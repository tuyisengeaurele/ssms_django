"""Acknowledging an alert and the comments on it.

A supervisor or admin acknowledges an alert to say they are dealing with it. Anyone who may see the alert may read its
comments, and the owner, supervisors and admins may write them. A comment from someone other than the owner is emailed
to the owner, so advice reaches a farmer who is not looking at the screen.
"""
from django.conf import settings
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.access import scope_alerts
from core.mail import Email, send_email_async
from core.utils import api_error, api_success

from .models import AlertComment, AlertLog
from .serializers import AlertLogSerializer
from .views import with_rooms

MAX_COMMENT = 1000
NO_PERMISSION = "You don't have permission to do that."


def _alert_or_404(user, pk):
    return with_rooms(scope_alerts(user, AlertLog.objects.all())).filter(pk=pk).first()


def _author(comment) -> dict | None:
    # No role is named here: a farmer reading the thread is not told what kind of account answered.
    return {'id': comment.author_id, 'name': comment.author.name or comment.author.email} if comment.author_id else None


def _comment_json(comment, viewer) -> dict:
    return {
        'id': comment.pk,
        'body': comment.body,
        'created_at': comment.created_at,
        'author': _author(comment),
        'can_delete': viewer.role == 'ADMIN' or comment.author_id == viewer.pk,
    }


class AlertAcknowledgeView(APIView):
    """POST /api/alerts/<id>/acknowledge says "I'm on it". DELETE takes it back. Supervisors and admins only."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error(NO_PERMISSION, 403)
        alert = _alert_or_404(request.user, pk)
        if alert is None:
            return api_error("We couldn't find that alert.", 404)
        if alert.acknowledged_by_id != request.user.pk:
            alert.acknowledged_by = request.user
            alert.acknowledged_at = timezone.now()
            alert.save(update_fields=['acknowledged_by', 'acknowledged_at'])
            log_action(request, 'UPDATE', 'Alert', alert.pk, f'Acknowledged alert {alert.pk}')
        return api_success(AlertLogSerializer(alert).data, 'Alert acknowledged.')

    def delete(self, request, pk):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error(NO_PERMISSION, 403)
        alert = _alert_or_404(request.user, pk)
        if alert is None:
            return api_error("We couldn't find that alert.", 404)
        if alert.acknowledged_by_id is not None:
            alert.acknowledged_by = None
            alert.acknowledged_at = None
            alert.save(update_fields=['acknowledged_by', 'acknowledged_at'])
            log_action(request, 'UPDATE', 'Alert', alert.pk, f'Took back the acknowledgement of alert {alert.pk}')
        return api_success(AlertLogSerializer(alert).data, 'Acknowledgement removed.')


class AlertCommentsView(APIView):
    """GET /api/alerts/<id>/comments lists the thread, oldest first. POST adds a comment."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        alert = _alert_or_404(request.user, pk)
        if alert is None:
            return api_error("We couldn't find that alert.", 404)
        rows = alert.comments.filter(is_active=True).select_related('author')
        return api_success([_comment_json(c, request.user) for c in rows])

    def post(self, request, pk):
        alert = _alert_or_404(request.user, pk)
        if alert is None:
            return api_error("We couldn't find that alert.", 404)

        raw = request.data.get('body')
        body = raw.strip() if isinstance(raw, str) else ''
        if not body:
            return api_error('Please check what you entered and try again.', 422, {'body': ['Please write a comment.']})
        if len(body) > MAX_COMMENT:
            return api_error('Please check what you entered and try again.', 422, {'body': ['A comment can be up to 1,000 characters.']})

        comment = AlertComment.objects.create(alert=alert, author=request.user, body=body)
        # The words of the comment stay out of the audit log, because they may be advice meant for one farmer.
        log_action(request, 'CREATE', 'AlertComment', comment.pk, f'Commented on alert {alert.pk}')
        self._tell_the_owner(alert, request.user, body)
        return api_success(_comment_json(comment, request.user), 'Comment added.', 201)

    @staticmethod
    def _tell_the_owner(alert, author, body: str) -> None:
        try:
            farm = (alert.batch or alert.room).farm
            owner = farm.owner
            if owner.pk == author.pk or not owner.email:
                return
            send_email_async(
                f'[SSMS] New comment on an alert at {farm.name}',
                [owner.email],
                Email(
                    heading='A comment on your alert',
                    greeting=f'Dear {owner.name or "Farmer"},',
                    intro=(f'{author.name or author.email} wrote about an alert at {farm.name}.',),
                    facts=(('Alert', alert.message), ('Comment', body)),
                    button=('Open alerts', f'{settings.FRONTEND_URL}/alerts'),
                    reason=f'You received this because you own {farm.name} on SSMS.',
                ),
            )
        except Exception:
            pass   # a failed email never loses the comment


class AlertCommentDetailView(APIView):
    """DELETE /api/alerts/<id>/comments/<comment id> hides a comment. Its author may, and so may an admin."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, comment_id):
        alert = _alert_or_404(request.user, pk)
        comment = alert.comments.filter(pk=comment_id, is_active=True).first() if alert else None
        if comment is None:
            return api_error("We couldn't find that comment.", 404)
        if request.user.role != 'ADMIN' and comment.author_id != request.user.pk:
            return api_error('You can only delete your own comments.', 403)
        comment.is_active = False
        comment.save(update_fields=['is_active'])
        log_action(request, 'DELETE', 'AlertComment', comment.pk, f'Deleted a comment on alert {alert.pk}')
        return api_success(None, 'Comment deleted.')
