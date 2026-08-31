import uuid
from django.db import models
from django.conf import settings


# ── Company ───────────────────────────────────────────────────────────────────

class Company(models.Model):
    """
    A bus operator company.

    client_type distinguishes two creation paths:
      DIRECT        — Created by superadmin or executive. License comes from the
                      external license server at registration time.
      DEALER_COMPANY — Created by a dealer_admin. License values are filled by
                      the dealer directly (no license server call). Counts are
                      deducted from the dealer's pool.

    License fields (populated at registration / renewal):
      product_registration_id, unique_identifier, product_from_date, product_to_date
      → From license server (DIRECT) or manually entered by dealer (DEALER_COMPANY).

    Count fields (how many of each resource this company is allowed):
      palmtec_count        — max ETM/Palmtec devices
      total_user_count     — max users of any tier
      premium_user_count   — max premium-tier users
      intermediate_user_count — max intermediate-tier users
      (basic users fill the remainder up to total_user_count; no explicit count)
    """

    class AuthStatus(models.TextChoices):
        PENDING    = 'Pending',    'Pending'
        VALIDATING = 'Validating', 'Validating'
        APPROVED   = 'Approve',    'Approved'
        EXPIRED    = 'Expired',    'Expired'
        BLOCKED    = 'Block',      'Blocked'

    class ClientType(models.TextChoices):
        DIRECT         = 'direct',         'Direct'          # superadmin / executive created
        DEALER_COMPANY = 'dealer_company',  'Dealer Company'  # dealer_admin created

    # ── Basic information ─────────────────────────────────────────────────────
    company_id   = models.CharField(max_length=100, unique=True, null=True, blank=True)
    company_name = models.CharField(max_length=100)
    company_email = models.EmailField(unique=True)
    gst_number          = models.CharField(max_length=20, null=True, blank=True)
    aggregator_merchant_id = models.CharField(max_length=50, null=True, blank=True, help_text="Payment aggregator merchant ID assigned to this company")

    # ── Contact ───────────────────────────────────────────────────────────────
    contact_person = models.CharField(max_length=100)
    contact_number = models.CharField(max_length=20)

    # ── Address ───────────────────────────────────────────────────────────────
    address  = models.TextField()
    state    = models.CharField(max_length=100)
    district = models.CharField(max_length=100, blank=True, null=True)

    # ── Creation path ─────────────────────────────────────────────────────────
    client_type = models.CharField(
        max_length=20,
        choices=ClientType.choices,
        default=ClientType.DIRECT,
        db_index=True,
    )

    # Dealer link — set only for DEALER_COMPANY. Null for DIRECT companies.
    # Replaces DealerCustomerMapping (which was a separate join table).
    dealer = models.ForeignKey(
        'Dealer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='companies',
        help_text='Set only for dealer-created companies. Null for direct companies.',
    )

    # ── License / registration fields (from license server or dealer form) ────
    authentication_status = models.CharField(
        max_length=20,
        choices=AuthStatus.choices,
        default=AuthStatus.PENDING,
        null=True,
        blank=True,
        db_index=True,
    )
    product_registration_id = models.IntegerField(null=True, blank=True)
    unique_identifier       = models.CharField(max_length=255, null=True, blank=True)
    product_from_date       = models.DateField(null=True, blank=True)
    product_to_date         = models.DateField(null=True, blank=True, db_index=True)

    # ── Counts (how many resources this company is allowed) ───────────────────
    # palmtec_count: max ETM / Palmtec devices that can be mapped to this company.
    palmtec_count           = models.IntegerField(default=0, null=True, blank=True)
    # total_user_count: max simultaneous logins (concurrent session cap, not a creation limit).
    total_user_count        = models.IntegerField(default=0, null=True, blank=True)
    # premium_user_count / intermediate_user_count: concurrent sub-limits by tier.
    premium_user_count      = models.IntegerField(default=0, null=True, blank=True)
    intermediate_user_count = models.IntegerField(default=0, null=True, blank=True)
    # number_of_licences: total capacity ceiling from the license server registration page.
    # PalmtecCount + TotalUserCount must not exceed this value.
    number_of_licences      = models.IntegerField(default=0, null=True, blank=True)
    # error_message: set when license validation hard-blocks (e.g. count inconsistency).
    # Cleared on successful authentication or sync.
    error_message           = models.CharField(max_length=500, null=True, blank=True)

    # ── Status ────────────────────────────────────────────────────────────────
    is_active = models.BooleanField(default=True, db_index=True)

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='companies_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'company'
        verbose_name = 'Company'
        verbose_name_plural = 'Companies'
        indexes = [
            models.Index(fields=['state', 'is_active']),
            models.Index(fields=['dealer', 'is_active']),
            models.Index(fields=['client_type']),
        ]

    def __str__(self):
        return self.company_name

    # ── Status helpers ────────────────────────────────────────────────────────

    @property
    def is_validated(self):
        return self.authentication_status == self.AuthStatus.APPROVED

    @property
    def needs_validation(self):
        return self.authentication_status == self.AuthStatus.PENDING

    @property
    def is_validating(self):
        return self.authentication_status == self.AuthStatus.VALIDATING


