import logging
from collections import defaultdict
from datetime import datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.http import JsonResponse
from django.db.models import Count
from django.db import OperationalError
from django.utils.dateparse import parse_datetime
import pytz

from ...models import TransactionData, TripData, ScheduleData, OdometerData, BusInspection
from ...permissions import LicensePermission
from ...serializers.transactions import TicketDataSerializer,TripDataSerializer,ScheduleDataSerializer, BusInspectionSerializer

logger = logging.getLogger('ticket.ticket_report')


def _parse_since(since_timestamp):
    """Parse a since= cursor timestamp. Returns aware datetime or None."""
    if not since_timestamp:
        return None
    try:
        dt = parse_datetime(since_timestamp)
        if dt is None:
            dt = datetime.fromisoformat(since_timestamp.replace('Z', '+00:00'))
        if dt and dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        return dt
    except (ValueError, TypeError):
        return None


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_all_transaction_data(request):
    """
    Ticket transactions for the web report page.

    Query params:
        from_date  YYYY-MM-DD  required
        to_date    YYYY-MM-DD  required
        since      ISO ts      optional — incremental polling cursor
    """
    user = request.user

    try:
        from_date = request.GET.get('from_date')
        to_date   = request.GET.get('to_date')
        since_ts  = request.GET.get('since')

        if not from_date or not to_date:
            return Response({'error': 'from_date and to_date are required'},
                            status=status.HTTP_400_BAD_REQUEST)

        if user.company:
            qs = TransactionData.objects.filter(
                company_code=user.company,
                ticket_date__gte=from_date,
                ticket_date__lte=to_date,
            ).select_related(
                'route_id',
                'from_stage_id__stage',
                'to_stage_id__stage',
                'trip_id',
                'schedule_id',
            ).prefetch_related('route_id__route_depots__depot')
        else:
            qs = TransactionData.objects.none()

        since_dt = _parse_since(since_ts)
        if since_ts and since_dt is None:
            logger.warning(f"Could not parse since timestamp: {since_ts}")
            return Response({"message": "success", "data": []}, status=status.HTTP_200_OK)

        if since_dt:
            qs = qs.filter(created_at__gt=since_dt)
            logger.info(f"Ticket polling: since={since_ts}")

        qs = qs.order_by('-created_at')[:500]

        serializer = TicketDataSerializer(qs, many=True)
        return Response({
            "message": "success",
            "data": serializer.data,
            "count": len(serializer.data),
        }, status=status.HTTP_200_OK)

    except OperationalError:
        return Response({"message": "Database error"},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        logger.exception("Error fetching transaction data")
        return Response({"message": "Data fetching failed", "error": str(e)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_all_trip_data(request):
    """
    Combined trip open+close data for the Trip Data report page.
    Queries TripData (merged table). Both open and closed trips returned.

    Query params:
        from_date  YYYY-MM-DD  required  — filters on start_date
        to_date    YYYY-MM-DD  required
        since      ISO ts      optional  — incremental polling cursor (uses updated_at)
    """
    user = request.user

    try:
        from_date = request.GET.get('from_date')
        to_date   = request.GET.get('to_date')
        since_ts  = request.GET.get('since')

        if not from_date or not to_date:
            return JsonResponse({'error': 'from_date and to_date are required'},
                                status=status.HTTP_400_BAD_REQUEST)

        if user.company:
            qs = TripData.objects.filter(
                company_code=user.company,
                start_date__gte=from_date,
                start_date__lte=to_date,
            ).select_related(
                'route_id',
            ).prefetch_related(
                'route_id__route_depots__depot',
            )
        else:
            qs = TripData.objects.none()

        since_dt = _parse_since(since_ts)
        if since_ts and since_dt is None:
            logger.warning(f"Could not parse since timestamp: {since_ts}")
            return JsonResponse({"message": "success", "data": []}, status=status.HTTP_200_OK)

        if since_dt:
            # Use updated_at — catches newly created trips AND trips that just closed
            qs = qs.filter(updated_at__gt=since_dt)
            logger.info(f"Trip polling: since={since_ts}")

        qs = qs.order_by('-start_datetime')[:500]

        serializer = TripDataSerializer(qs, many=True)
        return JsonResponse({
            "message": "success",
            "data": serializer.data,
            "count": len(serializer.data),
        }, status=status.HTTP_200_OK)

    except OperationalError:
        return JsonResponse({"message": "Database error"},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        logger.exception("Error fetching trip data")
        return JsonResponse({"message": str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_all_schedule_data(request):
    """
    Combined schedule open+close data for the Schedule Data report page.
    Queries ScheduleData (merged table). Both open and closed schedules returned.

    Query params:
        from_date  YYYY-MM-DD  required  — filters on start_date
        to_date    YYYY-MM-DD  required
        since      ISO ts      optional  — incremental polling cursor (uses updated_at)
    """
    user = request.user

    try:
        from_date = request.GET.get('from_date')
        to_date   = request.GET.get('to_date')
        since_ts  = request.GET.get('since')

        if not from_date or not to_date:
            return JsonResponse({'error': 'from_date and to_date are required'},
                                status=status.HTTP_400_BAD_REQUEST)

        if user.company:
            qs = ScheduleData.objects.filter(
                company_code=user.company,
                start_date__gte=from_date,
                start_date__lte=to_date,
            ).select_related(
                'route_id',
            ).prefetch_related(
                'route_id__route_depots__depot',
            ).annotate(
                _trips_count=Count('trips'),
            )
        else:
            qs = ScheduleData.objects.none()

        since_dt = _parse_since(since_ts)
        if since_ts and since_dt is None:
            logger.warning(f"Could not parse since timestamp: {since_ts}")
            return JsonResponse({"message": "success", "data": []}, status=status.HTTP_200_OK)

        if since_dt:
            qs = qs.filter(updated_at__gt=since_dt)
            logger.info(f"Schedule polling: since={since_ts}")

        qs = qs.order_by('-start_datetime')[:500]

        # Attach annotated trips_count so serializer uses it without extra query
        objects = list(qs)
        for obj in objects:
            obj._trips_count = obj._trips_count  # annotation already on obj

        if objects:
            pass_counts = defaultdict(int)
            pass_tickets = TransactionData.objects.filter(
                company_code=user.company,
                schedule_id__in=objects,
                ticket_status=TransactionData.PaymentMode.CASH,
            ).values_list('schedule_id_id', 'ticket_type', 'pass_number')
            for schedule_id, ticket_type, pass_number in pass_tickets:
                if pass_number or (ticket_type is not None and ticket_type & 32):
                    pass_counts[schedule_id] += 1
            for obj in objects:
                obj._pass_count = pass_counts[obj.id]

        # Bulk-fetch odometer readings once and attach total_run_km per schedule
        if objects:
            odo_rows = OdometerData.objects.filter(
                company_code=user.company,
                palmtec_id__in={o.palmtec_id for o in objects},
                schedule_no__in={o.schedule_no for o in objects},
                start_date__in={o.start_date for o in objects if o.start_date},
            ).values_list('palmtec_id', 'schedule_no', 'start_date', 'bus_no',
                          'start_time', 'start_reading', 'end_reading')
            readings_by_key = defaultdict(list)
            for pid, sno, sdate, bus, stime, start_r, end_r in odo_rows:
                key = ScheduleDataSerializer.odometer_key(pid, sno, sdate, bus)
                readings_by_key[key].append((stime, start_r, end_r))
            for obj in objects:
                key = ScheduleDataSerializer.odometer_key(
                    obj.palmtec_id, obj.schedule_no, obj.start_date, obj.bus_no)
                obj._total_run_km = ScheduleDataSerializer.run_km_for_time(
                    readings_by_key.get(key, []), obj.start_time)

        serializer = ScheduleDataSerializer(objects, many=True)
        return JsonResponse({
            "message": "success",
            "data": serializer.data,
            "count": len(serializer.data),
        }, status=status.HTTP_200_OK)

    except OperationalError:
        return JsonResponse({"message": "Database error"},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        logger.exception("Error fetching schedule data")
        return JsonResponse({"message": str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_bus_inspections(request):
    """
    Inspector-report records (BusInspection) for the Inspector Records report page.

    Query params:
        from_date  YYYY-MM-DD  required  — filters on inspection_date
        to_date    YYYY-MM-DD  required
    """
    user = request.user

    try:
        from_date = request.GET.get('from_date')
        to_date   = request.GET.get('to_date')

        if not from_date or not to_date:
            return Response({'error': 'from_date and to_date are required'},
                            status=status.HTTP_400_BAD_REQUEST)

        if user.company:
            qs = BusInspection.objects.filter(
                company=user.company,
                inspection_date__gte=from_date,
                inspection_date__lte=to_date,
            ).select_related('route_id')
        else:
            qs = BusInspection.objects.none()

        qs = qs.order_by('-inspection_date', '-inspection_time')[:500]

        serializer = BusInspectionSerializer(qs, many=True)
        return Response({
            "message": "success",
            "data": serializer.data,
            "count": len(serializer.data),
        }, status=status.HTTP_200_OK)

    except OperationalError:
        return Response({"message": "Database error"},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        logger.exception("Error fetching bus inspection data")
        return Response({"message": "Data fetching failed", "error": str(e)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)
