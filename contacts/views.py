from django.conf import settings
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from core.mail import Email
from core.mail import send_email_async as _send_mail_async
from core.throttles import ContactRateThrottle
from core.utils import api_error, api_success

from .models import ContactMessage
from .serializers import ContactSerializer

RECEIVED = 'Your message has been received. We will get back to you soon.'

# The reply to the sender is fixed text. Nothing the sender typed goes into it, so the form cannot
# be used to send a stranger an email with words of the attacker's choosing.
REPLY_SUBJECT = 'We received your message'
REPLY = Email(
    heading='We received your message',
    intro=('Thank you for contacting SSMS. We have received your message and will get back to you shortly.',),
    closing=('If you did not send a message to us, you can ignore this email.',),
    reason='You received this because this address was used on the SSMS contact form.',
)


def _team_note(data, message_id):
    return Email(
        heading='New contact message',
        intro=('Someone wrote to the SSMS contact form.',),
        facts=(('Name', data['name']), ('Email', data['email']), ('Subject', data['subject']), ('Message', f'#{message_id}')),
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

        msg = ContactMessage.objects.create(**data)

        _send_mail_async(REPLY_SUBJECT, [data['email']], REPLY)

        # The team sees everything that was written.
        admin_email = getattr(settings, 'EMAIL_HOST_USER', None)
        if admin_email:
            _send_mail_async(
                f"[SSMS Contact] {data['subject']} from {data['name']}",
                [admin_email],
                _team_note(data, msg.id),
                reply_to=[data['email']],
            )

        return api_success({'id': msg.id}, RECEIVED, 201)


def _serialize_message(m):
    return {
        'id':        m.id,
        'name':      m.name,
        'email':     m.email,
        'subject':   m.subject,
        'message':   m.message,
        'isRead':    m.is_read,
        'createdAt': m.created_at.isoformat(),
    }


class ContactListView(APIView):
    """GET /api/admin/contacts, admin only."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'ADMIN':
            return api_error("You don't have permission to do that.", 403)
        messages = ContactMessage.objects.all().order_by('-created_at')
        return api_success([_serialize_message(m) for m in messages])

    def patch(self, request, pk):
        """PATCH /api/admin/contacts/:id/read, mark as read."""
        if request.user.role != 'ADMIN':
            return api_error("You don't have permission to do that.", 403)
        try:
            msg = ContactMessage.objects.get(pk=pk)
        except ContactMessage.DoesNotExist:
            return api_error("We couldn't find that message.", 404)
        msg.is_read = True
        msg.save(update_fields=['is_read'])
        return api_success({'id': msg.id, 'isRead': True})


class ContactUnreadView(APIView):
    """
    GET /api/admin/contacts/unread
    Returns unread count + latest 5 unread messages for admin notification bell.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'ADMIN':
            return api_error("You don't have permission to do that.", 403)
        unread = ContactMessage.objects.filter(is_read=False).order_by('-created_at')
        data = {
            'count':    unread.count(),
            'messages': [_serialize_message(m) for m in unread[:5]],
        }
        return api_success(data)
