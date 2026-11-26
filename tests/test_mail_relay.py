"""The backend that hands each finished email to the website's mail sender, signed. No test here touches the network."""
import base64
import json
from email import message_from_bytes, policy
from pathlib import Path
from unittest import mock

import httpx
import pytest
from django.core.mail import EmailMessage

from core.mail import Email, send_email
from core.mail_relay import MAX_RECIPIENTS, RelayEmailBackend, RelayError, is_set_up, sign

pytestmark = pytest.mark.django_db

URL = 'https://site.example/api/send-mail'
SECRET = 'a' * 32
# The same example is checked by the sender's own tests (frontend/relay-tests), so the two sides cannot drift apart.
SHARED_BODY = b'{"to":["ada@example.rw"],"raw":"aGVsbG8="}'
SHARED_SIGNATURE = '3e6c623abb55c7f7ea909166acdec4cf34de5c6b367d73a74870abb1a0ae8a95'
# The sender refuses a larger body.
SENDER_LIMIT = 1_000_000


@pytest.fixture(autouse=True)
def relay(settings):
    settings.EMAIL_BACKEND = 'core.mail_relay.RelayEmailBackend'
    settings.MAIL_RELAY_URL = URL
    settings.MAIL_RELAY_SECRET = SECRET
    return settings


@pytest.fixture
def post():
    with mock.patch('core.mail_relay.httpx.post', return_value=httpx.Response(200, json={'ok': True})) as fake:
        yield fake


def sent_body(call):
    return json.loads(call.kwargs['content'])


def sent_message(call):
    return message_from_bytes(base64.b64decode(sent_body(call)['raw']), policy=policy.default)


def branded(**over):
    fields = dict(
        heading='Ubushyuhe buri hejuru',
        reason='Vous recevez ce message parce que vous suivez cette ferme.',
        greeting='Muraho Aline,',
        intro=('Ubuhehere buri hasi. La température est trop élevée.',),
    )
    fields.update(over)
    return Email(**fields)


def plain(to=('aline@example.rw',), **over):
    return EmailMessage('Hello', 'Body', 'SSMS <ssms@example.rw>', list(to), **over)


def test_it_signs_like_the_function():
    assert sign(SECRET, '1700000000', SHARED_BODY) == SHARED_SIGNATURE


def test_a_branded_email_goes_out_whole(post):
    send_email('Ubushyuhe: température', ['aline@example.rw'], branded(), reply_to=['team@example.rw'])
    assert post.call_args.args[0] == URL
    assert sent_body(post.call_args)['to'] == ['aline@example.rw']
    message = sent_message(post.call_args)
    assert str(message['Subject']) == 'Ubushyuhe: température'
    assert 'SSMS' in str(message['From'])
    assert str(message['Reply-To']) == 'team@example.rw'
    parts = {part.get_content_type(): part for part in message.walk() if not part.is_multipart()}
    for kind in ('text/plain', 'text/html'):
        assert 'Ubuhehere buri hasi. La température est trop élevée.' in parts[kind].get_content()
    assert parts['image/png']['Content-ID'] == '<ssms-logo>'
    assert len(post.call_args.kwargs['content']) < SENDER_LIMIT


def test_the_signature_covers_the_exact_bytes_sent(post):
    with mock.patch('core.mail_relay.time.time', return_value=1_700_000_000.9):
        plain().send()
    headers = post.call_args.kwargs['headers']
    assert headers['x-ssms-timestamp'] == '1700000000'
    assert headers['x-ssms-signature'] == sign(SECRET, '1700000000', post.call_args.kwargs['content'])
    assert headers['content-type'] == 'application/json'
    assert post.call_args.kwargs['follow_redirects'] is False
    assert post.call_args.kwargs['timeout'] == 35.0