# ── Depot ─────────────────────────────────────────────────────────────────────

class Depot(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='depots',
    )
    depot_code = models.CharField(max_length=50)
    depot_name = models.CharField(max_length=100)
    address    = models.TextField()

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='depots_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'depot'
        unique_together = [['company', 'depot_code']]
        indexes = [
            models.Index(fields=['company', 'depot_code']),
        ]

    def __str__(self):
        return f'{self.depot_name} ({self.company.company_name})'


# ── Dealer ────────────────────────────────────────────────────────────────────

class Dealer(models.Model):
    """
    A dealer intermediary. Dealers have their own license (from the license server,
    Path A) and distribute counts from that license to their client companies (Path B).

    Available pool counts are computed live from child company records via
    properties (slots_remaining, users_slots_remaining). No stored counters —
    the properties aggregate from active Company rows on every read, so they
    are always accurate without any deduction/restoration logic.

    A dealer's license_valid_to sets the maximum expiry date they can grant to
    any company they create.
    """

    class AuthStatus(models.TextChoices):
        PENDING    = 'Pending',    'Pending'
        VALIDATING = 'Validating', 'Validating'
        APPROVED   = 'Approve',    'Approved'
        EXPIRED    = 'Expired',    'Expired'
        BLOCKED    = 'Block',      'Blocked'

    # ── Basic information ─────────────────────────────────────────────────────
    dealer_code    = models.CharField(max_length=50, unique=True)
    dealer_name    = models.CharField(max_length=150)
    contact_person = models.CharField(max_length=100)
    contact_number = models.CharField(max_length=20)
    email          = models.EmailField(unique=True)
    address        = models.TextField()
    state          = models.CharField(max_length=100)
    district       = models.CharField(max_length=100, blank=True, null=True)
    gst_number     = models.CharField(max_length=20, null=True, blank=True)

    # ── License (dealer's own — from license server) ──────────────────────────
    authentication_status   = models.CharField(
        max_length=20,
        choices=AuthStatus.choices,
        default=AuthStatus.PENDING,
        null=True,
        blank=True,
        db_index=True,
    )
    product_registration_id = models.IntegerField(null=True, blank=True)
    unique_identifier       = models.CharField(max_length=255, null=True, blank=True)
    product_from_date       = models.DateField(null=True, blank=True)
    product_to_date         = models.DateField(null=True, blank=True, db_index=True)

    # ── Total counts (what the license server granted to this dealer) ─────────
    palmtec_count           = models.IntegerField(default=0)
    total_user_count        = models.IntegerField(default=0)
    premium_user_count      = models.IntegerField(default=0)
    intermediate_user_count = models.IntegerField(default=0)
    number_of_licences      = models.IntegerField(default=0, null=True, blank=True)
    error_message           = models.CharField(max_length=500, null=True, blank=True)

    # ── Status ────────────────────────────────────────────────────────────────
    is_active = models.BooleanField(default=True, db_index=True)

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dealers_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dealer'
        indexes = [
            models.Index(fields=['dealer_code']),
            models.Index(fields=['dealer_name']),
            models.Index(fields=['is_active']),
            models.Index(fields=['state', 'is_active']),
        ]

    def __str__(self):
        return f'{self.dealer_code} — {self.dealer_name}'

    @property
    def is_validated(self):
        return self.authentication_status == self.AuthStatus.APPROVED

    # ── Live-computed pool counts (replaces stored remaining_* fields) ─────────

    @property
    def slots_given_to_companies(self):
        """Sum of palmtec_count promised to all active companies under this dealer."""
        from django.db.models import Sum
        result = Company.objects.filter(
            dealer=self, is_active=True
        ).aggregate(total=Sum('palmtec_count'))
        return result['total'] or 0

    @property
    def slots_remaining(self):
        """Slots dealer can still promise to new companies. Never negative."""
        return max(0, self.palmtec_count - self.slots_given_to_companies)

    @property
    def devices_total(self):
        """Physical devices superadmin has given this dealer (all statuses)."""
        return ETMDevice.objects.filter(dealer=self).count()

    @property
    def devices_in_pool(self):
        """Physical devices sitting in dealer pool, not yet sent to a company."""
        return ETMDevice.objects.filter(
            dealer=self,
            allocation_status=ETMDevice.AllocationStatus.DEALER_POOL
        ).count()

    @property
    def devices_at_clients(self):
        """Physical devices currently allocated to a client company."""
        return ETMDevice.objects.filter(
            dealer=self,
            allocation_status=ETMDevice.AllocationStatus.ALLOCATED
        ).count()

    @property
    def devices_capacity_remaining(self):
        """How many more physical devices superadmin can push to this dealer."""
        return max(0, self.palmtec_count - self.devices_total)

    @property
    def users_given_to_companies(self):
        from django.db.models import Sum
        result = Company.objects.filter(
            dealer=self, is_active=True
        ).aggregate(
            total=Sum('total_user_count'),
            premium=Sum('premium_user_count'),
            inter=Sum('intermediate_user_count'),
        )
        return {
            'total':   result['total']   or 0,
            'premium': result['premium'] or 0,
            'inter':   result['inter']   or 0,
        }

    @property
    def users_slots_remaining(self):
        given        = self.users_given_to_companies
        dealer_basic = max(0, self.total_user_count - self.premium_user_count - self.intermediate_user_count)
        given_basic  = max(0, given['total'] - given['premium'] - given['inter'])
        return {
            'total':   max(0, self.total_user_count        - given['total']),
            'premium': max(0, self.premium_user_count      - given['premium']),
            'inter':   max(0, self.intermediate_user_count - given['inter']),
            'basic':   max(0, dealer_basic - given_basic),
        }


