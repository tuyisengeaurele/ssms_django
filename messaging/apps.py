from django.apps import AppConfig


class MessagingConfig(AppConfig):
    # Not "messages": django.contrib.messages already holds that name.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'messaging'
