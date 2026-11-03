
import ftplib
import io
import logging
import os
import re
import struct
import tempfile
from datetime import datetime, date, time as dt_time

from django.conf import settings
from django.db import IntegrityError
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ...permissions import LicensePermission

logger = logging.getLogger('ticket.palmtec.apk_upload')

# ── Struct definitions ────────────────────────────────────────────────────────
# Little-endian, packed (no alignment padding) — matches ETM device binary layout.

_EXPENSE_FMT  = '<BB16s16sffBBBBBhl11s'
_EXPENSE_SIZE = struct.calcsize(_EXPENSE_FMT)   # 64 bytes/record

_ODOMETER_FMT  = '<BB16s16sff1s1sBBh1s1sBBh10s'
_ODOMETER_SIZE = struct.calcsize(_ODOMETER_FMT)  # 64 bytes/record


def _parse_expense_dat(file_path, company_instance, palmtec_id=None):
    from ...models import ExpenseData, Employee, VehicleType, ExpenseMaster

    with open(file_path, 'rb') as f:
        data = f.read()

    n_records = len(data) // _EXPENSE_SIZE
    created = skipped = 0

    for i in range(n_records):
        chunk = data[i * _EXPENSE_SIZE:(i + 1) * _EXPENSE_SIZE]
        (
            schedule_no, trip_no,
            ename_b, busno_b,
            f_expens, f_diesel,
            uc_type, hour, minutes, day, month, year,
            rpt_no, expensename_b,
        ) = struct.unpack(_EXPENSE_FMT, chunk)

        if year == 0 and month == 0 and day == 0:
            continue  # unwritten record slot

        try:
            exp_date     = date(year + 2000, month, day)
            exp_time     = dt_time(hour, minutes)
            exp_datetime = timezone.make_aware(datetime.combine(exp_date, exp_time))
        except ValueError:
            continue

        driver_str       = ename_b.rstrip(b'\x00').decode('ascii', errors='replace').strip()
        bus_str          = busno_b.rstrip(b'\x00').decode('ascii', errors='replace').strip()
        expense_name_str = expensename_b.rstrip(b'\x00').decode('ascii', errors='replace').strip()

        errors = []

        driver_instance = None
        if driver_str:
            driver_instance = Employee.objects.filter(
                employee_name=driver_str, company=company_instance
            ).first()
            if not driver_instance:
                errors.append(f"driver not matched: {driver_str}")

        bus_instance = None
        if bus_str:
            bus_instance = VehicleType.objects.filter(
                bus_reg_num=bus_str, company=company_instance
            ).first()
            if not bus_instance:
                errors.append(f"bus not matched: {bus_str}")

        try:
            ExpenseData.objects.create(
                palmtec_id       = palmtec_id or None,
                company_code     = company_instance,
                schedule_no      = schedule_no,
                trip_no          = trip_no,
                expense_date     = exp_date,
                expense_time     = exp_time,
                expense_datetime = exp_datetime,
                driver           = driver_str or None,
                driver_id        = driver_instance,
                bus_no           = bus_str or None,
                bus_id           = bus_instance,
                expense_amount   = round(f_expens, 2),
                diesel_amount    = round(f_diesel, 2),
                expense_type      = uc_type,
                expense_master_id = ExpenseMaster.objects.filter(company=company_instance, expense_code=str(uc_type)).first() if uc_type else None,
                expense_name      = expense_name_str or None,
                source           = ExpenseData.SourceType.DAT,
                error_reason     = "; ".join(errors) if errors else None,
            )
            created += 1
        except IntegrityError:
            skipped += 1

    return created, skipped


def _parse_odometer_dat(file_path, company_instance, palmtec_id=None):
    from ...models import OdometerData, Employee, VehicleType

    with open(file_path, 'rb') as f:
        data = f.read()

    n_records = len(data) // _ODOMETER_SIZE
    created = skipped = 0

    for i in range(n_records):
        chunk = data[i * _ODOMETER_SIZE:(i + 1) * _ODOMETER_SIZE]
        (
            schedule_no, trip_no,
            driver_b, busno_b,
            startr, endr,
            shour_b, smin_b, sday, smonth, syear,
            ehour_b, emin_b, eday, emonth, eyear,
            reserved,
        ) = struct.unpack(_ODOMETER_FMT, chunk)

        if syear == 0 and smonth == 0 and sday == 0:
            continue  # unwritten record slot

        shour = shour_b[0]
        smin  = smin_b[0]
        ehour = ehour_b[0]
        emin  = emin_b[0]

        try:
            start_date     = date(syear + 2000, smonth, sday)
            start_time     = dt_time(shour, smin)
            start_datetime = timezone.make_aware(datetime.combine(start_date, start_time))
            end_date       = date(eyear + 2000, emonth, eday) if eyear else None
            end_time       = dt_time(ehour, emin) if eyear else None
            end_datetime   = timezone.make_aware(datetime.combine(end_date, end_time)) if end_date and end_time else None
        except ValueError:
            continue

        driver_str = driver_b.rstrip(b'\x00').decode('ascii', errors='replace').strip()
        bus_str    = busno_b.rstrip(b'\x00').decode('ascii', errors='replace').strip()

        errors = []

        driver_instance = None
        if driver_str:
            driver_instance = Employee.objects.filter(
                employee_name=driver_str, company=company_instance
            ).first()
            if not driver_instance:
                errors.append(f"driver not matched: {driver_str}")

        bus_instance = None
        if bus_str:
            bus_instance = VehicleType.objects.filter(
                bus_reg_num=bus_str, company=company_instance
            ).first()
            if not bus_instance:
                errors.append(f"bus not matched: {bus_str}")

        try:
            OdometerData.objects.create(
                palmtec_id     = palmtec_id or None,
                company_code   = company_instance,
                schedule_no    = schedule_no,
                trip_no        = trip_no,
                start_date     = start_date,
                start_time     = start_time,
                start_datetime = start_datetime,
                end_date       = end_date,
                end_time       = end_time,
                end_datetime   = end_datetime,
                driver         = driver_str or None,
                driver_id      = driver_instance,
                bus_no         = bus_str or None,
                bus_id         = bus_instance,
                start_reading  = round(startr, 2),
                end_reading    = round(endr, 2),
                source         = OdometerData.SourceType.DAT,
                error_reason   = "; ".join(errors) if errors else None,
            )
            created += 1
        except IntegrityError:
            skipped += 1

    return created, skipped


