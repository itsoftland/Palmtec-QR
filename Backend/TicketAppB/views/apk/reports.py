import datetime
from rest_framework.response import Response
from django.db.models import Q, Sum, Count
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from zoneinfo import ZoneInfo
from ...models import TransactionData, TripData, ScheduleData, Stage, ExpenseData, Route, RouteStage, VehicleType, AggregatorTransaction,AggregatorPayoutCallback
from ...permissions import LicensePermission
from ..utils import _meets_tier, _TIER_ERROR

PAYMENT_LABELS = {'Cash': 'Cash', 'UPI': 'UPI', 'Card': 'Card'}


class AggregatorTransactionPagination(PageNumberPagination):
    page_size = 5
    page_size_query_param = 'page_size'
    max_page_size = 500


# GET /apk/buses
# Returns all active bus registration numbers for the company.
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def apk_bus_list(request):
    user = request.user

    buses = list(
        VehicleType.objects.filter(company=user.company, is_deleted=False)
        .order_by('bus_reg_num')
        .values('id', 'bus_reg_num')
    )
    return Response({'buses': buses})


# GET /apk/schedules
# Returns schedule numbers (with open/closed status) for a bus on a date.
# Params: bus_no, date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def apk_schedules(request):
    user = request.user

    bus_no = request.GET.get('bus_no')
    date_str = request.GET.get('date')

    if not bus_no or not date_str:
        return Response({'error': 'bus_no and date are required'}, status=400)

    schedules = ScheduleData.objects.filter(
        company_code=user.company,
        bus_no=bus_no,
        start_date=date_str,
    ).order_by('schedule_no').values('schedule_no', 'is_closed')

    # Range-match version (schedule opened on a past date, still open today) — disabled for now:
    # schedules = ScheduleData.objects.filter(
    #     company_code=user.company,
    #     bus_no=bus_no,
    #     start_date__lte=date_str,
    # ).filter(
    #     Q(end_date__gte=date_str) | Q(end_date__isnull=True)
    # ).order_by('schedule_no').values('schedule_no', 'is_closed')

    data = [
        {
            'schedule_no': s['schedule_no'],
            'status': 'closed' if s['is_closed'] else 'open',
        }
        for s in schedules
    ]

    return Response({
        'data': data,
        'schedules': [s['schedule_no'] for s in data],
    })


