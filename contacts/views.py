import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.mail import Email, send_email
from core.mail import send_email_async as _send_mail_async
from core.permissions import RolePermission
from core.throttles import ContactRateThrottle, ContactReplyThrottle
from core.utils import api_error, api_success

from .language import detect_language
from .models import ContactMessage, ContactReply
from .reply_email import REPLY_SUBJECT, confirmation_email, reply_email
from .serializers import ContactReplySerializer, ContactSerializer

logger = logging.getLogger(__name__)

RECEIVED = 'Your message has been received. We will get back to you soon.'
# Every message from the form has this subject. A visitor is not asked for one, and one that is sent is ignored.
SUBJECT = 'Message to SSMS'

def _team_note(data, message_id):
    # Answers are written in the app, so the note has no reply-to and does not give the sender's address.
    return Email(
        heading='New contact message',
        intro=('Someone wrote to the SSMS contact form.',),
        facts=(('Name', data['name']), ('Message', f'#{message_id}')),
        button=('Open messages', f"{settings.FRONTEND_URL.rstrip('/')}/admin/contacts"),
        closing=(data['message'],),
        reason='You received this because this is the SSMS contact address.',
    )


class ContactCreateView(APIView):
    """POST /api/contact, public, no auth required."""
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ContactRateThrottle]

    def post(self, request):
        # A hidden field real people never see. A robot that fills it is told it worked.
        if request.data.get('website'):
            return api_success({'id': None}, RECEIVED, 201)

        serializer = ContactSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        data = serializer.validated_data

        # The words of the message say which language to answer in. The page's language only settles unclear words.
        language = detect_language(data['message'], fallback=request.data.get('language'))
        msg = ContactMessage.objects.create(**data, subject=SUBJECT, language=language)

        subject, confirmation = confirmation_email(language)
        _send_mail_async(subject, [data['email']], confirmation)

        # The team sees everything that was written.
        admin_email = getattr(settings, 'EMAIL_HOST_USER', None)
        if admin_email:
            _send_mail_async(SUBJECT, [admin_email], _team_note(data, msg.id))

        return api_success({'id': msg.id}, RECEIVED, 201)


def _person(user_id, user):
    return {'id': user_id, 'name': user.name or user.email} if user_id else None


def _serialize_reply(r):
    return {'id': r.pk, 'body': r.body, 'sentAt': r.sent_at.isoformat(), 'sentBy': _person(r.sent_by_id, r.sent_by)}


def _messages():
    """Messages with everything the list shows, in the same number of questions however many there are."""
    replies = Prefetch('replies', queryset=ContactReply.objects.select_related('sent_by'))
    return ContactMessage.objects.select_related('replied_by').prefetch_related(replies)


def _serialize_message(m):
    return {
        'id':        m.id,
        'name':      m.name,
        'email':     m.email,
        'subject':   m.subject,
        'message':   m.message,
        'language':  m.language or detect_language(m.message),
        'replies':   [_serialize_reply(r) for r in m.replies.all()],
        'isRead':    m.is_read,
        'createdAt': m.created_at.isoformat(),
        'repliedAt': m.replied_at.isoformat() if m.replied_at else None,
        'repliedBy': _person(m.replied_by_id, m.replied_by),
    }


