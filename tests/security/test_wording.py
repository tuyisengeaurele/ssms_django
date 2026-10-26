"""Farmers and supervisors do not know about administrators, so what the API says to them points to the SSMS team."""
import re
from pathlib import Path

import pytest
from django.core import mail

from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

ROOT = Path(__file__).resolve().parents[2]

# Code that only runs for an administrator, or a comment that explains an admin screen, may use the word.
ADMIN_ONLY = {
    Path('users/admin_views.py'),
    Path('users/serializers.py'),
    Path('core/csvsafe.py'),
}
SKIPPED_DIRS = {'venv', '.venv', 'site-packages', 'tests', 'migrations', 'node_modules', 'frontend', 'staticfiles', '.git', 'scripts', 'docs'}


def python_files():
    for path in ROOT.rglob('*.py'):
        relative = path.relative_to(ROOT)
        if SKIPPED_DIRS & set(relative.parts) or relative.name.startswith('test'):
            continue
        yield relative


def test_no_message_outside_the_admin_code_names_administrators():
    found = []
    for relative in python_files():
        if relative in ADMIN_ONLY:
            continue
        for number, line in enumerate((ROOT / relative).read_text(encoding='utf-8').splitlines(), 1):
            if re.search(r'administrator', line, re.IGNORECASE):
                found.append(f'{relative}:{number}')
    assert found == []


def test_the_invitation_email_does_not_mention_an_administrator_to_a_farmer(auth_client):
    admin = auth_client(UserFactory(role='ADMIN'))
    admin.post('/api/admin/users', {'name': 'Aline Uwase', 'email': 'aline@example.rw', 'role': 'FARMER'}, format='json')
    body = mail.outbox[0].body
    assert 'An SSMS account has been created for you as a farmer.' in body
    assert 'administrator' not in body.lower()
