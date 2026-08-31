from decimal import Decimal
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.conf import settings

# Master data (BusType, Employee, Stage, Route, etc.)

class BusType(models.Model):
    """Bus type/category master data"""
    bustype_code = models.CharField(max_length=50,help_text="Unique bus type code")
    name = models.CharField(max_length=100,help_text="Bus type name")
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='bus_types')
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False, help_text="Soft delete flag")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bustypes_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bustypes_updated'
    )
    
    class Meta:
        # db_table = 'bus_type'
        db_table = 'mdb_bus_type'
        unique_together = ['company', 'bustype_code']
        indexes = [
            models.Index(fields=['company', 'bustype_code']),
            models.Index(fields=['company', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.bustype_code} - {self.name}"


class EmployeeType(models.Model):
    """Employee type/role master data"""
    emp_type_code = models.CharField(max_length=50, null=True, blank=True, help_text="Employee type code (set by MDB import only)")
    emp_type_name = models.CharField(max_length=100,help_text="Driver, Conductor, Cleaner, etc.")
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='employee_types')
    is_deleted = models.BooleanField(default=False, help_text="Soft delete flag")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee_types_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee_types_updated'
    )
    
    class Meta:
        # db_table = 'employee_type'
        db_table = 'mdb_employee_type'
        unique_together = ['company', 'emp_type_code']
        indexes = [
            models.Index(fields=['company', 'emp_type_code']),
        ]
    
    def __str__(self):
        return f"{self.emp_type_code} - {self.emp_type_name}"


class Employee(models.Model):
    """Employee master data - drivers, conductors, cleaners"""
    employee_code = models.CharField(max_length=50,help_text="Unique employee code")
    employee_name = models.CharField(max_length=100,help_text="Employee full name")
    emp_type = models.ForeignKey(EmployeeType,on_delete=models.PROTECT,related_name='employees')
    phone_no = models.CharField(max_length=20,null=True,blank=True)
    password = models.CharField(max_length=255,help_text="Employee login password (if applicable)")
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='employees')
    is_deleted = models.BooleanField(default=False,help_text="Soft delete flag")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees_updated'
    )
    
    class Meta:
        # db_table = 'employee'
        db_table = 'mdb_employee'
        unique_together = ['company', 'employee_code']
        indexes = [
            models.Index(fields=['company', 'employee_code']),
            models.Index(fields=['company', 'emp_type']),
            models.Index(fields=['company', 'is_deleted']),
        ]
    
    def __str__(self):
        return f"{self.employee_code} - {self.employee_name}"


class Currency(models.Model):
    """Currency master data"""
    currency = models.CharField(max_length=3,help_text="Currency code (e.g., INR, USD)")
    country = models.CharField(max_length=50,help_text="Country name")
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='currencies')
    is_deleted = models.BooleanField(default=False, help_text="Soft delete flag")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='currencies_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='currencies_updated'
    )
    
    class Meta:
        # db_table = 'currency'
        db_table = 'mdb_currency'
        verbose_name_plural = 'Currencies'
        unique_together = ['company', 'currency']
        indexes = [
            models.Index(fields=['company', 'currency']),
        ]
    
    def __str__(self):
        return f"{self.currency} - {self.country}"


class Stage(models.Model):
    """Bus stop/stage master data"""
    stage_code = models.CharField(max_length=50,help_text="Unique stage code")
    stage_name = models.CharField(max_length=100,help_text="Stage/stop name")
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='stages')
    is_deleted = models.BooleanField(default=False,help_text="Soft delete flag")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stages_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stages_updated'
    )
    
    class Meta:
        # db_table = 'stage'
        db_table = 'mdb_stage'
        unique_together = ['company', 'stage_code']
        indexes = [
            models.Index(fields=['company', 'stage_code']),
            models.Index(fields=['company', 'is_deleted']),
        ]
    
    def __str__(self):
        return f"{self.stage_code} - {self.stage_name}"


