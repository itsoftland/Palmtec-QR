import logging
from datetime import datetime
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils.timezone import make_aware
from django.views.decorators.csrf import csrf_exempt
from TicketAppB.models.transactions import TransactionData
from django.contrib.auth import get_user_model
from TicketAppB.models.auth import UserSession, FCMSession
from FCM.models import FCMLog
from FCM.firebase import send_push_notification

from ...models import RawDataLog, OdometerData, ExpenseData, Employee, VehicleType, TripData, ScheduleData, ExpenseMaster
from ...tasks import (
    process_transaction_data,
    process_trip_open_data, process_trip_close_data, process_trip_close_summary_data,
    process_schedule_open_data, process_schedule_close_data, process_schedule_close_summary_data,
)
from ..utils import _get_company_for_palmtec, _validate_checksum

log_ticket           = logging.getLogger('ticket.palmtec.ticket_data')
log_trip_open        = logging.getLogger('ticket.palmtec.trip_open')
log_trip_close       = logging.getLogger('ticket.palmtec.trip_close')
log_trip_close_sum   = logging.getLogger('ticket.palmtec.trip_close_summary')
log_schedule_open    = logging.getLogger('ticket.palmtec.schedule_open')
log_schedule_close   = logging.getLogger('ticket.palmtec.schedule_close')
log_schedule_close_sum = logging.getLogger('ticket.palmtec.schedule_close_summary')
log_odometer         = logging.getLogger('ticket.palmtec.odometer')
log_expense          = logging.getLogger('ticket.palmtec.expense')


def _resolve_trip_by_palmtec(palmtec_id, company, trip_no, record_date):
    if not trip_no or not record_date:
        return None
    return TripData.objects.filter(
        palmtec_id=palmtec_id,
        company_code=company,
        trip_no=trip_no,
        start_date__lte=record_date,
    ).order_by('-start_date').first()


def _resolve_schedule_by_palmtec(palmtec_id, company, schedule_no, record_date):
    if not schedule_no or not record_date:
        return None
    return ScheduleData.objects.filter(
        palmtec_id=palmtec_id,
        company_code=company,
        schedule_no=schedule_no,
        start_date__lte=record_date,
    ).order_by('-start_date').first()


@csrf_exempt
def getScheduleOpenDataFromDevice(request):
    if request.method != 'GET':
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    # Need at least parts[11] (battery); parts[3]=company, parts[5]=route_code
    if len(parts) < 12:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'ShdOpn':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_schedule_open.debug("RECV fn=%s palmtec=%s", parts[1], parts[3])

    if not _validate_checksum('getScheduleOpen', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        with transaction.atomic():
            log = RawDataLog.objects.create(
                raw_payload  = raw,
                company_code = company_instance,
                source       = RawDataLog.typeChoices.SCHEDULE_OPEN,
            )
            transaction.on_commit(lambda: process_schedule_open_data.delay(log.id))

        User = get_user_model()
        company_users = list(User.objects.filter(company=company_instance))

        active_sessions = FCMSession.objects.filter(
                user__in=company_users, is_active=True,
            )

        for session in active_sessions:
                    
            # print(f"Active session: user={session.user}, session_uid={session.session_uid}, fcm_token={session.fcm_token}")

            if not session.fcm_token:
                print("token not found")
                # return
                continue
            
            title = "New Schedule"
            body = "A new schedule opened."
        
        
            try:
                send_push_notification(
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    data={
                        "type": "schedule_data",
                    }
                )

                print("notification send")
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="success",
                )

            except Exception as e:
                print(
                    f"Failed to send FCM notification: {e}"
                )
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="failed",
                    error=str(e),
                )

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except Exception as e:
        log_schedule_open.exception("ScheduleOpen failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")


@csrf_exempt
def getTripOpenDataFromDevice(request):
    if request.method != 'GET':
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    # Need at least parts[14] (checksum)
    if len(parts) < 15:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'TrpOp':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_trip_open.debug("RECV fn=%s palmtec=%s", parts[1], parts[2])

    if not _validate_checksum('getTripOpen', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if len(parts) > 3 and parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        with transaction.atomic():
            log = RawDataLog.objects.create(
                raw_payload  = raw,
                company_code = company_instance,
                source       = RawDataLog.typeChoices.TRIP_OPEN,
            )
            transaction.on_commit(lambda: process_trip_open_data.delay(log.id))

        User = get_user_model()
        company_users = list(User.objects.filter(company=company_instance))

        active_sessions = FCMSession.objects.filter(
                user__in=company_users, is_active=True,
            )

        for session in active_sessions:
                    
            # print(f"Active session: user={session.user}, session_uid={session.session_uid}, fcm_token={session.fcm_token}")

            if not session.fcm_token:
                print("token not found")
                # return
                continue
            
            title = "New Trip"
            body = "A new trip opened."
        
        
            try:
                send_push_notification(
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    data={
                        "type": "trip_data",
                    }
                )

                print("notification send")
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="success",
                )

            except Exception as e:
                print(
                    f"Failed to send FCM notification: {e}"
                )
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="failed",
                    error=str(e),
                )

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except Exception as e:
        log_trip_open.exception("TripOpen failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")


