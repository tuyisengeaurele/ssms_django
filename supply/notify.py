"""Who is told about an allowance, and what the mail says.

The reviewers hear when a request waits. The farmer hears when it is decided, or when a supervisor or admin changes the
amount directly. Each person gets a mail of their own, so nobody sees another's address. The change is already saved when a
mail goes out and the person can see it in the app, so a mail that cannot be sent is logged and never fails the request.
"""
import logging

from django.conf import settings

from cooperatives.reviewers import reviewers_of
from core.mail import Email, send_email_async

from . import allowance

logger = logging.getLogger(__name__)


def _boxes(n) -> str:
    return '1 box' if n == 1 else f'{n} boxes'


def _link(page: str = 'app') -> str:
    return f'{settings.FRONTEND_URL.rstrip("/")}/{page}'


def _send(subject: str, to: str, email: Email) -> None:
    try:
        send_email_async(subject, [to], email)
    except Exception:
        logger.exception('Could not send the allowance mail "%s"', subject)


def tell_reviewers(row) -> None:
    """A request waits for a decision."""
    farmer = row.farmer
    reviewers = reviewers_of(farmer)
    if not reviewers:
        return
    subject = 'An allowance change waits for your decision'
    intro = ['A farmer has asked for a different allowance.']
    # With no supervisor in the cooperative the admins decide, and they should know why it reached them.
    if any(r.role == 'ADMIN' for r in reviewers):
        intro.append('This farmer has no supervisor yet, so the request came to the admins.')
    facts = (
        ('Farmer', farmer.name),
        ('Allowance now', _boxes(allowance.current(farmer)['boxes'])),
        ('Asked for', _boxes(row.boxes_asked)),
        ('Reason', row.reason),
    )
    for reviewer in reviewers:
        email = Email(
            heading=subject,
            reason='You received this because you can decide about the allowance of this farmer.',
            greeting=f'Hello {reviewer.name},',
            intro=tuple(intro),
            facts=facts,
            button=('Open SSMS', _link('decisions')),
        )
        _send(subject, reviewer.email, email)


def tell_farmer(row) -> None:
    """A request was decided. `row` is the decided request."""
    farmer = row.farmer
    approved = row.status == row.Status.APPROVED
    by = row.decided_by.name if row.decided_by else 'your supervisor'
    facts = [('You asked for', _boxes(row.boxes_asked))]
    if approved:
        subject = 'Your allowance request was approved'
        intro = (f'{by} approved your request. Your allowance is now {_boxes(row.boxes_granted)}.',)
        facts.append(('Granted', _boxes(row.boxes_granted)))
    else:
        subject = 'Your allowance request was not approved'
        intro = (f'{by} did not approve your request. Your allowance stays at {_boxes(allowance.current(farmer)["boxes"])}.',)
    if row.decision_note:
        facts.append(('Note' if approved else 'Reason', row.decision_note))
    email = Email(
        heading=subject,
        reason='You received this because a decision was made on your allowance request.',
        greeting=f'Hello {farmer.name},',
        intro=intro,
        facts=tuple(facts),
        button=('Open SSMS', _link()),
    )
    _send(subject, farmer.email, email)


def tell_farmer_of_change(farmer, old_boxes: int, new_boxes: int, reason: str, by) -> None:
    """A supervisor or an admin changed the amount directly."""
    subject = 'Your allowance was lowered' if new_boxes < old_boxes else 'Your allowance was raised'
    email = Email(
        heading=subject,
        reason='You received this because your allowance was changed.',
        greeting=f'Hello {farmer.name},',
        intro=(f'{by.name} changed your allowance.',),
        facts=(('Before', _boxes(old_boxes)), ('Now', _boxes(new_boxes)), ('Reason', reason)),
        button=('Open SSMS', _link()),
    )
    _send(subject, farmer.email, email)