# GET /apk/dashboard
# APK home dashboard: revenue header, weekly chart (Mon–Sun), per-bus list with status.
# Params: date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def apk_dashboard(request):

    user = request.user

    date_str = request.GET.get('date')
    if not date_str:
        return Response({'error': 'date is required'}, status=400)

    company = user.company
    anchor = datetime.date.fromisoformat(date_str)

    company_created_date = company.created_at.date()

    if anchor < company_created_date:
        return Response({
                'date': date_str,
                'total_revenue': "0",
                'total_cash': "0",
                'total_upi': "0",
                'bus_on_road': 0,
                'weekly_chart': [],
                'bus_list': [],
            })
        
        
    # ── Revenue header: closed trips from TripData + open trips from TransactionData ──
    closed_day = TripData.objects.filter(
        company_code=company,
        start_date=date_str,
        is_closed=True,
    ).aggregate(total=Sum('total_collection'), upi=Sum('upi_ticket_amount'))

    # Current: keyed on ticket_date (day money was actually collected)
    # open_day = TransactionData.objects.filter(
    #     company_code=company,
    #     ticket_date=date_str,
    #     trip_id__is_closed=False,
    # ).aggregate(
    #     total=Sum('ticket_amount'),
    #     upi=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
    # )

    # Alternate: keyed on the schedule's own start_date (same gate as bus status below)
    open_day = TransactionData.objects.filter(
        company_code=company,
        schedule_id__start_date=date_str,
        trip_id__is_closed=False,
    ).aggregate(
        total=Sum('ticket_amount'),
        upi=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
    )

    total_revenue = (closed_day['total'] or 0) + (open_day['total'] or 0)
    total_upi = (closed_day['upi'] or 0) + (open_day['upi'] or 0)

    # ── Per-bus revenue: closed from TripData, open from TransactionData ──────
    closed_bus_rows = {
        row['bus_no']: row
        for row in TripData.objects.filter(
            company_code=company,
            start_date=date_str,
            is_closed=True,
            bus_no__isnull=False,
        ).values('bus_no').annotate(
            revenue=Sum('total_collection'),
            upi_amt=Sum('upi_ticket_amount'),
        )
    }

    # Current: keyed on ticket_date
    # open_bus_rows = {
    #     row['bus_no']: row
    #     for row in TransactionData.objects.filter(
    #         company_code=company,
    #         ticket_date=date_str,
    #         trip_id__is_closed=False,
    #         bus_no__isnull=False,
    #     ).values('bus_no').annotate(
    #         revenue=Sum('ticket_amount'),
    #         upi_amt=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
    #     )
    # }

    # Alternate: keyed on the schedule's own start_date
    open_bus_rows = {
        row['bus_no']: row
        for row in TransactionData.objects.filter(
            company_code=company,
            schedule_id__start_date=date_str,
            trip_id__is_closed=False,
            bus_no__isnull=False,
        ).values('bus_no').annotate(
            revenue=Sum('ticket_amount'),
            upi_amt=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
        )
    }

    # Status gate: schedule > trip > tickets — a bus is running/idle only when its
    # ScheduleData opened on this exact date (start_date == date_str), never carried
    # over from a schedule opened on a prior date that's still open. Revenue can still
    # accrue to this date via continuing trips, but status doesn't follow it.
    running_buses = set()
    closed_today_buses = set()
    for r in ScheduleData.objects.filter(
        company_code=company,
        start_date=date_str,
        bus_no__isnull=False,
    ).values('bus_no', 'is_closed'):
        if r['is_closed']:
            closed_today_buses.add(r['bus_no'])
        else:
            running_buses.add(r['bus_no'])

    running_count = len(running_buses)

    bus_list = []
    for reg_num in VehicleType.objects.filter(company=company, is_deleted=False).values_list('bus_reg_num', flat=True):
        closed = closed_bus_rows.get(reg_num, {})
        open_rev = open_bus_rows.get(reg_num, {})
        revenue = (closed.get('revenue') or 0) + (open_rev.get('revenue') or 0)
        upi_amt = (closed.get('upi_amt') or 0) + (open_rev.get('upi_amt') or 0)
        cash_amt = revenue - upi_amt

        if reg_num in running_buses:
            status = 'running'
        elif reg_num in closed_today_buses:
            status = 'idle'
        else:
            status = 'offline'

        bus_list.append({
            'bus_no': reg_num,
            'status': status,
            'revenue': str(revenue),
            'cash_amt': str(cash_amt),
            'upi_amt': str(upi_amt),
        })

    # ── Weekly chart (Mon–Sun): closed from TripData + open from TransactionData ──
    week_start = anchor - datetime.timedelta(days=anchor.weekday())
    week_end = week_start + datetime.timedelta(days=6)

    closed_weekly = {
        str(r['start_date']): {'total': r['total'] or 0, 'upi': r['upi'] or 0}
        for r in TripData.objects.filter(
            company_code=company,
            start_date__range=[week_start, week_end],
            is_closed=True,
        ).values('start_date').annotate(
            total=Sum('total_collection'),
            upi=Sum('upi_ticket_amount'),
        )
    }

    # Current: keyed on ticket_date
    # open_weekly = {
    #     str(r['ticket_date']): {'total': r['total'] or 0, 'upi': r['upi'] or 0}
    #     for r in TransactionData.objects.filter(
    #         company_code=company,
    #         ticket_date__range=[week_start, week_end],
    #         trip_id__is_closed=False,
    #     ).values('ticket_date').annotate(
    #         total=Sum('ticket_amount'),
    #         upi=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
    #     )
    # }

    # Alternate: keyed on the schedule's own start_date
    open_weekly = {
        str(r['schedule_id__start_date']): {'total': r['total'] or 0, 'upi': r['upi'] or 0}
        for r in TransactionData.objects.filter(
            company_code=company,
            schedule_id__start_date__range=[week_start, week_end],
            trip_id__is_closed=False,
        ).values('schedule_id__start_date').annotate(
            total=Sum('ticket_amount'),
            upi=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
        )
    }

    all_week_dates = sorted(set(closed_weekly.keys()) | set(open_weekly.keys()))
    weekly_chart = []
    for date in all_week_dates:
        rev = (closed_weekly.get(date, {}).get('total', 0)) + (open_weekly.get(date, {}).get('total', 0))
        upi = (closed_weekly.get(date, {}).get('upi', 0)) + (open_weekly.get(date, {}).get('upi', 0))
        weekly_chart.append({
            'date': date,
            'total': str(rev),
            'cash': str(rev - upi),
            'upi': str(upi),
        })


    # add some new for schedule data not working in apk (note: not removed old code)

    bus_lists = []

    # schedule_data = ScheduleData.objects.filter(
    #     company_code=company.id,
    #     start_date=date_str
    # )


    # schedule_data = ScheduleData.objects.filter(
    #     company_code=company.id
    # ).filter(
    #     Q(start_date=date_str) | Q(end_date__isnull=True)
    # )
    schedule_data = ScheduleData.objects.filter(
        company_code=company.id,
        start_date__lte=date_str
    ).order_by("-start_date", "-id")

    all_vehicle = VehicleType.objects.filter(
        company=company.id
    )

    for bus in all_vehicle:

        bus_no = str(bus.bus_reg_num)

        bus_schedules = schedule_data.filter(
            bus_no=bus_no
        )

        if bus_schedules.exists():

            # Latest schedule
            latest_data = bus_schedules.first()

            # Only get schedules with EXACT same start_date
            same_start_date = bus_schedules.filter(
                start_date=date_str
            )

            # Add only if start_date is exactly the requested date
            if str(latest_data.start_date) == str(date_str):
                cash_amt = sum(
                    data.total_collection or 0
                    for data in same_start_date
                )

                upi_amt = sum(
                    data.upi_total_collection or 0
                    for data in same_start_date
                )
            else:
                # Use only latest record
                cash_amt = latest_data.total_collection or 0
                upi_amt = latest_data.upi_total_collection or 0

            revenue = cash_amt + upi_amt

            status = (
                "Running"
                if latest_data.close_unique_code is None
                else "Not Running"
            )

            bus_data = {
                "bus_no": latest_data.bus_no,
                "status": status,
                "revenue": str(revenue),
                "cash_amt": str(cash_amt),
                "upi_amt": str(upi_amt),
                "sch_start_date": str(latest_data.start_date),
                "sch_end_date": str(latest_data.end_date)
            }

        else:
            bus_data = {
                "bus_no": bus.bus_reg_num,
                "status": "Not Running",
                "revenue": "0",
                "cash_amt": "0",
                "upi_amt": "0",
                "sch_start_date": "",
                "sch_end_date": ""
            }

        bus_lists.append(bus_data)
            

    return Response({
        'date': date_str,
        'total_revenue': str(total_revenue),
        'total_cash': str(total_revenue - total_upi),
        'total_upi': str(total_upi),
        'bus_on_road': running_count,
        'weekly_chart': weekly_chart,
        'bus_list': bus_lists,
    })


