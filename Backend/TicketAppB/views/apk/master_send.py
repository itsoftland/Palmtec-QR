import io
import struct
import zipfile
import logging
from django.http import HttpResponse, JsonResponse
from ...models import Settings, Route, Employee, VehicleType, ExpenseMaster, Stage, Fare, Currency, RouteStage, Company, SettingsProfile, ETMDevice
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from ...permissions import LicensePermission
import secrets

logger = logging.getLogger(__name__)


# ─── Binary packing helpers ────────────────────────────────────────────────────

def _s(val, size):
    """Fixed-width ASCII string, null-padded, truncated to fit."""
    return (val or '').encode('ascii', errors='replace')[:size].ljust(size, b'\x00')

def _b(val):
    """Single unsigned byte (0–255)."""
    try:
        return bytes([max(0, min(255, int(float(val or 0))))])
    except (ValueError, TypeError):
        return b'\x00'

def _bool(val):
    return b'\x01' if val else b'\x00'

def _f(val):
    """4-byte little-endian float (IEEE 754)."""
    try:
        return struct.pack('<f', float(val or 0))
    except (ValueError, TypeError):
        return struct.pack('<f', 0.0)

def _i(val):
    """2-byte little-endian signed short."""
    try:
        return struct.pack('<h', int(val or 0))
    except (ValueError, TypeError):
        return struct.pack('<h', 0)

def _u(val):
    """2-byte little-endian unsigned short."""
    try:
        return struct.pack('<H', int(val or 0))
    except (ValueError, TypeError):
        return struct.pack('<H', 0)


# ─── File packers ──────────────────────────────────────────────────────────────

