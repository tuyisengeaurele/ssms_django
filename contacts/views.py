import threading

from django.conf import settings
from django.core.mail import send_mail
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from core.throttles import ContactRateThrottle
from core.utils import api_error, api_success

from .models import ContactMessage
from .serializers import ContactSerializer

RECEIVED = 'Your message has been received. We will get back to you soon.'

# The reply to the sender is fixed text. Nothing the sender typed goes into it, so the form cannot
# be used to send a stranger an email with words of the attacker's choosing.
REPLY_SUBJECT = 'We received your message'
REPLY_BODY = '\n'.join([
    'Thank you for contacting SSMS.',
    '',
    'We have received your message and will get back to you shortly.',
    '',
    'If you did not send a message to us, you can ignore this email.',
    '',
    'The SSMS Team',
    'Smart Sericulture Management System, Rwanda',
])


def _send_mail_async(*args, **kwargs):
    """Fire-and-forget email, never blocks the HTTP response."""
    t = threading.Thread(target=send_mail, args=args, kwargs=kwargs, daemon=True)
    t.start()


def _team_note(data, message_id):
    return '\n'.join([
        'New contact form submission:',
        '',
        f"Name:    {data['name']}",
        f"Email:   {data['email']}",
        f"Subject: {data['subject']}",
        '',
        'Message:',
        data['message'],
        '',
        f'ID: #{message_id}',
    ])


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

        _send_mail_async(
            REPLY_SUBJECT, REPLY_BODY, settings.DEFAULT_FROM_EMAIL, [data['email']], fail_silently=True,
        )

        # The team sees everything that was written.
        admin_email = getattr(settings, 'EMAIL_HOST_USER', None)
        if admin_email:
            _send_mail_async(
                f"[SSMS Contact] {data['subject']} from {data['name']}",
                _team_note(data, msg.id),
                settings.DEFAULT_FROM_EMAIL,
                [admin_email],
                fail_silently=True,
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