# GET /apk/trips
# Trips for a bus on a specific schedule and date.
# Params: bus_no, schedule_no, date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def apk_trips(request):
    user = request.user

    bus_no = request.GET.get('bus_no')
    schedule_no = request.GET.get('schedule_no')
    date_str = request.GET.get('date')

    if not bus_no or not schedule_no or not date_str:
        return Response({'error': 'bus_no, schedule_no and date are required'}, status=400)

    # Current: gated only on the trip's own start_date
    # trips = TripData.objects.filter(
    #     company_code=user.company,
    #     bus_no=bus_no,
    #     schedule_no=int(schedule_no),
    #     start_date=date_str,
    # ).select_related('route_id').order_by('trip_no')

    # Guard: only show trips whose own schedule also opened on this same date — a trip
    # that started today under a schedule opened yesterday (still open) is excluded.
    trips = TripData.objects.filter(
        company_code=user.company,
        bus_no=bus_no,
        schedule_no=int(schedule_no),
        start_date=date_str,
        schedule_id__start_date=date_str,
    ).select_related('route_id').order_by('trip_no')

    trip_list = []
    for t in trips:
        if t.is_closed:
            revenue = t.total_collection or 0
            upi_amt = t.upi_ticket_amount or 0
        else:
            live = TransactionData.objects.filter(
                company_code=user.company,
                trip_id=t,
            ).aggregate(
                total=Sum('ticket_amount'),
                upi=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
            )
            revenue = live['total'] or 0
            upi_amt = live['upi'] or 0

        cash_amt = revenue - upi_amt
        trip_list.append({
            'trip_no': t.trip_no,
            'status': 'open' if not t.is_closed else 'closed',
            'route_name': t.route_id.route_name if t.route_id else None,
            'route_code': t.route_id.route_code if t.route_id else None,
            'start_time': str(t.start_time) if t.start_time else None,
            'end_time': str(t.end_time) if t.end_time else None,
            'revenue': str(revenue),
            'cash_amt': str(cash_amt),
            'upi_amt': str(upi_amt),
        })

    return Response({
        'bus_no': bus_no,
        'schedule_no': schedule_no,
        'date': date_str,
        'trips': trip_list,
    })


