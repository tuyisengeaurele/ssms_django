from django.core.mail import send_mail
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from core.utils import api_success, api_error
from .models import ContactMessage



class ContactCreateView(APIView):
    """POST /api/contact — public, no auth required."""
    permission_classes = [AllowAny]

    def post(self, request):
        name    = (request.data.get('name') or '').strip()
        email   = (request.data.get('email') or '').strip()
        subject = (request.data.get('subject') or '').strip()
        message = (request.data.get('message') or '').strip()

        if not name or not email or not subject or not message:
            return api_error('All fields are required.', 400)
        if len(message) < 10:
            return api_error('Message must be at least 10 characters.', 400)

        msg = ContactMessage.objects.create(
            name=name, email=email, subject=subject, message=message
        )

        # Confirmation email to sender
        try:
            send_mail(
                subject=f'We received your message — {subject}',
                message=(
                    f'Hi {name},\n\n'
                    f'Thank you for reaching out to SSMS. We have received your inquiry and will get back to you shortly.\n\n'
                    f'Your message:\n"{message}"\n\n'
                    f'Best regards,\nThe SSMS Team\nSilkworm Smart Management System — Rwanda'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
        except Exception:
            pass

        # Notification email to admin
        admin_email = getattr(settings, 'EMAIL_HOST_USER', None)
        if admin_email:
            try:
                send_mail(
                    subject=f'[SSMS Contact] {subject} — from {name}',
                    message=(
                        f'New contact form submission:\n\n'
                        f'Name:    {name}\n'
                        f'Email:   {email}\n'
                        f'Subject: {subject}\n\n'
                        f'Message:\n{message}\n\n'
                        f'ID: #{msg.id}'
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[admin_email],
                    fail_silently=True,
                )
            except Exception:
                pass

        return api_success(
            {'id': msg.id},
            'Your message has been received. We will get back to you soon.',
            201,
        )


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
    """GET /api/admin/contacts — admin only."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'ADMIN':
            return api_error('Admin access required.', 403)
        messages = ContactMessage.objects.all().order_by('-created_at')
        return api_success([_serialize_message(m) for m in messages])

    def patch(self, request, pk):
        """PATCH /api/admin/contacts/:id/read — mark as read."""
        if request.user.role != 'ADMIN':
            return api_error('Admin access required.', 403)
        try:
            msg = ContactMessage.objects.get(pk=pk)
        except ContactMessage.DoesNotExist:
            return api_error('Message not found.', 404)
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
            return api_error('Admin access required.', 403)
        unread = ContactMessage.objects.filter(is_read=False).order_by('-created_at')
        data = {
            'count':    unread.count(),
            'messages': [_serialize_message(m) for m in unread[:5]],
        }
        return api_success(data)