# ── ETMDevice ─────────────────────────────────────────────────────────────────

class ETMDevice(models.Model):
    """
    A physical Palmtec ETM (Electronic Ticket Machine) device or Android-based device.

    serial_number — hardware ID. Imported by production users via Excel upload.
                    Unique globally.

    palmtec_id    — logical identifier assigned by the company admin in the web UI.
                    The company admin maps "serial_number → palmtec_id" on the
                    device listing page. This ID is sent to the device via
                    masterdata download (SettingsProfile). Once configured,
                    the device uses this ID in all its data transmissions.

    Allocation flow:
      1. Production user uploads serial numbers → status = STOCK
      2. Superadmin allocates to dealer → status = DEALER_POOL, dealer FK set
      3. Dealer allocates to company (or superadmin directly to company) →
         status = ALLOCATED, company FK set
      4. Company admin assigns palmtec_id on the device listing page
      5. Masterdata download configures the device with its palmtec_id

    Device reassignment is a pending implementation (see pending-implementations.txt).
    """

    class DeviceType(models.TextChoices):
        ETM     = 'ETM',     'ETM (Electronic Ticket Machine)'
        ANDROID = 'ANDROID', 'Android App Device'

    class AllocationStatus(models.TextChoices):
        STOCK       = 'Stock',      'Stock'        # imported, not yet assigned
        DEALER_POOL = 'DealerPool', 'Dealer Pool'  # assigned to dealer
        ALLOCATED   = 'Allocated',  'Allocated'    # assigned to company
        # INACTIVE removed — decommissioning is now handled by is_active=False

    serial_number = models.CharField(max_length=100, unique=True, db_index=True)
    device_type   = models.CharField(
        max_length=20,
        choices=DeviceType.choices,
        default=DeviceType.ETM,
    )

    # Palmtec ID — assigned by company admin. Null until assigned.
    # Notification is shown to company admin on login if any allocated device is missing this.
    palmtec_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=(
            'Client-assigned device identifier (max 6 digits). '
            'Assigned by company admin on the device listing page. '
            'Sent to device via masterdata download.'
        ),
    )

    # for accomodating the terminal ID assigned by the payment aggregator to each device.
    aggregator_tid =  models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        help_text="Holds the terminal ID assigned by the payment aggregator to each ETM device")

    company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='etm_devices',
    )
    dealer = models.ForeignKey(
        Dealer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='etm_devices',
    )

    allocation_status = models.CharField(
        max_length=20,
        choices=AllocationStatus.choices,
        default=AllocationStatus.STOCK,
        db_index=True,
    )

    # ── Deactivation ───────────────────────────────────────────────────────────
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text='False = device is suspended. Inbound data will be rejected.',
    )
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='etm_devices_deactivated',
    )

    # ── Unmap tracking ─────────────────────────────────────────────────────────
    # Set when dealer allocates device to a company; tells unmap where to return it.
    source_dealer = models.ForeignKey(
        'Dealer',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='etm_devices_sourced',
    )

    # ── Activity tracking ──────────────────────────────────────────────────────
    has_fetched_setup = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Flips True once on first successful getEtmSetupDetails call.',
    )
    setup_fetched_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(
        null=True, blank=True, db_index=True,
        help_text='Updated on every successful inbound data post (tasks.py).',
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='etm_devices_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'etm_device'
        indexes = [
            models.Index(fields=['serial_number']),
            models.Index(fields=['palmtec_id']),
            models.Index(fields=['company', 'allocation_status']),
            models.Index(fields=['company', 'palmtec_id']),
            models.Index(fields=['dealer']),
            models.Index(fields=['allocation_status']),
            models.Index(fields=['is_active']),
            models.Index(fields=['company', 'is_active']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'palmtec_id'],
                name='uniq_etmdevice_company_palmtec_id',
            ),
        ]

    def __str__(self):
        company_name = self.company.company_name if self.company else 'Unassigned'
        pid = f' [PalmtecID: {self.palmtec_id}]' if self.palmtec_id else ' [No Palmtec ID]'
        return f'{self.serial_number} ({self.device_type}){pid} — {company_name}'