def _pack_busdat(p, cs):
    """
    Build BUS.DAT binary from SettingsProfile (p) + company Settings (cs).
    Structure: SETUP (~640 bytes) + HARDWARE_SETUP (64 bytes) = 704 bytes total.
    Matches VB6 Type SETUP + HARDWARE_SETUP definitions in mdFunctions.bas.

    p  = SettingsProfile  — per-device fields (passwords, display text, fare %, flags)
    cs = Settings         — company-level fields (connectivity, currency, ph_no2/3, etc.)
                            May be None if company has no Settings record; falls back to zeros.
    """
    # ── SETUP section ──────────────────────────────────────────────────────────
    data  = _s(p.main_display, 18)
    data += _s(p.main_display2, 23)
    data += _s(p.header1, 32)
    data += _s(p.header2, 32)
    data += _s(p.header3, 32)
    data += _s(p.footer1, 32)
    data += _s(p.footer2, 32)
    data += b'\x02'                          # PaperFeed (VB default 2)
    data += _s(str(p.palmtec_id), 6)        # PalmtecID — from SettingsProfile
    data += b'\x01'                          # DefaultFull (VB default 1)
    data += _b(p.half_per)
    data += _b(p.con_per)
    data += _f(p.st_max_amt)
    data += _f(cs.st_min_con if cs else 0)  # company Settings
    data += _b(p.phy_per)
    data += b'\x01'                          # LuggageUnitRateEdit (VB default 1)
    data += _f(p.luggage_unit_rate)
    data += b'\x01'                          # StageUpdation — always enable bidirectional from-stage nav
    data += b'\x01'                          # StageDisplayFont (VB default 1)
    data += b'\x00'                          # UseDuplicate
    data += b'\x00'                          # UseDup1
    data += _bool(p.roundoff)
    data += _bool(p.round_up)
    data += _s(cs.currency if cs else '', 8) # company Settings
    data += _u(p.round_amt)
    data += b'\x01'                          # ucbAdjust (VB default 1)
    data += b'\x00'                          # ucbReviewPasswd
    data += b'\x00'                          # ucbReportPasswd
    data += b'\x00'                          # ucbSTFromStage
    data += _bool(p.st_fare_edit)
    data += _s(p.master_pwd, 11)             # cMasterClearPassword
    data += _b((cs.report_flag if cs else 0) | 0x11)  # force bReportFarePrint (bit0) + crewEnable (bit4)
    data += _bool(p.next_fare_flag)
    data += _b(p.stage_updation_msg)         # UpdateStageMsg
    data += _bool(p.remove_ticket_flag)
    data += _bool(p.stage_font_flag)
    data += b'\x01'                          # EnableStageDefault (VB default 1)
    data += b'\x00'                          # PrinterSel
    data += _bool(p.odometer_entry)
    data += _bool(p.ticket_no_big_font)
    data += b'\x01'                          # CrewCheck — always enabled
    data += b'\x00' * 13                     # PhNo (zeroed — device uses its own)
    data += b'\x01'                          # TripSMS — always enabled
    data += _bool(p.schedulesend_enable)     # ScheduleSMS
    data += b'\x01'                          # TicketRpt — always enabled
    data += b'\x01'                          # Busno — always enabled
    data += b'\x01'                          # Driver — always enabled
    data += b'\x01'                          # Conductor — always enabled
    data += _bool(p.inspect_rpt)
    data += b'\x00'                          # RepeatST
    data += b'\x01' if (cs and cs.sendbill_enable == '1') else b'\x00'  # company Settings
    data += _bool(p.tripsend_enable)
    data += _bool(p.schedulesend_enable)
    data += _bool(cs.sendpend if cs else False)  # company Settings
    data += _s(cs.ph_no2 if cs else '', 13)      # company Settings
    data += _s(cs.access_point if cs else '', 24) # company Settings
    data += _s(cs.dest_adds if cs else '', 32)    # company Settings
    data += _s(cs.username if cs else '', 16)     # company Settings
    data += _s(cs.password if cs else '', 16)     # company Settings
    data += _s(cs.uploadpath if cs else '', 32)   # company Settings
    data += _s(cs.downloadpath if cs else '', 32) # company Settings
    data += _s(cs.http_url if cs else '', 64)     # company Settings
    data += _bool(cs.gprs_enable if cs else False) # company Settings
    data += b'\x00'                          # MsgPrompt
    data += b'\x01' if p.exp_enable else b'\x00'
    data += b'\x01' if (cs and cs.smart_card == '1') else b'\x00'  # company Settings
    data += b'\x01'                          # ModemON (VB default 1)
    data += b'\x01' if (cs and cs.ftp_enable == '1') else b'\x00'  # company Settings
    data += _s(p.remove_pwd, 11)             # RemovePassword — profile field
    data += b'\x01'                          # StageReport_E_D (VB default 1)
    data += _bool(p.st_roundoff_enable)
    data += _i(p.st_roundoff_amt)
    data += _bool(p.simple_report)
    data += _b(p.report_font)
    data += _bool(p.multiple_pass)
    data += _bool(p.inspector_sms)
    data += b'\x00'                          # StageEntry
    data += _s(cs.ph_no3 if cs else '', 13)  # company Settings
    data += _bool(p.auto_shut_down)
    data += _bool(p.userpswd_enable)
    data += b'\x00'                          # DieselEntryEnable
    data += b'\x00'                          # TripTimeEnable
    data += b'\x01'                          # ucTripCloseReport (VB default 1)
    data += b'\x01'                          # ucPaperFeed (VB default 1)
    data += _bool(cs.refund_enable if cs else False)  # ucRefundEnable — company Settings
    data += b'\x01'                          # ucsheduleCloseRpt (VB default 1)
    data += _b(cs.ladies_ratio if cs else 0) # LadiPer — company Settings
    data += _b(cs.senior_ratio if cs else 0) # SeniorPer — company Settings
    data += b'\x01'                          # bigfontenable — always on (VB default)
    data += b'\x00'                          # ucSeniorEnable
    data += b'\x00'                          # ucLaadiesEnable
    # shd_opn_d/shd_opn_t/trp_opn_d/trp_opn_t — firmware uses these bytes at runtime
    # for schedule/trip open date+time state. Must be zeroed by web app; device manages.
    data += b'\x00' * 4                      # shd_opn_d
    data += b'\x00' * 4                      # shd_opn_t
    data += b'\x00' * 4                      # trp_opn_d
    data += b'\x00' * 4                      # trp_opn_t
    data += b'\x00' * 51                     # ucTemp

    # ── HARDWARE_SETUP section (64 bytes) ──────────────────────────────────────
    # Ptime (4 bytes): Hour, Min, Sec, Hundredths — zeroed (device sets its own clock)
    data += b'\x00' * 4
    # Pdate (4 bytes): Day, Month, Year(2 bytes) — zeroed
    data += b'\x00' * 4
    data += _s(p.master_pwd, 11)             # MSR_PSWD
    data += _s(p.user_pwd, 11)             # USR_PSWD
    data += _s(p.supervisor_pwd, 11)       # SPR_PSWD — profile field
    data += bytes([4])                       # val_contrast (VB default 4)
    data += bytes([10])                      # val_brightness (VB default 10)
    data += b'\x00'                          # screensaver_onoff
    data += bytes([3])                       # backlit_timer (VB default 3)
    data += _b(cs.keyhitdelay if cs else 12) # keyhitdelay — company Settings (default 12)
    data += b'\x00'                          # boarder_en
    data += b'\x01'                          # dooropen_alert (VB default 1)
    data += b'\x01'                          # paperout_alert (VB default 1)
    data += b'\x00'                          # ucHalfPagePrinter
    data += b'\x01'                          # buzz_onoff (on)
    data += b'\x01'                          # rs232_baud (VB default 1)
    data += b'\x01'                          # ir_baud (VB default 1)
    data += b'\x01'                          # rf_baud (VB default 1)
    data += b'\x01'                          # connecting_medium (VB default 1)
    data += bytes([16])                      # footer_stat (VB default 16)
    data += _b(p.language_option)           # select_language
    data += b'\x00'                          # login_mode
    data += b'\x00'                          # ucKPLite_Opt
    data += _u(180)                          # usShuntdownTime (VB default 180)
    data += _b(p.language_option)           # LangNo
    data += b'\x00' * 2                     # ucTemp

    return data  # 704 bytes total


