from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)

class TicketappbConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'TicketAppB'

    # Import signals when Django starts
    def ready(self):
        from django.conf import settings
        from TicketAppB.log_handlers import configure_logging
        configure_logging(base_dir=settings.BASE_DIR, debug=settings.DEBUG)

        import TicketAppB.signals

        # Reset any companies stuck in VALIDATING from a previous crashed/killed process.
        # Uses .update() (single SQL query, no per-object overhead).
        # Wrapped in try/except so manage.py migrate/check never breaks if the
        # table doesn't exist yet (fresh install before first migration).
        try:
            from .models import Company
            Company.objects.filter(
                authentication_status=Company.AuthStatus.VALIDATING
            ).update(authentication_status=Company.AuthStatus.PENDING)
        except Exception as e:
            logger.error(f"Company stuck at VALIDATING couldn't be reverted due to signal registration failure: {e}", exc_info=True)