# POST /ticket-app/apk/upload/odometer-dat
@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def uploadOdometerDat(request):
    user = request.user

    company = getattr(user, 'company', None)
    if not company:
        return JsonResponse({'error': 'No company linked to user'}, status=400)

    dat_file = request.FILES.get('file')
    if not dat_file:
        return JsonResponse({'error': 'No file provided'}, status=400)

    palmtec_id = request.data.get('palmtec_id') or None

    try:
        now        = timezone.now()
        upload_dir = os.path.join(
            settings.MEDIA_ROOT, company.company_id, 'odometer', now.strftime('%Y-%m-%d')
        )
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, f"{now.strftime('%H-%M-%S')}.DAT")

        with open(file_path, 'wb') as f:
            for chunk in dat_file.chunks():
                f.write(chunk)

        created, skipped = _parse_odometer_dat(file_path, company, palmtec_id)

        return JsonResponse({'status': 'ok', 'created': created, 'skipped': skipped}, status=200)

    except Exception as e:
        logger.exception("OdometerDat upload failed: %s", e)
        return JsonResponse({'error': 'Upload failed'}, status=500)


# POST /ticket-app/apk/upload/expense-dat
@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def uploadExpenseDat(request):
    user = request.user

    company = getattr(user, 'company', None)
    if not company:
        return JsonResponse({'error': 'No company linked to user'}, status=400)

    dat_file = request.FILES.get('file')
    if not dat_file:
        return JsonResponse({'error': 'No file provided'}, status=400)

    palmtec_id = request.data.get('palmtec_id') or None

    try:
        now        = timezone.now()
        upload_dir = os.path.join(
            settings.MEDIA_ROOT, company.company_id, 'expense', now.strftime('%Y-%m-%d')
        )
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, f"{now.strftime('%H-%M-%S')}.DAT")

        with open(file_path, 'wb') as f:
            for chunk in dat_file.chunks():
                f.write(chunk)

        created, skipped = _parse_expense_dat(file_path, company, palmtec_id)

        return JsonResponse({'status': 'ok', 'created': created, 'skipped': skipped}, status=200)

    except Exception as e:
        logger.exception("ExpenseDat upload failed: %s", e)
        return JsonResponse({'error': 'Upload failed'}, status=500)


# Files the APK reads off the ETM device and uploads here as-is (no on-device
# parsing) — core files present on every read, plus dynamically discovered
# ticket/transaction files (TKTS01.DAT, TKTS02.DAT, ... vary by device).
_CORE_UPLOAD_NAMES = {
    'VERSION.DAT', 'STATUS.DAT', 'BUS.DAT', 'RPT01.DAT',
    'ODOMETER.DAT', 'EXPENSE.DAT', 'INSPECTOR.DAT',
}
_DYNAMIC_UPLOAD_NAMES = {'PASS.PAS', 'T.CON', 'FAREWISE.DAT', 'PRM'}


def _is_allowed_device_file(filename):
    name = filename.upper()
    if name in _CORE_UPLOAD_NAMES or name in _DYNAMIC_UPLOAD_NAMES:
        return True
    return name.startswith('TKTS') and name.endswith('.DAT')


def _safe_path_segment(value, fallback):
    value = re.sub(r'[^A-Za-z0-9_-]+', '_', str(value).strip()) if value else ''
    return value or fallback


# ── Remote FTP mirror ─────────────────────────────────────────────────────────
_FTP_HOST     = '124.124.79.122'
_FTP_USER     = 'silftp'
_FTP_PASSWORD = 'silftp'
_FTP_PORT     = 21
_FTP_ROOT     = 'PalmtecQr'


def _ftp_upload_files(remote_subdirs, files):
    """files: list of (filename, local_path). Mirrors upload_dir under _FTP_ROOT."""
    ftp = ftplib.FTP()
    ftp.connect(_FTP_HOST, _FTP_PORT, timeout=30)
    ftp.login(_FTP_USER, _FTP_PASSWORD)
    try:
        for part in [_FTP_ROOT] + remote_subdirs:
            try:
                ftp.cwd(part)
            except ftplib.error_perm:
                ftp.mkd(part)
                ftp.cwd(part)

        for filename, local_path in files:
            with open(local_path, 'rb') as f:
                ftp.storbinary(f'STOR {filename}', f)
    finally:
        ftp.quit()


