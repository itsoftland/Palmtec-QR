from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class FcmConfig(AppConfig):

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'FCM'

    def ready(self):
        try:
            from .firebase import initialize_firebase

            initialize_firebase()

            import FCM.signals

            logger.info(
                "Firebase Admin SDK initialized successfully"
            )

        except Exception as e:
            logger.error(
                f"Firebase initialization failed: {e}",
                exc_info=True
            )