def _pack_routelst(route):
    """
    Build RouteLST binary record for one route (64 bytes).
    Matches VB6 Type RouteLST in mdFunctions.bas.
    """
    stage_count = len(route.route_stages.all())
    data  = _s(route.route_code, 5)
    data += _s(route.route_name, 25)
    data += _b(stage_count)
    data += _f(route.min_fare)
    data += _b(route.fare_type)
    data += _bool(route.half)
    data += _bool(route.conc)
    data += _bool(route.ph)
    data += _bool(route.luggage)
    data += _bool(route.adjust)
    data += _b(route.start_from)
    data += _b(route.bus_type.pk % 256)     # BusType byte ID
    data += _s(route.bus_type.name, 16)
    data += _f(0)                            # OptedKM
    data += _bool(route.pass_allow)
    return data  # 64 bytes



def _pack_crewdat(employees):
    """
    Build CREW.DAT binary (32 bytes per employee).
    Matches VB6 Type CREWDET in mdFunctions.bas.
    """
    data = b''
    for emp in employees:
        name = emp.emp_type.emp_type_name.lower()
        if 'driver' in name:          type_byte = 1
        elif 'conductor' in name:     type_byte = 2
        elif 'cleaner' in name:       type_byte = 3
        elif 'inspector' in name:     type_byte = 4
        else:                         type_byte = 0
        data += _s(emp.employee_name, 16)
        data += _s(emp.employee_code, 8)
        data += bytes([type_byte])
        data += _s(emp.password, 7)
    return data  # 32 bytes × employee_count


def _pack_expensedet(expenses):
    """
    Build EXPENSEDET.DAT binary (64 bytes per expense).
    Matches VB6 Type EXPENSEDET and device struct EXPENSEDET1:
      ucType(5) + expname(16) + Reserved(43) = 64 bytes
    """
    data = b''
    for exp in expenses:
        data += _s(exp.expense_code, 5)
        data += _s(exp.expense_name, 16)
        data += b'\x00' * 43             # Reserved padding
    return data  # 64 bytes × expense_count


