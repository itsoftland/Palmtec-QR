import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.conf import settings
from .managers import CustomUserManager


# ── Role choices ──────────────────────────────────────────────────────────────

class UserRole(models.TextChoices):
    SUPERADMIN    = 'superadmin',    'Superadmin'
    EXECUTIVE     = 'executive',     'Executive'
    PRODUCTION    = 'production',    'Production'
    DEALER_ADMIN  = 'dealer_admin',  'Dealer Admin'
    COMPANY_ADMIN = 'company_admin', 'Company Admin'
    COMPANY_USER  = 'company_user',  'Company User'


# ── Tier choices ──────────────────────────────────────────────────────────────

class UserTier(models.TextChoices):
    NONE         = 'none',         'None'
    BASIC        = 'basic',        'Basic'
    INTERMEDIATE = 'intermediate', 'Intermediate'
    PREMIUM      = 'premium',      'Premium'


# Roles that should never have a tier assigned.
# company_admin access is role-based (full company scope), not tier-based.
_NON_COMPANY_ROLES = {
    UserRole.SUPERADMIN,
    UserRole.EXECUTIVE,
    UserRole.PRODUCTION,
    UserRole.DEALER_ADMIN,
    UserRole.COMPANY_ADMIN,
}


# ── CustomUser ────────────────────────────────────────────────────────────────

class CustomUser(AbstractUser):
    """
    Central user model. Inherits AbstractUser for password hashing, last_login,
    is_active (used as soft-delete flag), is_staff, is_superuser, etc.

    role  — hierarchy position (who you are, what you can manage)
    tier  — feature access level (what reports/functions you can use)
            Only meaningful for company_admin and company_user.
            Must be 'none' for all other roles.

    is_active = False → soft-delete. The record stays in DB.
                        Frees the tier slot automatically (count queries
                        filter is_active=True only).
    """

    # ── Role & Tier ───────────────────────────────────────────────────────────
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.COMPANY_USER,
        db_index=True,
    )
    tier = models.CharField(
        max_length=20,
        choices=UserTier.choices,
        default=UserTier.NONE,
        db_index=True,
    )

    # ── Email (required, unique — used for self-service password reset) ───────
    # AbstractUser has the email field; we override it to enforce uniqueness.
    # IMPORTANT: inform users on creation that this email must be valid and
    # accessible, as it is the only way to recover a lost password.
    email = models.EmailField(
        unique=True,
        help_text=(
            'Required. Used for password reset — must be a valid, accessible address.'
        ),
    )

    # ── State (executive_user only) ───────────────────────────────────────────
    # The Indian state this executive is restricted to. Null for all other roles.
    # Executive can only create companies/dealers in this state.
    # On login, executive sees only companies in this state that they created.
    state = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Mapped state for executive users. Must be null for all other roles.',
    )

    # ── Entity links ──────────────────────────────────────────────────────────
    # Exactly one of these should be set, depending on the role:
    #   superadmin / executive / production → both null
    #   dealer_admin                        → dealer set, company null
    #   company_admin / company_user        → company set, dealer null
    company = models.ForeignKey(
        'Company',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
    )
    dealer = models.ForeignKey(
        'Dealer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
    )

    # ── Audit ─────────────────────────────────────────────────────────────────
    # Self-referential: who created this user. Nullable so superadmin (root)
    # and script-created users have no creator. SET_NULL because users are
    # soft-deleted (is_active=False), not hard-deleted, so this rarely triggers.
    created_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users_created',
    )

    # ── Verification ──────────────────────────────────────────────────────────
    is_verified = models.BooleanField(
        default=False,
        help_text='Whether the user has been explicitly verified/activated by an admin.',
    )

    objects = CustomUserManager()

    # email is already in USERNAME_FIELD context; add it to REQUIRED_FIELDS
    # so `manage.py createsuperuser` prompts for it.
    REQUIRED_FIELDS = ['email']

    class Meta:
        db_table = 'custom_user'
        indexes = [
            models.Index(fields=['role', 'is_active']),
            models.Index(fields=['company', 'is_active']),
            models.Index(fields=['dealer', 'is_active']),
        ]

    def __str__(self):
        return f'{self.username} ({self.get_role_display()})'

    def clean(self):
        super().clean()
        # Tier must be 'none' for non-company roles
        if self.role in _NON_COMPANY_ROLES and self.tier != UserTier.NONE:
            raise ValidationError({
                'tier': (
                    f'Tier must be "none" for role "{self.get_role_display()}". '
                    'Tier is only applicable to company_admin and company_user.'
                )
            })
        # State must be set for executive, null for everyone else
        if self.role == UserRole.EXECUTIVE and not self.state:
            raise ValidationError({
                'state': 'State is required for executive users.'
            })
        if self.role != UserRole.EXECUTIVE and self.state:
            raise ValidationError({
                'state': 'State must be empty for non-executive users.'
            })

    # ── Convenience properties ────────────────────────────────────────────────

    @property
    def is_company_level(self):
        """True for company_admin and company_user."""
        return self.role in {UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER}

    @property
    def is_system_level(self):
        """True for superadmin, executive, and production users."""
        return self.role in {UserRole.SUPERADMIN, UserRole.EXECUTIVE, UserRole.PRODUCTION}

    @property
    def is_dealer_level(self):
        return self.role == UserRole.DEALER_ADMIN


