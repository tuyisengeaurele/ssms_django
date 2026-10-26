from datetime import timedelta
from pathlib import Path

import dj_database_url
import sentry_sdk
from decouple import config

from core.config import parse_list

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = parse_list(config('ALLOWED_HOSTS', default='localhost,127.0.0.1'))

# Railway injects RAILWAY_PUBLIC_DOMAIN — add it automatically so the
# health checker and public domain both work without manual config.
_railway_domain = config('RAILWAY_PUBLIC_DOMAIN', default='')
if _railway_domain and _railway_domain not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_railway_domain)

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',   # JWT blacklist on logout
    'corsheaders',
    'users',
    'cooperatives',
    'farms',
    'batches',
    'sensors',
    'alerts',
    'harvest',
    'contacts',
    'audit_log',
    'reports',
]

# ── Password reset token TTL (1 hour) ─────────────────────────────────────────
PASSWORD_RESET_TIMEOUT = 3600

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'core.middleware.SecurityHeadersMiddleware',
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

# ── Database ──────────────────────────────────────────────────────────────────
# Prefer DATABASE_URL (Railway / Render inject this automatically).
# Fall back to individual env vars for local development.
_DATABASE_URL = config('DATABASE_URL', default='')

if _DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(
            _DATABASE_URL,
            conn_max_age=60,          # persistent connections — reduces connection churn
            conn_health_checks=True,  # drop stale connections automatically
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME':     config('DB_NAME', default=''),
            'USER':     config('DB_USER', default=''),
            'PASSWORD': config('DB_PASSWORD', default=''),
            'HOST':     config('DB_HOST', default='localhost'),
            'PORT':     config('DB_PORT', default='5432'),
            'CONN_MAX_AGE': 60,
        }
    }

AUTH_USER_MODEL = 'users.User'

AUTHENTICATION_BACKENDS = [
    'core.auth_backends.BcryptAuthBackend',
]

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
        'OPTIONS': {'user_attributes': ('name', 'email')},
    },
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'core.validators.ComplexityValidator'},
]

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

# How many reverse proxies sit in front of the app. 0 on a laptop. Set to 1 behind a single host
# proxy such as Render. Throttles and audit logs only believe X-Forwarded-For up to this depth.
TRUSTED_PROXY_COUNT = config('TRUSTED_PROXY_COUNT', default=0, cast=int)

# Throttle counters must be shared by every worker, so they live in the database.
# Create the table once with: python manage.py createcachetable
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'django_cache',
    },
}

REST_FRAMEWORK = {
    'NUM_PROXIES': TRUSTED_PROXY_COUNT,
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
        'login': '10/minute',
        'register': '20/minute',
        'password_reset': '5/minute',
        'contact': '5/hour',
    },
}

SIMPLE_JWT = {
    # Short access tokens, because one cannot be taken back. A refresh token lasts a week and is
    # replaced every time it is used, so a stolen one stops working as soon as the owner refreshes.
    'ACCESS_TOKEN_LIFETIME':  timedelta(minutes=config('JWT_ACCESS_MINUTES', default=15, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('JWT_REFRESH_DAYS', default=7, cast=int)),
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': config('JWT_SECRET'),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'ROTATE_REFRESH_TOKENS':   True,   # issue a new refresh token on every refresh
    'BLACKLIST_AFTER_ROTATION': True,  # blacklist the old refresh token after rotation
}

CORS_ALLOWED_ORIGINS = parse_list(config('CORS_ALLOWED_ORIGINS', default='http://localhost:5173'))
CORS_ALLOW_CREDENTIALS = True

APPEND_SLASH = False

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

# Media files are now served via Cloudinary — MEDIA_ROOT is only used
# locally when DEBUG=True for non-detection uploads (if any).
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ── Cloudinary (disease detection image storage) ──────────────────────────────
CLOUDINARY_CLOUD_NAME    = config('CLOUDINARY_CLOUD_NAME',    default='dsmpn69ux')
CLOUDINARY_UPLOAD_PRESET = config('CLOUDINARY_UPLOAD_PRESET', default='ssms_images')

# ── Email (Gmail SMTP) ────────────────────────────────────────────────────────
# Real mail by default. Set EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend to print emails instead of sending them.
EMAIL_BACKEND       = config('EMAIL_BACKEND', default='django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST          = 'smtp.gmail.com'
EMAIL_PORT          = 587
EMAIL_USE_TLS       = True
EMAIL_HOST_USER     = config('EMAIL_HOST_USER',     default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL  = config('DEFAULT_FROM_EMAIL',  default='SSMS <smartsericulturerw@gmail.com>')
FRONTEND_URL        = config('FRONTEND_URL',        default='http://localhost:5173')

# AI microservice (FastAPI — deployed separately)
AI_SERVICE_URL = config('AI_SERVICE_URL', default='http://localhost:8001')
# Shared with the AI service, which refuses requests that do not carry it.
AI_SERVICE_SECRET = config('AI_SERVICE_SECRET', default='')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Security headers (production only) ───────────────────────────────────────
if not DEBUG:
    # The host's load balancer terminates SSL and forwards plain HTTP, so trust its
    # X-Forwarded-Proto header to tell whether the visitor used HTTPS.
    SECURE_PROXY_SSL_HEADER      = ('HTTP_X_FORWARDED_PROTO', 'https')

    # Send every visitor to HTTPS, except the health probe, which may arrive as plain HTTP.
    SECURE_SSL_REDIRECT          = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
    SECURE_REDIRECT_EXEMPT       = [r'^api/health$']

    # Cookies only travel over HTTPS.
    SESSION_COOKIE_SECURE        = True
    CSRF_COOKIE_SECURE           = True

    # HSTS — tell browsers to only use HTTPS for 1 year
    SECURE_HSTS_SECONDS          = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD          = True

    # Prevent MIME-type sniffing
    SECURE_CONTENT_TYPE_NOSNIFF  = True

    # Prevent clickjacking
    X_FRAME_OPTIONS              = 'DENY'

    # Referrer policy
    SECURE_REFERRER_POLICY       = 'strict-origin-when-cross-origin'

# ── Sentry error monitoring ───────────────────────────────────────────────────
SENTRY_DSN = config('SENTRY_DSN', default='')

if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=config('SENTRY_TRACES_SAMPLE_RATE', default=0.1, cast=float),
        profiles_sample_rate=config('SENTRY_PROFILES_SAMPLE_RATE', default=0.1, cast=float),
        environment=config('DJANGO_ENV', default='production'),
        send_default_pii=False,
    )
