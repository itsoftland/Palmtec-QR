
import logging
import os
import struct
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