@csrf_exempt
def getTicketDataFromDevice(request):
    if request.method != "GET":
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    # Need at least parts[47] (upi_manual_check); parts[46]=license_code, parts[44]=ticket_status
    if len(parts) < 48:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'Ticket':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_ticket.debug("RECV fn=%s palmtec=%s", parts[1], parts[2])

    if not _validate_checksum('getTicket', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[46]) if parts[46] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        with transaction.atomic():
            log = RawDataLog.objects.create(
                raw_payload  = raw,
                company_code = company_instance,
                source       = RawDataLog.typeChoices.TRANSACTION,
            )
            transaction.on_commit(lambda: process_transaction_data.delay(log.id))

        User = get_user_model()
        company_users = list(User.objects.filter(company=company_instance))

        active_sessions = FCMSession.objects.filter(
                user__in=company_users, is_active=True,
            )

        for session in active_sessions:
                    
            # print(f"Active session: user={session.user}, session_uid={session.session_uid}, fcm_token={session.fcm_token}")

            if not session.fcm_token:
                print("token not found")
                # return
                continue

            title = "New TIcket"
            body = "A new ticket  has been created."


            try:
                send_push_notification(
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    data={
                        "type": "transaction_data",
                    }
                )

                print("notification send")
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="success",
                )

            except Exception as e:
                print(
                    f"Failed to send FCM notification: {e}"
                )
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="failed",
                    error=str(e),
                )
        

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except Exception as e:
        log_ticket.exception("Ticket failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")



@csrf_exempt
def getScheduleCloseDataFromDevice(request):
    if request.method != 'GET':
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    # Need at least parts[46] (checksum)
    if len(parts) < 47:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'ShdCls':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_schedule_close.debug("RECV fn=%s palmtec=%s", parts[1], parts[3])

    if not _validate_checksum('getSdCl', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        with transaction.atomic():
            log = RawDataLog.objects.create(
                raw_payload  = raw,
                company_code = company_instance,
                source       = RawDataLog.typeChoices.SCHEDULE_CLOSE,
            )
            transaction.on_commit(lambda: process_schedule_close_data.delay(log.id))

        User = get_user_model()
        company_users = list(User.objects.filter(company=company_instance))

        active_sessions = FCMSession.objects.filter(
                user__in=company_users, is_active=True,
            )

        for session in active_sessions:
                    
            # print(f"Active session: user={session.user}, session_uid={session.session_uid}, fcm_token={session.fcm_token}")

            if not session.fcm_token:
                print("token not found")
                # return
                continue
            
            title = "Schedule Closed"
            body = "A schedule closed."
        
        
            try:
                send_push_notification(
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    data={
                        "type": "schedule_data",
                    }
                )

                print("notification send")
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="success",
                )

            except Exception as e:
                print(
                    f"Failed to send FCM notification: {e}"
                )
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="failed",
                    error=str(e),
                )

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except Exception as e:
        log_schedule_close.exception("ScheduleClose failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")


@csrf_exempt
def getTripCloseDataFromDevice(request):
    if request.method != 'GET':
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    # Need at least parts[37] (checksum); parts[4] = company
    if len(parts) < 38:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'TrpCl':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_trip_close.debug("RECV fn=%s palmtec=%s", parts[1], parts[2])

    if not _validate_checksum('getTripClose', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        with transaction.atomic():
            log = RawDataLog.objects.create(
                raw_payload  = raw,
                company_code = company_instance,
                source       = RawDataLog.typeChoices.TRIP_CLOSE,
            )
            transaction.on_commit(lambda: process_trip_close_data.delay(log.id))

        User = get_user_model()
        company_users = list(User.objects.filter(company=company_instance))

        active_sessions = FCMSession.objects.filter(
                user__in=company_users, is_active=True,
            )

        for session in active_sessions:
                    
            # print(f"Active session: user={session.user}, session_uid={session.session_uid}, fcm_token={session.fcm_token}")

            if not session.fcm_token:
                print("token not found")
                # return
                continue
            
            title = "Trip Closed"
            body = "A Trip Closed."
        
        
            try:
                send_push_notification(
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    data={
                        "type": "trip_data",
                    }
                )

                print("notification send")
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="success",
                )

            except Exception as e:
                print(
                    f"Failed to send FCM notification: {e}"
                )
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="failed",
                    error=str(e),
                )

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except Exception as e:
        log_trip_close.exception("TripClose failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")