# GET /apk/tickets
# Tickets for a specific trip with passenger type totals.
# Params: bus_no, schedule_no, trip_no, date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def apk_tickets(request):
    user = request.user

    bus_no = request.GET.get('bus_no')
    schedule_no = request.GET.get('schedule_no')
    trip_no = request.GET.get('trip_no')
    date_str = request.GET.get('date')

    # type of data required(full or partial)
    required_data_type = request.GET.get('data_type', None)
    ticket_id = request.GET.get('ticket_id')


    if not bus_no or not schedule_no or not trip_no or not date_str:
        return Response({'error': 'bus_no, schedule_no, trip_no and date are required'}, status=400)

    try:
        # Current: gated only on the trip's own start_date
        # trip = TripData.objects.get(
        #     company_code=user.company,
        #     bus_no=bus_no,
        #     schedule_no=int(schedule_no),
        #     trip_no=int(trip_no),
        #     start_date=date_str,
        # )

        # Guard: trip's own schedule must also have opened on this same date
        trip = TripData.objects.get(
            company_code=user.company,
            bus_no=bus_no,
            schedule_no=int(schedule_no),
            trip_no=int(trip_no),
            start_date=date_str,
            schedule_id__start_date=date_str,
        )
    except TripData.DoesNotExist:
        return Response({'error': 'Trip not found'}, status=404)

    # Stage map keyed by RouteStage PK — derived from the trip's own route
    stage_map = {}
    if trip.route_id:
        stage_map = {
            rs.id: rs.stage.stage_name
            for rs in RouteStage.objects.filter(route=trip.route_id).select_related('stage')
        }

    # Current: also gated on ticket_date — drops tickets punched after midnight
    # under the same still-open trip.
    # qs = TransactionData.objects.filter(
    #     company_code=user.company,
    #     trip_id=trip,
    #     ticket_date=date_str,
    # ).order_by('ticket_time')

    # trip_id already resolves to this exact trip row; all its tickets belong to
    # it regardless of which calendar date they were punched on.

    if required_data_type == "partial":
        qs = TransactionData.objects.filter(
            company_code=user.company,
            trip_id=trip,
            id__gt=ticket_id,
        ).order_by("ticket_time")

        if not qs.exists():
            return Response(
                {"message": "Current Ticket is latest"},
                status=200
            )

    elif required_data_type is None:
        qs = TransactionData.objects.filter(
            company_code=user.company,
            trip_id=trip,
        ).order_by("ticket_time")

    else:
        qs = TransactionData.objects.none()

    if not qs.exists():
        return Response(
            {"error": "Ticket not found"},
            status=404
        )

    totals = {'full': 0, 'half': 0, 'st': 0, 'phy': 0, 'lugg': 0, 'ladies': 0, 'senior': 0}
    ticket_list = []
    for t in qs:
        totals['full'] += t.full_count or 0
        totals['half'] += t.half_count or 0
        totals['st'] += t.st_count or 0
        totals['phy'] += t.phy_count or 0
        totals['lugg'] += t.lugg_count or 0
        totals['ladies'] += t.ladies_count or 0
        totals['senior'] += t.senior_count or 0
        ticket_list.append({
            'ticket_id': t.id,
            'ticket_no': t.ticket_number,
            'from_stage': stage_map.get(t.from_stage_id_id, str(t.from_stage) if t.from_stage is not None else None),
            'to_stage': stage_map.get(t.to_stage_id_id, str(t.to_stage) if t.to_stage is not None else None),
            'amount': str(t.ticket_amount),
            'payment_mode': PAYMENT_LABELS.get(t.ticket_status, 'Unknown'),
            'ticket_type': t.ticket_type,
            'full_count': t.full_count,
            'half_count': t.half_count,
            'st_count': t.st_count,
            'phy_count': t.phy_count,
            'lugg_count': t.lugg_count,
        })

    return Response({
        'bus_no': bus_no,
        'schedule_no': schedule_no,
        'trip_no': trip_no,
        'date': date_str,
        'passenger_totals': totals,
        'tickets': ticket_list,
    })