def _pack_vehicledat(vehicles):
    """
    Build VEHICLE.DAT binary (32 bytes per vehicle).
    Matches VB6 Type VEHICLE and device struct VEHICLE1:
      BUSID(1) + BusNo(16) + Reserved(15) = 32 bytes
    BUSID is the bus-type primary key (modulo 256).
    """
    data = b''
    for v in vehicles:
        data += bytes([v.bus_type.pk % 256])  # BUSID
        data += _s(v.bus_reg_num, 16)          # BusNo
        data += b'\x00' * 15                   # Reserved
    return data  # 32 bytes × vehicle_count


# ─── Additional file packers ───────────────────────────────────────────────────

def _pack_routelst_all(routes):
    """
    Build ROUTELST.LST binary — all routes, 64 bytes each.
    Reuses _pack_routelst() for each route.
    """
    data = b''
    for route in routes:
        data += _pack_routelst(route)
    return data


def _pack_stagelst_global(route_stages):
    """
    Build STAGE.LST binary — all company RouteStage entries, 16 bytes each.
    Matches VB6 Type STAGEDETAILS: StageName(12) + Distance Single(4).

    VB STAGE table is per-route (route, stage, distance), equivalent to RouteStage.
    Stage name truncated to 11 chars + null to ensure null-termination within 12 bytes.
    """
    data = b''
    for rs in route_stages:
        name = (rs.stage.stage_name or '')[:11]
        data += _s(name, 11) + b'\x00'     # 12 bytes, always null-terminated
        data += _f(float(rs.distance or 0))  # Distance (4 bytes)
    return data  # 16 bytes × route_stage_count


def _pack_languagedat(route_stages):
    """
    Build LANGUAGE.DAT binary — 24 bytes per entry (same order as STAGE.LST).
    Matches VB6 LanguageStageCode As String * 24.
    """
    data = b''
    for rs in route_stages:
        data += _s(rs.stage_local_lang or '', 24)
    return data  # 24 bytes × route_stage_count


def _pack_rtedat(routes, stage_index):
    """
    Build RTE.DAT binary.
    Per route: Route header (8 bytes) + fare Singles + stage Int16 IDs.
    Matches VB6 Type Route and fare/stage writing in mdFunctions.bas CreateRTE().
    stage_index: {RouteStage.pk: 0-based position in global STAGE.LST}
    """
    data = b''
    for route in routes:
        rs_qs = list(
            route.route_stages.select_related('stage').order_by('sequence_no')
        )
        nos = len(rs_qs)

        # Route header (8 bytes)
        data += _s(route.route_code, 5)
        data += _b(route.fare_type)
        data += bytes([nos % 256])
        data += b'\x00'  # NoOfDupFare

        fares = list(
            Fare.objects.filter(route=route)
            .order_by('row', 'col')
            .values_list('fare_amount', flat=True)
        )

        for f in fares:
            data += struct.pack('<f', float(f))

        # Stage IDs as Int16 — 0-based position in global STAGE.LST (RouteStage.pk order)
        for rs in rs_qs:
            idx = stage_index.get(rs.pk, -1)
            if idx < 0:
                logger.warning('RTE.DAT: RouteStage pk=%s not in stage_index for route %s', rs.pk, route.route_code)
                idx = 0
            data += struct.pack('<h', idx)

    return data


def _pack_currencydat(currencies):
    """
    Build CURRENCY.DAT binary — 8 bytes per entry.
    Matches VB6 Type CREATE_CUR: CurString As String * 8.
    """
    data = b''
    for c in currencies:
        data += _s(c.currency, 8)
    return data  # 8 bytes × currency_count


# ─── Auth helper ───────────────────────────────────────────────────────────────

def _get_company(request):
    """Return the authenticated user's company, or None (e.g. for superadmin)."""
    return getattr(request.user, 'company', None)


# ─── Views ─────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_routes_list(request):
    """
    GET /device/routes/
    Returns JSON list of {route_code, route_name} for APK route selection popup.
    """
    company = _get_company(request)
    if not company:
        return JsonResponse({'message': 'No company associated with this account'}, status=400)

    routes = (
        Route.objects
        .filter(company=company, is_deleted=False)
        .values('route_code', 'route_name')
        .order_by('route_code')
    )
    return JsonResponse({'routes': list(routes)})



