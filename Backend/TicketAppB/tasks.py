from celery import shared_task
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta, date, time
from .models import (
    RawDataLog, TransactionData, Direction, RouteStage,
    ScheduleData, TripData, Employee, VehicleType,
    ETMDevice, DeviceRejectionLog, Company, AggregatorTransaction,
)
from .views.utils import _get_route_for_palmtec
from django.contrib.auth import get_user_model
from TicketAppB.models.auth import UserSession
from FCM.models import FCMLog
from FCM.firebase import send_push_notification



def _fail(log, msg):
    log.status = RawDataLog.statusChoices.FAILED
    log.error_message = msg
    log.save()


def _parse_date(s, fmt="%Y-%m-%d"):
    """Parse date string; corrects 2-digit year stored as %04d (e.g. 0026 → 2026)."""
    if not s:
        return None
    d = datetime.strptime(s, fmt).date()
    return d.replace(year=d.year + 2000) if d.year < 100 else d


def _parse_time(s, fmt="%H:%M:%S"):
    if not s:
        return None
    try:
        return datetime.strptime(s, fmt).time()
    except ValueError:
        return datetime.strptime(s, "%H:%M").time()


def _decode_etm_date(s):
    """Decode Palmtec YrMo-Day format: A=2026, a=Jan, DD=day."""
    if not s or len(s) < 5:
        return None
    try:
        year  = ord(s[0]) - ord('A') + 2026
        month = ord(s[1]) - ord('a') + 1
        day   = int(s[3:5])
        return date(year, month, day)
    except (ValueError, IndexError):
        return None


def _decode_etm_time(s):
    """Decode Palmtec HrMin-Sec format: A=0h; A-Z=0-25min, a-z=26-51min, 1-8=52-59min."""
    if not s or len(s) < 5:
        return None
    try:
        hour = ord(s[0]) - ord('A')
        m = s[1]
        if m.isupper():
            minute = ord(m) - ord('A')
        elif m.islower():
            minute = ord(m) - ord('a') + 26
        else:
            minute = int(m) + 51
        second = int(s[3:5])
        return time(hour, minute, second)
    except (ValueError, IndexError):
        return None


def _resolve_schedule(palmtec_id, company_id, schedule_no, schedule_start_date):
    if not schedule_no or not schedule_start_date:
        return None
    return ScheduleData.objects.filter(
        palmtec_id=palmtec_id,
        company_code_id=company_id,
        schedule_no=schedule_no,
        start_date=schedule_start_date,
    ).first()


def _resolve_trip(palmtec_id, company_id, trip_no, trip_start_date, schedule_no=None):
    if not trip_no or not trip_start_date:
        return None
    qs = TripData.objects.filter(
        palmtec_id=palmtec_id,
        company_code_id=company_id,
        trip_no=trip_no,
        start_date=trip_start_date,
    )
    if schedule_no is not None:
        qs = qs.filter(schedule_no=schedule_no)
    return qs.first()


def _resolve_employee(employee_code, company_id):
    if not employee_code:
        return None
    return Employee.objects.filter(
        employee_code=employee_code,
        company_id=company_id,
        is_deleted=False,
    ).first()


def _resolve_vehicle(bus_reg_num, company_id):
    if not bus_reg_num:
        return None
    return VehicleType.objects.filter(
        bus_reg_num=bus_reg_num,
        company_id=company_id,
        is_deleted=False,
    ).first()


def _get_or_create_ghost_schedule(palmtec_id, company, schedule_no, schedule_start_date,
                                   schedule_start_time, ghost_note):
    """
    Return the ScheduleData for this (palmtec_id, company, schedule_no, start_date).
    If it doesn't exist yet, create a ghost row (auto_opened=True) so downstream
    FKs have something to point at.  On concurrent-worker IntegrityError, re-fetch.
    """
    existing = _resolve_schedule(palmtec_id, company.id, schedule_no, schedule_start_date)
    if existing:
        return existing
    start_datetime = (
        timezone.make_aware(datetime.combine(schedule_start_date, schedule_start_time))
        if schedule_start_date and schedule_start_time else None
    )
    try:
        with transaction.atomic():
            return ScheduleData.objects.create(
                palmtec_id     = palmtec_id,
                schedule_no    = schedule_no,
                start_date     = schedule_start_date,
                start_time     = schedule_start_time,
                start_datetime = start_datetime,
                auto_opened    = True,
                ghost_note     = ghost_note,
                company_code   = company,
            )
    except IntegrityError:
        return _resolve_schedule(palmtec_id, company.id, schedule_no, schedule_start_date)


def _get_or_create_ghost_trip(palmtec_id, company, route, schedule_obj,
                               schedule_no, schedule_start_date, schedule_start_time,
                               trip_no, start_date, start_time,
                               bus_no, bus_obj, driver, driver_obj,
                               conductor, conductor_obj, ghost_note):
    """
    Return the TripData for this (palmtec_id, company, schedule_no, trip_no, start_date).
    If it doesn't exist yet, create a ghost row (auto_opened=True, is_closed=False)
    with whatever fields the calling event already knows.
    On concurrent-worker IntegrityError, re-fetch.
    """
    existing = _resolve_trip(palmtec_id, company.id, trip_no, start_date, schedule_no)
    if existing:
        return existing
    start_datetime = (
        timezone.make_aware(datetime.combine(start_date, start_time))
        if start_date and start_time else None
    )
    try:
        with transaction.atomic():
            return TripData.objects.create(
                palmtec_id          = palmtec_id,
                route_id            = route,
                schedule_id         = schedule_obj,
                schedule_no         = schedule_no,
                schedule_start_date = schedule_start_date,
                schedule_start_time = schedule_start_time,
                trip_no             = trip_no,
                start_date          = start_date,
                start_time          = start_time,
                start_datetime      = start_datetime,
                bus_no              = bus_no,
                bus_id              = bus_obj,
                driver              = driver,
                driver_id           = driver_obj,
                conductor           = conductor,
                conductor_id        = conductor_obj,
                is_closed           = False,
                auto_opened         = True,
                ghost_note          = ghost_note,
                company_code        = company,
            )
    except IntegrityError:
        return _resolve_trip(palmtec_id, company.id, trip_no, start_date, schedule_no)


def _validate_device(log, palmtec_id_raw, company):
    """
    Validate that the device sending this payload:
      1. Is registered (ETMDevice exists with this palmtec_id under this company)
      2. Is allocated (not stock/pool/inactive status)
      3. Is active (not deactivated)

    Returns (device, None) on success.
    Returns (None, failure_reason_string) and writes DeviceRejectionLog on failure.
    Caller must call _fail(log, reason) and return if device is None.
    """
    try:
        palmtec_id = int(palmtec_id_raw)
    except (TypeError, ValueError):
        return None, f'Invalid palmtec_id format: {palmtec_id_raw}'

    device = ETMDevice.objects.filter(
        palmtec_id=palmtec_id,
        company=company,
        allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
    ).first()

    if device is None:
        reason = f'Device lock: palmtec_id={palmtec_id} not registered to company {company.company_id}'
        DeviceRejectionLog.objects.create(
            palmtec_id_claimed=palmtec_id,
            company_id_claimed=company.company_id,
            raw_payload=log.raw_payload,
            source=log.source,
            rejection_reason=DeviceRejectionLog.RejectionReason.DEVICE_NOT_REGISTERED,
        )
        return None, reason

    if not device.is_active:
        reason = f'Device inactive: palmtec_id={palmtec_id} is deactivated'
        DeviceRejectionLog.objects.create(
            palmtec_id_claimed=palmtec_id,
            company_id_claimed=company.company_id,
            raw_payload=log.raw_payload,
            source=log.source,
            rejection_reason=DeviceRejectionLog.RejectionReason.DEVICE_INACTIVE,
        )
        return None, reason

    return device, None


