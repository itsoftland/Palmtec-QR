import logging
import io
from django.db import transaction, IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.views import APIView

from ....models import BusType, Stage, Route, VehicleType, RouteStage, RouteBusType, RouteDepot, Fare, Depot, UserRole
from django.db.models import Count
from ....serializers.masterdata import BusTypeSerializer, StageSerializer, RouteSerializer, RouteListSerializer, VehicleTypeSerializer
from ...utils import _get_authenticated_company_admin, _get_object_or_404


logger = logging.getLogger(__name__)


# ── Bus Type ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_bus_types(request):
    user, company = _get_authenticated_company_admin(request)

    bus_types = BusType.objects.filter(company=company).order_by('id')
    serializer = BusTypeSerializer(bus_types, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_bus_type(request):
    user, company = _get_authenticated_company_admin(request)

    serializer = BusTypeSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(company=company, created_by=user)
        return Response({'message': 'Bus type created successfully', 'data': serializer.data}, status=status.HTTP_201_CREATED)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_bus_type(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(BusType, pk, company)
    if err:
        return err

    serializer = BusTypeSerializer(obj, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save(updated_by=user)
        return Response({'message': 'Bus type updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Stage ─────────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_stages(request):
    user, company = _get_authenticated_company_admin(request)

    show_deleted = request.query_params.get('show_deleted', 'false').lower() == 'true'
    qs = Stage.objects.filter(company=company)
    if show_deleted:
        qs = qs.filter(is_deleted=True)
    else:
        qs = qs.filter(is_deleted=False)

    qs = qs.order_by('id')
    serializer = StageSerializer(qs, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_stage(request):
    user, company = _get_authenticated_company_admin(request)

    serializer = StageSerializer(data=request.data)
    if serializer.is_valid():
        try:
            serializer.save(company=company, created_by=user)
        except IntegrityError:
            return Response({'message': 'Validation failed', 'errors': {'stage_code': ['A stage with this code already exists.']}}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'message': 'Stage created successfully', 'data': serializer.data}, status=status.HTTP_201_CREATED)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_stage(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(Stage, pk, company)
    if err:
        return err

    serializer = StageSerializer(obj, data=request.data, partial=True)
    if serializer.is_valid():
        try:
            serializer.save(updated_by=user)
        except IntegrityError:
            return Response({'message': 'Validation failed', 'errors': {'stage_code': ['A stage with this code already exists.']}}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'message': 'Stage updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Route ─────────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_routes(request):
    user, company = _get_authenticated_company_admin(request)

    show_deleted = request.query_params.get('show_deleted', 'false').lower() == 'true'
    qs = Route.objects.filter(company=company)
    if show_deleted:
        qs = qs.filter(is_deleted=True)
    else:
        qs = qs.filter(is_deleted=False)

    qs = qs.select_related('bus_type').annotate(
        stage_count=Count('route_stages')
    ).order_by('id')

    serializer = RouteListSerializer(qs, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_route_detail(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(Route, pk, company)
    if err:
        return err

    obj = Route.objects.select_related('bus_type').prefetch_related(
        'route_stages__stage',
        'route_bus_types__bus_type',
        'route_depots__depot',
    ).get(pk=pk)

    serializer = RouteSerializer(obj)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_route(request):
    user, company = _get_authenticated_company_admin(request)

    serializer = RouteSerializer(data=request.data, context={'company': company})
    if serializer.is_valid():
        route = serializer.save(company=company, created_by=user)

        route_stages_data = request.data.get('route_stages', [])
        if route_stages_data:
            _save_route_stages(route, route_stages_data, company, user)

        allowed_bus_type_ids = request.data.get('allowed_bus_types', [])
        if allowed_bus_type_ids:
            _save_route_bus_types(route, allowed_bus_type_ids, company, user)

        route_with_nested = Route.objects.prefetch_related(
            'route_stages__stage',
            'route_bus_types__bus_type'
        ).get(pk=route.id)
        return_serializer = RouteSerializer(route_with_nested)

        return Response({'message': 'Route created successfully', 'data': return_serializer.data}, status=status.HTTP_201_CREATED)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_route(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(Route, pk, company)
    if err:
        return err

    serializer = RouteSerializer(obj, data=request.data, partial=True, context={'company': company})
    if serializer.is_valid():
        route = serializer.save(updated_by=user)

        if 'route_stages' in request.data:
            route_stages_data = request.data.get('route_stages', [])
            RouteStage.objects.filter(route=route).delete()
            if route_stages_data:
                _save_route_stages(route, route_stages_data, company, user)

        if 'allowed_bus_types' in request.data:
            allowed_bus_type_ids = request.data.get('allowed_bus_types', [])
            RouteBusType.objects.filter(route=route).delete()
            if allowed_bus_type_ids:
                _save_route_bus_types(route, allowed_bus_type_ids, company, user)

        if 'depot_ids' in request.data:
            depot_ids = request.data.get('depot_ids', [])
            RouteDepot.objects.filter(route=route).delete()
            if depot_ids:
                _save_route_depots(route, depot_ids, company, user)

        route_with_nested = Route.objects.prefetch_related(
            'route_stages__stage',
            'route_bus_types__bus_type',
            'route_depots__depot',
        ).get(pk=route.id)
        return_serializer = RouteSerializer(route_with_nested)

        return Response({'message': 'Route updated successfully', 'data': return_serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


def _find_similar_stages(stage_name, company):
    """
    Existing company stages whose name is a case-insensitive substring match
    of stage_name (either direction) but not an exact match — exact matches
    are silently reused elsewhere and never flagged as a "conflict".
    """
    q = stage_name.strip().lower()
    if not q:
        return []
    candidates = Stage.objects.filter(company=company, is_deleted=False).exclude(stage_name__iexact=stage_name)
    similar = []
    for s in candidates:
        sname = s.stage_name.lower()
        # Skip trivial substring hits against very short existing names (e.g. "A")
        # — a 1-2 char match against anything isn't a meaningful "similar name".
        if len(sname) < 3 and len(sname) < len(q):
            continue
        if q in sname or sname in q:
            similar.append(s)
    return similar


def _check_stage_similarity_conflicts(stages_data, company):
    """
    Dry-run over a route_stages payload: for every entry that would create a
    brand-new Stage (no `stage` id, no exact name match), flag it if a
    similarly-named stage already exists and the caller hasn't explicitly
    confirmed (`confirmed_similar: true`) that a new one is wanted anyway.
    """
    conflicts = []
    for idx, stage_data in enumerate(stages_data):
        if stage_data.get('stage'):
            continue
        stage_name = str(stage_data.get('stage_name', '')).strip()
        if not stage_name or stage_data.get('confirmed_similar'):
            continue
        if Stage.objects.filter(company=company, stage_name__iexact=stage_name, is_deleted=False).exists():
            continue
        similar = _find_similar_stages(stage_name, company)
        if similar:
            conflicts.append({
                'index': idx,
                'stage_name': stage_name,
                'similar_to': [{'id': s.id, 'stage_name': s.stage_name, 'stage_code': s.stage_code} for s in similar],
            })
    return conflicts


def _save_route_stages(route, stages_data, company, user):
    """
    Rename + distance only — a route's stops are fixed once created (via the
    wizard); this never creates a Stage. Renaming updates the shared Stage
    row in place, so it's reflected on every other route using that stage too.
    """
    stage_ids = [s['stage'] for s in stages_data if s.get('stage')]
    valid_stages = {
        s.id: s for s in Stage.objects.filter(id__in=stage_ids, company=company)
    }

    route_stages_to_create = []
    for stage_data in stages_data:
        stage_obj = valid_stages.get(stage_data.get('stage'))
        if not stage_obj:
            continue

        new_name = str(stage_data.get('stage_name', '')).strip()
        if new_name and new_name.isalnum() and new_name != stage_obj.stage_name:
            stage_obj.stage_name = new_name
            stage_obj.save(update_fields=['stage_name'])

        route_stages_to_create.append(
            RouteStage(
                route=route,
                stage=stage_obj,
                sequence_no=stage_data.get('sequence_no', 0),
                distance=stage_data.get('distance', 0),
                stage_local_lang=stage_data.get('stage_local_lang', ''),
                company=company,
                created_by=user
            )
        )

    if route_stages_to_create:
        RouteStage.objects.bulk_create(route_stages_to_create)


def _save_route_bus_types(route, bus_type_ids, company, user):
    valid_bus_types = BusType.objects.filter(id__in=bus_type_ids, company=company).values_list('id', flat=True)
    valid_bus_type_set = set(valid_bus_types)

    route_bus_types_to_create = []
    for bus_type_id in bus_type_ids:
        if bus_type_id not in valid_bus_type_set:
            continue
        route_bus_types_to_create.append(
            RouteBusType(
                route=route,
                bus_type_id=bus_type_id,
                company=company,
                created_by=user
            )
        )

    if route_bus_types_to_create:
        RouteBusType.objects.bulk_create(route_bus_types_to_create)


def _save_route_depots(route, depot_ids, company, user):
    valid_depots = Depot.objects.filter(id__in=depot_ids, company=company).values_list('id', flat=True)
    valid_depot_set = set(valid_depots)

    to_create = [
        RouteDepot(route=route, depot_id=depot_id, company=company, created_by=user)
        for depot_id in depot_ids
        if depot_id in valid_depot_set
    ]
    if to_create:
        RouteDepot.objects.bulk_create(to_create, ignore_conflicts=True)


# ── Vehicle ───────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_vehicles(request):
    user, company = _get_authenticated_company_admin(request)

    show_deleted = request.query_params.get('show_deleted', 'false').lower() == 'true'
    qs = VehicleType.objects.filter(company=company)
    if show_deleted:
        qs = qs.filter(is_deleted=True)
    else:
        qs = qs.filter(is_deleted=False)

    qs = qs.select_related('bus_type').order_by('id')
    serializer = VehicleTypeSerializer(qs, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_vehicle(request):
    user, company = _get_authenticated_company_admin(request)

    serializer = VehicleTypeSerializer(data=request.data, context={'company': company})
    if serializer.is_valid():
        serializer.save(company=company, created_by=user)
        return Response({'message': 'Vehicle created successfully', 'data': serializer.data}, status=status.HTTP_201_CREATED)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_vehicle(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(VehicleType, pk, company)
    if err:
        return err

    serializer = VehicleTypeSerializer(obj, data=request.data, partial=True, context={'company': company})
    if serializer.is_valid():
        serializer.save(updated_by=user)
        return Response({'message': 'Vehicle updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Dropdowns ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_bus_types_dropdown(request):
    user, company = _get_authenticated_company_admin(request)

    data = list(
        BusType.objects.filter(company=company, is_active=True)
        .values('id', 'bustype_code', 'name')
        .order_by('name')
    )
    return Response({'message': 'Success', 'data': data}, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_stages_dropdown(request):
    user, company = _get_authenticated_company_admin(request)

    data = list(
        Stage.objects.filter(company=company, is_deleted=False)
        .values('id', 'stage_code', 'stage_name')
        .order_by('stage_name')
    )
    return Response({'message': 'Success', 'data': data}, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_vehicles_dropdown(request):
    user, company = _get_authenticated_company_admin(request)

    from ....models import CrewAssignment
    exclude_assigned = request.query_params.get('exclude_assigned', 'false').lower() == 'true'
    assignment_id = request.query_params.get('assignment_id')

    qs = VehicleType.objects.filter(company=company, is_deleted=False)
    if exclude_assigned:
        assigned_qs = CrewAssignment.objects.filter(company=company)
        if assignment_id and str(assignment_id).isdigit():
            assigned_qs = assigned_qs.exclude(id=int(assignment_id))
        assigned_vehicle_ids = assigned_qs.values_list('vehicle_id', flat=True)
        qs = qs.exclude(id__in=assigned_vehicle_ids)

    data = list(qs.values('id', 'bus_reg_num').order_by('bus_reg_num'))
    return Response({'message': 'Success', 'data': data}, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_depots_dropdown(request):
    user, company = _get_authenticated_company_admin(request)

    data = list(
        Depot.objects.filter(company=company)
        .values('id', 'depot_code', 'depot_name')
        .order_by('depot_name')
    )
    return Response({'message': 'Success', 'data': data}, status=status.HTTP_200_OK)


# ── Fare Editor ───────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_fare_editor(request, route_id):
    user, company = _get_authenticated_company_admin(request)

    route, err = _get_object_or_404(Route, route_id, company)
    if err:
        return err

    stages = route.route_stages.select_related('stage').order_by('sequence_no')
    stage_list = [{
        'sequence_no': rs.sequence_no,
        'stage_id': rs.stage.id,
        'stage_code': rs.stage.stage_code,
        'stage_name': rs.stage.stage_name,
    } for rs in stages]

    n_stages = len(stage_list)

    if n_stages == 0:
        return Response({
            'message': 'No stages defined for this route',
            'data': {
                'route': {'id': route.id, 'route_code': route.route_code, 'route_name': route.route_name, 'fare_type': route.fare_type},
                'stages': [],
                'fare_type_name': 'Table Fare' if route.fare_type == 1 else 'Graph Fare',
                'fare_list': [],
                'fare_matrix': [],
            }
        }, status=status.HTTP_200_OK)

    fares = Fare.objects.filter(route=route).order_by('row', 'col')

    if route.fare_type == 1:
        # Support both wizard/edit convention (row=1, col=stage_idx)
        # and MDB-imported convention (row=stage_idx, col=0 or row=0)
        fare_dict_col = {f.col: f.fare_amount for f in fares if f.row == 1 and f.col > 0}
        fare_dict_row = {f.row: f.fare_amount for f in fares if f.col == 0 and f.row > 0}
        fare_list = [
            fare_dict_col.get(i + 1, fare_dict_row.get(i + 1, 0))
            for i in range(n_stages)
        ]
        return Response({
            'message': 'Success',
            'data': {
                'route': {'id': route.id, 'route_code': route.route_code, 'route_name': route.route_name, 'fare_type': route.fare_type},
                'stages': stage_list,
                'fare_type_name': 'Table Fare (Distance-Based)',
                'fare_list': fare_list,
            }
        }, status=status.HTTP_200_OK)

    else:
        # DB convention: row=from_stage (1-indexed), col=to_stage-1
        # fare_matrix[i] has (i+1) entries: fare_matrix[i][j] = fare from stage j+1 to stage i+2
        fare_dict = {(f.row, f.col): f.fare_amount for f in fares}
        fare_matrix = []
        for row_idx in range(1, n_stages):   # row_idx = 1..N-1, to_stage = row_idx+1
            row_data = []
            for col_idx in range(row_idx):   # from_stage = col_idx+1
                # DB key: (from_stage, to_stage-1) = (col_idx+1, row_idx)
                fare_amount = fare_dict.get((col_idx + 1, row_idx), 0)
                row_data.append(fare_amount)
            fare_matrix.append(row_data)
        return Response({
            'message': 'Success',
            'data': {
                'route': {'id': route.id, 'route_code': route.route_code, 'route_name': route.route_name, 'fare_type': route.fare_type},
                'stages': stage_list,
                'fare_type_name': 'Graph Fare (Point-to-Point)',
                'fare_matrix': fare_matrix,
            }
        }, status=status.HTTP_200_OK)


@api_view(['POST'])
def update_fare_table(request, route_id):
    user, company = _get_authenticated_company_admin(request)

    route, err = _get_object_or_404(Route, route_id, company)
    if err:
        return err

    stages = route.route_stages.order_by('sequence_no')
    n_stages = stages.count()

    if n_stages == 0:
        return Response({'message': 'No stages defined for this route. Add stops before creating fares.'}, status=status.HTTP_400_BAD_REQUEST)

    Fare.objects.filter(route=route).delete()
    fares_to_create = []

    if route.fare_type == 1:
        fare_list = request.data.get('fare_list', [])
        if not fare_list or not isinstance(fare_list, list):
            return Response({'message': 'Invalid fare_list format. Expected 1D array.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(fare_list) != n_stages:
            return Response({'message': f'fare_list must have {n_stages} entries (number of stages).'}, status=status.HTTP_400_BAD_REQUEST)

        for col_idx, fare_amount in enumerate(fare_list):
            if fare_amount == 0 and col_idx != 0:
                continue
            fares_to_create.append(
                Fare(route=route, row=1, col=col_idx + 1, fare_amount=int(fare_amount), route_name=route.route_name, company=company, created_by=user)
            )

    else:
        # GRAPH fare: lower-triangular matrix, (n-1) rows, row i has (i+1) entries
        fare_matrix = request.data.get('fare_matrix', [])
        if not fare_matrix or not isinstance(fare_matrix, list):
            return Response({'message': 'Invalid fare_matrix format.'}, status=status.HTTP_400_BAD_REQUEST)
        expected_rows = n_stages - 1
        if len(fare_matrix) != expected_rows:
            return Response({'message': f'fare_matrix must have {expected_rows} rows for Graph fare.'}, status=status.HTTP_400_BAD_REQUEST)
        for i, row in enumerate(fare_matrix):
            if not isinstance(row, list) or len(row) != i + 1:
                return Response({'message': f'Row {i} must have {i + 1} entries.'}, status=status.HTTP_400_BAD_REQUEST)

        for i, row in enumerate(fare_matrix):
            for j, fare_amount in enumerate(row):
                # DB convention: row=from_stage (j+1), col=to_stage-1 (i+1)
                actual_row = j + 1   # from_stage
                actual_col = i + 1   # to_stage - 1
                if fare_amount == 0:
                    continue
                fares_to_create.append(
                    Fare(route=route, row=actual_row, col=actual_col, fare_amount=int(fare_amount), route_name=route.route_name, company=company, created_by=user)
                )

    if fares_to_create:
        Fare.objects.bulk_create(fares_to_create)

    fare_type_name = 'Table Fare' if route.fare_type == 1 else 'Graph Fare'
    return Response({'message': f'{fare_type_name} updated successfully. {len(fares_to_create)} fare records created.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_route_wizard(request):
    """
    Creates a route, its stages, and fare data in one atomic transaction.
    Replaces the 3-step wizard flow: route info → fare entry → stage names.
    """
    user, company = _get_authenticated_company_admin(request)

    data = request.data
    route_code   = str(data.get('route_code', '')).strip()
    route_name   = str(data.get('route_name', '')).strip()
    min_fare     = data.get('min_fare')
    fare_type_raw = data.get('fare_type')
    bus_type_id  = data.get('bus_type')
    stages_data  = data.get('stages', [])

    if not all([route_code, route_name, min_fare is not None, fare_type_raw, bus_type_id]):
        return Response(
            {'message': 'route_code, route_name, min_fare, fare_type, and bus_type are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not stages_data or not isinstance(stages_data, list) or len(stages_data) == 0:
        return Response({'message': 'At least one stage is required.'}, status=status.HTTP_400_BAD_REQUEST)

    for idx, stage_data in enumerate(stages_data):
        if not stage_data.get('stage') and not str(stage_data.get('stage_name', '')).strip():
            return Response({'message': f'Stage entry #{idx + 1} is missing a name.'}, status=status.HTTP_400_BAD_REQUEST)

    conflicts = _check_stage_similarity_conflicts(stages_data, company)
    if conflicts:
        return Response(
            {'message': 'Some stage names look similar to existing stages. Confirm to proceed.', 'similar_stage_conflicts': conflicts},
            status=status.HTTP_409_CONFLICT,
        )

    try:
        fare_type = int(fare_type_raw)
    except (ValueError, TypeError):
        return Response({'message': 'Invalid fare_type.'}, status=status.HTTP_400_BAD_REQUEST)

    n_stages = len(stages_data)

    if fare_type == 2 and n_stages <= 2:
        return Response(
            {'message': 'No of stages should be greater than 2 in Graph fare.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    fare_list   = data.get('fare_list', [])
    fare_matrix = data.get('fare_matrix', [])

    if fare_type == 1:
        if not isinstance(fare_list, list) or len(fare_list) != n_stages:
            return Response(
                {'message': f'fare_list must have exactly {n_stages} entries.'},
                status=status.HTTP_400_BAD_REQUEST
            )
    else:
        # GRAPH fare uses lower-triangular matrix: (n-1) rows, row i has (i+1) entries
        expected_rows = n_stages - 1
        if not isinstance(fare_matrix, list) or len(fare_matrix) != expected_rows:
            return Response(
                {'message': f'fare_matrix must have exactly {expected_rows} rows for Graph fare.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        for i, row in enumerate(fare_matrix):
            if not isinstance(row, list) or len(row) != i + 1:
                return Response(
                    {'message': f'fare_matrix row {i + 1} must have {i + 1} entries.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

    try:
        with transaction.atomic():
            try:
                bus_type_obj = BusType.objects.get(id=int(bus_type_id), company=company)
            except (BusType.DoesNotExist, ValueError):
                return Response({'message': 'Invalid bus type.'}, status=status.HTTP_400_BAD_REQUEST)

            route = Route.objects.create(
                route_code=route_code,
                route_name=route_name,
                min_fare=min_fare,
                fare_type=fare_type,
                bus_type=bus_type_obj,
                half=bool(data.get('half', False)),
                luggage=bool(data.get('luggage', False)),
                adjust=bool(data.get('adjust', False)),
                conc=bool(data.get('conc', False)),
                ph=bool(data.get('ph', False)),
                pass_allow=bool(data.get('pass_allow', False)),
                start_from=int(data.get('start_from', 0)),
                company=company,
                created_by=user,
            )

            used_codes = set(
                Stage.objects.filter(company=company).values_list('stage_code', flat=True)
            )
            existing_numeric_codes = [int(c) for c in used_codes if c.isdigit()]
            next_code = max(existing_numeric_codes, default=1000) + 1
            name_cache = {}

            for idx, stage_data in enumerate(stages_data):
                stage_id   = stage_data.get('stage')
                stage_name = str(stage_data.get('stage_name', '')).strip()
                distance   = stage_data.get('distance', 0)
                seq        = idx + 1

                stage_obj = None
                if stage_id:
                    stage_obj = Stage.objects.filter(id=stage_id, company=company).first()

                if not stage_obj and stage_name:
                    cache_key = stage_name.lower()
                    stage_obj = name_cache.get(cache_key)
                    if not stage_obj:
                        stage_obj = Stage.objects.filter(
                            company=company, stage_name__iexact=stage_name, is_deleted=False
                        ).first()

                if not stage_obj and stage_name:
                    stage_code = str(stage_data.get('stage_code', '')).strip()
                    if not stage_code.isdigit() or stage_code in used_codes:
                        stage_code = str(next_code)
                        while stage_code in used_codes:
                            next_code += 1
                            stage_code = str(next_code)
                    used_codes.add(stage_code)
                    next_code += 1

                    stage_obj = Stage.objects.create(
                        stage_code=stage_code,
                        stage_name=stage_name,
                        company=company,
                        created_by=user,
                    )

                if not stage_obj:
                    continue
                name_cache[stage_obj.stage_name.lower()] = stage_obj

                RouteStage.objects.create(
                    route=route,
                    stage=stage_obj,
                    sequence_no=seq,
                    distance=distance,
                    company=company,
                    created_by=user,
                )

            fares_to_create = []
            if fare_type == 1:
                for col_idx, fare_amount in enumerate(fare_list):
                    if int(fare_amount or 0) == 0 and col_idx != 0:
                        continue
                    fares_to_create.append(
                        Fare(route=route, row=1, col=col_idx + 1,
                             fare_amount=int(fare_amount or 0),
                             route_name=route.route_name,
                             company=company, created_by=user)
                    )
            else:
                # fare_matrix is lower-triangular: row i has (i+1) entries
                # fare_matrix[i][j] = fare from stage j+1 to stage i+2
                # DB convention: row=from_stage (j+1), col=to_stage-1 (i+1)
                for i, row_data in enumerate(fare_matrix):
                    for j, fare_amount in enumerate(row_data):
                        actual_row = j + 1  # from_stage
                        actual_col = i + 1  # to_stage - 1
                        if int(fare_amount or 0) == 0:
                            continue
                        fares_to_create.append(
                            Fare(route=route, row=actual_row, col=actual_col,
                                 fare_amount=int(fare_amount),
                                 route_name=route.route_name,
                                 company=company, created_by=user)
                        )

            if fares_to_create:
                Fare.objects.bulk_create(fares_to_create)

            depot_ids = data.get('depot_ids', [])
            if depot_ids and isinstance(depot_ids, list):
                _save_route_depots(route, depot_ids, company, user)

            route_final = Route.objects.prefetch_related(
                'route_stages__stage', 'route_bus_types__bus_type', 'route_depots__depot',
            ).get(pk=route.id)
            return Response(
                {'message': 'Route created successfully', 'data': RouteSerializer(route_final).data},
                status=status.HTTP_201_CREATED
            )

    except Exception as e:
        logger.error(f"create_route_wizard error: {e}")
        return Response(
            {'message': f'Failed to create route: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['PUT'])
def update_route_stage(request, pk):
    """
    Update the stage_name and/or distance for a single RouteStage entry.
    Matches EXE's 'Edit Data > Stage' functionality.
    """
    user, company = _get_authenticated_company_admin(request)

    try:
        rs = RouteStage.objects.select_related('stage', 'route').get(
            pk=pk, route__company=company
        )
    except RouteStage.DoesNotExist:
        return Response({'message': 'Route stage not found.'}, status=status.HTTP_404_NOT_FOUND)

    stage_name = str(request.data.get('stage_name', '')).strip()
    distance   = request.data.get('distance')

    if stage_name:
        rs.stage.stage_name = stage_name
        rs.stage.save(update_fields=['stage_name'])

    if distance is not None:
        rs.distance = distance
        rs.save(update_fields=['distance'])

    return Response({
        'message': 'Stage updated successfully',
        'data': {
            'id': rs.id,
            'sequence_no': rs.sequence_no,
            'stage_name': rs.stage.stage_name,
            'distance': rs.distance,
        }
    }, status=status.HTTP_200_OK)


# ── Route Excel Import ────────────────────────────────────────────────────────

class RouteExcelImportView(APIView):
    """
    POST /masterdata/routes/import-excel
    multipart/form-data: file (.xlsx)

    Expected columns (row 1 = headers, row 2+ = data):
      route_code, route_name, min_fare, fare_type (1=Table/2=Graph),
      bus_type (bus type name), half, luggage, adjust,
      conc, ph, pass_allow  (all flags: 0 or 1)

    Returns JSON with created/skipped counts and per-row errors.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = self.request.user
        if user.role != UserRole.COMPANY_ADMIN:
            return Response({'message': 'Only company admins can import routes.'}, status=status.HTTP_403_FORBIDDEN)
        company = user.company
        if not company:
            return Response({'message': 'No company mapped to this user.'}, status=status.HTTP_400_BAD_REQUEST)

        excel_file = request.FILES.get('file')
        if not excel_file:
            return Response({'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not excel_file.name.lower().endswith('.xlsx'):
            return Response({'message': 'Only .xlsx files are accepted.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            import openpyxl
        except ImportError:
            return Response({'message': 'openpyxl is not installed on the server. Run: pip install openpyxl'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            wb = openpyxl.load_workbook(io.BytesIO(excel_file.read()), data_only=True)
            ws = wb.active
        except Exception as e:
            return Response({'message': f'Failed to read Excel file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        rows = list(ws.iter_rows(values_only=True))
        if len(rows) < 2:
            return Response({'message': 'Excel file has no data rows (need header + at least 1 data row).'}, status=status.HTTP_400_BAD_REQUEST)

        header = [str(h or '').strip().lower() for h in rows[0]]
        required_cols = {'route_code', 'route_name', 'min_fare', 'fare_type', 'bus_type'}
        missing = required_cols - set(header)
        if missing:
            return Response({'message': f'Missing required columns: {", ".join(sorted(missing))}'}, status=status.HTTP_400_BAD_REQUEST)

        def col(row_dict, key, default=''):
            return str(row_dict.get(key, '') or '').strip()

        def to_bool(val):
            try:
                return bool(int(float(str(val or 0))))
            except (ValueError, TypeError):
                return False

        # Pre-load bus types for fast lookup
        bus_type_map = {bt.name.strip().lower(): bt for bt in BusType.objects.filter(company=company)}

        created = 0
        skipped = 0
        errors = []

        for i, row_values in enumerate(rows[1:], start=2):
            row_dict = dict(zip(header, row_values))
            route_code = col(row_dict, 'route_code').upper()
            route_name = col(row_dict, 'route_name')
            bus_type_name = col(row_dict, 'bus_type').lower()

            try:
                if not route_code:
                    raise ValueError('route_code is empty')
                if len(route_code) != 4 or not route_code.isalnum():
                    raise ValueError(f'route_code must be exactly 4 alphanumeric characters, got "{route_code}"')
                if not route_name:
                    raise ValueError('route_name is empty')

                try:
                    min_fare = float(col(row_dict, 'min_fare') or 0)
                except ValueError:
                    raise ValueError('min_fare must be numeric')

                try:
                    fare_type = int(float(col(row_dict, 'fare_type') or 1))
                    if fare_type not in (1, 2):
                        raise ValueError()
                except ValueError:
                    raise ValueError('fare_type must be 1 (Table) or 2 (Graph)')

                bus_type_obj = bus_type_map.get(bus_type_name)
                if not bus_type_obj:
                    available = ', '.join(sorted(bus_type_map.keys())) or 'none'
                    raise ValueError(f'bus_type "{bus_type_name}" not found. Available: {available}')

                with transaction.atomic():
                    _, was_created = Route.objects.get_or_create(
                        company=company,
                        route_code=route_code,
                        defaults={
                            'route_name':  route_name,
                            'min_fare':    min_fare,
                            'fare_type':   fare_type,
                            'bus_type':    bus_type_obj,
                            'half':        to_bool(row_dict.get('half')),
                            'luggage':     to_bool(row_dict.get('luggage')),
                            'adjust':      to_bool(row_dict.get('adjust')),
                            'conc':        to_bool(row_dict.get('conc')),
                            'ph':          to_bool(row_dict.get('ph')),
                            'pass_allow':  to_bool(row_dict.get('pass_allow')),
                            'created_by':  user,
                        }
                    )

                if was_created:
                    created += 1
                else:
                    skipped += 1
                    errors.append(f'Row {i}: route_code "{route_code}" already exists — skipped')

            except Exception as e:
                skipped += 1
                errors.append(f'Row {i}: {str(e)}')

        return Response({
            'message': f'Import complete. {created} created, {skipped} skipped.',
            'created': created,
            'skipped': skipped,
            'errors':  errors,
        }, status=status.HTTP_200_OK)