def _ftp_list(ftp, remote_parts):
    """Entry names under _FTP_ROOT/<remote_parts...>, or None if that path doesn't exist."""
    try:
        ftp.cwd('/')
        for part in [_FTP_ROOT] + remote_parts:
            ftp.cwd(part)
        return ftp.nlst()
    except ftplib.error_perm:
        return None


def _ftp_retrieve(ftp, remote_parts, filename):
    """Bytes of _FTP_ROOT/<remote_parts...>/filename."""
    ftp.cwd('/')
    for part in [_FTP_ROOT] + remote_parts:
        ftp.cwd(part)
    buf = io.BytesIO()
    ftp.retrbinary(f'RETR {filename}', buf.write)
    return buf.getvalue()


# POST /ticket-app/apk/upload/device-data
# Accepts one or more raw device files (multipart, any field name) from the
# APK's device read sequence and saves them to disk unmodified — no parsing.
@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def uploadDeviceData(request):
    user = request.user

    company = getattr(user, 'company', None)
    if not company:
        return JsonResponse({'error': 'No company linked to user'}, status=400)

    uploaded_files = list(request.FILES.values())
    if not uploaded_files:
        return JsonResponse({'error': 'No file provided'}, status=400)

    serial_number = request.data.get('serialnumber')
    if not serial_number:
        return JsonResponse({'error': 'Serial number not provided'}, status=400)

    from ...models import ETMDevice

    try:
        device = ETMDevice.objects.get(company=company, serial_number=serial_number)
    except ETMDevice.DoesNotExist:
        return JsonResponse({'error': 'Device not found for company'}, status=404)

    palmtec_id = device.palmtec_id

    print("-------------------------------------------------------------------------------------------------")
    print([f.name for f in uploaded_files])

    


    now = timezone.now()
    company_folder  = _safe_path_segment(company.company_name, company.company_id or 'unknown_company')
    username_folder = _safe_path_segment(user.username, 'unknown_user')
    palmtec_folder  = _safe_path_segment(palmtec_id, 'unknown_palmtec_id')
    # DEVICE_DATA_UPLOAD_ROOT = settings.MEDIA_ROOT
    # DEVICE_DATA_UPLOAD_ROOT = r'D:\IIS PUBLISHES\PALMTECQR\BUSTICKETING_DEMO\uploads'
    DEVICE_DATA_UPLOAD_ROOT = r'D:\LOGS\PALMTECQR'
    upload_dir = os.path.join(
        DEVICE_DATA_UPLOAD_ROOT, 'device_data', company_folder, username_folder, palmtec_folder, now.strftime('%Y-%m-%d')
    )

    saved = []
    rejected = []
    saved_paths = []

    try:
        os.makedirs(upload_dir, exist_ok=True)

        for uploaded_file in uploaded_files:
            filename = uploaded_file.name
            if not _is_allowed_device_file(filename):
                rejected.append(filename)
                continue

            file_path = os.path.join(upload_dir, f"{now.strftime('%H-%M-%S')}_{filename}")
            with open(file_path, 'wb') as f:
                for chunk in uploaded_file.chunks():
                    f.write(chunk)

            saved.append(filename)
            saved_paths.append((f"{now.strftime('%H-%M-%S')}_{filename}", file_path))

            upper_name = filename.upper()
            try:
                if upper_name == 'BUS.DAT':
                    bus = unpack_bus_dat(file_path)
                    result = _import_bus_dat(bus, company, device, user)
                    _report_import(filename, palmtec_id, 1,
                                   int(result == 'created'), int(result != 'created'))
                elif upper_name == 'INSPECTOR.DAT':
                    records = unpack_inspector_dat(file_path)
                    created, skipped = _import_inspector_dat(records, company, palmtec_id, user)
                    _report_import(filename, palmtec_id, len(records), created, skipped)
                elif upper_name == 'EXPENSE.DAT':
                    created, skipped = _parse_expense_dat(file_path, company, palmtec_id)
                    _report_import(filename, palmtec_id, created + skipped, created, skipped)
                else:
                    unpacker = _get_decode_only_unpacker(upper_name)
                    if unpacker:
                        decoded = unpacker(file_path)
                        count = len(decoded) if isinstance(decoded, list) else 1
                        _report_import(filename, palmtec_id, count)  # not stored in DB
            except Exception as import_err:
                print(f"[DEVICE-DATA] {filename}: FAILED - {import_err!r}")  # local test
                logger.exception("%s import failed: %s", filename, import_err)

        logger.info(
            "Device data upload by %s (palmtec_id=%s): saved=%s rejected=%s",
            user, palmtec_id, saved, rejected,
        )

        if saved_paths:
            try:
                _ftp_upload_files(
                    ['device_data', company_folder, username_folder, palmtec_folder, now.strftime('%Y-%m-%d')],
                    saved_paths,
                )
            except Exception as ftp_err:
                logger.exception("Device data FTP mirror failed: %s", ftp_err)

        return JsonResponse(
            {'status': 'ok', 'saved': saved, 'rejected': rejected}, status=200
        )

    except Exception as e:
        logger.exception("Device data upload failed: %s", e)
        return JsonResponse({'error': 'Upload failed'}, status=500)


