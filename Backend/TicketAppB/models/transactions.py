from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from .company import Company

# for up and down trip indications.
class Direction(models.TextChoices):
    UP   = 'Up',   'Up'
    DOWN = 'Down', 'Down'


class RawDataLog(models.Model):
    class typeChoices(models.TextChoices):
        TRANSACTION           = 'transaction',           'Transaction'
        TRIP_OPEN             = 'trip_open',             'Trip Open'
        TRIP_CLOSE            = 'trip_close',            'Trip Close'
        TRIP_CLOSE_SUMMARY    = 'trip_close_summary',    'Trip Close Summary'
        SCHEDULE_OPEN         = 'schedule_open',         'Schedule Open'
        SCHEDULE_CLOSE        = 'schedule_close',        'Schedule Close'
        SCHEDULE_CLOSE_SUMMARY = 'schedule_close_summary', 'Schedule Close Summary'

    class statusChoices(models.TextChoices):
        PENDING   = 'pending',   'Pending'
        PROCESSED = 'processed', 'Processed'
        DUPLICATE = 'duplicate', 'Duplicate'
        FAILED    = 'failed',    'Failed'

    raw_payload  = models.TextField()
    source       = models.CharField(choices=typeChoices.choices, max_length=25)
    company_code = models.ForeignKey(
        Company, on_delete=models.PROTECT,
        related_name='raw_data', db_index=True, null=True, blank=True
    )
    # Celery task only touches `pending` rows
    status        = models.CharField(choices=statusChoices.choices, max_length=20, default=statusChoices.PENDING)
    error_message = models.TextField(null=True, blank=True)
    received_at   = models.DateTimeField(auto_now_add=True)
    processed_at  = models.DateTimeField(null=True, blank=True)
    # Incremented each time a superadmin manually retries this row.
    # Capped at MAX_MANUAL_RETRIES (3) in the retry view.
    retry_count   = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'raw_data_log'
        indexes  = [models.Index(fields=['status', 'received_at'])]


