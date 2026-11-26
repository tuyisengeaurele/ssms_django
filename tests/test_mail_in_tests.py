"""How the suite treats mail that the app sends in the background (conftest.py).

The app sends many emails on a thread of their own, so a slow mail server never holds up a request. A test that reads the
outbox right after a request would then be racing that thread, and would fail on a busy machine. So under test the
background send is finished before the call returns.
"""
import time

from django.core import mail

from core import mail as core_mail
from core.mail import Email, send_email_async

MESSAGE = Email(heading='Hello', reason='Because', intro=('Text',))


def test_background_mail_has_arrived_when_the_call_returns(monkeypatch):
    real = core_mail.send_email

    def slow(*args, **kwargs):
        time.sleep(0.2)  # a busy machine: long enough that a thread of its own cannot have finished
        return real(*args, **kwargs)

    monkeypatch.setattr(core_mail, 'send_email', slow)
    send_email_async('Hello', ['aline@example.rw'], MESSAGE)
    assert [message.to for message in mail.outbox] == [['aline@example.rw']]


def test_a_background_send_that_breaks_still_never_reaches_the_caller(monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError('the mail server is down')

    monkeypatch.setattr(core_mail, 'send_email', broken)
    # As on a thread: whatever goes wrong out there is not the request's problem.
    send_email_async('Hello', ['aline@example.rw'], MESSAGE, fail_silently=False)
