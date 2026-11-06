"""The email that tells a person someone from support asks to look at their account."""
from core.mail import Email

SUBJECT = 'SSMS support asks to view your account'


def request_email(access) -> Email:
    asked = 'View only' if access.requested_mode == 'view' else 'View, and make changes if you allow it'
    return Email(
        heading='SSMS support asks to view your account',
        reason='You received this because someone from SSMS support asked to look at your account.',
        greeting=f'Hello {access.person_name},',
        intro=(
            f'{access.admin_name} from SSMS support asks to look at your account. Nothing happens unless you say yes.',
        ),
        facts=(('Reason', access.reason), ('Length', f'{access.minutes} minutes'), ('Asked for', asked)),
        # No button on purpose. Only a signed in person can answer, so a copied email can never approve anything.
        button=None,
        closing=(
            'Open SSMS and sign in. The request waits for 5 minutes, then it lapses.',
            'If you do not know why support would ask, say no.',
        ),
    )