# GET /apk/passengers
# Stage-wise boarded/deboarded table for a trip; live header for open trips.
# Params: bus_no, schedule_no, trip_no, date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def apk_passengers(request):
    user = request.user

    bus_no = request.GET.get('bus_no')
    schedule_no = request.GET.get('schedule_no')
    trip_no = request.GET.get('trip_no')
    date_str = request.GET.get('date')

    if not bus_no or not schedule_no or not trip_no or not date_str:
        return Response({'error': 'bus_no, schedule_no, trip_no and date are required'}, status=400)

    try:
        # Current: gated only on the trip's own start_date
        # trip = TripData.objects.get(
        #     company_code=user.company,
        #     bus_no=bus_no,
        #     schedule_no=int(schedule_no),
        #     trip_no=int(trip_no),
        #     start_date=date_str,
        # )

        # Guard: trip's own schedule must also have opened on this same date
        trip = TripData.objects.get(
            company_code=user.company,
            bus_no=bus_no,
            schedule_no=int(schedule_no),
            trip_no=int(trip_no),
            start_date=date_str,
            schedule_id__start_date=date_str,
        )
    except TripData.DoesNotExist:
        return Response({'error': 'Trip not found'}, status=404)

    # Current: also gated on ticket_date — drops tickets punched after midnight
    # under the same still-open trip.
    # qs = TransactionData.objects.filter(
    #     company_code=user.company,
    #     trip_id=trip,
    #     ticket_date=date_str,
    # )

    qs = TransactionData.objects.filter(
        company_code=user.company,
        trip_id=trip,
    )

    # Route stages ordered by sequence — derived from the trip's own route
    route_stages = []
    if trip.route_id:
        route_stages = list(
            RouteStage.objects.filter(route=trip.route_id)
            .select_related('stage')
            .order_by('sequence_no')
        )

    # ── Header ────────────────────────────────────────────────────────────────
    status = 'open' if not trip.is_closed else 'closed'
    if status == 'open':
        last_ticket = qs.order_by('-ticket_time').values('to_stage_id_id', 'passenger_count').first()
        if last_ticket and last_ticket['to_stage_id_id']:
            try:
                rs = RouteStage.objects.select_related('stage').get(id=last_ticket['to_stage_id_id'])
                current_stage = rs.stage.stage_name
            except RouteStage.DoesNotExist:
                current_stage = None
        else:
            current_stage = None
        passengers_in_bus = last_ticket['passenger_count'] if last_ticket else None

        live = qs.aggregate(
            total=Sum('ticket_amount'),
            upi=Sum('ticket_amount', filter=Q(ticket_status='UPI')),
        )
        total_collection = live['total'] or 0
    else:
        current_stage = None
        passengers_in_bus = None
        total_collection = trip.total_collection or 0

    # ── Passenger totals ──────────────────────────────────────────────────────
    agg = qs.aggregate(
        full=Sum('full_count'), half=Sum('half_count'),
        st=Sum('st_count'), phy=Sum('phy_count'),
        lugg=Sum('lugg_count'), ladies=Sum('ladies_count'), senior=Sum('senior_count'),
    )
    passenger_totals = {k: v or 0 for k, v in agg.items()}

    # ── Stage table: keyed by RouteStage PK (from_stage_id_id / to_stage_id_id) ──
    empty = {'f': 0, 'h': 0, 'st': 0, 'ph': 0}

    boarded = {
        r['from_stage_id_id']: {
            'f': r['full'] or 0, 'h': r['half'] or 0,
            'st': r['st'] or 0, 'ph': r['phy'] or 0,
        }
        for r in qs.values('from_stage_id_id').annotate(
            full=Sum('full_count'), half=Sum('half_count'),
            st=Sum('st_count'), phy=Sum('phy_count'),
        )
        if r['from_stage_id_id'] is not None
    }

    deboarded = {
        r['to_stage_id_id']: {
            'f': r['full'] or 0, 'h': r['half'] or 0,
            'st': r['st'] or 0, 'ph': r['phy'] or 0,
        }
        for r in qs.values('to_stage_id_id').annotate(
            full=Sum('full_count'), half=Sum('half_count'),
            st=Sum('st_count'), phy=Sum('phy_count'),
        )
        if r['to_stage_id_id'] is not None
    }

    if route_stages:
        stage_table = [
            {
                'stage_name': rs.stage.stage_name,
                'boarded': boarded.get(rs.id, empty),
                'deboarded': deboarded.get(rs.id, empty),
            }
            for rs in route_stages
        ]
    else:
        # No route linked — fall back to raw stage IDs
        all_ids = sorted(set(boarded.keys()) | set(deboarded.keys()))
        stage_table = [
            {
                'stage_name': str(sid),
                'boarded': boarded.get(sid, empty),
                'deboarded': deboarded.get(sid, empty),
            }
            for sid in all_ids
        ]

    return Response({
        'bus_no': bus_no,
        'schedule_no': schedule_no,
        'trip_no': trip_no,
        'date': date_str,
        'header': {
            'status': status,
            'current_stage': current_stage,
            'passengers_in_bus': passengers_in_bus,
            'total_collection': str(total_collection),
        },
        'passenger_totals': passenger_totals,
        'stage_table': stage_table,
    })


