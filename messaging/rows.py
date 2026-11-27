"""What the two sides are sent. A farmer is never sent a supervisor's email or number, so nothing here holds one."""
from .access import is_farmer

PREVIEW = 140


def _former(person) -> bool:
    return person.anonymised_at is not None


def _name(person) -> str:
    # A closed account is shown in the reader's own words for "former member", so no name is sent.
    return '' if _former(person) else person.name


def message_row(message, user) -> dict:
    sender = message.sender
    return {
        'id': message.pk,
        'body': message.body,
        'from_farmer': message.from_farmer,
        'mine': message.sender_id == user.pk,
        'sender': {'id': sender.pk, 'name': _name(sender), 'former': _former(sender)} if sender else None,
        'created_at': message.created_at.isoformat(),
    }


def _last_row(message, user):
    if message is None:
        return None
    return {
        'preview': ' '.join(message.body.split())[:PREVIEW],
        'from_farmer': message.from_farmer,
        'mine': message.sender_id == user.pk,
        'created_at': message.created_at.isoformat(),
    }


def conversation_row(conversation, user, last=None) -> dict:
    """`conversation` comes from `access.with_state`, with its farmer and cooperative loaded."""
    farmer = conversation.farmer
    return {
        'id': conversation.pk,
        'farmer': {'id': farmer.pk, 'name': _name(farmer), 'photo_url': farmer.photo_url, 'former': _former(farmer)},
        'cooperative': {'id': conversation.cooperative_id, 'name': conversation.cooperative.name},
        'is_open': conversation.is_open,
        'unread': conversation.unread,
        'last_message': _last_row(last, user),
    }


def other_read_at(conversation, user):
    """How far the other side has read."""
    mark = conversation.staff_read_at if is_farmer(user) else conversation.farmer_read_at
    return mark.isoformat() if mark else None
