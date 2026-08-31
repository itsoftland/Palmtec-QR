import logging
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....models import Employee, EmployeeType, CrewAssignment, VehicleType
from ....serializers.masterdata import EmployeeSerializer, EmployeeTypeSerializer, CrewAssignmentSerializer
from ...utils import _get_authenticated_company_admin, _get_object_or_404


logger = logging.getLogger(__name__)


def _normalize_role_text(value):
    text = str(value or '').strip().upper()
    return ''.join(ch for ch in text if ch.isalnum())


def _role_matches_expected(emp_type_obj, expected_role):
    expected_normalized = _normalize_role_text(expected_role)
    if not expected_normalized:
        return False
    name_normalized = _normalize_role_text(getattr(emp_type_obj, 'emp_type_name', ''))
    return expected_normalized == name_normalized


def _validate_crew_member(employee_id, expected_type_code, company, field_label):
    try:
        emp = Employee.objects.select_related('emp_type').get(pk=employee_id, company=company)
    except Employee.DoesNotExist:
        return None, f'{field_label} not found in your company.'

    if not _role_matches_expected(emp.emp_type, expected_type_code):
        return None, f'Selected {field_label} is not of type {expected_type_code}.'

    return emp, None


def _validate_distinct_roles(driver_id, conductor_id):
    if str(driver_id) == str(conductor_id):
        return {'conductor': ['Conductor must be different from driver.']}
    return None