# GET /reports/duty
# Duty report: all closed trips for a bus on a date, with crew and ticket range.
# Params: bus_no, date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def duty_report(request):
    user = request.user
    if not _meets_tier(user, 'intermediate'):
        return Response(_TIER_ERROR, status=403)

    bus_no = request.GET.get('bus_no')
    date_str = request.GET.get('date')

    if not bus_no or not date_str:
        return Response({'error': 'bus_no and date are required'}, status=400)

    trips = TripData.objects.filter(
        bus_no=bus_no,
        start_date=date_str,
        company_code=user.company,
    ).order_by('trip_no').values(
        'id', 'trip_no', 'start_time', 'start_ticket_no', 'end_ticket_no',
        'total_collection', 'is_closed', 'driver', 'conductor'
    )

    driver_name = None
    conductor_name = None
    trip_list = []
    for t in trips:
        if not driver_name and t['driver']:
            driver_name = t['driver']
        if not conductor_name and t['conductor']:
            conductor_name = t['conductor']

        if t['is_closed']:
            end_ticket = t['end_ticket_no']
            collection = str(t['total_collection'])
        else:
            # Current: also gated on ticket_date — drops tickets punched after midnight
            # under the same still-open trip.
            # live = TransactionData.objects.filter(
            #     company_code=user.company,
            #     trip_id=t['id'],
            #     ticket_date=date_str,
            # ).aggregate(live_collection=Sum('ticket_amount'))
            # last_ticket = TransactionData.objects.filter(
            #     company_code=user.company,
            #     trip_id=t['id'],
            #     ticket_date=date_str,
            # ).order_by('-ticket_time').values_list('ticket_number', flat=True).first()

            live = TransactionData.objects.filter(
                company_code=user.company,
                trip_id=t['id'],
            ).aggregate(live_collection=Sum('ticket_amount'))
            last_ticket = TransactionData.objects.filter(
                company_code=user.company,
                trip_id=t['id'],
            ).order_by('-ticket_time').values_list('ticket_number', flat=True).first()
            end_ticket = last_ticket
            collection = str(live['live_collection'] or '0.00')

        trip_list.append({
            'trip_no': t['trip_no'],
            'start_time': str(t['start_time']) if t['start_time'] else None,
            'start_ticket': t['start_ticket_no'],
            'end_ticket': end_ticket,
            'collection': collection,
        })

    return Response({
        'bus_no': bus_no,
        'date': date_str,
        'driver': driver_name,
        'conductor': conductor_name,
        'trips': trip_list,
    })


# GET /reports/bus-summary
# Per-date revenue and distance for a bus over a date range.
# Params: bus_no, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def bus_summary_report(request):
    user = request.user
    if not _meets_tier(user, 'intermediate'):
        return Response(_TIER_ERROR, status=403)

    bus_no = request.GET.get('bus_no')
    from_date = request.GET.get('from_date')
    to_date = request.GET.get('to_date')

    if not bus_no or not from_date or not to_date:
        return Response({'error': 'bus_no, from_date and to_date are required'}, status=400)

    closed_qs = TripData.objects.filter(
        company_code=user.company,
        bus_no=bus_no,
        start_date__range=[from_date, to_date],
        is_closed=True,
    ).values('start_date').annotate(
        revenue=Sum('total_collection'),
        distance=Sum('total_km'),
    )
    closed_map = {
        str(r['start_date']): {'revenue': r['revenue'] or 0, 'distance': r['distance'] or 0}
        for r in closed_qs
    }

    open_revenue = {
        str(r['ticket_date']): r['collection'] or 0
        for r in TransactionData.objects.filter(
            company_code=user.company,
            bus_no=bus_no,
            ticket_date__range=[from_date, to_date],
            trip_id__is_closed=False,
        ).values('ticket_date').annotate(collection=Sum('ticket_amount'))
    }

    open_distance = {}
    for trip in TripData.objects.filter(
        company_code=user.company,
        bus_no=bus_no,
        start_date__range=[from_date, to_date],
        is_closed=False,
        route_id__isnull=False,
    ).select_related('route_id'):
        last = TransactionData.objects.filter(
            company_code=user.company,
            trip_id=trip,
        ).order_by('-ticket_time').values('to_stage_id_id').first()
        if last and last['to_stage_id_id'] is not None:
            try:
                rs = RouteStage.objects.get(id=last['to_stage_id_id'])
                date_key = str(trip.start_date)
                open_distance[date_key] = open_distance.get(date_key, 0) + (rs.distance or 0)
            except RouteStage.DoesNotExist:
                pass

    all_dates = sorted(set(closed_map.keys()) | set(open_revenue.keys()) | set(open_distance.keys()))

    rows = [
        {
            'date': date,
            'revenue': str((closed_map.get(date, {}).get('revenue', 0)) + open_revenue.get(date, 0)),
            'distance': str((closed_map.get(date, {}).get('distance', 0)) + open_distance.get(date, 0)),
        }
        for date in all_dates
    ]

    return Response({'rows': rows})


