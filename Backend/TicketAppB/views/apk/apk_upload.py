
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