@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_settings_file(request):
    """
    GET /device/settings/
    Returns BUS.DAT binary (704 bytes).
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    serialnumber = request.GET.get('serialnumber')
    if not serialnumber:
        return HttpResponse('SERIAL_NUMBER_NOT_PROVIDED', status=400)

    try:
        device = ETMDevice.objects.get(company=company, serial_number=serialnumber)
    except ETMDevice.DoesNotExist:
        return HttpResponse('DEVICE_NOT_FOUND', status=404)

    if not device.is_active:
        return HttpResponse('DEVICE_INACTIVE', status=403)

    try:
        profile = SettingsProfile.objects.get(device=device)
    except SettingsProfile.DoesNotExist:
        return HttpResponse('SETTINGS_NOT_FOUND', status=404)

    # Company-level settings — may not exist yet, pass None and _pack_busdat handles fallback
    company_settings = Settings.objects.filter(company=company).first()

    binary = _pack_busdat(profile, company_settings)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="BUS.DAT"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_crew_file(request):
    """
    GET /device/crew/
    Returns CREW.DAT binary (32 bytes per employee).
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    employees = (
        Employee.objects
        .filter(company=company, is_deleted=False)
        .select_related('emp_type')
        .order_by('employee_code')
    )
    binary = _pack_crewdat(employees)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="CREW.DAT"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_vehicles_file(request):
    """
    GET /device/vehicles/
    Returns VEHICLE.DAT binary (33 bytes per vehicle).
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    vehicles = (
        VehicleType.objects
        .filter(company=company, is_deleted=False)
        .select_related('bus_type')
        .order_by('bus_reg_num')
    )
    binary = _pack_vehicledat(vehicles)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="VEHICLE.DAT"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_expenses_file(request):
    """
    GET /device/expenses/
    Returns EXPENSEDET.DAT binary (31 bytes per expense).
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    expenses = (
        ExpenseMaster.objects
        .filter(company=company)
        .order_by('expense_code')
    )
    binary = _pack_expensedet(expenses)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="EXPENSEDET.DAT"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_routelst_file(request):
    """
    GET /device/routelst[?route_codes=R01,R02]
    Returns ROUTELST.LST binary — 64 bytes per route.
    If route_codes provided, only those routes are included.
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    route_codes = _parse_route_codes(request)
    routes = Route.objects.filter(company=company, is_deleted=False)
    if route_codes:
        routes = routes.filter(route_code__in=route_codes)
    routes = routes.select_related('bus_type').prefetch_related('route_stages__stage').order_by('route_code')

    binary = _pack_routelst_all(routes)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="ROUTELST.LST"'
    return response


def _parse_route_codes(request):
    """
    Parse optional ?route_codes=R01,R02 query param.
    Returns a list of stripped codes, or None if param absent/empty.
    """
    raw = request.GET.get('route_codes', '').strip()
    if not raw:
        return None
    codes = [c.strip() for c in raw.split(',') if c.strip()]
    return codes or None


def _get_ordered_route_stages(company, route_codes=None):
    """
    Return RouteStage entries for company ordered by pk — the canonical
    order used by both STAGE.LST and LANGUAGE.DAT, and indexed by RTE.DAT.
    Mirrors VB: SELECT * FROM STAGE ORDER BY ID (auto-increment pk).
    If route_codes is provided, only stages for those routes are returned.
    """
    qs = RouteStage.objects.filter(company=company).select_related('stage')
    if route_codes:
        qs = qs.filter(route__route_code__in=route_codes)
    return list(qs.order_by('pk'))


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_stagelst_file(request):
    """
    GET /device/stagelst[?route_codes=R01,R02]
    Returns STAGE.LST binary — RouteStage entries, 16 bytes each.
    If route_codes provided, only stages for those routes are included.
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    route_stages = _get_ordered_route_stages(company, _parse_route_codes(request))
    binary = _pack_stagelst_global(route_stages)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="STAGE.LST"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_languagedat_file(request):
    """
    GET /device/languagedat[?route_codes=R01,R02]
    Returns LANGUAGE.DAT binary — 24 bytes per entry, same order as STAGE.LST.
    If route_codes provided, only entries for those routes are included.
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    route_stages = _get_ordered_route_stages(company, _parse_route_codes(request))
    binary = _pack_languagedat(route_stages)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="LANGUAGE.DAT"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_rtedat_file(request):
    """
    GET /device/rtedat[?route_codes=R01,R02]
    Returns RTE.DAT binary — route headers + fare matrices.
    If route_codes provided, only those routes are included.
    stage_index is built from the same filtered route_stages to stay consistent
    with the STAGE.LST that would be generated for the same route_codes.
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    route_codes = _parse_route_codes(request)

    routes_qs = Route.objects.filter(company=company, is_deleted=False)
    if route_codes:
        routes_qs = routes_qs.filter(route_code__in=route_codes)
    routes = list(routes_qs.prefetch_related('route_stages__stage').order_by('route_code'))

    # Must use same filtered set as get_stagelst_file for positional index consistency
    route_stages = _get_ordered_route_stages(company, route_codes)
    stage_index = {rs.pk: i for i, rs in enumerate(route_stages, start=0)}

    binary = _pack_rtedat(routes, stage_index)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="RTE.DAT"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_currency_file(request):
    """
    GET /device/currency
    Returns CURRENCY.DAT binary — 8 bytes per currency entry.
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    currencies = Currency.objects.filter(company=company).order_by('pk')
    binary = _pack_currencydat(currencies)
    response = HttpResponse(binary, content_type='application/octet-stream')
    response['Content-Disposition'] = 'attachment; filename="CURRENCY.DAT"'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_masterdata_bundle(request):
    """
    GET /device/masterdata[?route_codes=R01,R02]
    Returns a ZIP containing all route-dependent master data files.

    All files are built from the same DB snapshot so stage indices in RTE.DAT
    are guaranteed to match STAGE.LST positions.

    ZIP always contains:
      ROUTELST.LST  — route list (64 bytes/route)
      STAGE.LST     — stage names + distances (16 bytes/stage)
      RTE.DAT       — route headers + fare tables + stage ID arrays

    ZIP also contains (when any stage in the set has local-language data):
      LANGUAGE.DAT  — local-language stage names (24 bytes/stage)

    route_codes (optional): comma-separated e.g. ?route_codes=R01,R02
    Omit to include all company routes.
    """
    company = _get_company(request)
    if not company:
        return HttpResponse('NO_COMPANY', status=400)

    route_codes = _parse_route_codes(request)

    # ── Single DB snapshot for all files ──────────────────────────────────────
    routes_qs = Route.objects.filter(company=company, is_deleted=False)
    if route_codes:
        routes_qs = routes_qs.filter(route_code__in=route_codes)
    routes = list(
        routes_qs
        .select_related('bus_type')
        .prefetch_related('route_stages__stage')
        .order_by('route_code')
    )

    route_stages = _get_ordered_route_stages(company, route_codes)
    stage_index  = {rs.pk: i for i, rs in enumerate(route_stages, start=0)}

    # ── Build binaries ─────────────────────────────────────────────────────────
    routelst_bin = _pack_routelst_all(routes)
    stage_bin    = _pack_stagelst_global(route_stages)
    rte_bin      = _pack_rtedat(routes, stage_index)
    lang_bin     = (
        _pack_languagedat(route_stages)
        if any(rs.stage_local_lang for rs in route_stages)
        else None
    )

    # ── Pack into ZIP (ZIP_STORED = no compression, device reads raw bytes) ────
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_STORED) as zf:
        zf.writestr('ROUTELST.LST', routelst_bin)
        zf.writestr('STAGE.LST',    stage_bin)
        zf.writestr('RTE.DAT',      rte_bin)
        if lang_bin:
            zf.writestr('LANGUAGE.DAT', lang_bin)
    buf.seek(0)

    response = HttpResponse(buf.read(), content_type='application/zip')
    response['Content-Disposition'] = 'attachment; filename="masterdata.zip"'
    return response