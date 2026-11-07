"""Who is told about a room, and what the mail says.

The reviewers hear when a room or a size change waits. The farmer hears when it is decided. Each person gets a mail of
their own, so nobody sees another's address. The decision is already saved when a mail goes out, and the person can see it
in the app, so a mail that cannot be sent is logged and never fails the request.
"""
import logging

from django.conf import settings

from core.mail import Email, send_email_async

from .room_review import reviewers_for

logger = logging.getLogger(__name__)

NEW = 'new'
SIZE = 'size'


def _size(value) -> str:
    """12 and 12.00 read as 12, 14.50 as 14.5."""
    if value is None:
        return ''
    text = f'{value:f}'
    return text.rstrip('0').rstrip('.') if '.' in text else text


def _link() -> str:
    return f'{settings.FRONTEND_URL.rstrip("/")}/app'


def _send(subject: str, to: str, email: Email) -> None:
    try:
        send_email_async(subject, [to], email)
    except Exception:
        logger.exception('Could not send the room mail "%s"', subject)


def tell_reviewers(room, kind: str, old_size=None) -> None:
    """A room (`new`) or a size change (`size`) waits for a decision. `old_size` is the size in force for a change."""
    farm = room.farm
    farmer = farm.owner
    reviewers = reviewers_for(room)
    if not reviewers:
        return
    asked = kind == SIZE
    new_size = room.pending_area_m2 if asked and room.pending_area_m2 is not None else room.area_m2
    # A rejected room that is sent again has no size in force, it only has the size it was sent with.
    facts = [('Farmer', farmer.name), ('Farm', farm.name), ('Room', room.name)]
    if asked and old_size is not None:
        facts += [('Size now', f'{_size(old_size)} square metres'), ('New size', f'{_size(new_size)} square metres')]
    else:
        facts.append(('Size', f'{_size(new_size)} square metres'))

    subject = 'A room size change waits for your decision' if asked else 'A room waits for your decision'
    # With no supervisor in the cooperative the admins decide, and they should know why it reached them.
    via_admins = any(r.role == 'ADMIN' for r in reviewers)
    intro = ['A farmer has asked to change the size of a room.' if asked else 'A farmer has added a room and it needs your decision.']
    if via_admins:
        intro.append('This farmer has no supervisor yet, so the request came to the admins.')

    for reviewer in reviewers:
        email = Email(
            heading=subject,
            reason='You received this because you can approve rooms for this farmer.',
            greeting=f'Hello {reviewer.name},',
            intro=tuple(intro),
            facts=tuple(facts),
            button=('Open SSMS', _link()),
            closing=('The farmer cannot add a batch to this room until it is approved.',) if not asked else (),
        )
        _send(subject, reviewer.email, email)


def tell_owner(room, decision: str, size: bool = False) -> None:
    """Tell the farmer what was decided. `size` is true when the decision was about a queued size, not the room."""
    approved = decision == 'approve'
    what = 'room size change' if size else 'room'
    subject = f'Your {what} was approved' if approved else f'Your {what} was not approved'
    farmer = room.farm.owner
    facts = [('Farm', room.farm.name), ('Room', room.name), ('Size', f'{_size(room.area_m2)} square metres')]
    closing: tuple = ()
    if approved:
        intro = (f'The new size of {room.name} was approved.' if size else f'{room.name} was approved. You can now add a batch to it.',)
    else:
        intro = (f'The new size for {room.name} was not approved. The size in force stays as it is.' if size else f'{room.name} was not approved.',)
        if room.review_note:
            facts.append(('Reason', room.review_note))
        if not size:
            closing = ('You can change the size and send the room again.',)
    email = Email(
        heading=subject,
        reason='You received this because a decision was made on one of your rooms.',
        greeting=f'Hello {farmer.name},',
        intro=intro,
        facts=tuple(facts),
        button=('Open SSMS', _link()),
        closing=closing,
    )
    _send(subject, farmer.email, email)