# ── UserSession ───────────────────────────────────────────────────────────────

class UserSession(models.Model):
    """
    Tracks one active session per user across all platforms (web and APK).

    One session per user enforced at login:
      - If an is_active=True session exists → reject new login (403 SESSION_CONFLICT).
      - If force_login=True → kill old session, create new one.
      - Superadmin is exempt from this limit.

    Web:  session stored as HttpOnly cookie (pqr_session).
    APK:  same cookie; no token refresh cycle. A 401 means the session is dead.

    Session validity is checked on every request via SessionAuthentication
    (Redis cache → DB fallback). No JWTs. No token refresh.
    """

    class DeviceType(models.TextChoices):
        ANDROID     = 'android',     'Android'
        IOS         = 'ios',         'iOS'
        WEB_DESKTOP = 'web_desktop', 'Web Desktop'
        WEB_MOBILE  = 'web_mobile',  'Web Mobile'
        UNKNOWN     = 'unknown',     'Unknown'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sessions',
    )
    session_uid = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        db_index=True,
    )
    device_type = models.CharField(
        max_length=20,
        choices=DeviceType.choices,
        default=DeviceType.UNKNOWN,
    )
    user_agent = models.TextField(blank=True, null=True)

    # True on login, False on logout.
    # Middleware rejects requests where is_active=False (session was killed).
    is_active = models.BooleanField(default=True, db_index=True)

    # Updated on every authenticated request (debounced — at most once per 5 min).
    last_seen_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # MAC address / hardware UUID from APK login payload. Stored for future FCM use.
    device_uuid = models.CharField(max_length=255, null=True, blank=True)

    # FCM Token
    fcm_token = models.TextField(
                null=True,
                blank=True
            )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_session'
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['user', 'is_active', 'last_seen_at']),
        ]

    def __str__(self):
        status = 'Active' if self.is_active else 'Inactive'
        return f'{self.user.username} | {self.device_type} | {status}'


# ── UserApprovedDevice ────────────────────────────────────────────────────────

class UserApprovedDevice(models.Model):
    """
    Records devices (by UUID/MAC address) that a company_admin has approved
    for a company_user. APK logins from an unrecognised UUID are blocked until
    an entry exists here.

    is_revoked — future use: allow company_admin to revoke a lost/stolen device.
    """

    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='approved_devices',
    )
    device_uuid = models.CharField(max_length=255, db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='devices_approved',
    )
    approved_at = models.DateTimeField(auto_now_add=True)
    is_revoked  = models.BooleanField(default=False)

    class Meta:
        db_table = 'user_approved_device'
        unique_together = [('user', 'device_uuid')]
        indexes = [
            models.Index(fields=['user', 'device_uuid', 'is_revoked']),
        ]

    def __str__(self):
        return f'{self.user.username} | {self.device_uuid[:16]}…'


# ── DevicePendingApproval ─────────────────────────────────────────────────────

class DevicePendingApproval(models.Model):
    """
    Created when a company_user attempts an APK login from an unrecognised UUID.
    company_admin reviews and approves or rejects from the sessions page.
    On approval: UserApprovedDevice record created, user.is_verified set True.
    """

    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='device_approvals',
    )
    device_uuid  = models.CharField(max_length=255)
    device_type  = models.CharField(max_length=20, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    status       = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    reviewed_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='device_approvals_reviewed',
    )
    reviewed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'device_pending_approval'
        indexes = [
            models.Index(fields=['user', 'status']),
        ]

    def __str__(self):
        return f'{self.user.username} | {self.device_uuid[:16]}… | {self.status}'



class FCMSession(models.Model):

    class DeviceType(models.TextChoices):
        ANDROID     = 'android',     'Android'
        IOS         = 'ios',         'iOS'
        WEB_DESKTOP = 'web_desktop', 'Web Desktop'
        WEB_MOBILE  = 'web_mobile',  'Web Mobile'
        UNKNOWN     = 'unknown',     'Unknown'


    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='fcm_sessions',
    )

    device_type = models.CharField(
        max_length=20,
        choices=DeviceType.choices,
        default=DeviceType.UNKNOWN,
    )

    user_agent = models.TextField(blank=True, null=True)

    is_active = models.BooleanField(default=True, db_index=True)

    device_uuid = models.CharField(max_length=255, null=True, blank=True)

    fcm_token = models.TextField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'fcm_session'
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]

    def __str__(self):
        status = 'Active' if self.is_active else 'Inactive'
        return f'{self.user.username} | {self.device_type} | {status}'
    
        