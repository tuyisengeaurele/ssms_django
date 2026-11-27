"""Conversations between farmers and their cooperative's supervisors. Who may read what is in `access`."""
from django.db.models import Q
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.pagination import StandardPagination
from core.permissions import RolePermission
from core.utils import api_success

from .access import conversations_for, get_conversation_or_404, with_state
from .models import Message
from .rows import conversation_row, message_row, other_read_at

PAGE = 50


def last_messages(conversations) -> dict:
    """The latest message of each, in one question to the database."""
    ids = [c.last_message_id for c in conversations if c.last_message_id]
    return {m.conversation_id: m for m in Message.objects.filter(pk__in=ids)}


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'messages'

    def get(self, request):
        """GET /api/messages/conversations: the person's conversations, the latest first."""
        found = (
            with_state(conversations_for(request.user), request.user)
            .select_related('farmer', 'cooperative')
            .order_by('-last_message_at', '-pk')
        )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(found, request, view=self)
        last = last_messages(page)
        return paginator.get_paginated_response([conversation_row(c, request.user, last.get(c.pk)) for c in page])


class ConversationView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'messages'

    def get(self, request, pk):
        """GET /api/messages/conversations/<id>?before=<message id>: fifty messages, the latest or those before one."""
        conversation = get_conversation_or_404(request.user, pk)
        found = Message.objects.filter(conversation=conversation)
        before = request.query_params.get('before')
        if before:
            place = found.filter(pk=before).first()
            if place is None:
                raise NotFound("We couldn't find that message.")
            # The id breaks a tie, so messages saved at the same moment are neither skipped nor sent twice.
            found = found.filter(Q(created_at__lt=place.created_at) | Q(created_at=place.created_at, id__lt=place.pk))
        newest_first = list(found.select_related('sender').order_by('-created_at', '-id')[:PAGE + 1])
        return api_success({
            'conversation': conversation_row(conversation, request.user, last_messages([conversation]).get(conversation.pk)),
            'messages': [message_row(m, request.user) for m in reversed(newest_first[:PAGE])],
            'has_older': len(newest_first) > PAGE,
            'other_read_at': other_read_at(conversation, request.user),
        })