def test_more_than_twenty_recipients_are_sent_in_groups(post):
    people = [f'p{i}@example.rw' for i in range(45)]
    assert plain(to=people).send() == 1
    groups = [sent_body(call)['to'] for call in post.call_args_list]
    assert [len(group) for group in groups] == [MAX_RECIPIENTS, MAX_RECIPIENTS, 5]
    assert [address for group in groups for address in group] == people


def test_a_hidden_copy_is_delivered_but_not_shown(post):
    plain(to=['Aline <aline@example.rw>'], bcc=['hidden@example.rw']).send()
    assert sent_body(post.call_args)['to'] == ['aline@example.rw', 'hidden@example.rw']
    assert 'hidden@example.rw' not in str(sent_message(post.call_args))


def test_a_message_with_nobody_to_go_to_is_not_posted(post):
    assert plain(to=[]).send() == 0
    post.assert_not_called()


@pytest.mark.parametrize('url, secret', [('', SECRET), (URL, ''), (URL, 'a' * 31)])
def test_not_set_up_sends_nothing(post, relay, url, secret):
    relay.MAIL_RELAY_URL, relay.MAIL_RELAY_SECRET = url, secret
    assert is_set_up() is False
    with pytest.raises(RelayError) as failure:
        plain().send()
    assert failure.value.code == 'not_set_up'
    post.assert_not_called()


def test_a_url_and_a_long_enough_secret_are_set_up():
    assert is_set_up() is True


@pytest.mark.parametrize('outcome, code', [
    (httpx.ReadTimeout('slow'), 'timeout'),
    (httpx.ConnectError('nobody there'), 'unreachable'),
    (httpx.InvalidURL('what is this'), 'unreachable'),
    (httpx.Response(401, json={'ok': False, 'error': 'unauthorized'}), 'unauthorized'),
    (httpx.Response(502, json={'ok': False, 'error': 'send_failed'}), 'send_failed'),
    (httpx.Response(503, json={'ok': False, 'error': 'not_set_up'}), 'not_set_up'),
    (httpx.Response(502, json={'ok': False, 'error': 'aline@example.rw was refused'}), 'refused'),
    (httpx.Response(500, text='<html>Server error</html>'), 'refused'),
    (httpx.Response(200, text='<html>Not the sender</html>'), 'refused'),
    (httpx.Response(200, json=['ok']), 'refused'),
    (httpx.Response(200, json={'ok': False}), 'refused'),
    (httpx.Response(308, headers={'location': 'https://elsewhere.example'}), 'refused'),
])
def test_each_failure_has_a_short_code_and_is_tried_once(post, outcome, code):
    if isinstance(outcome, Exception):
        post.side_effect = outcome
    else:
        post.return_value = outcome
    with pytest.raises(RelayError) as failure:
        plain().send()
    assert failure.value.code == code
    assert str(failure.value) == code
    # The mail may have left already, so the backend never sends it again by itself.
    assert post.call_count == 1


def test_fail_silently_swallows_it_and_counts_nothing(post):
    post.side_effect = httpx.ConnectError('nobody there')
    assert RelayEmailBackend(fail_silently=True).send_messages([plain()]) == 0


def test_the_error_holds_no_address_or_secret(post):
    post.side_effect = httpx.ConnectError(f'could not reach {URL} for aline@example.rw using {SECRET}')
    with pytest.raises(RelayError) as failure:
        plain().send()
    told = f'{failure.value} {failure.value!r}'
    for secret in ('aline@example.rw', SECRET, URL):
        assert secret not in told
    # A logged traceback would print the error underneath too.
    assert failure.value.__cause__ is None and failure.value.__suppress_context__


def test_the_api_waits_longer_than_the_function_may_run(relay):
    vercel = json.loads((Path(__file__).resolve().parent.parent / 'frontend' / 'vercel.json').read_text(encoding='utf-8'))
    assert relay.MAIL_RELAY_TIMEOUT > vercel['functions']['api/send-mail.ts']['maxDuration']
