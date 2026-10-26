import bcrypt
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password

LEGACY_PREFIXES = ('$2b$', '$2a$', '$2y$')

# Checked when the email is unknown, so a missing account takes as long to refuse as a real one.
# Made on first use, so importing this module stays cheap.
_dummy_hash = None


def _burn_a_hash(password: str) -> None:
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = make_password('not-a-real-password')
    check_password(password, _dummy_hash)


class BcryptAuthBackend:
    """
    Authenticates users whose passwords may be stored as raw bcrypt hashes from the previous
    Node.js backend, or as Django-hashed passwords for newly registered users. A raw hash is
    replaced by a Django one the first time its owner signs in.
    """

    def authenticate(self, request, email=None, password=None, **kwargs):
        User = get_user_model()
        if not email or not password:
            return None

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            _burn_a_hash(password)
            return None

        if not user.is_active:
            return None

        stored = user.password or ''

        if stored.startswith(LEGACY_PREFIXES):
            try:
                if not bcrypt.checkpw(password.encode('utf-8'), stored.encode('utf-8')):
                    return None
            except ValueError:
                return None
            user.set_password(password)
            user.save(update_fields=['password'])
            return user

        return user if user.check_password(password) else None

    def get_user(self, user_id):
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