# ─────────────────────────────────────────────────────────────────────────────
# Ticket / Transaction
# Protocol (new firmware with shd_opn_d/shd_opn_t):
#   [0]=fn  [1]=unique_code  [2]=palmtec_id  [3]=route_code
#   [4]=trip_no  [5]=ticket_no
#   [6]=schedule_start_date  [7]=schedule_start_time
#   [8]=ticket_date  [9]=ticket_time
#   [10]=from_stage  [11]=to_stage
#   [12]=full  [13]=half  [14]=st  [15]=phy  [16]=lugg
#   [17]=amount  [18]=lugg_amount  [19]=ticket_type  [20]=adjust_amount
#   [21]=pass_id  [22]=warrant  [23]=refund_status  [24]=refund_amount
#   [25]=ladies  [26]=senior
#   [27]=bus_no  [28]=schedule_no  [29]=driver  [30]=conductor
#   [31]=up_down_trip (char as %d, e.g. 85='U', 68='D')
#   [32]=trip_start_date  [33]=trip_start_time  [34]=battery
#   [35]=passenger_count
#   [36]=full_total  [37]=half_total  [38]=phy_total  [39]=ladies_total
#   [40]=senior_total  [41]=lugg_total  [42]=st_total
#   [43]=transaction_id  [44]=ticket_status  [45]=bqr_merchant_id
#   [46]=license_code(company)  [47]=upi_manual_check (1=manual, 0=auto)  [48]=checksum
# ─────────────────────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=3)
def process_transaction_data(self, log_id):
    try:
        with transaction.atomic():
            log = RawDataLog.objects.select_related('company_code').select_for_update().get(id=log_id)

            if log.status != RawDataLog.statusChoices.PENDING:
                return f"Log {log_id} already processed."

            company = log.company_code
            if not company:
                _fail(log, "Invalid Company Code")
                return

            parts = log.raw_payload.split("|")

            def _p(i, default=None):
                return parts[i] if len(parts) > i and parts[i].strip() else default

            # Device lock + inactive check
            device, lock_reason = _validate_device(log, _p(2), company)
            if device is None:
                _fail(log, lock_reason)
                return
            device.last_seen_at = timezone.now()
            device.save(update_fields=['last_seen_at'])

            required = {
                'palmtec_id':    _p(2),
                'route_code':    _p(3),
                'trip_no':       _p(4),
                'ticket_number': _p(5),
                'ticket_date':   _p(8),
                'ticket_time':   _p(9),
                'from_stage':    _p(10),
                'to_stage':      _p(11),
                'schedule_no':   _p(28),
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                _fail(log, f"Missing required fields: {', '.join(missing)}")
                return

            route = _get_route_for_palmtec(_p(3), company)
            if not route:
                _fail(log, f"Route not found: {_p(3)}")
                return

            full_count   = int(_p(12, 0))
            half_count   = int(_p(13, 0))
            st_count     = int(_p(14, 0))
            phy_count    = int(_p(15, 0))
            lugg_count   = int(_p(16, 0))
            ladies_count = int(_p(25, 0))
            senior_count = int(_p(26, 0))
            total_tickets = full_count + half_count + st_count + phy_count + lugg_count + ladies_count + senior_count

            raw_status = _p(44, '0')
            ticket_status = (
                TransactionData.PaymentMode.UPI if raw_status == '1'
                else TransactionData.PaymentMode.CASH
            )

            raw_dir_val = _p(31, '')
            try:
                raw_dir = chr(int(raw_dir_val)) if raw_dir_val else ''
            except (ValueError, TypeError):
                raw_dir = raw_dir_val
            up_down_trip = (
                Direction.UP   if raw_dir == 'U' else
                Direction.DOWN if raw_dir == 'D' else None
            )

            stages = RouteStage.objects.filter(route=route).order_by('sequence_no')
            from_raw = int(_p(10))
            to_raw   = int(_p(11))
            from_stage_obj = to_stage_obj = None
            if stages:
                if from_raw > 0:
                    try:
                        from_stage_obj = stages[from_raw - 1]
                    except IndexError:
                        pass
                if to_raw > 0:
                    try:
                        to_stage_obj = stages[to_raw - 1]
                    except IndexError:
                        pass

            if _p(6) == "0000-00-00":
                _fail(log, "Invalid schedule date: device sent 0000-00-00")
                return
            if _p(32) == "0000-00-00":
                _fail(log, "Invalid trip start date: device sent 0000-00-00")
                return

            trip_no             = int(_p(4))
            schedule_no         = int(_p(28))
            schedule_start_date = _decode_etm_date(_p(6))
            schedule_start_time = _decode_etm_time(_p(7))
            ticket_date         = _decode_etm_date(_p(8))
            ticket_time         = _decode_etm_time(_p(9))
            trip_start_date     = _decode_etm_date(_p(32))
            trip_start_time     = _decode_etm_time(_p(33))

            # ── Resolve or ghost-create schedule ─────────────────────────────
            # Ticket carries schedule_no + schedule_start_date/time — enough to
            # create a ghost ScheduleData if ShdOpn hasn't arrived yet.
            schedule_obj = _resolve_schedule(str(_p(2)), company.id, schedule_no, schedule_start_date)
            if not schedule_obj and schedule_no and schedule_start_date:
                schedule_obj = _get_or_create_ghost_schedule(
                    palmtec_id          = str(_p(2)),
                    company             = company,
                    schedule_no         = schedule_no,
                    schedule_start_date = schedule_start_date,
                    schedule_start_time = schedule_start_time,
                    ghost_note          = "Ticket received; ShdOpn missing",
                )

            # ── Resolve or ghost-create trip ──────────────────────────────────
            # Ticket carries trip_no + trip_start_date/time, bus, crew — enough
            # to create a ghost TripData if TrpOp hasn't arrived yet.
            trip_obj = _resolve_trip(str(_p(2)), company.id, trip_no, trip_start_date, schedule_no)
            if not trip_obj and trip_no and trip_start_date:
                trip_obj = _get_or_create_ghost_trip(
                    palmtec_id          = str(_p(2)),
                    company             = company,
                    route               = route,
                    schedule_obj        = schedule_obj,
                    schedule_no         = schedule_no,
                    schedule_start_date = schedule_start_date,
                    schedule_start_time = schedule_start_time,
                    trip_no             = trip_no,
                    start_date          = trip_start_date,
                    start_time          = trip_start_time,
                    bus_no              = _p(27),
                    bus_obj             = _resolve_vehicle(_p(27), company.id),
                    driver              = _p(29),
                    driver_obj          = _resolve_employee(_p(29), company.id),
                    conductor           = _p(30),
                    conductor_obj       = _resolve_employee(_p(30), company.id),
                    ghost_note          = "Ticket received; TrpOp missing",
                )

            # Keep schedule_obj in sync with whatever the trip resolved to
            if trip_obj and trip_obj.schedule_id:
                schedule_obj = trip_obj.schedule_id

            try:
                with transaction.atomic():
                    TransactionData.objects.create(
                        unique_code          = _p(1),
                        palmtec_id           = _p(2),
                        route_id             = route,
                        trip_id              = trip_obj,
                        schedule_id          = schedule_obj,
                        ticket_number        = _p(5),
                        ticket_date          = ticket_date,
                        ticket_time          = ticket_time,
                        from_stage           = from_raw,
                        from_stage_id        = from_stage_obj,
                        to_stage             = to_raw,
                        to_stage_id          = to_stage_obj,
                        full_count           = full_count,
                        half_count           = half_count,
                        st_count             = st_count,
                        phy_count            = phy_count,
                        lugg_count           = lugg_count,
                        ladies_count         = ladies_count,
                        senior_count         = senior_count,
                        total_tickets        = total_tickets,
                        ticket_amount        = Decimal(_p(17, '0')),
                        lugg_amount          = Decimal(_p(18, '0')),
                        ticket_type          = int(_p(19)) if _p(19) else None,
                        adjust_amount        = Decimal(_p(20, '0')),
                        pass_id              = _p(21),
                        warrant_amount       = Decimal(_p(22, '0')),
                        refund_status        = int(_p(23)) if _p(23) else None,
                        refund_amount        = Decimal(_p(24, '0')),
                        bus_no               = _p(27),
                        bus_id               = _resolve_vehicle(_p(27), company.id),
                        driver               = _p(29),
                        driver_id            = _resolve_employee(_p(29), company.id),
                        conductor            = _p(30),
                        conductor_id         = _resolve_employee(_p(30), company.id),
                        up_down_trip         = up_down_trip,
                        trip_start_date      = trip_start_date,
                        trip_start_time      = trip_start_time,
                        battery_percentage   = int(_p(34)) if _p(34) else None,
                        passenger_count      = int(_p(35)) if _p(35) else None,
                        full_total_amount    = Decimal(_p(36, '0')),
                        half_total_amount    = Decimal(_p(37, '0')),
                        phy_total_amount     = Decimal(_p(38, '0')),
                        ladies_total_amount  = Decimal(_p(39, '0')),
                        senior_total_amount  = Decimal(_p(40, '0')),
                        luggage_total_amount = Decimal(_p(41, '0')),
                        st_total_amount      = Decimal(_p(42, '0')),
                        transaction_id       = _p(43),
                        ticket_status        = ticket_status,
                        bqr_merchant_id      = _p(45),
                        manual_verified_upi  = (int(_p(47)) == 1) if _p(47) is not None else None,
                        company_code         = company,
                        raw_payload          = log.raw_payload,
                    )

            except IntegrityError as ie:
                log.status = RawDataLog.statusChoices.DUPLICATE
                log.error_message = str(ie)
                log.save()
                return

            log.status = RawDataLog.statusChoices.PROCESSED
            log.processed_at = timezone.now()
            log.save()

    except Exception as exc:
        RawDataLog.objects.filter(id=log_id).update(
            status=RawDataLog.statusChoices.FAILED,
            error_message=str(exc))
        raise self.retry(exc=exc, countdown=60)


# ─────────────────────────────────────────────────────────────────────────────
# Trip Open
# Protocol (new firmware — schedule_no added after license_code):
#   [0]=fn  [1]=unique_code  [2]=palmtec_id  [3]=license_code
#   [4]=schedule_no  [5]=route_code  [6]=up_down_trip  [7]=trip_no
#   [8]=bus_no  [9]=driver  [10]=conductor
#   [11]=schedule_start_date  [12]=schedule_start_time
#   [13]=trip_start_date  [14]=trip_start_time
#   [15]=battery
# ─────────────────────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=3)
def process_trip_open_data(self, log_id):
    try:
        with transaction.atomic():
            log = RawDataLog.objects.select_related('company_code').select_for_update().get(id=log_id)

            if log.status != RawDataLog.statusChoices.PENDING:
                return f"Log {log_id} already processed."

            company = log.company_code
            if not company:
                _fail(log, "Invalid Company Code")
                return

            parts = log.raw_payload.split("|")

            def _p(i, default=None):
                return parts[i] if len(parts) > i and parts[i].strip() else default

            # Device lock + inactive check
            device, lock_reason = _validate_device(log, _p(2), company)
            if device is None:
                _fail(log, lock_reason)
                return
            device.last_seen_at = timezone.now()
            device.save(update_fields=['last_seen_at'])

            required = {'route_code': _p(5), 'trip_no': _p(7)}
            missing = [k for k, v in required.items() if not v]
            if missing:
                _fail(log, f"Missing required fields: {', '.join(missing)}")
                return

            route = _get_route_for_palmtec(_p(5), company)
            if not route:
                _fail(log, f"Route not found: {_p(5)}")
                return

            raw_dir = _p(6, '')
            up_down_trip = (
                Direction.UP   if raw_dir == 'U' else
                Direction.DOWN if raw_dir == 'D' else None
            )

            schedule_no         = int(_p(4)) if _p(4) else None
            schedule_start_date = _parse_date(_p(11))
            schedule_start_time = _parse_time(_p(12))
            trip_no             = int(_p(7))
            start_date          = _parse_date(_p(13))
            start_time          = _parse_time(_p(14))
            start_datetime      = timezone.make_aware(datetime.combine(start_date, start_time)) if start_date and start_time else None
            battery             = int(_p(15)) if _p(15) else None

            # ── Resolve FKs ───────────────────────────────────────────────────
            driver_obj    = _resolve_employee(_p(9),  company.id)
            conductor_obj = _resolve_employee(_p(10), company.id)
            bus_obj       = _resolve_vehicle(_p(8),   company.id)

            # ── Resolve or ghost-create schedule ─────────────────────────────
            # TrpOp carries schedule_no + schedule_start_date/time — enough to
            # create a ghost ScheduleData if ShdOpn hasn't arrived yet.
            schedule_obj = _resolve_schedule(_p(2), company.id, schedule_no, schedule_start_date)
            if not schedule_obj and schedule_no and schedule_start_date:
                schedule_obj = _get_or_create_ghost_schedule(
                    palmtec_id          = _p(2),
                    company             = company,
                    schedule_no         = schedule_no,
                    schedule_start_date = schedule_start_date,
                    schedule_start_time = schedule_start_time,
                    ghost_note          = "TrpOp received; ShdOpn missing",
                )

            # ── TripData upsert ───────────────────────────────────────────────
            existing = _resolve_trip(_p(2), company.id, trip_no, start_date, schedule_no)
            if existing and existing.auto_opened:
                # Late open arriving after ghost close — fill in the open fields
                update_fields = ['open_unique_code', 'bus_no', 'bus_id', 'driver', 'driver_id',
                                 'conductor', 'conductor_id', 'up_down_trip', 'start_time',
                                 'start_datetime', 'battery_percentage', 'open_raw_payload',
                                 'auto_opened', 'updated_at']
                existing.open_unique_code   = _p(1)
                existing.bus_no             = _p(8)
                existing.bus_id             = bus_obj
                existing.driver             = _p(9)
                existing.driver_id          = driver_obj
                existing.conductor          = _p(10)
                existing.conductor_id       = conductor_obj
                existing.up_down_trip       = up_down_trip
                existing.start_time         = start_time
                existing.start_datetime     = start_datetime
                existing.battery_percentage = battery
                existing.open_raw_payload   = log.raw_payload
                existing.auto_opened        = False
                if existing.ghost_note:
                    existing.ghost_note = None
                    update_fields.append('ghost_note')
                if not existing.schedule_id and schedule_obj:
                    existing.schedule_id         = schedule_obj
                    existing.schedule_no         = schedule_no
                    existing.schedule_start_date = schedule_start_date
                    existing.schedule_start_time = schedule_start_time
                    update_fields += ['schedule_id', 'schedule_no', 'schedule_start_date', 'schedule_start_time']
                existing.save(update_fields=update_fields)
            elif existing and not existing.auto_opened:
                # Machine restart: same device/trip/date, different unique_code.
                # Original open fields (start_time, battery, crew, open_raw_payload)
                # must not change — existing tickets reference them. Record the
                # re-open in ghost_note only; full payload preserved in raw_data_log.
                note = (
                    f"re-opened: machine restart | reopen_code={_p(1)}"
                    f" | at={timezone.now().isoformat()}"
                )
                existing.ghost_note = (
                    existing.ghost_note + " | " + note
                    if existing.ghost_note else note
                )
                existing.save(update_fields=['ghost_note', 'updated_at'])
            else:
                try:
                    with transaction.atomic():
                        TripData.objects.create(
                            open_unique_code    = _p(1),
                            palmtec_id          = _p(2),
                            route_id            = route,
                            schedule_id         = schedule_obj,
                            schedule_no         = schedule_no,
                            schedule_start_date = schedule_start_date,
                            schedule_start_time = schedule_start_time,
                            trip_no             = trip_no,
                            up_down_trip        = up_down_trip,
                            bus_no              = _p(8),
                            bus_id              = bus_obj,
                            driver              = _p(9),
                            driver_id           = driver_obj,
                            conductor           = _p(10),
                            conductor_id        = conductor_obj,
                            start_date          = start_date,
                            start_time          = start_time,
                            start_datetime      = start_datetime,
                            battery_percentage  = battery,
                            is_closed           = False,
                            open_raw_payload    = log.raw_payload,
                            company_code        = company,
                        )
                except IntegrityError as ie:
                    log.status = RawDataLog.statusChoices.DUPLICATE
                    log.error_message = str(ie)
                    log.save()
                    return

            log.status = RawDataLog.statusChoices.PROCESSED
            log.processed_at = timezone.now()
            log.save()

    except Exception as exc:
        RawDataLog.objects.filter(id=log_id).update(
            status=RawDataLog.statusChoices.FAILED,
            error_message=str(exc))
        raise self.retry(exc=exc, countdown=60)


# ─────────────────────────────────────────────────────────────────────────────
# Trip Close
# Protocol (current firmware with shd_opn_d/shd_opn_t):
#   [0]=fn  [1]=unique_code  [2]=palmtec_id  [3]=license_code
#   [4]=route_code  [5]=schedule_no  [6]=trip_no
#   [7]=schedule_start_date  [8]=schedule_start_time
#   [9]=trip_start_date  [10]=trip_start_time
#   [11]=trip_end_date  [12]=trip_end_time
#   [13]=driver  [14]=conductor  [15]=total_km
#   [16]=start_ticket_no  [17]=end_ticket_no
#   [18]=full  [19]=half  [20]=st  [21]=lugg  [22]=phy  [23]=pass
#   [24]=ladies  [25]=senior
#   [26]=full_coll  [27]=half_coll  [28]=st_coll  [29]=lugg_coll
#   [30]=phy_coll  [31]=ladies_coll  [32]=senior_coll
#   [33]=adjust_coll  [34]=expense_amount  [35]=total_coll
#   [36]=upi_count  [37]=upi_amount  [38]=up_down_trip  [39]=total_passengers
# ─────────────────────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=3)
def process_trip_close_data(self, log_id):
    try:
        with transaction.atomic():
            log = RawDataLog.objects.select_related('company_code').select_for_update().get(id=log_id)

            if log.status != RawDataLog.statusChoices.PENDING:
                return f"Log {log_id} already processed."

            company = log.company_code
            if not company:
                _fail(log, "Invalid Company Code")
                return

            parts = log.raw_payload.split("|")

            def _p(i, default=None):
                return parts[i] if len(parts) > i and parts[i].strip() else default

            # Device lock + inactive check
            device, lock_reason = _validate_device(log, _p(2), company)
            if device is None:
                _fail(log, lock_reason)
                return
            device.last_seen_at = timezone.now()
            device.save(update_fields=['last_seen_at'])

            required = {'route_code': _p(4), 'schedule_no': _p(5), 'trip_no': _p(6)}
            missing = [k for k, v in required.items() if not v]
            if missing:
                _fail(log, f"Missing required fields: {', '.join(missing)}")
                return

            route = _get_route_for_palmtec(_p(4), company)
            if not route:
                _fail(log, f"Route not found: {_p(4)}")
                return

            schedule_no         = int(_p(5))
            trip_no             = int(_p(6))
            schedule_start_date = _parse_date(_p(7))
            schedule_start_time = _parse_time(_p(8))
            start_date          = _parse_date(_p(9))
            start_time          = _parse_time(_p(10))
            end_date            = _parse_date(_p(11))
            end_time            = _parse_time(_p(12))
            start_datetime      = timezone.make_aware(datetime.combine(start_date, start_time)) if start_date and start_time else None
            end_datetime        = timezone.make_aware(datetime.combine(end_date, end_time)) if end_date and end_time else None

            full_count     = int(_p(18, 0))
            half_count     = int(_p(19, 0))
            st1_count      = int(_p(20, 0))
            luggage_count  = int(_p(21, 0))
            physical_count = int(_p(22, 0))
            pass_count     = int(_p(23, 0))
            ladies_count   = int(_p(24, 0))
            senior_count   = int(_p(25, 0))
            upi_count      = int(_p(36, 0))

            total_tickets      = (full_count + half_count + st1_count + luggage_count +
                                  physical_count + pass_count + ladies_count + senior_count)
            total_cash_tickets = max(0, total_tickets - upi_count)

            total_coll = Decimal(_p(35, '0'))
            upi_amount = Decimal(_p(37, '0'))
            total_pass = int(_p(39, 0))

            raw_dir = _p(38, '')
            up_down_trip = (
                Direction.UP   if raw_dir == 'U' else
                Direction.DOWN if raw_dir == 'D' else None
            )

            # ── Resolve FKs ───────────────────────────────────────────────────
            schedule_obj  = _resolve_schedule(_p(2), company.id, schedule_no, schedule_start_date)
            driver_obj    = _resolve_employee(_p(13), company.id)
            conductor_obj = _resolve_employee(_p(14), company.id)

            close_fields = dict(
                close_unique_code   = _p(1),
                schedule_id         = schedule_obj,
                schedule_no         = schedule_no,
                schedule_start_date = schedule_start_date,
                schedule_start_time = schedule_start_time,
                end_date            = end_date,
                end_time            = end_time,
                end_datetime        = end_datetime,
                driver              = _p(13),
                conductor           = _p(14),
                total_km            = Decimal(_p(15, '0')),
                start_ticket_no     = int(_p(16, 0)),
                end_ticket_no       = int(_p(17, 0)),
                full_count          = full_count,
                half_count          = half_count,
                st_count            = st1_count,
                luggage_count       = luggage_count,
                physical_count      = physical_count,
                pass_count          = pass_count,
                ladies_count        = ladies_count,
                senior_count        = senior_count,
                total_tickets       = total_tickets,
                total_cash_tickets  = total_cash_tickets,
                total_passengers    = total_pass,
                full_collection     = Decimal(_p(26, '0')),
                half_collection     = Decimal(_p(27, '0')),
                st_collection       = Decimal(_p(28, '0')),
                luggage_collection  = Decimal(_p(29, '0')),
                physical_collection = Decimal(_p(30, '0')),
                ladies_collection   = Decimal(_p(31, '0')),
                senior_collection   = Decimal(_p(32, '0')),
                adjust_collection   = Decimal(_p(33, '0')),
                expense_amount      = Decimal(_p(34, '0')),
                total_collection    = total_coll,
                upi_ticket_count    = upi_count,
                upi_ticket_amount   = upi_amount,
                up_down_trip        = up_down_trip,
                driver_id           = driver_obj,
                conductor_id        = conductor_obj,
                is_closed           = True,
                auto_opened         = False,
                ghost_note          = None,
                close_raw_payload   = log.raw_payload,
            )

            # ── TripData upsert ───────────────────────────────────────────────
            existing = _resolve_trip(_p(2), company.id, trip_no, start_date, schedule_no)
            if existing:
                for k, v in close_fields.items():
                    setattr(existing, k, v)
                existing.save()
            else:
                try:
                    with transaction.atomic():
                        TripData.objects.create(
                            palmtec_id          = _p(2),
                            route_id            = route,
                            trip_no             = trip_no,
                            start_date          = start_date,
                            start_time          = start_time,
                            start_datetime      = start_datetime,
                            auto_opened         = True,
                            ghost_note          = "TrpCl received; TrpOp missing",
                            company_code        = company,
                            **close_fields,
                        )
                except IntegrityError as ie:
                    log.status = RawDataLog.statusChoices.DUPLICATE
                    log.error_message = str(ie)
                    log.save()
                    return

            log.status = RawDataLog.statusChoices.PROCESSED
            log.processed_at = timezone.now()
            log.save()

    except Exception as exc:
        RawDataLog.objects.filter(id=log_id).update(
            status=RawDataLog.statusChoices.FAILED,
            error_message=str(exc))
        raise self.retry(exc=exc, countdown=60)


# ─────────────────────────────────────────────────────────────────────────────
# Schedule Open
# Protocol (unchanged):
#   [0]=fn  [1]=unique_code  [2]=palmtec_id  [3]=license_code
#   [4]=schedule_no
#   [5]=start_date  [6]=start_time
#   [7]=driver  [8]=conductor  [9]=bus_no
#   [10]=battery
# ─────────────────────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=3)
def process_schedule_open_data(self, log_id):
    try:
        with transaction.atomic():
            log = RawDataLog.objects.select_related('company_code').select_for_update().get(id=log_id)

            if log.status != RawDataLog.statusChoices.PENDING:
                return f"Log {log_id} already processed."

            company = log.company_code
            if not company:
                _fail(log, "Invalid Company Code")
                return

            parts = log.raw_payload.split("|")

            def _p(i, default=None):
                return parts[i] if len(parts) > i and parts[i].strip() else default

            # Device lock + inactive check
            device, lock_reason = _validate_device(log, _p(2), company)
            if device is None:
                _fail(log, lock_reason)
                return
            device.last_seen_at = timezone.now()
            device.save(update_fields=['last_seen_at'])

            if not _p(4):
                _fail(log, "Missing required fields: schedule_no")
                return

            schedule_no    = int(_p(4))
            start_date     = _parse_date(_p(5))
            start_time     = _parse_time(_p(6))
            start_datetime = timezone.make_aware(datetime.combine(start_date, start_time)) if start_date and start_time else None
            battery        = int(_p(10)) if _p(10) else None

            # ── Resolve FKs ───────────────────────────────────────────────────
            driver_obj    = _resolve_employee(_p(7), company.id)
            conductor_obj = _resolve_employee(_p(8), company.id)
            bus_obj       = _resolve_vehicle(_p(9),  company.id)

            # ── ScheduleData upsert ───────────────────────────────────────────
            existing = ScheduleData.objects.filter(
                palmtec_id=_p(2),
                company_code=company,
                schedule_no=schedule_no,
                start_date=start_date,
            ).first()

            if existing:
                if existing.auto_opened:
                    # Ghost schedule (ShdCls arrived before ShdOpn) — fill in the open fields
                    existing.open_unique_code = _p(1)
                    existing.driver           = _p(7)
                    existing.driver_id        = driver_obj
                    existing.conductor        = _p(8)
                    existing.conductor_id     = conductor_obj
                    existing.bus_no           = _p(9)
                    existing.bus_id           = bus_obj
                    existing.start_time       = start_time
                    existing.start_datetime   = start_datetime
                    existing.battery_open     = battery
                    existing.open_raw_payload = log.raw_payload
                    existing.ghost_note       = None
                    existing.auto_opened      = False
                    existing.save(update_fields=[
                        'open_unique_code', 'driver', 'driver_id', 'conductor', 'conductor_id',
                        'bus_no', 'bus_id', 'start_time', 'start_datetime', 'battery_open',
                        'open_raw_payload', 'ghost_note', 'auto_opened', 'updated_at',
                    ])
                else:
                    # Machine restart: same device/schedule/date, different unique_code.
                    # Original open fields (start_time, battery, crew, open_raw_payload)
                    # must not change — existing tickets reference them. Record the
                    # re-open in ghost_note only; full payload preserved in raw_data_log.
                    note = (
                        f"re-opened: machine restart | reopen_code={_p(1)}"
                        f" | at={timezone.now().isoformat()}"
                    )
                    existing.ghost_note = (
                        existing.ghost_note + " | " + note
                        if existing.ghost_note else note
                    )
                    existing.save(update_fields=['ghost_note', 'updated_at'])
            else:
                try:
                    with transaction.atomic():
                        ScheduleData.objects.create(
                            open_unique_code  = _p(1),
                            palmtec_id        = _p(2),
                            schedule_no       = schedule_no,
                            driver            = _p(7),
                            driver_id         = driver_obj,
                            conductor         = _p(8),
                            conductor_id      = conductor_obj,
                            bus_no            = _p(9),
                            bus_id            = bus_obj,
                            start_date        = start_date,
                            start_time        = start_time,
                            start_datetime    = start_datetime,
                            battery_open      = battery,
                            is_closed         = False,
                            open_raw_payload  = log.raw_payload,
                            company_code      = company,
                        )
                except IntegrityError as ie:
                    log.status = RawDataLog.statusChoices.DUPLICATE
                    log.error_message = str(ie)
                    log.save()
                    return

            log.status = RawDataLog.statusChoices.PROCESSED
            log.processed_at = timezone.now()
            log.save()

    except Exception as exc:
        RawDataLog.objects.filter(id=log_id).update(
            status=RawDataLog.statusChoices.FAILED,
            error_message=str(exc))
        raise self.retry(exc=exc, countdown=60)


# ─────────────────────────────────────────────────────────────────────────────
# Schedule Close
# Protocol (current firmware with shd_opn_d/shd_opn_t):
#   [0]=fn  [1]=unique_code  [2]=palmtec_id  [3]=license_code
#   [4]=route_code  [5]=schedule_no
#   [6]=schedule_start_date (shd_opn_d)  [7]=schedule_start_time (shd_opn_t)
#   [8]=end_date  [9]=end_time
#   [10]=driver  [11]=conductor  [12]=bus_no
#   [13]=total_tickets  [14]=full  [15]=half  [16]=phy  [17]=ladies
#   [18]=senior  [19]=lugg  [20]=st  [21]=adjust
#   [22]=total_coll  [23]=full_coll  [24]=half_coll  [25]=phy_coll
#   [26]=ladies_coll  [27]=senior_coll  [28]=st_coll  [29]=adjust_coll  [30]=lugg_coll
#   [31]=upi_total  [32]=upi_full  [33]=upi_half  [34]=upi_phy
#   [35]=upi_ladies  [36]=upi_senior  [37]=upi_st  [38]=upi_lugg
#   [39]=upi_full_cnt  [40]=upi_half_cnt  [41]=upi_phy_cnt  [42]=upi_ladies_cnt
#   [43]=upi_senior_cnt  [44]=upi_lugg_cnt  [45]=upi_st_cnt
#   [46]=battery
# ─────────────────────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=3)
def process_schedule_close_data(self, log_id):
    try:
        with transaction.atomic():
            log = RawDataLog.objects.select_related('company_code').select_for_update().get(id=log_id)

            if log.status != RawDataLog.statusChoices.PENDING:
                return f"Log {log_id} already processed."

            company = log.company_code
            if not company:
                _fail(log, "Invalid Company Code")
                return

            parts = log.raw_payload.split("|")

            def _p(i, default=None):
                return parts[i] if len(parts) > i and parts[i].strip() else default

            # Device lock + inactive check
            device, lock_reason = _validate_device(log, _p(2), company)
            if device is None:
                _fail(log, lock_reason)
                return
            device.last_seen_at = timezone.now()
            device.save(update_fields=['last_seen_at'])

            required = {
                'route_code':  _p(4),
                'schedule_no': _p(5),
                'end_date':    _p(8),
                'end_time':    _p(9),
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                _fail(log, f"Missing required fields: {', '.join(missing)}")
                return

            route = _get_route_for_palmtec(_p(4), company)
            if not route:
                _fail(log, f"Route not found: {_p(4)}")
                return

            schedule_no         = int(_p(5))
            schedule_start_date = _parse_date(_p(6))
            schedule_start_time = _parse_time(_p(7))
            end_date            = _parse_date(_p(8))
            end_time            = _parse_time(_p(9))
            end_datetime        = timezone.make_aware(datetime.combine(end_date, end_time)) if end_date and end_time else None

            # ── Resolve FKs ───────────────────────────────────────────────────
            driver_obj    = _resolve_employee(_p(10), company.id)
            conductor_obj = _resolve_employee(_p(11), company.id)
            bus_obj       = _resolve_vehicle(_p(12),  company.id)

            # ── ScheduleData upsert ───────────────────────────────────────────
            close_fields_new = dict(
                close_unique_code       = _p(1),
                route_id                = route,
                driver                  = _p(10),
                driver_id               = driver_obj,
                conductor               = _p(11),
                conductor_id            = conductor_obj,
                bus_no                  = _p(12),
                bus_id                  = bus_obj,
                end_date                = end_date,
                end_time                = end_time,
                end_datetime            = end_datetime,
                battery_close           = int(_p(46)) if _p(46) else None,
                total_tickets           = int(_p(13, 0)),
                full_count              = int(_p(14, 0)),
                half_count              = int(_p(15, 0)),
                physical_count          = int(_p(16, 0)),
                ladies_count            = int(_p(17, 0)),
                senior_count            = int(_p(18, 0)),
                luggage_count           = int(_p(19, 0)),
                st_count                = int(_p(20, 0)),
                adjust_count            = int(_p(21, 0)),
                total_collection        = Decimal(_p(22, '0')),
                full_collection         = Decimal(_p(23, '0')),
                half_collection         = Decimal(_p(24, '0')),
                physical_collection     = Decimal(_p(25, '0')),
                ladies_collection       = Decimal(_p(26, '0')),
                senior_collection       = Decimal(_p(27, '0')),
                st_collection           = Decimal(_p(28, '0')),
                adjust_collection       = Decimal(_p(29, '0')),
                luggage_collection      = Decimal(_p(30, '0')),
                upi_total_collection    = Decimal(_p(31, '0')),
                upi_full_collection     = Decimal(_p(32, '0')),
                upi_half_collection     = Decimal(_p(33, '0')),
                upi_physical_collection = Decimal(_p(34, '0')),
                upi_ladies_collection   = Decimal(_p(35, '0')),
                upi_senior_collection   = Decimal(_p(36, '0')),
                upi_st_collection       = Decimal(_p(37, '0')),
                upi_luggage_collection  = Decimal(_p(38, '0')),
                upi_full_count          = int(_p(39, 0)),
                upi_half_count          = int(_p(40, 0)),
                upi_physical_count      = int(_p(41, 0)),
                upi_ladies_count        = int(_p(42, 0)),
                upi_senior_count        = int(_p(43, 0)),
                upi_luggage_count       = int(_p(44, 0)),
                upi_st_count            = int(_p(45, 0)),
                is_closed               = True,
                auto_opened             = False,
                ghost_note              = None,
                close_raw_payload       = log.raw_payload,
            )

            existing = ScheduleData.objects.filter(
                palmtec_id=_p(2),
                company_code=company,
                schedule_no=schedule_no,
                start_date=schedule_start_date,
            ).first()

            if existing:
                for k, v in close_fields_new.items():
                    setattr(existing, k, v)
                existing.save()
            else:
                # Ghost: ShdCls arrived without ShdOpn
                try:
                    with transaction.atomic():
                        ScheduleData.objects.create(
                            palmtec_id  = _p(2),
                            schedule_no = schedule_no,
                            start_date  = schedule_start_date,
                            start_time  = schedule_start_time,
                            start_datetime = (
                                timezone.make_aware(datetime.combine(schedule_start_date, schedule_start_time))
                                if schedule_start_date and schedule_start_time else None
                            ),
                            auto_opened  = True,
                            ghost_note   = "ShdCls received; ShdOpn missing",
                            company_code = company,
                            **close_fields_new,
                        )
                except IntegrityError as ie:
                    log.status = RawDataLog.statusChoices.DUPLICATE
                    log.error_message = str(ie)
                    log.save()
                    return

            log.status = RawDataLog.statusChoices.PROCESSED
            log.processed_at = timezone.now()
            log.save()

    except Exception as exc:
        RawDataLog.objects.filter(id=log_id).update(
            status=RawDataLog.statusChoices.FAILED,
            error_message=str(exc))
        raise self.retry(exc=exc, countdown=60)


# ─────────────────────────────────────────────────────────────────────────────
# Trip Close Summary
# Protocol: identical to TrpCl (fn=TrpClSum). Firmware resend when TrpCl
# was not acknowledged. Idempotent: if trip already closed → DUPLICATE.
# ─────────────────────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=3)
def process_trip_close_summary_data(self, log_id):
    try:
        with transaction.atomic():
            log = RawDataLog.objects.select_related('company_code').select_for_update().get(id=log_id)

            if log.status != RawDataLog.statusChoices.PENDING:
                return f"Log {log_id} already processed."

            company = log.company_code
            if not company:
                _fail(log, "Invalid Company Code")
                return

            parts = log.raw_payload.split("|")

            def _p(i, default=None):
                return parts[i] if len(parts) > i and parts[i].strip() else default

            required = {'route_code': _p(4), 'schedule_no': _p(5), 'trip_no': _p(6)}
            missing = [k for k, v in required.items() if not v]
            if missing:
                _fail(log, f"Missing required fields: {', '.join(missing)}")
                return

            route = _get_route_for_palmtec(_p(4), company)
            if not route:
                _fail(log, f"Route not found: {_p(4)}")
                return

            schedule_no         = int(_p(5))
            trip_no             = int(_p(6))
            schedule_start_date = _parse_date(_p(7))
            schedule_start_time = _parse_time(_p(8))
            start_date          = _parse_date(_p(9))
            start_time          = _parse_time(_p(10))
            end_date            = _parse_date(_p(11))
            end_time            = _parse_time(_p(12))
            start_datetime      = timezone.make_aware(datetime.combine(start_date, start_time)) if start_date and start_time else None
            end_datetime        = timezone.make_aware(datetime.combine(end_date, end_time)) if end_date and end_time else None

            full_count     = int(_p(18, 0))
            half_count     = int(_p(19, 0))
            st1_count      = int(_p(20, 0))
            luggage_count  = int(_p(21, 0))
            physical_count = int(_p(22, 0))
            pass_count     = int(_p(23, 0))
            ladies_count   = int(_p(24, 0))
            senior_count   = int(_p(25, 0))
            upi_count      = int(_p(36, 0))

            total_tickets      = (full_count + half_count + st1_count + luggage_count +
                                  physical_count + pass_count + ladies_count + senior_count)
            total_cash_tickets = max(0, total_tickets - upi_count)

            total_coll  = Decimal(_p(35, '0'))
            upi_amount  = Decimal(_p(37, '0'))
            total_pass  = int(_p(39, 0))

            raw_dir = _p(38, '')
            up_down_trip = (
                Direction.UP   if raw_dir == 'U' else
                Direction.DOWN if raw_dir == 'D' else None
            )

            # ── Idempotency guard ─────────────────────────────────────────────
            existing = _resolve_trip(_p(2), company.id, trip_no, start_date, schedule_no)
            if existing and existing.is_closed:
                log.status = RawDataLog.statusChoices.DUPLICATE
                log.error_message = "TrpClSum: trip already closed by TrpCl"
                log.save()
                return

            schedule_obj  = _resolve_schedule(_p(2), company.id, schedule_no, schedule_start_date)
            driver_obj    = _resolve_employee(_p(13), company.id)
            conductor_obj = _resolve_employee(_p(14), company.id)

            close_fields = dict(
                close_unique_code   = _p(1),
                schedule_id         = schedule_obj,
                schedule_no         = schedule_no,
                schedule_start_date = schedule_start_date,
                schedule_start_time = schedule_start_time,
                end_date            = end_date,
                end_time            = end_time,
                end_datetime        = end_datetime,
                driver              = _p(13),
                driver_id           = driver_obj,
                conductor           = _p(14),
                conductor_id        = conductor_obj,
                total_km            = Decimal(_p(15, '0')),
                start_ticket_no     = int(_p(16, 0)),
                end_ticket_no       = int(_p(17, 0)),
                full_count          = full_count,
                half_count          = half_count,
                st_count            = st1_count,
                luggage_count       = luggage_count,
                physical_count      = physical_count,
                pass_count          = pass_count,
                ladies_count        = ladies_count,
                senior_count        = senior_count,
                total_tickets       = total_tickets,
                total_cash_tickets  = total_cash_tickets,
                total_passengers    = total_pass,
                full_collection     = Decimal(_p(26, '0')),
                half_collection     = Decimal(_p(27, '0')),
                st_collection       = Decimal(_p(28, '0')),
                luggage_collection  = Decimal(_p(29, '0')),
                physical_collection = Decimal(_p(30, '0')),
                ladies_collection   = Decimal(_p(31, '0')),
                senior_collection   = Decimal(_p(32, '0')),
                adjust_collection   = Decimal(_p(33, '0')),
                expense_amount      = Decimal(_p(34, '0')),
                total_collection    = total_coll,
                upi_ticket_count    = upi_count,
                upi_ticket_amount   = upi_amount,
                up_down_trip        = up_down_trip,
                is_closed           = True,
                auto_opened         = False,
                ghost_note          = None,
                close_raw_payload   = log.raw_payload,
            )

            if existing:
                for k, v in close_fields.items():
                    setattr(existing, k, v)
                existing.save()
            else:
                try:
                    with transaction.atomic():
                        TripData.objects.create(
                            palmtec_id   = _p(2),
                            route_id     = route,
                            trip_no      = trip_no,
                            start_date   = start_date,
                            start_time   = start_time,
                            start_datetime = start_datetime,
                            auto_opened  = True,
                            ghost_note   = "TrpClSum received; TrpOp missing",
                            company_code = company,
                            **close_fields,
                        )
                except IntegrityError as ie:
                    log.status = RawDataLog.statusChoices.DUPLICATE
                    log.error_message = str(ie)
                    log.save()
                    return

            log.status = RawDataLog.statusChoices.PROCESSED
            log.processed_at = timezone.now()
            log.save()

    except Exception as exc:
        RawDataLog.objects.filter(id=log_id).update(
            status=RawDataLog.statusChoices.FAILED,
            error_message=str(exc))
        raise self.retry(exc=exc, countdown=60)


# ─────────────────────────────────────────────────────────────────────────────
# Schedule Close Summary
# Protocol: identical to ShdCls (fn=ShdClsSum). Firmware resend when ShdCls
# was not acknowledged. Idempotent: if schedule already closed → DUPLICATE.
# ─────────────────────────────────────────────────────────────────────────────
@shared_task(bind=True, max_retries=3)
def process_schedule_close_summary_data(self, log_id):
    try:
        with transaction.atomic():
            log = RawDataLog.objects.select_related('company_code').select_for_update().get(id=log_id)

            if log.status != RawDataLog.statusChoices.PENDING:
                return f"Log {log_id} already processed."

            company = log.company_code
            if not company:
                _fail(log, "Invalid Company Code")
                return

            parts = log.raw_payload.split("|")

            def _p(i, default=None):
                return parts[i] if len(parts) > i and parts[i].strip() else default

            required = {
                'route_code':  _p(4),
                'schedule_no': _p(5),
                'end_date':    _p(8),
                'end_time':    _p(9),
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                _fail(log, f"Missing required fields: {', '.join(missing)}")
                return

            route = _get_route_for_palmtec(_p(4), company)
            if not route:
                _fail(log, f"Route not found: {_p(4)}")
                return

            schedule_no         = int(_p(5))
            schedule_start_date = _parse_date(_p(6))
            schedule_start_time = _parse_time(_p(7))
            end_date            = _parse_date(_p(8))
            end_time            = _parse_time(_p(9))
            end_datetime        = timezone.make_aware(datetime.combine(end_date, end_time)) if end_date and end_time else None

            # ── Idempotency guard ─────────────────────────────────────────────
            existing = ScheduleData.objects.filter(
                palmtec_id=_p(2),
                company_code=company,
                schedule_no=schedule_no,
                start_date=schedule_start_date,
            ).first()
            if existing and existing.is_closed:
                log.status = RawDataLog.statusChoices.DUPLICATE
                log.error_message = "ShdClsSum: schedule already closed by ShdCls"
                log.save()
                return

            driver_obj    = _resolve_employee(_p(10), company.id)
            conductor_obj = _resolve_employee(_p(11), company.id)
            bus_obj       = _resolve_vehicle(_p(12),  company.id)

            close_fields_new = dict(
                close_unique_code       = _p(1),
                route_id                = route,
                driver                  = _p(10),
                driver_id               = driver_obj,
                conductor               = _p(11),
                conductor_id            = conductor_obj,
                bus_no                  = _p(12),
                bus_id                  = bus_obj,
                end_date                = end_date,
                end_time                = end_time,
                end_datetime            = end_datetime,
                battery_close           = int(_p(46)) if _p(46) else None,
                total_tickets           = int(_p(13, 0)),
                full_count              = int(_p(14, 0)),
                half_count              = int(_p(15, 0)),
                physical_count          = int(_p(16, 0)),
                ladies_count            = int(_p(17, 0)),
                senior_count            = int(_p(18, 0)),
                luggage_count           = int(_p(19, 0)),
                st_count                = int(_p(20, 0)),
                adjust_count            = int(_p(21, 0)),
                total_collection        = Decimal(_p(22, '0')),
                full_collection         = Decimal(_p(23, '0')),
                half_collection         = Decimal(_p(24, '0')),
                physical_collection     = Decimal(_p(25, '0')),
                ladies_collection       = Decimal(_p(26, '0')),
                senior_collection       = Decimal(_p(27, '0')),
                st_collection           = Decimal(_p(28, '0')),
                adjust_collection       = Decimal(_p(29, '0')),
                luggage_collection      = Decimal(_p(30, '0')),
                upi_total_collection    = Decimal(_p(31, '0')),
                upi_full_collection     = Decimal(_p(32, '0')),
                upi_half_collection     = Decimal(_p(33, '0')),
                upi_physical_collection = Decimal(_p(34, '0')),
                upi_ladies_collection   = Decimal(_p(35, '0')),
                upi_senior_collection   = Decimal(_p(36, '0')),
                upi_st_collection       = Decimal(_p(37, '0')),
                upi_luggage_collection  = Decimal(_p(38, '0')),
                upi_full_count          = int(_p(39, 0)),
                upi_half_count          = int(_p(40, 0)),
                upi_physical_count      = int(_p(41, 0)),
                upi_ladies_count        = int(_p(42, 0)),
                upi_senior_count        = int(_p(43, 0)),
                upi_luggage_count       = int(_p(44, 0)),
                upi_st_count            = int(_p(45, 0)),
                is_closed               = True,
                auto_opened             = False,
                ghost_note              = None,
                close_raw_payload       = log.raw_payload,
            )

            if existing:
                for k, v in close_fields_new.items():
                    setattr(existing, k, v)
                existing.save()
            else:
                try:
                    with transaction.atomic():
                        ScheduleData.objects.create(
                            palmtec_id  = _p(2),
                            schedule_no = schedule_no,
                            start_date  = schedule_start_date,
                            start_time  = schedule_start_time,
                            start_datetime = (
                                timezone.make_aware(datetime.combine(schedule_start_date, schedule_start_time))
                                if schedule_start_date and schedule_start_time else None
                            ),
                            auto_opened  = True,
                            ghost_note   = "ShdClsSum received; ShdOpn missing",
                            company_code = company,
                            **close_fields_new,
                        )
                except IntegrityError as ie:
                    log.status = RawDataLog.statusChoices.DUPLICATE
                    log.error_message = str(ie)
                    log.save()
                    return

            log.status = RawDataLog.statusChoices.PROCESSED
            log.processed_at = timezone.now()
            log.save()

    except Exception as exc:
        RawDataLog.objects.filter(id=log_id).update(
            status=RawDataLog.statusChoices.FAILED,
            error_message=str(exc))
        raise self.retry(exc=exc, countdown=60)


@shared_task
def scan_pending_raw_logs():
    now = timezone.now()
    stale_cutoff   = now - timedelta(hours=12)
    requeue_cutoff = now - timedelta(seconds=60)

    RawDataLog.objects.filter(
        status=RawDataLog.statusChoices.PENDING,
        received_at__lt=stale_cutoff,
    ).update(
        status=RawDataLog.statusChoices.FAILED,
        error_message="Payload unprocessed for 12 hours",
    )

    requeue_records = RawDataLog.objects.filter(
        status=RawDataLog.statusChoices.PENDING,
        received_at__range=(stale_cutoff, requeue_cutoff),
    ).order_by('received_at')[:200]

    TASK_MAP = {
        RawDataLog.typeChoices.TRANSACTION:            process_transaction_data,
        RawDataLog.typeChoices.TRIP_OPEN:              process_trip_open_data,
        RawDataLog.typeChoices.TRIP_CLOSE:             process_trip_close_data,
        RawDataLog.typeChoices.TRIP_CLOSE_SUMMARY:     process_trip_close_summary_data,
        RawDataLog.typeChoices.SCHEDULE_OPEN:          process_schedule_open_data,
        RawDataLog.typeChoices.SCHEDULE_CLOSE:         process_schedule_close_data,
        RawDataLog.typeChoices.SCHEDULE_CLOSE_SUMMARY: process_schedule_close_summary_data,
    }

    count = 0
    for record in requeue_records:
        task = TASK_MAP.get(record.source)
        if task:
            task.delay(record.id)
            count += 1

    return count


@shared_task
def cleanup_processed_raw_logs():
    cutoff = timezone.now() - timedelta(days=30)
    deleted_count, _ = RawDataLog.objects.filter(
        status=RawDataLog.statusChoices.PROCESSED,
        processed_at__lt=cutoff,
    ).delete()
    return deleted_count


import logging as _logging
_sweep_logger = _logging.getLogger(__name__)

@shared_task
def sweep_stale_sessions():
    """
    Reconcile DB with Redis. Any UserSession with is_active=True whose Redis
    cache key no longer exists has expired naturally (TTL elapsed) or was
    force-logged out. Mark those sessions inactive in the DB so the admin
    session listing stays accurate.
    """
    from django.core.cache import cache
    from .models import UserSession
    from .authentication import _CACHE_KEY_PREFIX

    active_sessions = UserSession.objects.filter(is_active=True).values_list(
        'session_uid', flat=True,
    )

    stale_ids = []
    for session_uid in active_sessions:
        key = f'{_CACHE_KEY_PREFIX}{session_uid}'
        if not cache.get(key):
            stale_ids.append(session_uid)

    if stale_ids:
        updated = UserSession.objects.filter(session_uid__in=stale_ids).update(
            is_active=False,
        )
        _sweep_logger.info(f'sweep_stale_sessions: marked {updated} sessions inactive.')


# ─────────────────────────────────────────────────────────────────────────────
# License server polling
# Moved from company.py threading.Thread to Celery.
# Called via .delay(company_id) from validate_company_license view.
# Retries up to 3 times on unexpected failure (not on deliberate status resets).
# ─────────────────────────────────────────────────────────────────────────────

import logging as _license_logger
_lic_log = logging.getLogger(__name__) if 'logging' in dir() else __import__('logging').getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def poll_company_license(self, company_id: int) -> None:
    """
    Poll the external license server for a company and update its status.
    Replaces the background threading.Thread in validate_company_license view.

    On Celery worker restart mid-poll: the task is re-queued from the broker
    (unlike a daemon thread which dies silently on process exit). The `finally`
    block resets VALIDATING → PENDING so the company is never stuck.
    """
    import logging
    log = logging.getLogger(__name__)

    from .views.web.company import poll_license_authentication, _parse_license_date

    log.info(f'[poll_company_license] Starting for company_id={company_id}')

    try:
        company = Company.objects.get(id=company_id)
    except Company.DoesNotExist:
        log.error(f'[poll_company_license] Company {company_id} not found — aborting')
        return

    try:
        auth_result = poll_license_authentication(company.company_id)

        if not auth_result['success']:
            log.error(f'[poll_company_license] Polling failed for {company_id}: {auth_result.get("error")}')
            company.authentication_status = Company.AuthStatus.PENDING
            company.save(update_fields=['authentication_status'])
            return

        auth_data   = auth_result.get('data', {})
        auth_status = auth_result['status']
        log.info(f'[poll_company_license] Result: {auth_status} for company {company.company_name}')

        if auth_status == 'Approve':
            company.authentication_status = Company.AuthStatus.APPROVED
            company.is_active = True
        elif auth_status == 'Expired':
            company.authentication_status = Company.AuthStatus.EXPIRED
        elif auth_status == 'Block':
            company.authentication_status = Company.AuthStatus.BLOCKED

        if auth_status == 'Approve':
            def _safe_int(val, default=0):
                try:
                    return int(val or default)
                except (ValueError, TypeError):
                    return default

            number_of_licences      = _safe_int(auth_data.get('NumberOfLicence'))
            palmtec_count           = _safe_int(auth_data.get('PalmtecCount'))
            total_user_count        = _safe_int(auth_data.get('TotalUserCount'))
            premium_user_count      = _safe_int(auth_data.get('PremiumUserCount'))
            intermediate_user_count = _safe_int(auth_data.get('IntermediateUserCount'))

            if number_of_licences > 0 and (palmtec_count + total_user_count) > number_of_licences:
                log.error(
                    f'[poll_company_license] License config error for {company.company_name}: '
                    f'palmtec({palmtec_count}) + users({total_user_count}) > '
                    f'NumberOfLicence({number_of_licences})'
                )
                company.authentication_status = Company.AuthStatus.PENDING
                company.error_message = (
                    f'License config error: device slots ({palmtec_count}) + '
                    f'user slots ({total_user_count}) = {palmtec_count + total_user_count} '
                    f'exceeds total licensed units ({number_of_licences}). '
                    'Contact the license server administrator.'
                )
                company.save()
                return

            company.product_registration_id = auth_data.get('ProductRegistrationId')
            company.unique_identifier        = auth_data.get('UniqueIDentifier')
            company.product_from_date        = _parse_license_date(auth_data.get('ProductFromDate'))
            company.product_to_date          = _parse_license_date(auth_data.get('ProductToDate'))
            company.number_of_licences       = number_of_licences
            company.palmtec_count            = palmtec_count
            company.total_user_count         = total_user_count
            company.premium_user_count       = premium_user_count
            company.intermediate_user_count  = intermediate_user_count
            company.error_message            = None

        company.save()
        log.info(f'[poll_company_license] Updated company {company_id} → {company.authentication_status}')

    except Exception as exc:
        log.exception(f'[poll_company_license] Unexpected error for company {company_id}: {exc}')
        raise self.retry(exc=exc, countdown=120)

    finally:
        # Safety net: if the task ends for any reason while status is still
        # VALIDATING, reset to PENDING so admins can retry. This also covers
        # the case where a Celery worker is killed mid-task (on next heartbeat
        # Celery marks the task as failed and this finally runs on the retry).
        try:
            company = Company.objects.get(id=company_id)
            if company.authentication_status == Company.AuthStatus.VALIDATING:
                company.authentication_status = Company.AuthStatus.PENDING
                company.save(update_fields=['authentication_status'])
        except Exception as e:
            log.error(f'[poll_company_license] Could not reset VALIDATING for {company_id}: {e}')


import logging as _recon_logger
_recon_log = _recon_logger.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def reconcile_aggregator_transaction(self, transaction_id):
    """
    Async reconciliation for a single AggregatorTransaction.
    Fired by the webhook after create. Replaces the removed post_save signal.
    """
    try:
        txn = AggregatorTransaction.objects.select_related('company').get(id=transaction_id)
    except AggregatorTransaction.DoesNotExist:
        _recon_log.error('[reconcile_aggregator] Transaction %s not found', transaction_id)
        return

    if not txn.is_payment_successful:
        AggregatorTransaction.objects.filter(id=transaction_id).update(
            processing_status=AggregatorTransaction.ProcessingStatus.PENDING_VERIFICATION
        )
        return

    AggregatorTransaction.objects.filter(id=transaction_id).update(
        processing_status=AggregatorTransaction.ProcessingStatus.RECONCILING
    )

    def _fail(status, error, ticket=None):
        update = dict(
            reconciliation_status=status,
            reconciliation_error=error,
            processing_status=AggregatorTransaction.ProcessingStatus.PENDING_VERIFICATION,
        )
        if ticket:
            update['related_ticket'] = ticket
        AggregatorTransaction.objects.filter(id=transaction_id).update(**update)

    try:
        company = txn.company
        if not company:
            _fail(
                AggregatorTransaction.ReconciliationStatus.NOT_FOUND,
                f'Company not resolved for terminal: {txn.transactionTerminalId}',
            )
            return

        # Tier 1: device wrote the aggregator transactionID back onto the ticket
        # after its own UPI status check succeeded — authoritative match.
        ticket = TransactionData.objects.filter(
            transaction_id=txn.transactionID,
            company_code=company,
        ).first()

        # Tier 2: device-side write-back failed/dropped, but aggregator's posting
        # still arrived. narration == bqrMerchantId, packed by device firmware
        # (create_bqrMerchantId): [0:6]=ticket_number ASCII, [6:10]=date hex
        # (d16 = (yearOffset<<9)|(month<<5)|day, yearOffset=Y-2000), [10:14]=time
        # hex (t16 = (hour<<11)|(minute<<5)|(second/2)), [-5:]=palmtec_id.
        # yearOffset can decode as 0 (device RTC year not set) even though
        # month/day/time are correct, so year is trusted only if it decodes
        # plausibly; otherwise assume the payment's own year.
        if not ticket and txn.narration and len(txn.narration) >= 14:
            try:
                ticket_number = str(int(txn.narration[:6]))
            except ValueError:
                ticket_number = None
            try:
                palmtec_id = str(int(txn.narration[-5:]))
            except ValueError:
                palmtec_id = None

            def _seconds(t):
                return t.hour * 3600 + t.minute * 60 + t.second

            if ticket_number and palmtec_id:
                # Tier 2a: exact date/time decoded straight off the device's own
                # narration — deterministic, not a proximity guess.
                decoded_date = decoded_time = None
                try:
                    d16 = int(txn.narration[6:10], 16)
                    t16 = int(txn.narration[10:14], 16)
                    year_offset = d16 >> 9
                    month = (d16 >> 5) & 0xF
                    day = d16 & 0x1F
                    hour = t16 >> 11
                    minute = (t16 >> 5) & 0x3F
                    second = (t16 & 0x1F) * 2
                    year = 2000 + year_offset if year_offset else txn.transaction_date.year
                    decoded_date = date(year, month, day)
                    decoded_time = time(hour, minute, second)
                except ValueError:
                    decoded_date = decoded_time = None

                if decoded_date and decoded_time:
                    target_seconds = _seconds(decoded_time)
                    exact_candidates = [
                        t for t in TransactionData.objects.filter(
                            ticket_number=ticket_number,
                            palmtec_id=palmtec_id,
                            company_code=company,
                            ticket_date=decoded_date,
                        )
                        # ±1s to absorb the seconds/2 truncation on the way in.
                        if abs(_seconds(t.ticket_time) - target_seconds) <= 1
                    ]
                    if len(exact_candidates) == 1:
                        ticket = exact_candidates[0]

                # Tier 2b: narration didn't decode cleanly (older/other firmware) —
                # pin to device + payment day, disambiguate by closest ticket_time.
                if not ticket:
                    candidates = list(TransactionData.objects.filter(
                        ticket_number=ticket_number,
                        palmtec_id=palmtec_id,
                        company_code=company,
                        ticket_date=txn.transaction_date,
                    ))
                    if len(candidates) == 1:
                        ticket = candidates[0]
                    elif len(candidates) > 1:
                        txn_seconds = _seconds(txn.transaction_time)
                        closest = min(
                            candidates,
                            key=lambda t: abs(_seconds(t.ticket_time) - txn_seconds),
                        )
                        # Only accept if unambiguously closest and within a sane
                        # window — payment is expected within minutes of issuance.
                        gap = abs(_seconds(closest.ticket_time) - txn_seconds)
                        if gap <= 1800:
                            ticket = closest

        if not ticket:
            _fail(
                AggregatorTransaction.ReconciliationStatus.NOT_FOUND,
                f'No ticket found for transactionID: {txn.transactionID}',
            )
            return

        ticket_amount  = ticket.ticket_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        payment_amount = Decimal(str(txn.transactionAmount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        if ticket_amount != payment_amount:
            _fail(
                AggregatorTransaction.ReconciliationStatus.AMOUNT_MISMATCH,
                f'Amount mismatch - Ticket: ₹{ticket_amount}, Payment: ₹{payment_amount}',
                ticket=ticket,
            )
            return

        with transaction.atomic():
            existing = AggregatorTransaction.objects.select_for_update().filter(
                related_ticket=ticket
            ).exclude(id=transaction_id).first()
            if existing:
                _fail(
                    AggregatorTransaction.ReconciliationStatus.DUPLICATE,
                    f'Ticket already paid by transaction: {existing.transactionID}',
                )
                return
            AggregatorTransaction.objects.filter(id=transaction_id).update(
                related_ticket=ticket,
                reconciliation_status=AggregatorTransaction.ReconciliationStatus.AUTO_MATCHED,
                reconciled_at=timezone.now(),
                processing_status=AggregatorTransaction.ProcessingStatus.PENDING_VERIFICATION,
            )
        _recon_log.info('[reconcile_aggregator] Auto-matched TXN-%s ↔ Ticket-%s', txn.transactionID, ticket.ticket_number)

    except Exception as exc:
        _recon_log.exception('[reconcile_aggregator] Error for transaction %s: %s', transaction_id, exc)
        AggregatorTransaction.objects.filter(id=transaction_id).update(
            reconciliation_error=f'Reconciliation error: {exc}',
            processing_status=AggregatorTransaction.ProcessingStatus.PENDING_VERIFICATION,
        )
        raise self.retry(exc=exc, countdown=60)


@shared_task
def scan_pending_aggregator_reconciliations():
    """
    Beat task. Finds AggregatorTransaction records stuck in PENDING reconciliation
    for more than 5 minutes (e.g. worker killed mid-task) and requeues them.
    """
    cutoff = timezone.now() - timedelta(minutes=5)
    stuck = AggregatorTransaction.objects.filter(
        reconciliation_status=AggregatorTransaction.ReconciliationStatus.PENDING,
        created_at__lt=cutoff,
        responseCode__in=['0', '00', '000'],
    ).values_list('id', flat=True)[:200]

    count = 0
    for txn_id in stuck:
        reconcile_aggregator_transaction.delay(txn_id)
        count += 1

    if count:
        _recon_log.info('[scan_pending_aggregator] Requeued %d stuck transactions', count)
    return count


@shared_task
def scan_unmatched_aggregator_transactions():
    """
    Beat task. Retries AggregatorTransaction rows stuck NOT_FOUND (ticket not yet
    synced from device — device may have been offline). Retried for up to
    MAX_AGE_DAYS; older rows are left NOT_FOUND for manual review.
    """
    cutoff = timezone.now() - timedelta(minutes=5)
    max_age = timezone.now() - timedelta(days=3)

    unmatched = AggregatorTransaction.objects.filter(
        reconciliation_status=AggregatorTransaction.ReconciliationStatus.NOT_FOUND,
        created_at__lt=cutoff,
        created_at__gte=max_age,
    ).values_list('id', flat=True)[:200]

    count = 0
    for txn_id in unmatched:
        reconcile_aggregator_transaction.delay(txn_id)
        count += 1

    if count:
        _recon_log.info('[scan_unmatched_aggregator] Requeued %d NOT_FOUND transactions', count)
    return count


import json as _json
import logging as _tid_logger
_tid_log = _tid_logger.getLogger(__name__)

@shared_task
def auto_populate_aggregator_tids():
    """
    Daily beat task. For each company that has any device with aggregator_tid unset,
    fetches TerminalMap from the license server and populates aggregator_tid
    by matching TerminalMap SER to ETMDevice.serial_number.
    Skips companies where all devices already have TID set.
    Never overwrites an already-set TID.
    """
    from .views.web.company import fetch_company_from_license_server

    companies_with_gaps = Company.objects.filter(
        etmdevice__aggregator_tid__isnull=True,
        etmdevice__allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
    ).distinct() | Company.objects.filter(
        etmdevice__aggregator_tid='',
        etmdevice__allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
    ).distinct()

    total_updated = 0

    for company in companies_with_gaps:
        try:
            result = fetch_company_from_license_server(company.company_id)
            if not result.get('success'):
                _tid_log.warning('[auto_populate_aggregator_tids] License server failed for company %s: %s', company.company_id, result.get('error'))
                continue

            terminal_map_raw = result['data'].get('TerminalMap')
            if not terminal_map_raw:
                continue

            try:
                terminal_map = _json.loads(terminal_map_raw) if isinstance(terminal_map_raw, str) else terminal_map_raw
            except (_json.JSONDecodeError, TypeError):
                _tid_log.warning('[auto_populate_aggregator_tids] Invalid TerminalMap for company %s', company.company_id)
                continue

            ser_to_tid = {e['SER']: e['TER'] for e in terminal_map if e.get('SER') and e.get('TER')}

            devices = ETMDevice.objects.filter(
                company=company,
                allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
            ).filter(
                Q(aggregator_tid__isnull=True) | Q(aggregator_tid='')
            )

            for device in devices:
                tid = ser_to_tid.get(device.serial_number)
                if not tid:
                    continue
                if ETMDevice.objects.filter(aggregator_tid=tid).exclude(pk=device.pk).exists():
                    _tid_log.warning('[auto_populate_aggregator_tids] TID %s already taken, skipping %s', tid, device.serial_number)
                    continue
                device.aggregator_tid = tid
                device.save(update_fields=['aggregator_tid', 'updated_at'])
                total_updated += 1

        except Exception as exc:
            _tid_log.exception('[auto_populate_aggregator_tids] Error processing company %s: %s', company.company_id, exc)

    _tid_log.info('[auto_populate_aggregator_tids] Done. %d device(s) updated.', total_updated)
    return total_updated