# GET /reports/payment-type
# Per-date cash/UPI breakdown for a bus over a date range.
# Params: bus_no, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD),
#         payment_mode (cash | upi) — optional, returns both if omitted
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def payment_type_report(request):
    user = request.user
    if not _meets_tier(user, 'intermediate'):
        return Response(_TIER_ERROR, status=403)

    bus_no = request.GET.get('bus_no')
    from_date = request.GET.get('from_date')
    to_date = request.GET.get('to_date')
    payment_mode = request.GET.get('payment_mode', '').lower()

    if not bus_no or not from_date or not to_date:
        return Response({'error': 'bus_no, from_date and to_date are required'}, status=400)

    want_cash = payment_mode in ('', 'cash')
    want_upi = payment_mode in ('', 'upi')

    closed_map = {}
    for r in TripData.objects.filter(
        company_code=user.company,
        bus_no=bus_no,
        start_date__range=[from_date, to_date],
        is_closed=True,
    ).values('start_date').annotate(
        total=Sum('total_collection'),
        upi=Sum('upi_ticket_amount'),
    ):
        date = str(r['start_date'])
        upi = r['upi'] or 0
        total = r['total'] or 0
        closed_map[date] = {'cash': total - upi, 'upi': upi}

    open_map = {}
    for r in TransactionData.objects.filter(
        company_code=user.company,
        bus_no=bus_no,
        ticket_date__range=[from_date, to_date],
        trip_id__is_closed=False,
        ticket_status__in=['Cash', 'UPI'],
    ).values('ticket_date', 'ticket_status').annotate(amount=Sum('ticket_amount')):
        date = str(r['ticket_date'])
        if date not in open_map:
            open_map[date] = {'cash': 0, 'upi': 0}
        if r['ticket_status'] == 'Cash':
            open_map[date]['cash'] += r['amount'] or 0
        else:
            open_map[date]['upi'] += r['amount'] or 0

    all_dates = sorted(set(closed_map.keys()) | set(open_map.keys()))

    rows = []
    total_cash = 0
    total_upi = 0
    for date in all_dates:
        cash = closed_map.get(date, {}).get('cash', 0) + open_map.get(date, {}).get('cash', 0)
        upi = closed_map.get(date, {}).get('upi', 0) + open_map.get(date, {}).get('upi', 0)
        total_cash += cash
        total_upi += upi
        row = {'date': date}
        if want_cash:
            row['cash_amt'] = str(cash)
        if want_upi:
            row['upi_amt'] = str(upi)
        rows.append(row)

    totals = {}
    if want_cash:
        totals['total_cash'] = str(total_cash)
    if want_upi:
        totals['total_upi'] = str(total_upi)

    return Response({'rows': rows, 'totals': totals})


# GET /reports/farewise
# Fare-wise ticket count/revenue and per-trip passenger counts for a date range.
# Params: bus_no, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def farewise_report(request):
    user = request.user
    if not _meets_tier(user, 'intermediate'):
        return Response(_TIER_ERROR, status=403)

    bus_no = request.GET.get('bus_no')
    from_date = request.GET.get('from_date')
    to_date = request.GET.get('to_date')

    if not bus_no or not from_date or not to_date:
        return Response({'error': 'bus_no, from_date and to_date are required'}, status=400)

    fares = [
        {
            'fare': str(r['ticket_amount']),
            'ticket_count': r['ticket_count'],
            'revenue': str(r['revenue'] or '0.00'),
        }
        for r in TransactionData.objects.filter(
            company_code=user.company,
            bus_no=bus_no,
            ticket_date__range=[from_date, to_date],
        ).values('ticket_amount').annotate(
            ticket_count=Count('id'),
            revenue=Sum('ticket_amount'),
        ).order_by('ticket_amount')
    ]

    trips = TripData.objects.filter(
        company_code=user.company,
        bus_no=bus_no,
        start_date__range=[from_date, to_date],
    ).order_by('start_date', 'trip_no')

    open_trip_ids = [t.id for t in trips if not t.is_closed]
    open_agg = {}
    if open_trip_ids:
        for row in TransactionData.objects.filter(
            trip_id__in=open_trip_ids,
        ).values('trip_id').annotate(
            full=Sum('full_count'), half=Sum('half_count'),
            st=Sum('st_count'), phy=Sum('phy_count'),
            lugg=Sum('lugg_count'), ladies=Sum('ladies_count'), senior=Sum('senior_count'),
        ):
            open_agg[row['trip_id']] = row

    passenger_counts = []
    for t in trips:
        if t.is_closed:
            passenger_counts.append({
                'trip_no': t.trip_no,
                'date': str(t.start_date),
                'full': t.full_count or 0,
                'half': t.half_count or 0,
                'st': t.st_count or 0,
                'phy': t.physical_count or 0,
                'lugg': t.luggage_count or 0,
                'pass': t.pass_count or 0,
                'ladies': t.ladies_count or 0,
                'senior': t.senior_count or 0,
            })
        else:
            agg = open_agg.get(t.id, {})
            passenger_counts.append({
                'trip_no': t.trip_no,
                'date': str(t.start_date),
                'full': agg.get('full') or 0,
                'half': agg.get('half') or 0,
                'st': agg.get('st') or 0,
                'phy': agg.get('phy') or 0,
                'lugg': agg.get('lugg') or 0,
                'pass': 0,
                'ladies': agg.get('ladies') or 0,
                'senior': agg.get('senior') or 0,
            })

    return Response({
        'fares': fares,
        'passenger_counts': passenger_counts,
    })