# ── BUS.DAT / INSPECTOR.DAT unpackers ─────────────────────────────────────────
# Pure decoders: file path in, plain dict(s) out. No DB writes.

# BUS.DAT = SETUP + HARDWARE_SETUP, 704 bytes. Field order mirrors
# master_send._pack_busdat. Format codes are struct codes (little-endian, packed).
_BUSDAT_FIELDS = [
    # ── SETUP ──
    ('main_disp', '18s'), ('main_disp2', '23s'),
    ('bhl1', '32s'), ('bhl2', '32s'), ('bhl3', '32s'), ('bfl1', '32s'), ('bfl2', '32s'),
    ('paper_feed', 'B'), ('palmtec_id', '6s'), ('default_full', 'B'),
    ('half_per', 'B'), ('con_per', 'B'), ('st_max_amt', 'f'), ('st_min_con', 'f'),
    ('phy_per', 'B'), ('luggage_unit_rate_edit', 'B'), ('luggage_unit_rate', 'f'),
    ('stage_updation', 'B'), ('stage_display_font', 'B'),
    ('use_duplicate', 'B'), ('use_dup1', 'B'), ('roundoff', 'B'), ('round_up', 'B'),
    ('currency', '8s'), ('round_amt', 'H'),
    ('ucb_adjust', 'B'), ('ucb_review_passwd', 'B'), ('ucb_report_passwd', 'B'),
    ('ucb_st_from_stage', 'B'), ('ucb_st_fare_edit', 'B'),
    ('master_clear_password', '11s'), ('report_flag', 'B'), ('next_fare_round', 'B'),
    ('update_stage_msg', 'B'), ('enable_remove_ticket', 'B'), ('enable_stage_font', 'B'),
    ('enable_stage_default', 'B'), ('printer_sel', 'B'), ('odometer_entry', 'B'),
    ('ticket_no_big_font', 'B'), ('crew_check', 'B'),
    ('ph_no', '13s'), ('trip_sms', 'B'), ('schedule_sms', 'B'),
    ('ticket_rpt', 'B'), ('busno', 'B'), ('driver', 'B'), ('conductor', 'B'),
    ('inspector_report', 'B'), ('repeat_st', 'B'), ('sendbill_enable', 'B'),
    ('tripsend_enable', 'B'), ('schedulesend_enable', 'B'), ('sendpend', 'B'),
    ('ph_no2', '13s'), ('access_point', '24s'), ('dest_adds', '32s'),
    ('username', '16s'), ('password', '16s'), ('uploadpath', '32s'),
    ('downloadpath', '32s'), ('http_url', '64s'),
    ('gprs_enable', 'B'), ('msg_prompt', 'B'), ('exp_enable', 'B'), ('smart_card', 'B'),
    ('modem_on', 'B'), ('ftp_enable', 'B'), ('remove_password', '11s'),
    ('stage_report_e_d', 'B'), ('st_roundoff_enable', 'B'), ('st_roundoff_amt', 'h'),
    ('simple_report', 'B'), ('report_font', 'B'), ('multiple_pass', 'B'),
    ('inspector_sms', 'B'), ('stage_entry', 'B'), ('ph_no3', '13s'),
    ('auto_shut_down', 'B'), ('userpswd_enable', 'B'), ('diesel_entry_enable', 'B'),
    ('trip_time_enable', 'B'), ('trip_close_report', 'B'), ('paper_feed2', 'B'),
    ('refund_enable', 'B'), ('schedule_close_rpt', 'B'), ('ladies_per', 'B'),
    ('senior_per', 'B'), ('bigfont_enable', 'B'), ('senior_enable', 'B'),
    ('ladies_enable', 'B'),
    ('shd_opn_d', '4s'), ('shd_opn_t', '4s'), ('trp_opn_d', '4s'), ('trp_opn_t', '4s'),
    ('sms_no1', '13s'), ('sms_no2', '13s'), ('sms_no3', '13s'),
    ('sms_sending_enable', 'B'), ('sms_prompt_enable', 'B'),
    ('setup_reserved', '10s'),
    # ── HARDWARE_SETUP ──
    ('hw_ptime', '4s'), ('hw_pdate', '4s'),
    ('msr_pswd', '11s'), ('usr_pswd', '11s'), ('spr_pswd', '11s'),
    ('val_contrast', 'B'), ('val_brightness', 'B'), ('screensaver_onoff', 'B'),
    ('backlit_timer', 'B'), ('keyhitdelay', 'B'), ('boarder_en', 'B'),
    ('dooropen_alert', 'B'), ('paperout_alert', 'B'), ('half_page_printer', 'B'),
    ('buzz_onoff', 'B'), ('rs232_baud', 'B'), ('ir_baud', 'B'), ('rf_baud', 'B'),
    ('connecting_medium', 'B'), ('footer_stat', 'B'), ('select_language', 'B'),
    ('login_mode', 'B'), ('kplite_opt', 'B'), ('shutdown_time', 'H'),
    ('lang_no', 'B'), ('hw_reserved', '2s'),
]
_BUSDAT_FMT  = '<' + ''.join(code for _, code in _BUSDAT_FIELDS)
_BUSDAT_SIZE = struct.calcsize(_BUSDAT_FMT)   # 704 bytes

