"""One look for every email SSMS sends.

Each email is a plain text part and an HTML part built from the same fields, so the two always say the same thing.
The logo travels inside the message, so it shows on localhost and behind mail apps that block remote images.
"""
import threading
from dataclasses import dataclass
from email.mime.image import MIMEImage
from pathlib import Path

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

LOGO = Path(__file__).parent / 'assets' / 'logo-mark.png'
LOGO_CID = 'ssms-logo'
ORG_NAME = 'Smart Sericulture Management System'


@dataclass(frozen=True)
class Email:
    """What an email says. `reason` is the line in the footer that tells the person why it reached them."""
    heading: str
    reason: str
    greeting: str = ''
    intro: tuple = ()
    facts: tuple = ()               # (label, value) pairs
    button: tuple | None = None     # (label, url)
    closing: tuple = ()

    def _context(self):
        site = settings.FRONTEND_URL.rstrip('/')
        return {
            'email': self,
            'org_name': ORG_NAME,
            'org_address': settings.ORG_ADDRESS,
            'support_email': settings.SUPPORT_EMAIL,
            'site_url': site,
            'privacy_url': f'{site}/privacy',
            'terms_url': f'{site}/terms',
            'logo_cid': LOGO_CID,
        }

    def plain(self) -> str:
        return render_to_string('email/message.txt', self._context())

    def html(self) -> str:
        return render_to_string('email/message.html', self._context())


def send_email(subject: str, recipient_list: list, email: Email, fail_silently: bool = False, reply_to: list | None = None) -> None:
    message = EmailMultiAlternatives(subject, email.plain(), settings.DEFAULT_FROM_EMAIL, recipient_list, reply_to=reply_to)
    message.attach_alternative(email.html(), 'text/html')
    # "related" lets the HTML point at the logo with cid:, so no public address is needed.
    message.mixed_subtype = 'related'
    logo = MIMEImage(LOGO.read_bytes(), 'png')
    logo.add_header('Content-ID', f'<{LOGO_CID}>')
    logo.add_header('Content-Disposition', 'inline', filename='logo.png')
    message.attach(logo)
    message.send(fail_silently=fail_silently)


def send_email_async(subject: str, recipient_list: list, email: Email, fail_silently: bool = True, reply_to: list | None = None) -> None:
    """Fire and forget: SMTP never holds up the request that caused the email."""
    threading.Thread(target=send_email, args=(subject, recipient_list, email, fail_silently, reply_to), daemon=True).start()
