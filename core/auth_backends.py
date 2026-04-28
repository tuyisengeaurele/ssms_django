from django.contrib.auth import get_user_model


class BcryptAuthBackend:
    """
    Authenticates users whose passwords may be stored as raw bcrypt hashes
    from the previous Node.js backend, or as Django-hashed passwords for
    newly registered users.
    """

    def authenticate(self, request, email=None, password=None, **kwargs):
        User = get_user_model()
        if not email or not password:
            return None

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return None

        if not user.is_active:
            return None

        stored = user.password or ''

        if stored.startswith(('$2b$', '$2a$', '$2y$')):
            try:
                import bcrypt
                if bcrypt.checkpw(password.encode('utf-8'), stored.encode('utf-8')):
                    return user
            except Exception:
                pass
            return None
        else:
            if user.check_password(password):
                return user
            return None

    def get_user(self, user_id):
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