class ContactListView(APIView):
    """GET /api/admin/contacts, admin only."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'contacts'

    def get(self, request):
        messages = _messages().order_by('-created_at')
        return api_success([_serialize_message(m) for m in messages])

    def patch(self, request, pk):
        """PATCH /api/admin/contacts/:id/read, mark as read."""
        try:
            msg = ContactMessage.objects.get(pk=pk)
        except ContactMessage.DoesNotExist:
            return api_error("We couldn't find that message.", 404)
        msg.is_read = True
        msg.save(update_fields=['is_read'])
        return api_success({'id': msg.id, 'isRead': True})


class ContactRepliedView(APIView):
    """POST /api/admin/contacts/<id>/replied says the message has been answered, and by whom. DELETE takes that back.

    The reply itself is sent from the admin's own mail app, so this is a mark made by hand. Answering also marks the
    message read. Marking it again keeps the first answer, so the record says who really answered first.
    """
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'contacts'

    def _message(self, request, pk):
        msg = ContactMessage.objects.select_related('replied_by').filter(pk=pk).first()
        if msg is None:
            return None, api_error("We couldn't find that message.", 404)
        return msg, None

    def post(self, request, pk):
        msg, problem = self._message(request, pk)
        if problem:
            return problem
        if msg.replied_at is None:
            msg.replied_by = request.user
            msg.replied_at = timezone.now()
            msg.is_read = True
            msg.save(update_fields=['replied_by', 'replied_at', 'is_read'])
            # The words of the message stay out of the audit log. They were written to us, not to the log.
            log_action(request, 'UPDATE', 'ContactMessage', msg.pk, f'Marked contact message {msg.pk} as answered')
        return api_success(_serialize_message(msg), 'Marked as answered.')

    def delete(self, request, pk):
        msg, problem = self._message(request, pk)
        if problem:
            return problem
        if msg.replied_at is not None:
            msg.replied_by = None
            msg.replied_at = None
            msg.save(update_fields=['replied_by', 'replied_at'])
            log_action(request, 'UPDATE', 'ContactMessage', msg.pk, f'Removed the answered mark of contact message {msg.pk}')
        return api_success(_serialize_message(msg), 'Answered mark removed.')


class ContactReplyView(APIView):
    """POST /api/admin/contacts/<id>/replies sends an admin's answer to the address on the message.

    The answer is saved only when the email went. The app sends one for a message: the person can answer the email, and the
    talk goes on in the SSMS mailbox.
    """
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'contacts'
    throttle_classes = [ContactReplyThrottle]

    def post(self, request, pk):
        serializer = ContactReplySerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you wrote and try again.', 422, serializer.errors)
        body = serializer.validated_data['body']

        sent = False
        with transaction.atomic():
            # The row stays locked while the email goes, so a second admin answering this message waits and is then told.
            msg = ContactMessage.objects.select_for_update().filter(pk=pk).first()
            if msg is None:
                return api_error("We couldn't find that message.", 404)
            if msg.replies.exists():
                return api_error('Someone already replied to this message.', 409, code='already_replied')
            language = serializer.validated_data.get('language') or msg.language or detect_language(msg.message)
            try:
                send_email(REPLY_SUBJECT, [msg.email], reply_email(body, msg.created_at, language))
            except Exception as exc:
                # Caught here, inside the transaction, so that the job log line send_email wrote is kept. Only the kind of
                # failure is logged: a mail server's own words often repeat the address.
                logger.warning('The reply to contact message %s was not sent: %s', msg.pk, type(exc).__name__)
            else:
                ContactReply.objects.create(message=msg, body=body, sent_by=request.user)
                msg.language, msg.is_read = language, True
                msg.replied_by, msg.replied_at = request.user, timezone.now()
                msg.save(update_fields=['language', 'is_read', 'replied_by', 'replied_at'])
                log_action(request, 'UPDATE', 'ContactMessage', msg.pk, f'Replied to contact message {msg.pk}')
                sent = True

        if not sent:
            return api_error('The reply was not sent. Please try again.', 502, code='reply_not_sent')
        return api_success(_serialize_message(_messages().get(pk=pk)), 'Reply sent.', 201)


class ContactUnreadView(APIView):
    """
    GET /api/admin/contacts/unread
    Returns unread count + latest 5 unread messages for admin notification bell.
    """
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'contacts'

    def get(self, request):
        unread = _messages().filter(is_read=False).order_by('-created_at')
        data = {
            'count':    unread.count(),
            'messages': [_serialize_message(m) for m in unread[:5]],
        }
        return api_success(data)