class Route(models.Model):
    """Bus route master data"""
    route_code = models.CharField(max_length=50,help_text="Unique route code")
    route_name = models.CharField(max_length=100,help_text="Route name/description")
    min_fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Minimum fare amount"
    )

    fare_type = models.IntegerField(help_text="Fare calculation type")
    bus_type = models.ForeignKey(BusType,on_delete=models.PROTECT,related_name='routes',help_text="Bus type for route")
    half = models.BooleanField(default=False,help_text="Allow half fare tickets")
    luggage = models.BooleanField(default=False,help_text="Allow luggage charges")
    adjust = models.BooleanField(default=False,help_text="Allow fare adjustment")
    conc = models.BooleanField(default=False,help_text="Allow concession")
    ph = models.BooleanField(default=False,help_text="Allow physically handicapped concession")
    start_from = models.IntegerField(default=0,help_text="Starting stage number")
    pass_allow = models.BooleanField(default=False,help_text="Allow pass holders")
    
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='routes')
    is_deleted = models.BooleanField(default=False,help_text="Soft delete flag")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routes_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routes_updated'
    )
    
    class Meta:
        # db_table = 'route'
        db_table = 'mdb_route'
        unique_together = ['company', 'route_code']
        indexes = [
            models.Index(fields=['company', 'route_code']),
            models.Index(fields=['company', 'is_deleted']),
        ]
    
    def __str__(self):
        return f"{self.route_code} - {self.route_name}"


class RouteStage(models.Model):
    """Route-Stage mapping with sequence"""
    route = models.ForeignKey(Route,on_delete=models.CASCADE,related_name='route_stages')
    stage = models.ForeignKey(Stage,on_delete=models.PROTECT,related_name='stage_routes')
    sequence_no = models.IntegerField(help_text="Stage sequence in route (1st stop, 2nd stop, etc.)")
    distance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Distance from route start (in km)"
    )
    stage_local_lang = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text="Stage name in local language"
    )
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='route_stages')
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='route_stages_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='route_stages_updated'
    )
    
    class Meta:
        # db_table = 'route_stage'
        db_table = 'mdb_route_stage'
        unique_together = [
            ['route', 'stage'],
            ['route', 'sequence_no']
        ]
        indexes = [
            models.Index(fields=['route', 'sequence_no']),
            models.Index(fields=['company']),
        ]
        ordering = ['route', 'sequence_no']
    
    def __str__(self):
        return f"{self.route.route_code} - Stop {self.sequence_no}: {self.stage.stage_name}"


# class Fare(models.Model):
#     """Fare matrix - from stage to stage pricing"""
#     route = models.ForeignKey(Route,on_delete=models.CASCADE,related_name='fares')
#     from_stage = models.ForeignKey(Stage,on_delete=models.PROTECT,related_name='fares_from',help_text="Start stage")
#     to_stage = models.ForeignKey(Stage,on_delete=models.PROTECT,related_name='fares_to',help_text="End stage")
#     fare_amount = models.DecimalField(
#         max_digits=10,
#         decimal_places=2,
#         validators=[MinValueValidator(Decimal('0.00'))],
#         help_text="Fare amount for this stage combination"
#     )
#     company = models.ForeignKey(
#         'Company',
#         on_delete=models.CASCADE,
#         related_name='fares'
#     )
    
#     created_at = models.DateTimeField(auto_now_add=True)
#     created_by = models.ForeignKey(
#         settings.AUTH_USER_MODEL,
#         on_delete=models.SET_NULL,
#         null=True,
#         blank=True,
#         related_name='fares_created'
#     )
#     updated_at = models.DateTimeField(auto_now=True)
#     updated_by = models.ForeignKey(
#         settings.AUTH_USER_MODEL,
#         on_delete=models.SET_NULL,
#         null=True,
#         blank=True,
#         related_name='fares_updated'
#     )
    
#     class Meta:
#         # db_table = 'fare'
#         db_table = 'mdb_fare'
#         unique_together = ['route', 'from_stage', 'to_stage']
#         indexes = [
#             models.Index(fields=['route', 'from_stage', 'to_stage']),
#             models.Index(fields=['company']),
#         ]
    
#     def __str__(self):
#         return f"{self.route.route_code}: {self.from_stage.stage_name} → {self.to_stage.stage_name} = ₹{self.fare_amount}"