class TransactionData(models.Model):
    class PaymentMode(models.TextChoices):
        CASH = 'Cash', 'Cash'
        UPI  = 'UPI',  'UPI'
        # adding card if needed later.
        CARD = 'Card', 'Card'

    # ── Identity ─────────────────────────────────────────────────────────────
    unique_code = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    palmtec_id  = models.CharField(max_length=20)

    # ── Route / Trip ─────────────────────────────────────────────────────────
    # route_code = models.CharField(max_length=50, null=True, blank=True)
    route_id = models.ForeignKey('Route', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')

    trip_id       = models.ForeignKey('TripData',     on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    schedule_id   = models.ForeignKey('ScheduleData', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    ticket_number = models.CharField(max_length=20)
    ticket_date   = models.DateField()
    ticket_time   = models.TimeField()

    # raw ordinal ints from device (1-based sequence position)
    from_stage = models.IntegerField(null=True, blank=True)
    to_stage   = models.IntegerField(null=True, blank=True)
    # resolved FKs — NULL if route stages not yet loaded or ordinal out of range
    from_stage_id = models.ForeignKey('RouteStage', on_delete=models.SET_NULL, null=True, blank=True, related_name='from_transactions')
    to_stage_id   = models.ForeignKey('RouteStage', on_delete=models.SET_NULL, null=True, blank=True, related_name='to_transactions')

    ticket_type = models.IntegerField(null=True, blank=True)

    # ── Passenger counts ─────────────────────────────────────────────────────
    full_count    = models.IntegerField(default=0)
    half_count    = models.IntegerField(default=0)
    st_count      = models.IntegerField(default=0)
    phy_count     = models.IntegerField(default=0)
    lugg_count    = models.IntegerField(default=0)
    ladies_count  = models.IntegerField(default=0)
    senior_count  = models.IntegerField(default=0)
    total_tickets = models.IntegerField(default=0)

    # ── Per-ticket amounts ────────────────────────────────────────────────────
    ticket_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    lugg_amount   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    adjust_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # ── Pass / Warrant / Refund ───────────────────────────────────────────────
    pass_id        = models.CharField(max_length=20, null=True, blank=True)
    warrant_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)
    # char or int/dec after clarification
    refund_status  = models.IntegerField(null=True, blank=True)

    # ── Vehicle / Crew / Schedule (raw strings from device) ──────────────────
    bus_no = models.CharField(max_length=30, null=True, blank=True)
    bus_id = models.ForeignKey('VehicleType', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')

    driver = models.CharField(max_length=50, null=True, blank=True)
    driver_id = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='driven_transactions')

    conductor = models.CharField(max_length=50, null=True, blank=True)
    conductor_id = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='conducted_transactions')

    up_down_trip = models.CharField(max_length=4, choices=Direction.choices, null=True, blank=True)

    # ── Trip start context (device snapshot at ticket issuance) ───────────────
    trip_start_date = models.DateField(null=True, blank=True)
    trip_start_time = models.TimeField(null=True, blank=True)

    # ── Device telemetry ──────────────────────────────────────────────────────
    battery_percentage = models.IntegerField(null=True, blank=True)
    passenger_count    = models.IntegerField(null=True, blank=True)

    # ── Cumulative trip totals from device at point of this ticket ────────────
    # fFullAmt, fHalfAmt, fPhyAmt, fLadiAmt, fSeniorAmt, fLuggageAmt, fSTAmt
    full_total_amount    = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)
    half_total_amount    = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)
    phy_total_amount     = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)
    ladies_total_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)
    senior_total_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)
    luggage_total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)
    st_total_amount      = models.DecimalField(max_digits=10, decimal_places=2, default=0, null=True, blank=True)

    # ── Payment Mode───────────────────────────────────────────────────────────────
    ticket_status   = models.CharField(
        max_length=4, choices=PaymentMode.choices,
        default=PaymentMode.CASH, null=True, blank=True
    )
    #----------------
    # indicate if upi payment verification manual/not
    manual_verified_upi    = models.BooleanField(
        # default=None translates to null
        default=None,null=True,blank=True
    )
    #----------------

    # ── UPI Fields ───────────────────────────────────────────────────────────────
    transaction_id   = models.CharField(max_length=50, null=True, blank=True)
    bqr_merchant_id  = models.CharField(max_length=100, null=True, blank=True)
    reference_number = models.CharField(max_length=50, null=True, blank=True)

    # ── Relations ─────────────────────────────────────────────────────────────
    company_code = models.ForeignKey(
        Company, on_delete=models.PROTECT,
        related_name='transactions', db_index=True, null=True, blank=True
    )

    # ── Raw data ──────────────────────────────────────────────────────────────
    checksum    = models.CharField(max_length=50, null=True, blank=True)
    raw_payload = models.TextField()
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'transaction_data'
        indexes  = [
            models.Index(fields=['palmtec_id', 'ticket_date']),
            models.Index(fields=['company_code']),
            models.Index(fields=['unique_code']),
            models.Index(fields=['ticket_date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['palmtec_id', 'company_code', 'ticket_number', 'ticket_date', 'ticket_time'],
                name='uniq_device_ticket_datetime'
            ),
            # Composite unique constraint scoped per device.
            # MariaDB allows multiple NULLs in a composite unique index
            # (NULL != NULL in index comparisons), so this correctly enforces
            # uniqueness for devices that send a unique_code while allowing
            # multiple rows with unique_code=NULL from older devices.
            models.UniqueConstraint(
                fields=['palmtec_id', 'unique_code'],
                name='uniq_device_unique_code'
            ),
        ]

    def __str__(self):
        return f"{self.ticket_number} - {self.palmtec_id}"


class ScheduleData(models.Model):
    """Merged schedule open+close. Created on ShdOpn; close fields populated on ShdCls."""

    # ── Identity ─────────────────────────────────────────────────────────────
    open_unique_code  = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    close_unique_code = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    palmtec_id        = models.CharField(max_length=20, db_index=True)

    # ── Route / Schedule ─────────────────────────────────────────────────────
    route_id    = models.ForeignKey('Route', on_delete=models.SET_NULL, null=True, blank=True, related_name='schedules')
    schedule_no = models.IntegerField(db_index=True)

    # ── Vehicle / Crew ────────────────────────────────────────────────────────
    bus_no       = models.CharField(max_length=30, null=True, blank=True)
    bus_id       = models.ForeignKey('VehicleType', on_delete=models.SET_NULL, null=True, blank=True, related_name='schedule_data')
    driver       = models.CharField(max_length=50, null=True, blank=True)
    driver_id    = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='driven_schedule_data')
    conductor    = models.CharField(max_length=50, null=True, blank=True)
    conductor_id = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='conducted_schedule_data')

    # ── Open timing ───────────────────────────────────────────────────────────
    start_date     = models.DateField(db_index=True, null=True, blank=True)
    start_time     = models.TimeField(null=True, blank=True)
    start_datetime = models.DateTimeField(db_index=True, null=True, blank=True)
    battery_open   = models.IntegerField(null=True, blank=True)

    # ── Close timing ──────────────────────────────────────────────────────────
    end_date     = models.DateField(null=True, blank=True)
    end_time     = models.TimeField(null=True, blank=True)
    end_datetime = models.DateTimeField(null=True, blank=True)
    battery_close = models.IntegerField(null=True, blank=True)

    # ── Passenger counts (cash) ───────────────────────────────────────────────
    total_tickets  = models.IntegerField(default=0, null=True, blank=True)
    full_count     = models.IntegerField(default=0, null=True, blank=True)
    half_count     = models.IntegerField(default=0, null=True, blank=True)
    physical_count = models.IntegerField(default=0, null=True, blank=True)
    ladies_count   = models.IntegerField(default=0, null=True, blank=True)
    senior_count   = models.IntegerField(default=0, null=True, blank=True)
    luggage_count  = models.IntegerField(default=0, null=True, blank=True)
    st_count       = models.IntegerField(default=0, null=True, blank=True)
    adjust_count   = models.IntegerField(default=0, null=True, blank=True)

    # ── Cash collections ──────────────────────────────────────────────────────
    total_collection    = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    full_collection     = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    half_collection     = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    physical_collection = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    ladies_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    senior_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    st_collection       = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    adjust_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    luggage_collection  = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)

    # ── UPI collections ───────────────────────────────────────────────────────
    upi_total_collection    = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    upi_full_collection     = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    upi_half_collection     = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    upi_physical_collection = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    upi_ladies_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    upi_senior_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    upi_st_collection       = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    upi_luggage_collection  = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)

    # ── UPI counts ────────────────────────────────────────────────────────────
    upi_full_count     = models.IntegerField(default=0, null=True, blank=True)
    upi_half_count     = models.IntegerField(default=0, null=True, blank=True)
    upi_physical_count = models.IntegerField(default=0, null=True, blank=True)
    upi_ladies_count   = models.IntegerField(default=0, null=True, blank=True)
    upi_senior_count   = models.IntegerField(default=0, null=True, blank=True)
    upi_luggage_count  = models.IntegerField(default=0, null=True, blank=True)
    upi_st_count       = models.IntegerField(default=0, null=True, blank=True)

    # ── Status ────────────────────────────────────────────────────────────────
    is_closed    = models.BooleanField(default=False, db_index=True)
    auto_opened  = models.BooleanField(default=False)  # True when open fields auto-populated from close signal (open signal missed)
    ghost_note   = models.TextField(null=True, blank=True)

    # ── Relations ─────────────────────────────────────────────────────────────
    company_code = models.ForeignKey(
        Company, on_delete=models.PROTECT,
        related_name='schedule_data', db_index=True, null=True, blank=True
    )

    # ── Raw data ──────────────────────────────────────────────────────────────
    open_raw_payload  = models.TextField(null=True, blank=True)
    close_raw_payload = models.TextField(null=True, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'schedule_data'
        indexes  = [
            models.Index(fields=['palmtec_id', 'schedule_no']),
            models.Index(fields=['palmtec_id', 'start_date']),
            models.Index(fields=['company_code', 'start_date']),
            models.Index(fields=['company_code']),
            models.Index(fields=['start_date']),
            models.Index(fields=['is_closed']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['palmtec_id', 'company_code', 'schedule_no', 'start_date'],
                name='uniq_schedule_data'
            )
        ]
        ordering = ['-start_datetime']

    def __str__(self):
        return f"Schedule {self.schedule_no} - {self.palmtec_id} ({self.start_date})"


class TripData(models.Model):
    """Merged trip open+close. Created on TrpOp; close fields populated on TrpCl."""

    # ── Identity ─────────────────────────────────────────────────────────────
    open_unique_code  = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    close_unique_code = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    palmtec_id        = models.CharField(max_length=20, db_index=True)

    # ── Route / Schedule / Trip ───────────────────────────────────────────────
    route_id    = models.ForeignKey('Route', on_delete=models.SET_NULL, null=True, blank=True, related_name='trip_data')
    # FK set when schedule is resolved; raw int kept for matching before resolution
    schedule_id = models.ForeignKey(ScheduleData, on_delete=models.SET_NULL, null=True, blank=True, related_name='trips')
    schedule_no = models.IntegerField(null=True, blank=True, db_index=True)

    # schedule start from device — used to resolve schedule_id FK
    schedule_start_date = models.DateField(null=True, blank=True)
    schedule_start_time = models.TimeField(null=True, blank=True)

    trip_no      = models.IntegerField(db_index=True)
    up_down_trip = models.CharField(max_length=4, choices=Direction.choices, null=True, blank=True)

    # ── Vehicle / Crew (from open signal) ────────────────────────────────────
    bus_no       = models.CharField(max_length=30, null=True, blank=True)
    bus_id       = models.ForeignKey('VehicleType', on_delete=models.SET_NULL, null=True, blank=True, related_name='trip_data')
    driver       = models.CharField(max_length=50, null=True, blank=True)
    driver_id    = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='driven_trip_data')
    conductor    = models.CharField(max_length=50, null=True, blank=True)
    conductor_id = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='conducted_trip_data')

    # ── Open timing ───────────────────────────────────────────────────────────
    start_date         = models.DateField(db_index=True, null=True, blank=True)
    start_time         = models.TimeField(null=True, blank=True)
    start_datetime     = models.DateTimeField(db_index=True, null=True, blank=True)
    battery_percentage = models.IntegerField(null=True, blank=True)

    # ── Close timing ──────────────────────────────────────────────────────────
    end_date     = models.DateField(null=True, blank=True)
    end_time     = models.TimeField(null=True, blank=True)
    end_datetime = models.DateTimeField(null=True, blank=True)

    # ── Distance / Ticket range ───────────────────────────────────────────────
    total_km        = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    total_passengers = models.IntegerField(null=True, blank=True)
    start_ticket_no = models.BigIntegerField(null=True, blank=True)
    end_ticket_no   = models.BigIntegerField(null=True, blank=True)

    # ── Passenger counts ─────────────────────────────────────────────────────
    full_count     = models.IntegerField(default=0, null=True, blank=True)
    half_count     = models.IntegerField(default=0, null=True, blank=True)
    st_count       = models.IntegerField(default=0, null=True, blank=True)
    luggage_count  = models.IntegerField(default=0, null=True, blank=True)
    physical_count = models.IntegerField(default=0, null=True, blank=True)
    pass_count     = models.IntegerField(default=0, null=True, blank=True)
    ladies_count   = models.IntegerField(default=0, null=True, blank=True)
    senior_count   = models.IntegerField(default=0, null=True, blank=True)

    total_tickets      = models.IntegerField(default=0, null=True, blank=True)
    total_cash_tickets = models.IntegerField(default=0, null=True, blank=True)

    # ── Collection amounts ────────────────────────────────────────────────────
    full_collection     = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    half_collection     = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    st_collection       = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    luggage_collection  = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    physical_collection = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    ladies_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    senior_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    adjust_collection   = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    expense_amount      = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)
    total_collection    = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)

    # ── UPI ───────────────────────────────────────────────────────────────────
    upi_ticket_count  = models.IntegerField(default=0, null=True, blank=True)
    upi_ticket_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), null=True, blank=True)

    # ── Status ────────────────────────────────────────────────────────────────
    is_closed   = models.BooleanField(default=False, db_index=True)
    auto_opened = models.BooleanField(default=False)  # True when open fields auto-populated from close signal (open signal missed)
    ghost_note  = models.TextField(null=True, blank=True)

    # ── Relations ─────────────────────────────────────────────────────────────
    company_code = models.ForeignKey(
        Company, on_delete=models.PROTECT,
        related_name='trip_data', db_index=True, null=True, blank=True
    )

    # ── Raw data ──────────────────────────────────────────────────────────────
    open_raw_payload  = models.TextField(null=True, blank=True)
    close_raw_payload = models.TextField(null=True, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'trip_data'
        indexes  = [
            models.Index(fields=['palmtec_id', 'trip_no']),
            models.Index(fields=['palmtec_id', 'start_date']),
            models.Index(fields=['company_code', 'start_date']),
            models.Index(fields=['company_code']),
            models.Index(fields=['start_date']),
            models.Index(fields=['schedule_id']),
            models.Index(fields=['is_closed']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['palmtec_id', 'company_code', 'schedule_no', 'trip_no', 'start_date'],
                name='uniq_trip_data'
            )
        ]
        ordering = ['-start_datetime']

    def __str__(self):
        return f"Trip {self.trip_no} - {self.palmtec_id} ({self.start_date})"


class OdometerData(models.Model):
    class SourceType(models.TextChoices):
        API = 'api', 'API'
        DAT = 'dat', 'DAT Upload'

    # ── Identity ─────────────────────────────────────────────────────────────
    unique_code = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    palmtec_id  = models.CharField(max_length=20, null=True, blank=True, db_index=True)

    # ── Schedule / Trip ───────────────────────────────────────────────────────
    schedule_no = models.IntegerField(db_index=True)
    trip_no     = models.IntegerField(db_index=True)

    # ── Timing ────────────────────────────────────────────────────────────────
    start_date     = models.DateField(null=True, blank=True)
    start_time     = models.TimeField(null=True, blank=True)
    start_datetime = models.DateTimeField(null=True, blank=True, db_index=True)
    end_date       = models.DateField(null=True, blank=True)
    end_time       = models.TimeField(null=True, blank=True)
    end_datetime   = models.DateTimeField(null=True, blank=True, db_index=True)

    # ── Trip / Schedule FKs ───────────────────────────────────────────────────
    trip_id     = models.ForeignKey('TripData',     on_delete=models.SET_NULL, null=True, blank=True, related_name='odometer_records')
    schedule_id = models.ForeignKey('ScheduleData', on_delete=models.SET_NULL, null=True, blank=True, related_name='odometer_records')

    # ── Vehicle / Crew (raw strings + nullable FKs) ───────────────────────────
    driver       = models.CharField(max_length=50, null=True, blank=True)
    driver_id    = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='odometer_records')

    conductor    = models.CharField(max_length=50, null=True, blank=True)
    conductor_id = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='conducted_odometer_records')

    bus_no = models.CharField(max_length=30, null=True, blank=True)
    bus_id = models.ForeignKey('VehicleType', on_delete=models.SET_NULL, null=True, blank=True, related_name='odometer_records')

    # ── Odometer readings ─────────────────────────────────────────────────────
    start_reading = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    end_reading   = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # ── Data quality ─────────────────────────────────────────────────────────
    error_reason = models.TextField(null=True, blank=True)

    # ── Source ────────────────────────────────────────────────────────────────
    source = models.CharField(max_length=3, choices=SourceType.choices)

    # ── Relations ─────────────────────────────────────────────────────────────
    company_code = models.ForeignKey(
        Company, on_delete=models.PROTECT,
        related_name='odometer_records', db_index=True, null=True, blank=True
    )

    # ── Raw data ──────────────────────────────────────────────────────────────
    checksum    = models.CharField(max_length=50, null=True, blank=True)
    raw_payload = models.TextField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'odometer_data'
        indexes  = [
            models.Index(fields=['palmtec_id', 'start_datetime']),
            models.Index(fields=['company_code', 'start_date']),
            models.Index(fields=['company_code']),
            models.Index(fields=['start_date']),
            models.Index(fields=['unique_code']),
            models.Index(fields=['schedule_no', 'trip_no']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['company_code', 'schedule_no', 'trip_no', 'start_datetime'],
                name='uniq_device_company_odometer'
            )
        ]
        ordering = ['-start_datetime']

    def __str__(self):
        return f"Odometer {self.schedule_no}/{self.trip_no} - {self.palmtec_id}"


