from django.db import models
from django.conf import settings


# ── GlobalSettings ────────────────────────────────────────────────────────────

class GlobalSettings(models.Model):
    """
    Single-row table for app-wide configuration managed by superadmin.

    Currently stores the developer/support contact info shown on every
    company's About page ("For any help or queries, contact: ...").

    The entry UI is superadmin-only. The output (shown on About page)
    is visible to all company-level users.

    Single-row enforcement: save() always writes to pk=1.
    Use GlobalSettings.get() as the standard accessor — creates the row
    with blank values if it does not yet exist.
    """

    # Developer / support contact info
    support_company_name = models.CharField(max_length=200, blank=True, null=True)
    support_email        = models.EmailField(blank=True, null=True)
    support_phone        = models.CharField(max_length=20, blank=True, null=True)

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='global_settings_updated',
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'global_settings'
        verbose_name = 'Global Settings'
        verbose_name_plural = 'Global Settings'

    def save(self, *args, **kwargs):
        # Enforce single-row constraint
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Prevent deletion — just clear the fields instead
        pass

    @classmethod
    def get(cls):
        """Return the singleton GlobalSettings row, creating it if absent."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Global Settings'


# ── AuditLog ──────────────────────────────────────────────────────────────────

class AuditLog(models.Model):
    """
    Immutable audit trail for all management-level actions.

    Scope: CustomUser, Company, Dealer, ETMDevice, device mappings, masterdata
           imports (who triggered which MDB/Excel import).
    NOT for: TransactionData, TripData, ScheduleData — those are device-generated.

    actor_username_snapshot preserves the actor's username even if the actor
    user is later soft-deleted (is_active=False).

    Records are never deleted. AuditLog is an append-only table.
    """

    class ActionType(models.TextChoices):
        CREATE             = 'create',             'Create'
        UPDATE             = 'update',             'Update'
        DELETE             = 'delete',             'Delete'
        DEACTIVATE         = 'deactivate',         'Deactivate'
        ACTIVATE           = 'activate',           'Activate'
        PASSWORD_RESET     = 'password_reset',     'Password Reset'
        TIER_CHANGE        = 'tier_change',        'Tier Change'
        ROLE_CHANGE        = 'role_change',        'Role Change'
        DEVICE_ALLOCATE    = 'device_allocate',    'Device Allocate'
        DEVICE_DEALLOCATE  = 'device_deallocate',  'Device Deallocate'
        MDB_IMPORT         = 'mdb_import',         'MDB Import'
        ROUTE_IMPORT       = 'route_import',       'Route Import'
        SERIAL_UPLOAD      = 'serial_upload',      'Serial Number Upload'
        LOGIN              = 'login',              'Login'
        LOGOUT             = 'logout',             'Logout'
        SESSION_TERMINATED = 'session_terminated', 'Session Terminated'
        LICENSE_RENEWAL    = 'license_renewal',    'License Renewal'

    # Who performed the action
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    # Snapshot preserved even if actor is soft-deleted
    actor_username_snapshot = models.CharField(
        max_length=150,
        help_text='Username of the actor at time of action.',
    )

    action = models.CharField(max_length=30, choices=ActionType.choices, db_index=True)

    # What was affected
    target_model   = models.CharField(max_length=100, db_index=True)   # e.g. 'CustomUser', 'Company'
    target_id      = models.CharField(max_length=50, null=True, blank=True)  # PK of the record
    target_display = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text='Human-readable snapshot of the target (e.g. username, company name).',
    )

    # Additional context: before/after state, counts, notes
    details = models.JSONField(null=True, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp  = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_log'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['actor', 'timestamp']),
            models.Index(fields=['target_model', 'target_id']),
            models.Index(fields=['action', 'timestamp']),
        ]

    def __str__(self):
        ts = self.timestamp.strftime('%Y-%m-%d %H:%M') if self.timestamp else '?'
        return (
            f'[{ts}] {self.actor_username_snapshot} '
            f'{self.action} {self.target_model} #{self.target_id}'
        )


# ── DeviceRejectionLog ────────────────────────────────────────────────────────

class DeviceRejectionLog(models.Model):
    """
    Immutable log of device requests rejected by the server.
    Written by tasks.py and setup_data.py. Never deleted.
    """

    class RejectionReason(models.TextChoices):
        DEVICE_NOT_REGISTERED = 'device_not_registered', 'Device not registered to company'
        NOT_ALLOCATED         = 'not_allocated',         'Device not in allocated status'
        DEVICE_INACTIVE       = 'device_inactive',       'Device is deactivated'
        LIMIT_EXCEEDED        = 'limit_exceeded',        'Company device limit exceeded'
        NO_COMPANY            = 'no_company',            'Device has no company assigned'

    palmtec_id_claimed    = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    company_id_claimed    = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    serial_number_claimed = models.CharField(max_length=100, blank=True, null=True)
    rejection_reason      = models.CharField(max_length=30, choices=RejectionReason.choices, db_index=True)
    raw_payload           = models.TextField(blank=True, null=True)
    source                = models.CharField(max_length=50, blank=True, null=True)
    ip_address            = models.GenericIPAddressField(null=True, blank=True)
    created_at            = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'device_rejection_log'
        indexes = [
            models.Index(fields=['palmtec_id_claimed', 'created_at']),
            models.Index(fields=['company_id_claimed', 'created_at']),
        ]

    def __str__(self):
        return f'Rejected palmtec={self.palmtec_id_claimed} reason={self.rejection_reason} @ {self.created_at}'
