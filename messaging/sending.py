"""Saving a message: where it may go, and only once."""
from django.db import transaction
from rest_framework.exceptions import NotFound

from users.models import Role, User

from .access import conversations_for, get_conversation_or_404, is_farmer, open_q, read_mark
from .models import Conversation, Message


class Refused(Exception):
    """Why a message cannot be sent, as one of the codes the page knows (core/error_text.py)."""

    def __init__(self, code: str, message: str, status: int = 409):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _closed():
    return Refused('conversation_closed', 'This conversation is closed.')


def already_saved(user, client_id, conversation_id=None, farmer_id=None):
    """The message this one is a retry of, or None. It is looked for before anything else is checked, so a retry still
    gets its answer when the conversation has closed since."""
    found = Message.objects.filter(sender=user, client_id=client_id, conversation__in=conversations_for(user))
    if conversation_id:
        found = found.filter(conversation_id=conversation_id)
    if farmer_id:
        found = found.filter(conversation__farmer_id=farmer_id)
    return found.select_related('sender').first()


def conversation_to_write_in(user, conversation_id=None, farmer_id=None) -> Conversation:
    """The conversation named, or the farmer's own, made now if this is the first message in it."""
    if conversation_id:
        return get_conversation_or_404(user, conversation_id)
    if is_farmer(user):
        cooperative = user.cooperative if user.cooperative_id else None
        if cooperative is None or not cooperative.is_active:
            raise Refused('message_no_cooperative', 'Join a cooperative to send messages.')
        farmer = user
    else:
        farmer = None
        if user.cooperative_id:
            farmer = (
                User.objects.filter(pk=farmer_id, role=Role.FARMER, cooperative_id=user.cooperative_id, is_active=True)
                .select_related('cooperative')
                .first()
            )
        if farmer is None:
            raise NotFound("We couldn't find that farmer.")
        cooperative = farmer.cooperative
        if farmer.deletion_requested_at is not None or not cooperative.is_active:
            raise _closed()
    # Two first messages at once both try to make it. The database keeps one, and this gives that one to both.
    conversation, _ = Conversation.objects.get_or_create(cooperative=cooperative, farmer=farmer)
    return conversation


def save_message(user, conversation, body: str, client_id: str):
    """(message, whether it is new). Saved only while the conversation is open."""
    with transaction.atomic():
        # Held until the message is saved. So two retries cannot both save, and the times of the messages in one
        # conversation follow the order they were saved in: a read mark can never cover a message saved after it.
        list(Conversation.objects.select_for_update().filter(pk=conversation.pk).values_list('pk', flat=True))
        earlier = Message.objects.filter(conversation=conversation, sender=user, client_id=client_id).first()
        if earlier is not None:
            return earlier, False
        if not Conversation.objects.filter(open_q(), pk=conversation.pk).exists():
            raise _closed()
        message = Message.objects.create(
            conversation=conversation, sender=user, from_farmer=is_farmer(user), body=body, client_id=client_id,
        )
        # Somebody who writes has read what is there.
        Conversation.objects.filter(pk=conversation.pk).update(
            last_message_at=message.created_at, **{read_mark(user): message.created_at},
        )
    return message, True
