import pymysql
pymysql.install_as_MySQLdb()

from pathlib import Path

import environ
import os

from datetime import timedelta
from celery.schedules import crontab

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# env
env = environ.Env() 
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

SECRET_KEY = env('SECRET_KEY')

DEBUG = env.bool('DEBUG', default=False)

ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',             
    'corsheaders',
    'django_celery_beat',
    'TicketAppB',
    'FCM.apps.FcmConfig',
]


MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'Backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'Backend.wsgi.application'


# Database

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': env('DB_NAME'),
        'USER': env('DB_USER'),
        'PASSWORD': env('DB_PASSWORD'),
        'HOST': env('DB_HOST'),
        'PORT': env('DB_PORT'),
        'CONN_MAX_AGE': 60,
        'OPTIONS': {
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}


# custom user model
AUTH_USER_MODEL = 'TicketAppB.CustomUser'


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
LANGUAGE_CODE = 'en-us'

USE_I18N = True

USE_TZ = True
TIME_ZONE = 'Asia/Kolkata'


# Logging is configured programmatically in TicketAppB.apps.TicketappbConfig.ready()
# via TicketAppB.log_handlers.configure_logging(). Disable Django's auto-config here.
LOGGING_CONFIG = None


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'

MEDIA_ROOT = os.path.join(BASE_DIR, 'uploads')
MEDIA_URL  = '/uploads/'

# Default primary key field type

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS')

CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'TicketAppB.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
        'TicketAppB.permissions.LicensePermission',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
}

# Session idle timeout in seconds. Read from env.
SESSION_IDLE_TIMEOUT = int(env('SESSION_IDLE_TIMEOUT', default=1200))
SESSION_IDLE_TIMEOUT_APK = int(env('SESSION_IDLE_TIMEOUT_APK', default=43200))


COOKIE_SECURE = env.bool('COOKIE_SECURE', default=not DEBUG)
SESSION_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_SECURE = COOKIE_SECURE

SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'



# License Server Configuration
LICENSE_SERVER_BASE_URL = env('LICENSE_SERVER_BASE_URL')
PRODUCT_REGISTRATION_ENDPOINT = env('PRODUCT_REGISTRATION_ENDPOINT', default='/product-registration')
PRODUCT_AUTH_ENDPOINT = env('PRODUCT_AUTH_ENDPOINT', default='/product-authentication')

# Construct full URLs
PRODUCT_REGISTRATION_URL = f"{LICENSE_SERVER_BASE_URL}{PRODUCT_REGISTRATION_ENDPOINT}"
PRODUCT_AUTH_URL = f"{LICENSE_SERVER_BASE_URL}{PRODUCT_AUTH_ENDPOINT}"

# Application Configuration
APP_VERSION   = env('APP_VERSION')
PROJECT_NAME  = env('PROJECT_NAME')
DEVICE_MODEL  = env('DeviceModel',  default='Windows')
DEVICE_TYPE   = env.int('DeviceType', default=1)

# Payment aggregator salt
AGGREGATOR_SALT=env('AGGREGATOR_SALT')

# automatically append slash to URLs (for DRF)
APPEND_SLASH = False

# Celery Configuration
CELERY_BROKER_URL = env('CELERY_BROKER_URL')

CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Kolkata'  # Set to your local time

# Optimization for high-concurrency (Reliability)
CELERY_TASK_ACKS_LATE = True # Task isn't "gone" until it's finished
CELERY_WORKER_PREFETCH_MULTIPLIER = 1 # Prevents one worker from hogging 100 tasks
CELERY_TASK_REJECT_ON_WORKER_LOST = True  # Re-queue if worker crashes

# Django Cache (Redis DB 1 — separate from Celery broker on DB 0)
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env('REDIS_CACHE_URL'),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        }
    }
}


CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

CELERY_BEAT_SCHEDULE = {
    'scan-pending-raw-logs': {
        'task': 'TicketAppB.tasks.scan_pending_raw_logs',
        # interval in seconds. runs every 60 seconds
        'schedule': 60.0,
    },
    'cleanup-processed-raw-logs': {
        'task': 'TicketAppB.tasks.cleanup_processed_raw_logs',
        # every day @ 2 AM
        'schedule': crontab(hour=2, minute=0),
    },
    'sweep-stale-sessions': {
        'task': 'TicketAppB.tasks.sweep_stale_sessions',
        'schedule': 600,  # every 10 minutes
    },
    'auto-populate-aggregator-tids': {
        'task': 'TicketAppB.tasks.auto_populate_aggregator_tids',
        'schedule': crontab(hour=0, minute=30),  # daily at 00:30
    },
    'scan-pending-aggregator-reconciliations': {
        'task': 'TicketAppB.tasks.scan_pending_aggregator_reconciliations',
        'schedule': 300.0,  # every 5 minutes
    },
    'scan-unmatched-aggregator-transactions': {
        'task': 'TicketAppB.tasks.scan_unmatched_aggregator_transactions',
        'schedule': 300.0,  # every 5 minutes
    },
}


# email settings
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_PORT = env('EMAIL_PORT',default=587)
EMAIL_USE_TLS = env('EMAIL_USE_TLS',default=True)
EMAIL_HOST_USER = env('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL')

# fcm
FCM_CREDENTIALS_PATH = env("FCM_CREDENTIALS_PATH")