class Fare(models.Model):
    number = models.IntegerField(unique=True,blank=True,null=True)
    row = models.IntegerField(default=0)        # ✅ indented correctly
    col = models.IntegerField(default=0)        # ✅ indented correctly
    fare_amount = models.IntegerField(default=0)
    route = models.ForeignKey(
        Route,
        on_delete=models.CASCADE,
        related_name='fares'
    )
    route_name = models.CharField(
        max_length=100,
        help_text="Denormalized route name snapshot",
        blank=True,null=True
    )
    company = models.ForeignKey(
        'Company',
        on_delete=models.CASCADE,
        related_name='fares'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fares_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fares_updated'
    )

    class Meta:
        db_table = 'mdb_fare'
        unique_together = ['route', 'row', 'col']
        indexes = [
            models.Index(fields=['route', 'row', 'col']),
            models.Index(fields=['company']),
        ]

    def __str__(self):
        return f"{self.route_name} - Row:{self.row} Col:{self.col} = {self.fare_amount}"


class RouteBusType(models.Model):
    """Route-BusType mapping (routes can have multiple allowed bus types)"""
    route = models.ForeignKey(Route,on_delete=models.CASCADE,related_name='route_bus_types')
    bus_type = models.ForeignKey(BusType,on_delete=models.PROTECT,related_name='assigned_routes')
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='route_bus_types')
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='route_bus_types_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='route_bus_types_updated'
    )
    
    class Meta:
        # db_table = 'route_bus_type'
        db_table = 'mdb_route_bus_type'
        unique_together = ['route', 'bus_type']
        indexes = [
            models.Index(fields=['route']),
            models.Index(fields=['bus_type']),
            models.Index(fields=['company']),
        ]
    
    def __str__(self):
        return f"{self.route.route_code} - {self.bus_type.name}"


class RouteDepot(models.Model):
    """Route-Depot mapping (a route can be operated from multiple depots)"""
    route  = models.ForeignKey(Route,   on_delete=models.CASCADE, related_name='route_depots')
    depot  = models.ForeignKey('Depot', on_delete=models.CASCADE, related_name='route_depots')
    company = models.ForeignKey('Company', on_delete=models.CASCADE, related_name='route_depots')

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='route_depots_created'
    )

    class Meta:
        db_table = 'mdb_route_depot'
        unique_together = ['route', 'depot']
        indexes = [
            models.Index(fields=['route'],   name='mdb_route_depot_route_idx'),
            models.Index(fields=['company'], name='mdb_route_depot_company_idx'),
        ]

    def __str__(self):
        return f"{self.route.route_code} → {self.depot.depot_name}"


class VehicleType(models.Model):
    """Individual vehicle/bus registration"""
    bus_type = models.ForeignKey(
        BusType,
        on_delete=models.PROTECT,
        related_name='vehicles',
        help_text="Bus type/category"
    )
    bus_reg_num = models.CharField(max_length=50,help_text="Bus registration number")
    company = models.ForeignKey('Company',on_delete=models.CASCADE,related_name='vehicles')
    is_deleted = models.BooleanField(default=False,help_text="Soft delete flag")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vehicles_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vehicles_updated'
    )
    
    class Meta:
        # db_table = 'vehicle_type'
        db_table = 'mdb_vehicle_type'
        unique_together = ['company', 'bus_reg_num']
        indexes = [
            models.Index(fields=['company', 'bus_reg_num']),
            models.Index(fields=['bus_type']),
            models.Index(fields=['company', 'is_deleted']),
        ]
    
    def __str__(self):
        return f"{self.bus_reg_num} ({self.bus_type.name})"