# INSPECTOR.DAT = array of INSPECTORDET records, 64 bytes each.
_INSPECTOR_FMT  = '<8sBB5s12sBBhBB31s'
_INSPECTOR_SIZE = struct.calcsize(_INSPECTOR_FMT)  # 64 bytes/record


def _dat_str(raw):
    """Fixed-width null/space-padded device string -> str."""
    return raw.split(b'\x00', 1)[0].decode('ascii', errors='replace').strip()


def unpack_bus_dat(file_path):
    """Decode BUS.DAT into a dict of field name -> value. Raises ValueError on bad size."""
    with open(file_path, 'rb') as f:
        data = f.read()

    if len(data) < _BUSDAT_SIZE:
        raise ValueError(f"BUS.DAT too short: {len(data)} bytes, expected {_BUSDAT_SIZE}")

    values = struct.unpack(_BUSDAT_FMT, data[:_BUSDAT_SIZE])
    result = {}
    for (name, code), value in zip(_BUSDAT_FIELDS, values):
        if code.endswith('s'):
            # hw_ptime/hw_pdate/shd_*/trp_* and reserved blocks are raw bytes, rest are text
            result[name] = value.hex() if name.endswith(('_reserved', '_d', '_t')) or name in ('hw_ptime', 'hw_pdate') else _dat_str(value)
        elif code == 'f':
            result[name] = round(value, 4)
        else:
            result[name] = value
    return result