class ExpenseData(models.Model):
    class SourceType(models.TextChoices):
        API = 'api', 'API'
        DAT = 'dat', 'DAT Upload'

    # ── Identity ─────────────────────────────────────────────────────────────
    unique_code = models.CharField(max_length=30, null=True, blank=True, db_index=True)
    palmtec_id  = models.CharField(max_length=20, null=True, blank=True, db_index=True)

    # ── Schedule / Trip ───────────────────────────────────────────────────────
    schedule_no = models.IntegerField(db_index=True)
    trip_no     = models.IntegerField(db_index=True)

    # ── Timing ────────────────────────────────────────────────────────────────
    expense_date     = models.DateField(null=True, blank=True)
    expense_time     = models.TimeField(null=True, blank=True)
    expense_datetime = models.DateTimeField(null=True, blank=True, db_index=True)

    # ── Trip / Schedule FKs ───────────────────────────────────────────────────
    trip_id     = models.ForeignKey('TripData',     on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_records')
    schedule_id = models.ForeignKey('ScheduleData', on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_records')

    # ── Vehicle / Crew ────────────────────────────────────────────────────────
    driver    = models.CharField(max_length=50, null=True, blank=True)
    driver_id = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_records')

    bus_no = models.CharField(max_length=30, null=True, blank=True)
    bus_id = models.ForeignKey('VehicleType', on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_records')

    # ── Amounts ───────────────────────────────────────────────────────────────
    expense_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    diesel_amount  = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    expense_type      = models.IntegerField(null=True, blank=True)
    expense_master_id = models.ForeignKey('ExpenseMaster', on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_records')
    expense_name      = models.CharField(max_length=20, null=True, blank=True)

    # ── Data quality ──────────────────────────────────────────────────────────
    error_reason = models.TextField(null=True, blank=True)

    # ── Source ────────────────────────────────────────────────────────────────
    source = models.CharField(max_length=3, choices=SourceType.choices)

    # ── Relations ─────────────────────────────────────────────────────────────
    company_code = models.ForeignKey(
        Company, on_delete=models.PROTECT,
        related_name='expense_records', db_index=True, null=True, blank=True
    )

    # ── Raw data ──────────────────────────────────────────────────────────────
    checksum    = models.CharField(max_length=50, null=True, blank=True)
    raw_payload = models.TextField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'expense_data'
        indexes  = [
            models.Index(fields=['palmtec_id', 'expense_datetime']),
            models.Index(fields=['company_code', 'expense_date']),
            models.Index(fields=['company_code']),
            models.Index(fields=['expense_date']),
            models.Index(fields=['unique_code']),
            models.Index(fields=['schedule_no', 'trip_no']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['company_code', 'schedule_no', 'trip_no', 'expense_datetime', 'expense_type'],
                name='uniq_device_company_expense'
            )
        ]
        ordering = ['-expense_datetime']

    def __str__(self):
        return f"Expense {self.schedule_no}/{self.trip_no} - {self.palmtec_id}"