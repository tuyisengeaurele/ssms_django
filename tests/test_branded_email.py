"""The one look every SSMS email shares: a text part, an HTML part, the logo, and a footer that says who we are and why."""
import re

import pytest
from django.core import mail

from core.mail import Email, send_email

pytestmark = pytest.mark.django_db

WHY = 'You received this because someone created an SSMS account with this address.'


def sample(**over):
    fields = dict(
        heading='Verify your email address',
        reason=WHY,
        greeting='Hi Aline,',
        intro=('Please confirm this address to start using SSMS.',),
        button=('Verify my email', 'https://ssms.example/verify-email?uid=abc&token=def'),
        closing=('The link works for 1 hour.',),
    )
    fields.update(over)
    return Email(**fields)


def sent(**over):
    send_email('Verify your SSMS email address', ['aline@example.rw'], sample(**over))
    return mail.outbox[-1]


def html_of(message):
    (body, kind), = message.alternatives
    assert kind == 'text/html'
    return body


# ── two parts ───────────────────────────────────────────────────────────────

def test_the_email_has_a_plain_text_part_and_an_html_part():
    message = sent()
    assert 'Please confirm this address' in message.body
    assert 'Please confirm this address' in html_of(message)


def test_the_message_goes_to_the_people_asked_with_the_subject_given():
    message = sent()
    assert message.to == ['aline@example.rw']
    assert message.subject == 'Verify your SSMS email address'


# ── the logo ────────────────────────────────────────────────────────────────

def test_the_logo_travels_inside_the_email_so_it_shows_without_a_public_address():
    message = sent()
    images = [part for part in message.attachments if getattr(part, 'get_content_maintype', lambda: '')() == 'image']
    assert len(images) == 1
    cid = images[0]['Content-ID'].strip('<>')
    assert f'cid:{cid}' in html_of(message)


def test_the_logo_has_alternative_text():
    assert re.search(r'<img[^>]+alt="SSMS"', html_of(sent()))


# ── heading, greeting, button ───────────────────────────────────────────────

def test_the_html_shows_the_heading_the_greeting_and_the_button():
    html = html_of(sent())
    assert '<h1' in html and 'Verify your email address' in html
    assert 'Hi Aline,' in html
    assert re.search(r'<a [^>]*href="https://ssms.example/verify-email\?uid=abc&amp;token=def"[^>]*>\s*Verify my email', html)


def test_the_text_part_puts_the_link_on_its_own_line():
    lines = [line.strip() for line in sent().body.splitlines()]
    assert 'https://ssms.example/verify-email?uid=abc&token=def' in lines


def test_an_email_without_a_button_has_none():
    message = sent(button=None)
    assert 'verify-email' not in message.body
    assert 'role="button"' not in html_of(message)


def test_facts_come_as_label_and_value_in_both_parts():
    message = sent(facts=(('Room', 'Rearing house 1'), ('Time (UTC)', '2026-10-27 09:30')))
    assert 'Room: Rearing house 1' in message.body
    html = html_of(message)
    assert 'Rearing house 1' in html and 'Time (UTC)' in html


# ── the footer ──────────────────────────────────────────────────────────────

def test_the_footer_says_who_we_are_in_both_parts(settings):
    settings.ORG_ADDRESS = 'UR-CST, P.O. Box 3900, Kigali, Rwanda'
    settings.SUPPORT_EMAIL = 'help@ssms.example'
    settings.FRONTEND_URL = 'https://ssms.example'
    message = sent()
    for text in (message.body, html_of(message)):
        assert 'Smart Sericulture Management System' in text
        assert 'UR-CST, P.O. Box 3900, Kigali, Rwanda' in text
        assert 'help@ssms.example' in text
        assert 'https://ssms.example/privacy' in text
        assert 'https://ssms.example/terms' in text


def test_the_footer_gives_the_reason_the_person_got_the_email():
    message = sent()
    assert WHY in message.body
    assert WHY in html_of(message)


def test_the_default_contact_address_is_the_project_mailbox():
    assert 'smartsericulturerw@gmail.com' in sent().body


def test_the_address_follows_the_setting_and_is_never_empty_by_accident(settings):
    assert settings.ORG_ADDRESS.strip()


# ── safety ──────────────────────────────────────────────────────────────────

def test_a_name_with_markup_is_shown_as_text_in_the_html():
    message = sent(greeting='Hi <script>alert(1)</script>,')
    html = html_of(message)
    assert '<script>' not in html
    assert '&lt;script&gt;' in html


def test_the_text_part_is_not_escaped():
    message = sent(intro=('Tom & Jerry <farm>',))
    assert 'Tom & Jerry <farm>' in message.body


def test_no_dash_characters_that_the_project_bans_appear():
    message = sent()
    for text in (message.body, html_of(message)):
        assert chr(8212) not in text and chr(8211) not in text