def unpack_inspector_dat(file_path):
    """Decode INSPECTOR.DAT into a list of inspector-check dicts. Empty slots are skipped."""
    with open(file_path, 'rb') as f:
        data = f.read()

    records = []
    for i in range(len(data) // _INSPECTOR_SIZE):
        chunk = data[i * _INSPECTOR_SIZE:(i + 1) * _INSPECTOR_SIZE]
        (
            inspector_id_b, schedule_no, trip_no,
            route_code_b, stage_b,
            day, month, year, hour, minutes,
            _reserved,
        ) = struct.unpack(_INSPECTOR_FMT, chunk)

        if year == 0 and month == 0 and day == 0:
            continue  # unwritten record slot

        try:
            checked_at = datetime(year + 2000, month, day, hour, minutes)
        except ValueError:
            continue

        records.append({
            'inspector_id': _dat_str(inspector_id_b),
            'schedule_no':  schedule_no,
            'trip_no':      trip_no,
            'route_code':   _dat_str(route_code_b),
            'stage':        _dat_str(stage_b),
            'checked_at':   checked_at,
        })
    return records


# ── Other device-file unpackers (decode only, no DB writes) ───────────────────
# Layouts from mdFunctions.bas / General.bas in the VB6 PVT BUS source.

_PASSCONC_FMT  = '<11sl12sf4sBBBBBBh1s'   # PASS.PAS record, also embedded in RPT01.DAT
_PASSCONC_SIZE = struct.calcsize(_PASSCONC_FMT)  # 44 bytes

_TICKET_FMT  = '<lBBBBBBBffBBBBB5sBBBfBB10s'     # PTicket (TKTSnn.DAT)
_TICKET_SIZE = struct.calcsize(_TICKET_FMT)      # 48 bytes

_FAREWISE_FMT  = '<lf'                            # fare_type (FAREWISE.DAT)
_FAREWISE_SIZE = struct.calcsize(_FAREWISE_FMT)  # 8 bytes

# PReport (RPT01.DAT): 2 longs, 16 singles, 9 ints, PASSCONC, 5 ints, 3 bytes,
# route code, 10 date/time bytes, depot/crew/bus strings, fare type, 2 ints, 2 singles
_REPORT_FMT = (
    '<ll' + '16f' + '9h' + _PASSCONC_FMT[1:] + '5h' + 'BBB' + '5s' + '10B'
    + '6s11s16s16s16s16s' + 'B' + 'hhff'
)
_REPORT_SIZE = struct.calcsize(_REPORT_FMT)      # 256 bytes
_PASSCONC_FIELDS = 13
_REPORT_SINGLES = (
    'in_hand_amount', 'total_coll', 'full_coll', 'half_coll', 'phy_coll',
    'luggage_coll', 'st_coll', 'adjust_coll', 'total_km', 'cess_amount',
    'expense_amount', 'warrant_amount', 'deaf_dump_amount', 'operated_km',
    'diesel_filled', 'cancelled_km',
)
_REPORT_INTS = (
    'full', 'half', 'phy', 'st', 'free', 'adjust', 'conc', 'others', 'lugg',
)


def unpack_version_dat(file_path):
    """VERSION.DAT -> version string (16-byte fixed field)."""
    with open(file_path, 'rb') as f:
        data = f.read(16)
    return _dat_str(data)


def unpack_status_dat(file_path):
    """STATUS.DAT -> trip/schedule open flags from byte 0 (bit1 = trip open, bit0 = schedule open)."""
    with open(file_path, 'rb') as f:
        data = f.read()
    if not data:
        raise ValueError("STATUS.DAT empty")
    b0 = data[0]
    return {
        'trip_closed':     not bool(b0 & 2),
        'schedule_closed': not bool(b0 & 1),
        'raw':             data.hex(),
    }


def _decode_passconc(chunk):
    (
        pass_no, ticket_no, name, amount, dob,
        start_period, end_period, start_stage, end_stage, via_stage, trans_id,
        pass_type, _reserved,
    ) = struct.unpack(_PASSCONC_FMT, chunk)
    return {
        'pass_no':        _dat_str(pass_no),
        'ticket_no':      ticket_no,
        'name':           _dat_str(name),
        'amount':         round(amount, 2),
        'date_of_birth':  dob.hex(),
        'starting_period': start_period,
        'end_period':     end_period,
        'start_stage':    start_stage,
        'end_stage':      end_stage,
        'via_stage':      via_stage,
        'trans_id':       trans_id,
        'pass_type':      pass_type,
    }


def unpack_pass_pas(file_path):
    """PASS.PAS -> list of pass records (PASSCONC, 44 bytes each). Blank slots skipped."""
    with open(file_path, 'rb') as f:
        data = f.read()
    records = []
    for i in range(len(data) // _PASSCONC_SIZE):
        rec = _decode_passconc(data[i * _PASSCONC_SIZE:(i + 1) * _PASSCONC_SIZE])
        if not rec['pass_no'] and rec['ticket_no'] == 0:
            continue
        records.append(rec)
    return records


def unpack_tkts_dat(file_path):
    """TKTSnn.DAT -> list of ticket dicts (PTicket, 48 bytes). Stops at TicketNo == -1 like the VB reader."""
    with open(file_path, 'rb') as f:
        data = f.read()
    records = []
    for i in range(len(data) // _TICKET_SIZE):
        (
            ticket_no, frm, to, full, half, st, phy, lugg,
            amount, luggage, hour, minute, typ, day, month,
            _temp, trip_no, bus_warrant, refund_sts, refund_amt,
            ladies, senior, _reserved,
        ) = struct.unpack(_TICKET_FMT, data[i * _TICKET_SIZE:(i + 1) * _TICKET_SIZE])
        if ticket_no == -1:
            break
        records.append({
            'ticket_no': ticket_no, 'from_stage': frm, 'to_stage': to,
            'full': full, 'half': half, 'st': st, 'phy': phy, 'lugg': lugg,
            'amount': round(amount, 2), 'luggage_amount': round(luggage, 2),
            'hour': hour, 'minute': minute, 'type': typ, 'day': day, 'month': month,
            'trip_no': trip_no, 'bus_warrant': bus_warrant,
            'refund_status': refund_sts, 'refund_amount': round(refund_amt, 2),
            'ladies_count': ladies, 'senior_count': senior,
        })
    return records


def unpack_farewise_dat(file_path):
    """FAREWISE.DAT -> list of {ticket_no, fare} (fare_type, 8 bytes each). Stops at ticket_no == -1."""
    with open(file_path, 'rb') as f:
        data = f.read()
    records = []
    for i in range(len(data) // _FAREWISE_SIZE):
        ticket_no, fare = struct.unpack(_FAREWISE_FMT, data[i * _FAREWISE_SIZE:(i + 1) * _FAREWISE_SIZE])
        if ticket_no == -1:
            break
        records.append({'ticket_no': ticket_no, 'fare': round(fare, 2)})
    return records


def unpack_rpt01_dat(file_path):
    """RPT01.DAT -> list of trip report dicts (PReport, 256 bytes each). Stops at schedule == 0."""
    with open(file_path, 'rb') as f:
        data = f.read()
    records = []
    for i in range(len(data) // _REPORT_SIZE):
        v = struct.unpack(_REPORT_FMT, data[i * _REPORT_SIZE:(i + 1) * _REPORT_SIZE])
        rec = {'start_ticket_no': v[0], 'end_ticket_no': v[1]}
        pos = 2
        for name in _REPORT_SINGLES:
            rec[name] = round(v[pos], 2)
            pos += 1
        for name in _REPORT_INTS:
            rec[name] = v[pos]
            pos += 1
        rec['general_pass'] = _decode_passconc(
            struct.pack(_PASSCONC_FMT, *v[pos:pos + _PASSCONC_FIELDS])
        )
        pos += _PASSCONC_FIELDS
        (rec['season_pass'], rec['warrant'], rec['deaf_and_dump'],
         rec['cess_count'], rec['total_passenger']) = v[pos:pos + 5]
        pos += 5
        schedule, trip_no, up_down = v[pos:pos + 3]
        pos += 3
        if schedule == 0:
            break
        route_code = _dat_str(v[pos]); pos += 1
        sd, smo, sy, sh, sm, ed, emo, ey, eh, em = v[pos:pos + 10]
        pos += 10
        depot_code, depot_name, driver, conductor, cleaner, busno = (_dat_str(x) for x in v[pos:pos + 6])
        pos += 6
        fare_type = v[pos]; pos += 1
        ladies_count, senior_count, ladies_coll, senior_coll = v[pos:pos + 4]
        rec.update({
            'schedule_no': schedule, 'trip_no': trip_no, 'up_down_trip': up_down,
            'route_code': route_code,
            'start': {'d': sd, 'm': smo, 'y': sy, 'h': sh, 'min': sm},
            'end':   {'d': ed, 'm': emo, 'y': ey, 'h': eh, 'min': em},
            'depot_code': depot_code, 'depot_name': depot_name,
            'driver': driver, 'conductor': conductor, 'cleaner': cleaner, 'bus_no': busno,
            'fare_type': fare_type,
            'ladies_count': ladies_count, 'senior_count': senior_count,
            'ladies_coll': round(ladies_coll, 2), 'senior_coll': round(senior_coll, 2),
        })
        records.append(rec)
    return records


# Decode-only files: name (or TKTS prefix) -> unpacker. Result is printed/logged, not stored.
def _get_decode_only_unpacker(upper_name):
    if upper_name.startswith('TKTS') and upper_name.endswith('.DAT'):
        return unpack_tkts_dat
    return {
        'VERSION.DAT':  unpack_version_dat,
        'STATUS.DAT':   unpack_status_dat,
        'PASS.PAS':     unpack_pass_pas,
        'FAREWISE.DAT': unpack_farewise_dat,
        'RPT01.DAT':    unpack_rpt01_dat,
    }.get(upper_name)


def _report_import(filename, palmtec_id, unpacked, created=None, skipped=None):
    """Print + log one clear summary line per file. created/skipped None = file is decode-only (not stored)."""
    if created is None:
        line = f"[DEVICE-DATA] {filename} (palmtec_id={palmtec_id}): unpacked={unpacked} | not stored in DB"
    else:
        line = (f"[DEVICE-DATA] {filename} (palmtec_id={palmtec_id}): "
                f"unpacked={unpacked} | created={created} | skipped={skipped}")
    print(line)  # local test
    logger.info(line)


def _import_bus_dat(bus, company, device, user):
    """
    Create a SettingsProfile from unpacked BUS.DAT if the device has none yet.
    Existing profile is never overwritten (DB is source of truth).
    Returns 'created' or 'exists'.
    """
    from ...models import SettingsProfile

    try:
        palmtec_id = int(device.palmtec_id)
    except (TypeError, ValueError):
        palmtec_id = int(bus['palmtec_id'] or 0)

    if (SettingsProfile.objects.filter(device=device).exists()
            or SettingsProfile.objects.filter(company=company, palmtec_id=palmtec_id).exists()):
        return 'exists'

    SettingsProfile.objects.create(
        company=company,
        device=device,
        name=f"Imported {palmtec_id}",
        palmtec_id=palmtec_id,
        user_pwd=bus['usr_pswd'], master_pwd=bus['msr_pswd'],
        supervisor_pwd=bus['spr_pswd'], remove_pwd=bus['remove_password'],
        half_per=bus['half_per'], con_per=bus['con_per'], phy_per=bus['phy_per'],
        round_amt=bus['round_amt'], luggage_unit_rate=round(bus['luggage_unit_rate'], 2),
        main_display=bus['main_disp'], main_display2=bus['main_disp2'],
        header1=bus['bhl1'], header2=bus['bhl2'], header3=bus['bhl3'],
        footer1=bus['bfl1'], footer2=bus['bfl2'],
        language_option=bus['select_language'], report_font=bus['report_font'],
        st_fare_edit=bool(bus['ucb_st_fare_edit']),
        st_max_amt=str(int(bus['st_max_amt'])),
        st_roundoff_enable=bool(bus['st_roundoff_enable']),
        st_roundoff_amt=str(bus['st_roundoff_amt']),
        roundoff=bool(bus['roundoff']), round_up=bool(bus['round_up']),
        remove_ticket_flag=bool(bus['enable_remove_ticket']),
        stage_font_flag=bool(bus['enable_stage_font']),
        next_fare_flag=bool(bus['next_fare_round']),
        odometer_entry=bool(bus['odometer_entry']),
        ticket_no_big_font=bool(bus['ticket_no_big_font']),
        tripsend_enable=bool(bus['tripsend_enable']),
        schedulesend_enable=bool(bus['schedulesend_enable']),
        inspect_rpt=bool(bus['inspector_report']),
        multiple_pass=bool(bus['multiple_pass']),
        simple_report=bool(bus['simple_report']),
        inspector_sms=bool(bus['inspector_sms']),
        auto_shut_down=bool(bus['auto_shut_down']),
        userpswd_enable=bool(bus['userpswd_enable']),
        exp_enable=bool(bus['exp_enable']),
        stage_updation_msg=bus['update_stage_msg'],
        created_by=user, updated_by=user,
    )
    return 'created'


def _import_inspector_dat(records, company, palmtec_id, user):
    """
    Insert unpacked INSPECTOR.DAT rows into InspectorDetails, skipping rows
    already in DB. Inspector matched by Employee.employee_code; unmatched
    inspectors are skipped (FK is required). Returns (created, skipped).
    """
    from ...models import InspectorDetails, Employee

    created = skipped = 0
    for rec in records:
        inspector = Employee.objects.filter(
            company=company, employee_code=rec['inspector_id'], is_deleted=False
        ).first()
        if not inspector:
            skipped += 1
            continue

        _, was_created = InspectorDetails.objects.get_or_create(
            company=company,
            palmtec_id=str(palmtec_id),
            inspector=inspector,
            schedule_no=rec['schedule_no'],
            trip_no=rec['trip_no'],
            date=rec['checked_at'].date(),
            time=rec['checked_at'].time(),
            defaults={
                'station_no': rec['stage'],
                'tripmaster_ref_id': '',
                'created_by': user,
                'updated_by': user,
            },
        )
        if was_created:
            created += 1
        else:
            skipped += 1
    return created, skipped


# Files pulled back from FTP that we know how to decode into DB rows.
# Anything else on the FTP (VERSION.DAT, BUS.DAT, TKTS*.DAT, ...) has no
# parser here and is left untouched — same "no on-device parsing" boundary
# uploadDeviceData draws, just mirrored on the way back in.
_IMPORTERS = {
    'EXPENSE.DAT':  _parse_expense_dat,
    'ODOMETER.DAT': _parse_odometer_dat,
}


# GET /ticket-app/apk/download/device-data?serialnumber=...&date=YYYY-MM-DD
# Pulls previously uploaded raw device files back from the FTP mirror
# (uploadDeviceData's destination) and imports the known ones (EXPENSE.DAT,
# ODOMETER.DAT) into this company's DB. `date` is optional — omit it for the
# most recent date available for the device.
# @api_view(['GET'])
# @permission_classes([IsAuthenticated, LicensePermission])
# def downloadDeviceData(request):
#     user = request.user

#     company = getattr(user, 'company', None)
#     if not company:
#         return JsonResponse({'error': 'No company linked to user'}, status=400)

#     serial_number = request.query_params.get('serialnumber')
#     if not serial_number:
#         return JsonResponse({'error': 'Serial number not provided'}, status=400)

#     from ...models import ETMDevice

#     try:
#         device = ETMDevice.objects.get(company=company, serial_number=serial_number)
#     except ETMDevice.DoesNotExist:
#         return JsonResponse({'error': 'Device not found for company'}, status=404)

#     palmtec_id = device.palmtec_id
#     requested_date = request.query_params.get('date') or None

#     company_folder = _safe_path_segment(company.company_name, company.company_id or 'unknown_company')
#     palmtec_folder = _safe_path_segment(palmtec_id, 'unknown_palmtec_id')
#     base_parts = ['device_data', company_folder]

#     try:
#         ftp = ftplib.FTP()
#         ftp.connect(_FTP_HOST, _FTP_PORT, timeout=30)
#         ftp.login(_FTP_USER, _FTP_PASSWORD)
#     except Exception as e:
#         logger.exception("Device data download FTP connect failed: %s", e)
#         return JsonResponse({'error': 'Could not reach FTP server'}, status=502)

#     try:
#         usernames = _ftp_list(ftp, base_parts) or []

#         # Uploads land under a per-uploader username folder, so a device's
#         # files may be split across several usernames — gather dates from all.
#         dates_by_user = {}
#         for username in usernames:
#             dates = _ftp_list(ftp, base_parts + [username, palmtec_folder])
#             if dates:
#                 dates_by_user[username] = dates

#         if requested_date:
#             target_date = requested_date
#         else:
#             all_dates = sorted({d for dates in dates_by_user.values() for d in dates})
#             target_date = all_dates[-1] if all_dates else None

#         if not target_date:
#             return JsonResponse({'error': 'No device data found'}, status=404)

#         imported = {}
#         skipped_no_parser = []
#         failed = []

#         for username, dates in dates_by_user.items():
#             if target_date not in dates:
#                 continue
#             file_parts = base_parts + [username, palmtec_folder, target_date]
#             for filename in _ftp_list(ftp, file_parts) or []:
#                 importer = _IMPORTERS.get(filename.upper())
#                 if not importer:
#                     skipped_no_parser.append(filename)
#                     continue

#                 tmp_path = None
#                 try:
#                     content = _ftp_retrieve(ftp, file_parts, filename)
#                     with tempfile.NamedTemporaryFile(delete=False, suffix=f'_{filename}') as tmp:
#                         tmp.write(content)
#                         tmp_path = tmp.name

#                     created, skipped = importer(tmp_path, company, palmtec_id)
#                     entry = imported.setdefault(filename.upper(), {'created': 0, 'skipped': 0})
#                     entry['created']  += created
#                     entry['skipped']  += skipped
#                 except Exception as file_err:
#                     logger.exception("Device data import failed for %s: %s", filename, file_err)
#                     failed.append(filename)
#                 finally:
#                     if tmp_path and os.path.exists(tmp_path):
#                         os.remove(tmp_path)

#         if not imported and not failed:
#             return JsonResponse(
#                 {'error': 'No importable device data found for requested date', 'skipped_no_parser': skipped_no_parser},
#                 status=404,
#             )

#         logger.info(
#             "Device data import by %s (palmtec_id=%s, date=%s): imported=%s failed=%s skipped=%s",
#             user, palmtec_id, target_date, imported, failed, skipped_no_parser,
#         )

#         return JsonResponse({
#             'status': 'ok',
#             'date': target_date,
#             'imported': imported,
#             'failed': failed,
#             'skipped_no_parser': skipped_no_parser,
#         }, status=200)

#     except Exception as e:
#         logger.exception("Device data download/import failed: %s", e)
#         return JsonResponse({'error': 'Download failed'}, status=500)
#     finally:
#         try:
#             ftp.quit()
#         except Exception:
#             pass

