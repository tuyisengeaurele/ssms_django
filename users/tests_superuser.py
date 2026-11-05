import pytest

from users.models import Role, User


@pytest.mark.django_db
def test_an_admin_made_on_the_command_line_can_sign_in_without_an_email_link():
    # The owner has no account to sign in with yet, so nobody could send a first link.
    admin = User.objects.create_superuser(email='first@example.com', password='Str0ngPass!word', name='First')
    assert admin.role == Role.ADMIN
    assert admin.is_email_verified is True


@pytest.mark.django_db
def test_a_normal_user_still_has_to_verify_the_email():
    user = User.objects.create_user(email='farmer@example.com', password='Str0ngPass!word', name='Farmer')
    assert user.is_email_verified is False