@csrf_exempt
def getTripCloseSummaryFromDevice(request):
    if request.method != "GET":
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    if len(parts) < 38:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'TrpClSum':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_trip_close_sum.debug("RECV fn=%s palmtec=%s", parts[1], parts[2])

    if not _validate_checksum('getTripCloseSummary', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if len(parts) > 3 and parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        with transaction.atomic():
            log = RawDataLog.objects.create(
                raw_payload  = raw,
                company_code = company_instance,
                source       = RawDataLog.typeChoices.TRIP_CLOSE_SUMMARY,
            )
            transaction.on_commit(lambda: process_trip_close_summary_data.delay(log.id))

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except Exception as e:
        log_trip_close_sum.exception("TripCloseSummary failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")


@csrf_exempt
def getScheduleCloseSummaryFromDevice(request):
    if request.method != "GET":
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    if len(parts) < 47:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'ShdClsSum':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_schedule_close_sum.debug("RECV fn=%s palmtec=%s", parts[1], parts[3])

    if not _validate_checksum('getSdClSm', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        with transaction.atomic():
            log = RawDataLog.objects.create(
                raw_payload  = raw,
                company_code = company_instance,
                source       = RawDataLog.typeChoices.SCHEDULE_CLOSE_SUMMARY,
            )
            transaction.on_commit(lambda: process_schedule_close_summary_data.delay(log.id))

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except Exception as e:
        log_schedule_close_sum.exception("ScheduleCloseSummary failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")


@csrf_exempt
def getOdometerDataFromDevice(request):
    # Protocol: [0]=OdoMtr [1]=unique_code [2]=palmtec_id [3]=company_code
    # [4]=schedule_no [5]=trip_no [6]=start_date [7]=start_time
    # [8]=end_date [9]=end_time [10]=driver [11]=bus_no
    # [12]=start_reading [13]=end_reading [14]=checksum [15]=empty
    if request.method != "GET":
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    if len(parts) < 15:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'OdoMtr':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_odometer.debug("RECV fn=%s palmtec=%s", parts[1], parts[2])

    if not _validate_checksum('getOdometerDetails', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        def _p(i, default=None):
            return parts[i] if len(parts) > i and parts[i] else default

        errors = []

        driver_instance = None
        if _p(10):
            driver_instance = Employee.objects.filter(employee_name=_p(10), company=company_instance).first()
            if not driver_instance:
                errors.append(f"driver not matched: {_p(10)}")

        bus_instance = None
        if _p(11):
            bus_instance = VehicleType.objects.filter(bus_reg_num=_p(11), company=company_instance).first()
            if not bus_instance:
                errors.append(f"bus not matched: {_p(11)}")

        start_date     = datetime.strptime(_p(6), "%Y-%m-%d").date() if _p(6) else None
        start_time     = datetime.strptime(_p(7), "%H:%M:%S").time() if _p(7) else None
        start_datetime = make_aware(datetime.combine(start_date, start_time)) if start_date and start_time else None
        end_date       = datetime.strptime(_p(8), "%Y-%m-%d").date() if _p(8) else None
        end_time       = datetime.strptime(_p(9), "%H:%M:%S").time() if _p(9) else None
        end_datetime   = make_aware(datetime.combine(end_date, end_time)) if end_date and end_time else None

        schedule_no = int(_p(4)) if _p(4) else None
        trip_no     = int(_p(5)) if _p(5) else None

        trip_obj     = _resolve_trip_by_palmtec(_p(2), company_instance, trip_no, start_date)
        schedule_obj = _resolve_schedule_by_palmtec(_p(2), company_instance, schedule_no, start_date)

        OdometerData.objects.create(
            unique_code    = _p(1),
            palmtec_id     = _p(2),
            company_code   = company_instance,
            schedule_no    = schedule_no,
            trip_no        = trip_no,
            trip_id        = trip_obj,
            schedule_id    = schedule_obj,
            start_date     = start_date,
            start_time     = start_time,
            start_datetime = start_datetime,
            end_date       = end_date,
            end_time       = end_time,
            end_datetime   = end_datetime,
            driver         = _p(10),
            driver_id      = driver_instance,
            bus_no         = _p(11),
            bus_id         = bus_instance,
            start_reading  = Decimal(_p(12, '0')),
            end_reading    = Decimal(_p(13, '0')),
            source         = OdometerData.SourceType.API,
            checksum       = _p(14),
            raw_payload    = raw,
            error_reason   = "; ".join(errors) if errors else None,
        )

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except IntegrityError:
        return HttpResponse(f'OK#DUPLICATE#fn={parts[1]}#', content_type="text/plain", status=200)
    except Exception as e:
        log_odometer.exception("OdometerData failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")


@csrf_exempt
def getExpenseDataFromDevice(request):
    # Protocol: [0]=ExpDtl [1]=unique_code [2]=palmtec_id [3]=company_code
    # [4]=schedule_no [5]=trip_no [6]=YYYY-MM-DD [7]=HH:MM:00
    # [8]=driver [9]=bus_no [10]=expense_amount [11]=diesel_amount
    # [12]=expense_type [13]=expense_name [14]=checksum [15]=empty
    if request.method != "GET":
        return HttpResponse("METHOD_NOT_ALLOWED", status=405, content_type="text/plain")

    raw = request.GET.get("fn")
    if not raw:
        return HttpResponse("NO_DATA", status=400, content_type="text/plain")

    parts = raw.split("|")

    if len(parts) < 15:
        return HttpResponse("MISSING_DATA", status=400, content_type="text/plain")

    if parts[0] != 'ExpDtl':
        return HttpResponse("INVALID", status=400, content_type="text/plain")

    log_expense.debug("RECV fn=%s palmtec=%s", parts[1], parts[2])

    if not _validate_checksum('getExpenseDetails', raw):
        return HttpResponse("INVALID_CHECKSUM", status=400, content_type="text/plain")

    company_instance = None
    try:
        company_instance = _get_company_for_palmtec(parts[3]) if parts[3] else None
        if not company_instance:
            return HttpResponse("INVALID_COMPANY", status=400, content_type="text/plain")

        def _p(i, default=None):
            return parts[i] if len(parts) > i and parts[i] else default

        errors = []

        driver_instance = None
        if _p(8):
            driver_instance = Employee.objects.filter(employee_name=_p(8), company=company_instance).first()
            if not driver_instance:
                errors.append(f"driver not matched: {_p(8)}")

        bus_instance = None
        if _p(9):
            bus_instance = VehicleType.objects.filter(bus_reg_num=_p(9), company=company_instance).first()
            if not bus_instance:
                errors.append(f"bus not matched: {_p(9)}")

        expense_date     = datetime.strptime(_p(6), "%Y-%m-%d").date() if _p(6) else None
        expense_time     = datetime.strptime(_p(7), "%H:%M:%S").time() if _p(7) else None
        expense_datetime = make_aware(datetime.combine(expense_date, expense_time)) if expense_date and expense_time else None

        schedule_no = int(_p(4)) if _p(4) else None
        trip_no     = int(_p(5)) if _p(5) else None

        trip_obj     = _resolve_trip_by_palmtec(_p(2), company_instance, trip_no, expense_date)
        schedule_obj = _resolve_schedule_by_palmtec(_p(2), company_instance, schedule_no, expense_date)

        ExpenseData.objects.create(
            unique_code      = _p(1),
            palmtec_id       = _p(2),
            company_code     = company_instance,
            schedule_no      = schedule_no,
            trip_no          = trip_no,
            trip_id          = trip_obj,
            schedule_id      = schedule_obj,
            expense_date     = expense_date,
            expense_time     = expense_time,
            expense_datetime = expense_datetime,
            driver           = _p(8),
            driver_id        = driver_instance,
            bus_no           = _p(9),
            bus_id           = bus_instance,
            expense_amount   = Decimal(_p(10, '0')),
            diesel_amount    = Decimal(_p(11, '0')),
            expense_type      = int(_p(12)) if _p(12) else None,
            expense_master_id = ExpenseMaster.objects.filter(company=company_instance, expense_code=str(int(_p(12)))).first() if _p(12) else None,
            expense_name      = _p(13),
            source           = ExpenseData.SourceType.API,
            checksum         = _p(14),
            raw_payload      = raw,
            error_reason     = "; ".join(errors) if errors else None,
        )

        return HttpResponse(f'OK#SUCCESS#fn={parts[1]}#', content_type="text/plain", status=200)

    except IntegrityError:
        return HttpResponse(f'OK#DUPLICATE#fn={parts[1]}#', content_type="text/plain", status=200)
    except Exception as e:
        log_expense.exception("ExpenseData failed raw=%s err=%s", raw, e, extra={'company_id': company_instance.company_id} if company_instance else {})
        return HttpResponse("ERROR", status=500, content_type="text/plain")