class Settings(models.Model):
    """System settings per company"""
    user_pwd = models.CharField(max_length=255, null=True, blank=True)
    master_pwd = models.CharField(max_length=255, null=True, blank=True)
    
    half_per = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('50.00'),
        help_text="Half fare percentage"
    )
    con_per = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Concession percentage"
    )
    st_max_amt = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Student max amount"
    )
    st_min_con = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Student min concession"
    )
    phy_per = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Physically handicapped percentage"
    )
    round_amt = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Rounding amount"
    )
    luggage_unit_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Luggage per unit rate"
    )
    
    # Display settings
    main_display = models.CharField(max_length=50, null=True, blank=True)
    main_display2 = models.CharField(max_length=50, null=True, blank=True)
    header1 = models.CharField(max_length=100, null=True, blank=True)
    header2 = models.CharField(max_length=100, null=True, blank=True)
    header3 = models.CharField(max_length=100, null=True, blank=True)
    footer1 = models.CharField(max_length=100, null=True, blank=True)
    footer2 = models.CharField(max_length=100, null=True, blank=True)
    
    # Boolean flags
    roundoff = models.BooleanField(default=False)
    round_up = models.BooleanField(default=False)
    remove_ticket_flag = models.BooleanField(default=False)
    stage_font_flag = models.BooleanField(default=False)
    next_fare_flag = models.BooleanField(default=False)
    odometer_entry = models.BooleanField(default=False)
    ticket_no_big_font = models.BooleanField(default=False)
    gprs_enable = models.BooleanField(default=False)
    tripsend_enable = models.BooleanField(default=False)
    schedulesend_enable = models.BooleanField(default=False)
    sendpend = models.BooleanField(default=False)
    inspect_rpt = models.BooleanField(default=False)
    st_roundoff_enable = models.BooleanField(default=False)
    st_fare_edit = models.BooleanField(default=False)
    multiple_pass = models.BooleanField(default=False)
    simple_report = models.BooleanField(default=False)
    inspector_sms = models.BooleanField(default=False)
    auto_shut_down = models.BooleanField(default=False)
    userpswd_enable = models.BooleanField(default=False)

    # Integer settings
    report_flag = models.IntegerField(default=0)
    language_option = models.IntegerField(default=0)
    stage_updation_msg = models.IntegerField(default=0)
    default_stage = models.IntegerField(default=0)
    report_font = models.IntegerField(default=0)
    st_roundoff_amt = models.IntegerField(default=0)

    # Communication settings
    ph_no2 = models.CharField(max_length=20, null=True, blank=True)
    ph_no3 = models.CharField(max_length=20, null=True, blank=True)
    access_point = models.CharField(max_length=255, null=True, blank=True)
    dest_adds = models.CharField(max_length=255, null=True, blank=True)
    username = models.CharField(max_length=100, null=True, blank=True)
    password = models.CharField(max_length=255, null=True, blank=True)
    uploadpath = models.CharField(max_length=255, null=True, blank=True)
    downloadpath = models.CharField(max_length=255, null=True, blank=True)
    http_url = models.CharField(max_length=255, null=True, blank=True)

    # Feature flags (text/varchar stored as strings)
    smart_card = models.CharField(max_length=10, default='0')
    exp_enable = models.CharField(max_length=10, default='0')
    ftp_enable = models.CharField(max_length=10, default='0')
    gprs_enable_message = models.CharField(max_length=10, default='0')
    sendbill_enable = models.CharField(max_length=10, default='0')

    currency = models.CharField(max_length=10, null=True, blank=True)

    # ETM concession ratios & flags (sourced from MDB import)
    ladies_ratio  = models.IntegerField(default=0, help_text="Ladies concession % (LadiPer)")
    senior_ratio  = models.IntegerField(default=0, help_text="Senior citizen concession % (SeniorPer)")
    big_font      = models.BooleanField(default=False, help_text="Enable big font on ETM (bigfontenable)")
    refund_enable = models.BooleanField(default=False, help_text="Enable refund on ETM (ucRefundEnable)")

    # Hardware debounce — not shown in UI, packed into HW.keyhitdelay
    keyhitdelay = models.IntegerField(default=12)

    # Password defaults — per-profile values fall back to these on new profile creation
    supervisor_pwd = models.CharField(max_length=255, null=True, blank=True)
    remove_pwd     = models.CharField(max_length=255, null=True, blank=True)

    company = models.OneToOneField('Company',on_delete=models.CASCADE,related_name='settings')

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='settings_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='settings_updated'
    )

    class Meta:
        # db_table = 'settings'
        db_table = 'mdb_settings'
        verbose_name_plural = 'Settings'

    def __str__(self):
        return f"Settings for {self.company.company_name}"