# GET /reports/expense
# Returns expense data for a bus over a date range.
# Params: bus_no, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def expense_report(request):
    user = request.user
    if not _meets_tier(user, 'intermediate'):
        return Response(_TIER_ERROR, status=403)

    bus_no = request.GET.get('bus_no')
    from_date = request.GET.get('from_date')
    to_date = request.GET.get('to_date')

    if not bus_no or not from_date or not to_date:
        return Response({'error': 'bus_no, from_date and to_date are required'}, status=400)

    closed_revenue = {
        str(r['start_date']): r['collection'] or 0
        for r in TripData.objects.filter(
            company_code=user.company,
            bus_no=bus_no,
            start_date__range=[from_date, to_date],
            is_closed=True,
        ).values('start_date').annotate(collection=Sum('total_collection'))
    }

    open_revenue = {
        str(r['ticket_date']): r['collection'] or 0
        for r in TransactionData.objects.filter(
            company_code=user.company,
            bus_no=bus_no,
            ticket_date__range=[from_date, to_date],
            trip_id__is_closed=False,
        ).values('ticket_date').annotate(collection=Sum('ticket_amount'))
    }

    revenue_map = {
        date: closed_revenue.get(date, 0) + open_revenue.get(date, 0)
        for date in set(closed_revenue.keys()) | set(open_revenue.keys())
    }

    expense_map = {
        str(e['expense_date']): e['expense'] or 0
        for e in ExpenseData.objects.filter(
            company_code=user.company,
            bus_no=bus_no,
            expense_date__range=[from_date, to_date],
        ).values('expense_date').annotate(expense=Sum('expense_amount'))
    }

    all_dates = sorted(set(revenue_map.keys()) | set(expense_map.keys()))

    return Response({
        'rows': [
            {
                'date': date,
                'collection': str(revenue_map.get(date, 0)),
                'expense': str(expense_map.get(date, 0)),
            }
            for date in all_dates
        ]
    })


# GET /reports/aggregator-transactions
# Payment aggregator transaction posting data for the company on a given date.
# Params: date (YYYY-MM-DD)
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def aggregator_transaction_report(request):
    user = request.user
    
    from_date = request.GET.get('start_date')
    to_date = request.GET.get('end_date')

    if not from_date or not to_date:
        return Response({'error': 'start_date and end_date are required'}, status=400)

    if to_date < from_date:
        return Response({'error': 'Cannot process: end_date cannot be earlier than start_date'}, status=400)

    qs = AggregatorTransaction.objects.select_related('related_ticket').filter(
        company=user.company,
        transaction_date__gte=from_date,
        transaction_date__lte=to_date,
    ).order_by('-transaction_datetime')

    paginator = AggregatorTransactionPagination()
    page = paginator.paginate_queryset(qs, request)

    records = [
        {
            'Application Transaction ID': t.tgTransactionId,
            'Ticket Transaction ID': str(t.transactionID),
            'BQR Merchant ID': t.narration,
            'Ticket Date': t.transaction_date,
            'Ticket Time': t.transaction_time,
            'Ticket Number': t.related_ticket.ticket_number if t.related_ticket else '',
            'Palmtec ID': t.related_ticket.palmtec_id if t.related_ticket else '',
            'Payer ID': (
                t.transactionCardNumber[:3]
                + 'x' * (len(t.transactionCardNumber) - 7)
                + t.transactionCardNumber[-4:]
                if t.transactionCardNumber and len(t.transactionCardNumber) > 7
                else t.transactionCardNumber
            ),
            'Transaction Amount': str(t.transactionAmount),
        }
        for t in page
    ]

    response = paginator.get_paginated_response(records)
    response.data['start_date'] = from_date
    response.data['end_date'] = to_date
    return response



'''
    GET /report/payout-settlement
    return payout data for the company over a date range.
'''
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def payout_settlement_report_apk(request):
    user = request.user
    from_date = request.GET.get('start_date')
    to_date = request.GET.get('end_date')

    if not from_date or not to_date:
        return Response({'error': 'start_date and end_date are required'}, status=400)

    IST = ZoneInfo('Asia/Kolkata')
    from_dt = datetime.datetime.strptime(from_date, '%Y-%m-%d').replace(tzinfo=IST)
    to_dt = datetime.datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59, tzinfo=IST)

    payouts = AggregatorPayoutCallback.objects.filter(
        company=user.company,
        payoutDate__gte=from_dt,
        payoutDate__lte=to_dt,
    ).order_by('-payoutDate')

    paginator = AggregatorTransactionPagination()
    page = paginator.paginate_queryset(payouts, request)

    records = [
        {
            'statementId': p.statementId,
            'payoutAmount': str(p.payoutAmount/100),
            'utrNumber': p.utrNumber,
            'payoutDate': p.payoutDate.isoformat(),
            'payoutAccount': p.payoutAccount,
            'payoutBank': p.payoutBank,
            'payoutStatus': p.payoutStatus,
            'transaction_count': len(p.transactions),
        }
        for p in page
    ]

    response = paginator.get_paginated_response(records)
    response.data['start_date'] = from_date
    response.data['end_date'] = to_date
    return response