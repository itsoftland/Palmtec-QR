from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from django.utils import timezone as tz
import datetime

from ...models import RawDataLog, UserRole
from ...permissions import LicensePermission
from ...tasks import (
    process_transaction_data, process_trip_open_data, process_trip_close_data,
    process_trip_close_summary_data, process_schedule_open_data,
    process_schedule_close_data, process_schedule_close_summary_data,
)

_TASK_MAP = {
    RawDataLog.typeChoices.TRANSACTION:            process_transaction_data,
    RawDataLog.typeChoices.TRIP_OPEN:              process_trip_open_data,
    RawDataLog.typeChoices.TRIP_CLOSE:             process_trip_close_data,
    RawDataLog.typeChoices.TRIP_CLOSE_SUMMARY:     process_trip_close_summary_data,
    RawDataLog.typeChoices.SCHEDULE_OPEN:          process_schedule_open_data,
    RawDataLog.typeChoices.SCHEDULE_CLOSE:         process_schedule_close_data,
    RawDataLog.typeChoices.SCHEDULE_CLOSE_SUMMARY: process_schedule_close_summary_data,
}


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_failed_payloads(request):
    user = request.user
    if user.role != UserRole.SUPERADMIN:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    qs = RawDataLog.objects.select_related('company_code').filter(
        status=RawDataLog.statusChoices.FAILED
    ).order_by('-received_at')

    source     = request.GET.get('source', '').strip()
    company_id = request.GET.get('company_id', '').strip()
    from_date  = request.GET.get('from_date', '').strip()
    to_date    = request.GET.get('to_date', '').strip()
    search     = request.GET.get('search', '').strip()

    if source:
        qs = qs.filter(source=source)
    if company_id:
        qs = qs.filter(company_code_id=company_id)
    if from_date:
        try:
            from_dt = tz.make_aware(datetime.datetime.strptime(from_date, '%Y-%m-%d'), tz.get_current_timezone())
            qs = qs.filter(received_at__gte=from_dt)
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = tz.make_aware(
                datetime.datetime.strptime(to_date, '%Y-%m-%d') + datetime.timedelta(days=1),
                tz.get_current_timezone()
            )
            qs = qs.filter(received_at__lt=to_dt)
        except ValueError:
            pass
    if search:
        qs = qs.filter(
            Q(error_message__icontains=search) |
            Q(raw_payload__icontains=search)   |
            Q(company_code__company_name__icontains=search)
        )

    try:
        page      = max(1, int(request.GET.get('page', 1)))
        page_size = min(100, max(1, int(request.GET.get('page_size', 25))))
    except (ValueError, TypeError):
        page, page_size = 1, 25

    total   = qs.count()
    start   = (page - 1) * page_size
    records = qs[start:start + page_size]

    data = [{
        'id':               r.id,
        'source':           r.source,
        'status':           r.status,
        'company_name':     r.company_code.company_name if r.company_code else None,
        'company_id':       r.company_code_id,
        'error_message':    r.error_message,
        'raw_payload':      r.raw_payload,
        'received_at':      r.received_at.isoformat() if r.received_at else None,
        'processed_at':     r.processed_at.isoformat() if r.processed_at else None,
        'retry_count':      r.retry_count,
        'retries_remaining': max(0, _MAX_MANUAL_RETRIES - r.retry_count),
    } for r in records]

    return Response({
        'message':     'success',
        'data':        data,
        'total':       total,
        'page':        page,
        'page_size':   page_size,
        'total_pages': (total + page_size - 1) // page_size,
    })


_MAX_MANUAL_RETRIES = 3


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def retry_failed_payload(request, log_id):
    user = request.user
    if user.role != UserRole.SUPERADMIN:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    try:
        log = RawDataLog.objects.get(id=log_id, status=RawDataLog.statusChoices.FAILED)
    except RawDataLog.DoesNotExist:
        return Response(
            {'error': 'Log not found or not in FAILED status'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if log.retry_count >= _MAX_MANUAL_RETRIES:
        return Response(
            {
                'error': (
                    f'Maximum manual retries ({_MAX_MANUAL_RETRIES}) reached for this payload. '
                    'Inspect the raw_payload and error_message to resolve the underlying issue.'
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    task = _TASK_MAP.get(log.source)
    if not task:
        return Response(
            {'error': f'No task handler for source: {log.source}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    log.status        = RawDataLog.statusChoices.PENDING
    log.error_message = None
    log.processed_at  = None
    log.retry_count  += 1
    log.save(update_fields=['status', 'error_message', 'processed_at', 'retry_count'])

    task.delay(log.id)

    return Response({
        'message': 'success',
        'log_id': log_id,
        'retry_count': log.retry_count,
        'retries_remaining': _MAX_MANUAL_RETRIES - log.retry_count,
    })
