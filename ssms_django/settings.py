from pathlib import Path
from datetime import timedelta
from decouple import config
import sentry_sdk

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'users',
    'cooperatives',
    'farms',
    'batches',
    'sensors',
    'alerts',
    'harvest',
]

# ── Password reset token TTL (hours) ──────────────────────────────────────────
PASSWORD_RESET_TIMEOUT = 3600  # 1 hour

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',   # serve static files in production
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ssms_django.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'ssms_django.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='ssms_db'),
        'USER': config('DB_USER', default='ssms_user'),
        'PASSWORD': config('DB_PASSWORD', default='RwandaKigali@321'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

AUTH_USER_MODEL = 'users.User'

AUTHENTICATION_BACKENDS = [
    'core.auth_backends.BcryptAuthBackend',
]

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'core.jwt_authentication.ActiveUserJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_RENDERER_CLASSES': (
        'djangorestframework_camel_case.render.CamelCaseJSONRenderer',
    ),
    'DEFAULT_PARSER_CLASSES': (
        'djangorestframework_camel_case.parser.CamelCaseJSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ),
    'EXCEPTION_HANDLER': 'core.utils.custom_exception_handler',
    # ── Rate limiting ──────────────────────────────────────────────────────────
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '300/minute',
        'login': '10/minute',          # applied per-view on auth endpoints
        'password_reset': '5/minute',  # applied per-view on reset endpoints
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=config('JWT_EXPIRES_DAYS', default=7, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': config('JWT_SECRET'),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='http://localhost:5173').split(',')
CORS_ALLOW_CREDENTIALS = True

APPEND_SLASH = False  # REST API — no trailing-slash redirects

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ── Email (Gmail SMTP) ────────────────────────────────────────────────────────
EMAIL_BACKEND   = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST      = 'smtp.gmail.com'
EMAIL_PORT      = 587
EMAIL_USE_TLS   = True
EMAIL_HOST_USER     = config('EMAIL_HOST_USER',     default='smartsericulturerw@gmail.com')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='qrke bpmv savx nkag')
DEFAULT_FROM_EMAIL  = config('DEFAULT_FROM_EMAIL',  default='SSMS <smartsericulturerw@gmail.com>')
FRONTEND_URL        = config('FRONTEND_URL',        default='http://localhost:5173')

# AI microservice (FastAPI on port 8001)
AI_SERVICE_URL = config('AI_SERVICE_URL', default='http://localhost:8001')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Sentry error monitoring ───────────────────────────────────────────────────
SENTRY_DSN = config('SENTRY_DSN', default='')

if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        # Capture 100% of transactions in development, 10% in production
        traces_sample_rate=config('SENTRY_TRACES_SAMPLE_RATE', default=0.1, cast=float),
        # Capture 10% of profiles
        profiles_sample_rate=config('SENTRY_PROFILES_SAMPLE_RATE', default=0.1, cast=float),
        environment=config('DJANGO_ENV', default='production'),
        send_default_pii=False,  # Don't send PII (email addresses etc.)
        integrations=[],         # sentry-sdk[django] auto-detects Django integration
    )
