"""Who is told about a supply round, and what the mail says.

Every farmer hears when a round opens. A requester hears the result when the split is confirmed, and when a round they asked in
is cancelled. A farmer hears when a supervisor records their receipt. Each person gets a mail of their own, and the change is
already saved when a mail goes out, so one that cannot be sent is logged and never fails the request.
"""
import logging

from django.conf import settings
from django.utils import timezone

from core.mail import Email, send_email_async

from .models import EggRequest
from .rounds import farmers_of

logger = logging.getLogger(__name__)
Req = EggRequest.Status


def _boxes(n) -> str:
    return '1 box' if n == 1 else f'{n} boxes'


def _link() -> str:
    return f'{settings.FRONTEND_URL.rstrip("/")}/app'


def _day(value) -> str:
    return value.strftime('%d %b %Y')


def _send(subject: str, to: str, email: Email) -> None:
    try:
        send_email_async(subject, [to], email)
    except Exception:
        logger.exception('Could not send the supply mail "%s"', subject)


def _email(subject: str, reason: str, person, intro, facts=(), closing=()) -> Email:
    return Email(
        heading=subject, reason=reason, greeting=f'Hello {person.name},', intro=tuple(intro), facts=tuple(facts),
        button=('Open SSMS', _link()), closing=tuple(closing),
    )


def tell_farmers_round_open(round) -> None:
    subject = 'A supply round is open'
    facts = (
        ('Round', round.name),
        ('Eggs in the round', _boxes(round.stock_boxes)),
        ('Ask before', timezone.localtime(round.request_deadline).strftime('%d %b %Y, %H:%M')),
        ('Handed over on', _day(round.delivery_date)),
        ('At', round.delivery_place),
    )
    for farmer in farmers_of(round):
        _send(subject, farmer.email, _email(
            subject, 'You received this because your cooperative opened a supply round.', farmer,
            ['Your cooperative has opened a round of eggs. You can ask for eggs until the deadline.'], facts,
            ['You can ask for up to your allowance, and for what your approved rooms can hold.'],
        ))


def tell_decision(request, round) -> None:
    """The split was confirmed. `request` carries its result."""
    farmer = request.farmer
    approved = request.boxes_approved or 0
    facts = [('Round', round.name), ('You asked for', _boxes(request.boxes_asked))]
    closing = []
    if request.status == Req.APPROVED:
        subject = 'Your egg request was approved'
        intro = [f'You will receive {_boxes(approved)}.']
    elif request.status == Req.PART_APPROVED:
        subject = 'Your egg request was partly approved'
        intro = [f'There were not enough eggs for everyone, so you will receive {_boxes(approved)}.']
    elif request.status == Req.WAITLISTED:
        subject = 'You are on the waiting list for eggs'
        intro = ['There were not enough eggs for this round. You are on the waiting list, in the order of your request.']
    else:
        subject = 'Your egg request was not approved'
        intro = ['Your request for eggs was not approved in this round.']
    if approved:
        facts += [('You will receive', _boxes(approved)), ('Handed over on', _day(round.delivery_date)), ('At', round.delivery_place)]
        closing.append('When the eggs arrive, open SSMS and confirm how many you received. That starts your batch.')
    if request.decision_note:
        facts.append(('Note', request.decision_note))
    _send(subject, farmer.email, _email(subject, 'You received this because the split of a supply round was confirmed.', farmer, intro, facts, closing))


def tell_cancelled(round, requests, note: str) -> None:
    subject = 'A supply round was cancelled'
    for request in requests:
        _send(subject, request.farmer.email, _email(
            subject, 'You received this because you asked for eggs in a round that was cancelled.', request.farmer,
            [f'The round {round.name} was cancelled, so your request is cancelled too.'],
            [('Round', round.name), ('Reason', note)],
        ))


def tell_received_for(request, by) -> None:
    subject = 'Your eggs were recorded as received'
    farmer = request.farmer
    _send(subject, farmer.email, _email(
        subject, 'You received this because a supervisor recorded your eggs as received.', farmer,
        [f'{by.name} recorded that you received your eggs. A batch was started for you.'],
        [('Round', request.round.name), ('Received', _boxes(request.boxes_received or 0)), ('Condition', request.condition)],
    ))