def _validation_failed(errors):
    return Response({'message': 'Validation failed', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)


def _validate_crew_assignment_payload(company, payload, exclude_assignment_id=None):
    errors = {}
    driver_id = payload.get('driver')
    conductor_id = payload.get('conductor')
    cleaner_id = payload.get('cleaner')
    vehicle_id = payload.get('vehicle')

    if not driver_id:
        errors.setdefault('driver', []).append('Driver is required.')
    if not conductor_id:
        errors.setdefault('conductor', []).append('Conductor is required.')
    if not vehicle_id:
        errors.setdefault('vehicle', []).append('Vehicle is required.')

    if driver_id and conductor_id:
        distinct_errors = _validate_distinct_roles(driver_id, conductor_id)
        if distinct_errors:
            for field, msgs in distinct_errors.items():
                errors.setdefault(field, []).extend(msgs)

    if driver_id:
        _, err_msg = _validate_crew_member(driver_id, 'DRIVER', company, 'Driver')
        if err_msg:
            errors.setdefault('driver', []).append(err_msg)

    if conductor_id:
        _, err_msg = _validate_crew_member(conductor_id, 'CONDUCTOR', company, 'Conductor')
        if err_msg:
            errors.setdefault('conductor', []).append(err_msg)

    if cleaner_id:
        _, err_msg = _validate_crew_member(cleaner_id, 'CLEANER', company, 'Cleaner')
        if err_msg:
            errors.setdefault('cleaner', []).append(err_msg)

    if vehicle_id:
        try:
            VehicleType.objects.get(pk=vehicle_id, company=company, is_deleted=False)
        except VehicleType.DoesNotExist:
            errors.setdefault('vehicle', []).append('Vehicle not found in your company.')

    if errors:
        return errors

    existing_qs = CrewAssignment.objects.filter(company=company)
    if exclude_assignment_id:
        existing_qs = existing_qs.exclude(pk=exclude_assignment_id)

    if existing_qs.filter(driver_id=driver_id).exists():
        errors.setdefault('driver', []).append('Selected driver is already assigned.')
    if existing_qs.filter(conductor_id=conductor_id).exists():
        errors.setdefault('conductor', []).append('Selected conductor is already assigned.')
    if cleaner_id and existing_qs.filter(cleaner_id=cleaner_id).exists():
        errors.setdefault('cleaner', []).append('Selected cleaner is already assigned.')
    if existing_qs.filter(vehicle_id=vehicle_id).exists():
        errors.setdefault('vehicle', []).append('Selected vehicle is already assigned.')

    return errors


# ── Employee Type ─────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_employee_types(request):
    user, company = _get_authenticated_company_admin(request)

    emp_types = EmployeeType.objects.filter(company=company).order_by('id')
    serializer = EmployeeTypeSerializer(emp_types, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_employee_type(request):
    user, company = _get_authenticated_company_admin(request)

    serializer = EmployeeTypeSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(company=company, created_by=user)
        return Response({'message': 'Employee type created successfully', 'data': serializer.data}, status=status.HTTP_201_CREATED)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_employee_type(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(EmployeeType, pk, company)
    if err:
        return err

    serializer = EmployeeTypeSerializer(obj, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save(updated_by=user)
        return Response({'message': 'Employee type updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Employee ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_employees(request):
    user, company = _get_authenticated_company_admin(request)

    show_deleted = request.query_params.get('show_deleted', 'false').lower() == 'true'
    qs = Employee.objects.filter(company=company)
    if show_deleted:
        qs = qs.filter(is_deleted=True)
    else:
        qs = qs.filter(is_deleted=False)

    qs = qs.select_related('emp_type').order_by('id')
    serializer = EmployeeSerializer(qs, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_employee(request):
    user, company = _get_authenticated_company_admin(request)

    serializer = EmployeeSerializer(data=request.data, context={'company': company})
    if serializer.is_valid():
        serializer.save(company=company, created_by=user)
        return Response({'message': 'Employee created successfully', 'data': serializer.data}, status=status.HTTP_201_CREATED)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_employee(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(Employee, pk, company)
    if err:
        return err

    serializer = EmployeeSerializer(obj, data=request.data, partial=True, context={'company': company})
    if serializer.is_valid():
        serializer.save(updated_by=user)
        return Response({'message': 'Employee updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Crew Assignment ───────────────────────────────────────────────────────────

@api_view(['GET'])
def get_crew_assignments(request):
    user, company = _get_authenticated_company_admin(request)

    qs = CrewAssignment.objects.filter(company=company).select_related(
        'driver', 'conductor', 'cleaner', 'vehicle'
    ).order_by('id')
    serializer = CrewAssignmentSerializer(qs, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_crew_assignment(request):
    user, company = _get_authenticated_company_admin(request)

    serializer_payload = {
        'driver': request.data.get('driver'),
        'conductor': request.data.get('conductor'),
        'cleaner': request.data.get('cleaner') or None,
        'vehicle': request.data.get('vehicle'),
    }
    errors = _validate_crew_assignment_payload(company, serializer_payload)
    if errors:
        return _validation_failed(errors)

    serializer = CrewAssignmentSerializer(data=serializer_payload)
    if serializer.is_valid():
        serializer.save(company=company, created_by=user)
        return Response({'message': 'Crew assignment created successfully', 'data': serializer.data}, status=status.HTTP_201_CREATED)

    return _validation_failed(serializer.errors)


@api_view(['PUT'])
def update_crew_assignment(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(CrewAssignment, pk, company)
    if err:
        return err

    serializer_payload = {
        'driver': request.data.get('driver', obj.driver_id),
        'conductor': request.data.get('conductor', obj.conductor_id),
        'cleaner': request.data.get('cleaner', obj.cleaner_id) or None,
        'vehicle': request.data.get('vehicle', obj.vehicle_id),
    }
    errors = _validate_crew_assignment_payload(company, serializer_payload, exclude_assignment_id=obj.id)
    if errors:
        return _validation_failed(errors)

    serializer = CrewAssignmentSerializer(obj, data=serializer_payload, partial=False)
    if serializer.is_valid():
        serializer.save(updated_by=user)
        return Response({'message': 'Crew assignment updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return _validation_failed(serializer.errors)


@api_view(['DELETE'])
def delete_crew_assignment(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(CrewAssignment, pk, company)
    if err:
        return err

    obj.delete()
    return Response({'message': 'Crew assignment deleted successfully'}, status=status.HTTP_200_OK)


# ── Dropdowns ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_employee_types_dropdown(request):
    user, company = _get_authenticated_company_admin(request)

    data = list(
        EmployeeType.objects.filter(company=company)
        .values('id', 'emp_type_name')
        .order_by('emp_type_name')
    )
    return Response({'message': 'Success', 'data': data}, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_employees_by_type_dropdown(request):
    user, company = _get_authenticated_company_admin(request)

    requested_role = request.query_params.get('type')
    exclude_assigned = request.query_params.get('exclude_assigned', 'false').lower() == 'true'
    assignment_id = request.query_params.get('assignment_id')

    qs = Employee.objects.filter(company=company, is_deleted=False).select_related('emp_type')
    if requested_role:
        matching_type_ids = [
            emp_type.id
            for emp_type in EmployeeType.objects.filter(company=company)
            if _role_matches_expected(emp_type, requested_role)
        ]
        qs = qs.filter(emp_type_id__in=matching_type_ids) if matching_type_ids else qs.none()

    if exclude_assigned and requested_role:
        role_key = _normalize_role_text(requested_role)
        field_map = {'DRIVER': 'driver_id', 'CONDUCTOR': 'conductor_id', 'CLEANER': 'cleaner_id'}
        assignment_field = field_map.get(role_key)
        if assignment_field:
            assigned_qs = CrewAssignment.objects.filter(company=company)
            if assignment_id and str(assignment_id).isdigit():
                assigned_qs = assigned_qs.exclude(id=int(assignment_id))
            assigned_ids = assigned_qs.exclude(**{f'{assignment_field}__isnull': True}).values_list(
                assignment_field, flat=True
            )
            qs = qs.exclude(id__in=assigned_ids)

    data = list(qs.values('id', 'employee_code', 'employee_name').order_by('employee_name'))
    return Response({'message': 'Success', 'data': data}, status=status.HTTP_200_OK)
