"""Who may read a conversation. Every messaging view asks this module and keeps no rule of its own.

* A farmer reads their own conversations, in the cooperative they are in and in any they were in before.
* A supervisor reads the conversations of the cooperative they are in now.
* Nobody else reads any. An admin has no way in, and support access is refused before a view runs (core/support_rules.py).

Asking for one that is out of reach raises NotFound, so the API never confirms that it exists.
"""
from datetime import datetime, timezone

from django.db.models import (
    BooleanField,
    Case,
    Count,
    DateTimeField,
    F,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Value,
    When,
)
from django.db.models.functions import Coalesce
from rest_framework.exceptions import NotFound

from .models import Conversation, Message

# Stands for "never read": every message is newer.
NEVER = datetime(1970, 1, 1, tzinfo=timezone.utc)


def is_farmer(user) -> bool:
    return user.role == 'FARMER'


def read_mark(user) -> str:
    """The name of the read mark of this person's side."""
    return 'farmer_read_at' if is_farmer(user) else 'staff_read_at'


def conversations_for(user):
    if is_farmer(user):
        return Conversation.objects.filter(farmer=user)
    if user.role == 'SUPERVISOR' and user.cooperative_id:
        return Conversation.objects.filter(cooperative_id=user.cooperative_id)
    return Conversation.objects.none()


def open_q() -> Q:
    """A conversation takes new messages while its farmer is still in its cooperative, and both are still there."""
    return Q(
        cooperative__is_active=True, farmer__is_active=True, farmer__deletion_requested_at__isnull=True,
        farmer__cooperative_id=F('cooperative_id'),
    )


def with_state(qs, user):
    """Adds `is_open`, `unread` for this person's side, and `last_message_id`."""
    new_to_them = (
        Message.objects.filter(
            conversation=OuterRef('pk'), from_farmer=not is_farmer(user),
            created_at__gt=Coalesce(OuterRef(read_mark(user)), Value(NEVER), output_field=DateTimeField()),
        )
        .order_by().values('conversation').annotate(n=Count('pk')).values('n')
    )
    latest = Message.objects.filter(conversation=OuterRef('pk')).order_by('-created_at', '-id').values('pk')[:1]
    return qs.annotate(
        is_open=Case(When(open_q(), then=Value(True)), default=Value(False), output_field=BooleanField()),
        unread=Coalesce(Subquery(new_to_them, output_field=IntegerField()), Value(0)),
        last_message_id=Subquery(latest),
    )


def unread_total(user) -> int:
    """How many messages from the other side this person's side has not read, over all they may read."""
    mark = Coalesce(F(f'conversation__{read_mark(user)}'), Value(NEVER), output_field=DateTimeField())
    return Message.objects.filter(
        conversation__in=conversations_for(user), from_farmer=not is_farmer(user), created_at__gt=mark,
    ).count()


def get_conversation_or_404(user, pk) -> Conversation:
    conversation = with_state(conversations_for(user), user).select_related('farmer', 'cooperative').filter(pk=pk).first()
    if conversation is None:
        raise NotFound("We couldn't find that conversation.")
    return conversation
