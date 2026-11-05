"""
Management command: reset_admin_mfa
The last way back in when an admin has lost their phone and their recovery codes and no other admin can reset them.

    python manage.py reset_admin_mfa someone@example.rw

It removes the authenticator app and the recovery codes, and signs every device of that person out. At their next sign in
they set up the app again. Run it with DATABASE_URL set in your own terminal, as for createsuperuser, then close the
terminal. It writes a security event and an audit entry and sends no email.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from audit_log.models import AuditLog
from logs.models import SecurityEvent
from users import mfa
from users.models import Role, SecondFactor

User = get_user_model()


class Command(BaseCommand):
    help = "Reset an admin's authenticator app and recovery codes, and sign their devices out."

    def add_arguments(self, parser):
        parser.add_argument('email', help='The admin whose authenticator app to reset.')

    def handle(self, *args, email, **options):
        target = User.objects.filter(email__iexact=email.strip(), role=Role.ADMIN).first()
        if target is None:
            raise CommandError(f'No admin has the email {email}.')
        if not SecondFactor.objects.filter(user=target).exists():
            raise CommandError(f'{target.email} has no authenticator app to reset.')

        ended = mfa.reset_and_sign_out(target)
        SecurityEvent.objects.create(kind='mfa_reset', user=target, user_email=target.email, detail='Reset from the command line')
        AuditLog.objects.create(
            action='UPDATE', resource='User', resource_id=target.pk,
            detail=f'Reset the second factor of {target.email} from the command line',
        )
        self.stdout.write(
            f'Reset the authenticator app of {target.email} and signed out {ended} devices. '
            'They set it up again at their next sign in.'
        )
