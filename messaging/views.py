"""Conversations between farmers and their cooperative's supervisors. Who may read what is in `access`."""
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.pagination import StandardPagination
from core.params import ParamError
from core.permissions import RolePermission
from core.throttles import MessageDayThrottle, MessageSendThrottle, UserRateThrottle
from core.utils import api_error, api_success

from .access import conversations_for, get_conversation_or_404, read_mark, unread_total, with_state
from .models import Conversation, Message
from .rows import conversation_row, message_row, other_read_at
from .sending import Refused, already_saved, conversation_to_write_in, save_message
from .serializers import ReadSerializer, SendSerializer

PAGE = 50
# One message can be saved a moment before another and finish after it. The check looks this much further back than it
# is asked, and the page drops what it already has by its id.
OVERLAP = timedelta(seconds=15)


def last_messages(conversations) -> dict:
    """The latest message of each, in one question to the database."""
    ids = [c.last_message_id for c in conversations if c.last_message_id]
    return {m.conversation_id: m for m in Message.objects.filter(pk__in=ids)}


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'messages'

    def get(self, request):
        """GET /api/messages/conversations?farmer=<id>: the person's conversations, the latest first."""
        mine = conversations_for(request.user)
        farmer = request.query_params.get('farmer')
        if farmer:
            mine = mine.filter(farmer_id=farmer)   # narrows what the person may see already, never widens it
        found = (
            with_state(mine, request.user)
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


def _refused(serializer):
    return api_error('Please check what you entered and try again.', 422, serializer.errors, code='invalid_input')


class SendView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'messages'
    throttle_classes = [UserRateThrottle, MessageSendThrottle, MessageDayThrottle]

    def post(self, request):
        """POST /api/messages/send. 201 when the message is saved, 200 when it had been saved already."""
        serializer = SendSerializer(data=request.data, context={'user': request.user})
        if not serializer.is_valid():
            return _refused(serializer)
        words = serializer.validated_data
        where = {'conversation_id': words.get('conversation_id'), 'farmer_id': words.get('farmer_id')}
        message, new = already_saved(request.user, words['client_id'], **where), False
        if message is None:
            try:
                # Together, so that a refusal leaves no empty conversation behind.
                with transaction.atomic():
                    conversation = conversation_to_write_in(request.user, **where)
                    message, new = save_message(request.user, conversation, words['body'], words['client_id'])
            except Refused as refusal:
                return api_error(refusal.message, refusal.status, code=refusal.code)
        conversation = get_conversation_or_404(request.user, message.conversation_id)
        data = {
            'conversation': conversation_row(conversation, request.user, last_messages([conversation]).get(conversation.pk)),
            'message': message_row(message, request.user),
        }
        return api_success(data, 'Message sent', 201 if new else 200)


class ReadView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'messages'
    actions = {'post': 'mark_read'}

    def post(self, request):
        """POST /api/messages/read: this side has read as far as one message. The mark only moves forward.

        The page sends this by itself when new words are on a screen somebody is looking at, so it does not move the idle
        clock (core/jwt_authentication.py)."""
        serializer = ReadSerializer(data=request.data)
        if not serializer.is_valid():
            return _refused(serializer)
        conversation = get_conversation_or_404(request.user, serializer.validated_data['conversation_id'])
        message = Message.objects.filter(conversation=conversation, pk=serializer.validated_data['message_id']).first()
        if message is None:
            raise NotFound("We couldn't find that message.")
        mark = read_mark(request.user)
        # In one statement, so two marks sent together cannot move it back.
        Conversation.objects.filter(
            Q(**{f'{mark}__isnull': True}) | Q(**{f'{mark}__lt': message.created_at}), pk=conversation.pk,
        ).update(**{mark: message.created_at})
        return api_success({'unread_total': unread_total(request.user)})


def _moment(request, name):
    raw = request.query_params.get(name) or ''
    try:
        moment = parse_datetime(raw)
    except ValueError:   # the shape of a date, with a month or an hour that does not exist
        moment = None
    if moment is None or timezone.is_naive(moment):
        raise ParamError(f'Please send "{name}" as a date and time with its time zone.')
    return moment


class UpdatesView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'messages'

    def get(self, request):
        """GET /api/messages/updates?conversation=<id>&since=<moment>: the count, and what is new in the open one.

        The page asks every 30 seconds on its own, so this does not move the idle clock."""
        watched = None
        pk = request.query_params.get('conversation')
        if pk:
            since = _moment(request, 'since')
            conversation = get_conversation_or_404(request.user, pk)
            found = (
                Message.objects.filter(conversation=conversation, created_at__gt=since - OVERLAP)
                .select_related('sender')
                .order_by('created_at', 'id')[:PAGE]
            )
            watched = {
                'is_open': conversation.is_open,
                'other_read_at': other_read_at(conversation, request.user),
                'messages': [message_row(m, request.user) for m in found],
            }
        return api_success({'unread_total': unread_total(request.user), 'conversation': watched})