class SettingsProfile(models.Model):
    """
    Settings profile for exactly one ETM device (device is a OneToOneField).
    palmtec_id mirrors device.palmtec_id at save time.
    """

    LANGUAGE_CHOICES = [(0, 'Malayalam'), (1, 'Tamil')]
    FONT_CHOICES     = [(0, 'Normal'),    (1, 'Condensed')]

    company = models.ForeignKey(
        'Company',
        on_delete=models.CASCADE,
        related_name='settings_profiles',
    )
    device = models.OneToOneField(
        'ETMDevice',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='settings_profile',
        help_text='The device this profile is configured for. One profile per device.',
    )
    name = models.CharField(max_length=100)
    palmtec_id = models.PositiveIntegerField(
        help_text="Mirrors device.palmtec_id at save time. Not independently client-writable."
    )

    # ── Passwords ────────────────────────────────────────────────────────────
    user_pwd       = models.CharField(max_length=255, null=True, blank=True)
    master_pwd     = models.CharField(max_length=255, null=True, blank=True)
    supervisor_pwd = models.CharField(max_length=255, null=True, blank=True)
    remove_pwd     = models.CharField(max_length=255, null=True, blank=True)

    # ── Fare percentages & amounts ───────────────────────────────────────────
    half_per          = models.DecimalField(max_digits=5,  decimal_places=2, default=Decimal('50.00'))
    con_per           = models.DecimalField(max_digits=5,  decimal_places=2, default=Decimal('0.00'))
    phy_per           = models.DecimalField(max_digits=5,  decimal_places=2, default=Decimal('0.00'))
    round_amt         = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    luggage_unit_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))

    # ── Ticket display ───────────────────────────────────────────────────────
    main_display  = models.CharField(max_length=50,  null=True, blank=True)
    main_display2 = models.CharField(max_length=50,  null=True, blank=True)
    header1       = models.CharField(max_length=100, null=True, blank=True)
    header2       = models.CharField(max_length=100, null=True, blank=True)
    header3       = models.CharField(max_length=100, null=True, blank=True)
    footer1       = models.CharField(max_length=100, null=True, blank=True)
    footer2       = models.CharField(max_length=100, null=True, blank=True)

    # ── Language & font ──────────────────────────────────────────────────────
    language_option = models.IntegerField(default=0, choices=LANGUAGE_CHOICES)
    report_font     = models.IntegerField(default=0, choices=FONT_CHOICES)

    # ── ST fare settings ─────────────────────────────────────────────────────
    st_fare_edit = models.BooleanField(default=False)
    st_max_amt   = models.CharField(max_length=5,  default='0', blank=True)
    st_ratio     = models.CharField(max_length=2,  default='0', blank=True)
    st_min_amt   = models.CharField(max_length=6,  default='0', blank=True)

    # ── ST roundoff ──────────────────────────────────────────────────────────
    st_roundoff_enable = models.BooleanField(default=False)
    st_roundoff_amt    = models.CharField(max_length=3, default='0', blank=True)

    # ── Boolean feature flags ────────────────────────────────────────────────
    roundoff            = models.BooleanField(default=False)
    round_up            = models.BooleanField(default=False)
    remove_ticket_flag  = models.BooleanField(default=False)
    stage_font_flag     = models.BooleanField(default=False)
    next_fare_flag      = models.BooleanField(default=False)
    odometer_entry      = models.BooleanField(default=False)
    ticket_no_big_font  = models.BooleanField(default=False)
    tripsend_enable     = models.BooleanField(default=False)
    schedulesend_enable = models.BooleanField(default=False)
    inspect_rpt         = models.BooleanField(default=False)
    multiple_pass       = models.BooleanField(default=False)
    simple_report       = models.BooleanField(default=False)
    inspector_sms       = models.BooleanField(default=False)
    auto_shut_down      = models.BooleanField(default=False)
    userpswd_enable     = models.BooleanField(default=False)
    exp_enable          = models.BooleanField(default=False)

    # ── Integer settings ─────────────────────────────────────────────────────
    stage_updation_msg = models.IntegerField(default=0)
    default_stage      = models.IntegerField(default=0)

    # ── Audit ────────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='settings_profiles_created',
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='settings_profiles_updated',
    )

    class Meta:
        db_table = 'settings_profiles'
        unique_together = [('company', 'name'), ('company', 'palmtec_id')]

    def __str__(self):
        return f"{self.name} ({self.company.company_name})"