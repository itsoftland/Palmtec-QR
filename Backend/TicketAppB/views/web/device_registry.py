"""
ETM Device Registry Views
=========================
Production uploads an Excel of serial numbers → Stock.
Superadmin bulk-assigns to dealer (DealerPool) or directly to company (Allocated).
Dealer assigns from their pool to a client company (Allocated).

  POST  /etm-devices/upload              — Excel upload of serial numbers (superadmin)
  GET   /etm-devices                     — List devices (role-scoped)
  GET   /etm-devices/summary             — Count breakdown by status (role-scoped)
  POST  /etm-devices/bulk-assign-dealer  — Assign serial numbers to dealer pool (superadmin)
  POST  /etm-devices/bulk-assign-company — Assign serial numbers directly to company (superadmin)
  POST  /etm-devices/<id>/allocate       — Dealer allocates one pool device to a client company
  POST  /etm-devices/<id>/deactivate     — Suspend device (sets is_active=False)
  POST  /etm-devices/<id>/reactivate    — Re-enable a suspended device
  DELETE /etm-devices/<id>/delete        — Permanently delete a Stock device (superadmin)
"""

import io
import json
import logging
import re
import openpyxl

from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ...models import ETMDevice, Company, Dealer, AuditLog, UserRole, SettingsProfile
from ...serializers.devices import ETMDeviceSerializer
from ...permissions import LicensePermission
from ..utils import (
    _is_superadmin,
    _is_executive,
    _is_dealer_admin,
    _is_company_admin,
    _is_superadmin_or_executive,
)
from .audit_logs import log_action

logger = logging.getLogger(__name__)


# ── Scope helper ──────────────────────────────────────────────────────────────

def _device_qs_for_user(user):
    qs = ETMDevice.objects.select_related('company', 'dealer', 'created_by')

    if _is_superadmin(user):
        return qs

    if user.role == UserRole.PRODUCTION:
        # Production users see only the devices they uploaded
        return qs.filter(created_by=user)

    if _is_executive(user):
        # Executive sees devices for companies they created.
        # TODO Phase 4: also restrict by executive's state (CustomUser.state).
        company_ids = Company.objects.filter(
            created_by=user, is_active=True
        ).values_list('id', flat=True)
        return qs.filter(company_id__in=company_ids)

    if _is_dealer_admin(user):
        if not user.dealer_id:
            return qs.none()
        return qs.filter(dealer_id=user.dealer_id)

    if _is_company_admin(user):
        if not user.company_id:
            return qs.none()
        return qs.filter(
            company_id=user.company_id,
            allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
        )

    return qs.none()


# ── Views ─────────────────────────────────────────────────────────────────────

class DeviceUploadView(APIView):
    """
    POST /etm-devices/upload
    Accepts .xlsx with header row containing 'serial_number'.
    Creates Stock records; skips duplicates. Superadmin only.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = self.request.user
        if not (_is_superadmin(user) or user.role == UserRole.PRODUCTION):
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        excel_file = request.FILES.get('file')
        if not excel_file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        if not excel_file.name.lower().endswith('.xlsx'):
            return Response({'error': 'Only .xlsx files are accepted'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            wb = openpyxl.load_workbook(io.BytesIO(excel_file.read()), data_only=True)
        except Exception as e:
            return Response({'error': f'Cannot read file: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return Response({'error': 'File is empty'}, status=status.HTTP_400_BAD_REQUEST)

        header_row_idx = None
        col_idx = None
        for i, row in enumerate(rows):
            headers = [str(h or '').strip().lower() for h in row]
            if 'serial_number' in headers:
                header_row_idx = i
                col_idx = headers.index('serial_number')
                break
        if header_row_idx is None:
            return Response({'error': 'Column "serial_number" not found in header row'}, status=status.HTTP_400_BAD_REQUEST)

        serials = []
        for row in rows[header_row_idx + 1:]:
            val = row[col_idx] if col_idx < len(row) else None
            if val is not None and str(val).strip():
                serials.append(str(val).strip())

        if not serials:
            return Response({'error': 'No serial numbers found in file'}, status=status.HTTP_400_BAD_REQUEST)

        # Deduplicate within the file preserving order
        serials = list(dict.fromkeys(serials))

        existing = set(
            ETMDevice.objects.filter(serial_number__in=serials).values_list('serial_number', flat=True)
        )
        new_serials = [s for s in serials if s not in existing]

        ETMDevice.objects.bulk_create([
            ETMDevice(
                serial_number=s,
                device_type=ETMDevice.DeviceType.ETM,
                allocation_status=ETMDevice.AllocationStatus.STOCK,
                created_by=user,
            )
            for s in new_serials
        ])

        log_action(
            actor=user, action=AuditLog.ActionType.SERIAL_UPLOAD,
            target_model='ETMDevice',
            details={'created': len(new_serials), 'skipped': len(existing)},
            ip_address=request.META.get('REMOTE_ADDR'),
        )

        logger.info(f"Device upload by {user}: {len(new_serials)} created, {len(existing)} skipped")
        return Response({
            'message': f'{len(new_serials)} device(s) added to stock.',
            'created': len(new_serials),
            'skipped': len(existing),
            'skipped_serials': sorted(existing),
        }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def list_devices(request):
    """
    List devices scoped to the requesting user's role.
    Query params: ?status=Stock|DealerPool|Allocated|Inactive  ?dealer=<id>  ?company=<id>
    """
    user = request.user

    qs = _device_qs_for_user(user)

    filter_status = request.query_params.get('status')
    if filter_status:
        qs = qs.filter(allocation_status=filter_status)

    filter_company = request.query_params.get('company')
    if filter_company:
        qs = qs.filter(company_id=filter_company)

    filter_dealer = request.query_params.get('dealer')
    if filter_dealer and _is_superadmin_or_executive(user):
        qs = qs.filter(dealer_id=filter_dealer)

    qs = qs.order_by('-created_at')
    return Response({'message': 'Success', 'data': ETMDeviceSerializer(qs, many=True).data}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def device_summary(request):
    """Count breakdown by allocation_status, scoped to the user."""
    user = request.user

    qs = _device_qs_for_user(user)
    by_status = {s: 0 for s in ETMDevice.AllocationStatus.values}
    for row in qs.values('allocation_status').annotate(n=Count('id')):
        by_status[row['allocation_status']] = row['n']

    by_dealer = []
    if _is_superadmin_or_executive(user):
        for row in (
            qs.filter(dealer__isnull=False)
            .values('dealer__id', 'dealer__dealer_name')
            .annotate(total=Count('id'))
            .order_by('-total')
        ):
            by_dealer.append({
                'dealer_id':   row['dealer__id'],
                'dealer_name': row['dealer__dealer_name'],
                'total':       row['total'],
            })

    return Response({
        'message': 'Success',
        'data': {'total': qs.count(), 'by_status': by_status, 'by_dealer': by_dealer},
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def bulk_assign_dealer(request):
    """
    Assign Stock serial numbers to a dealer pool.
    Body: { serial_numbers: [...], dealer_id: <int> }
    Superadmin only.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    serial_numbers = request.data.get('serial_numbers', [])
    dealer_id = request.data.get('dealer_id')

    if not serial_numbers or not isinstance(serial_numbers, list):
        return Response({'error': 'serial_numbers must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
    if not dealer_id:
        return Response({'error': 'dealer_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    from django.db import transaction as db_transaction
    with db_transaction.atomic():
        try:
            dealer = Dealer.objects.select_for_update().get(pk=dealer_id, is_active=True)
        except Dealer.DoesNotExist:
            return Response({'error': 'Dealer not found'}, status=status.HTTP_404_NOT_FOUND)

        capacity_remaining = dealer.devices_capacity_remaining
        if len(serial_numbers) > capacity_remaining:
            return Response({
                'error': (
                    f'Dealer device capacity exceeded. '
                    f'Dealer limit: {dealer.palmtec_count}, '
                    f'currently holds: {dealer.devices_total}, '
                    f'can receive: {capacity_remaining}, '
                    f'requested: {len(serial_numbers)}.'
                )
            }, status=status.HTTP_400_BAD_REQUEST)

        updated = ETMDevice.objects.filter(
            serial_number__in=serial_numbers,
            allocation_status=ETMDevice.AllocationStatus.STOCK,
        ).update(dealer=dealer, allocation_status=ETMDevice.AllocationStatus.DEALER_POOL)

    log_action(
        actor=user, action=AuditLog.ActionType.DEVICE_ALLOCATE,
        target_model='ETMDevice',
        target_display=dealer.dealer_name,
        details={'dealer_id': dealer.id, 'count': updated},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': f'{updated} device(s) moved to dealer pool.',
        'assigned': updated,
        'skipped': len(serial_numbers) - updated,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def bulk_assign_company(request):
    """
    Directly assign Stock serial numbers to a company.
    Body: { serial_numbers: [...], company_id: <int> }
    Superadmin only.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    serial_numbers = request.data.get('serial_numbers', [])
    company_id = request.data.get('company_id')

    if not serial_numbers or not isinstance(serial_numbers, list):
        return Response({'error': 'serial_numbers must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
    if not company_id:
        return Response({'error': 'company_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        company = Company.objects.get(pk=company_id)
    except Company.DoesNotExist:
        return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)

    already_allocated = ETMDevice.objects.filter(
        company=company,
        allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
    ).count()
    allowed = company.palmtec_count or 0
    requesting = len(serial_numbers)
    if allowed > 0 and (already_allocated + requesting) > allowed:
        return Response({
            'error': (
                f'Company device limit exceeded. '
                f'Limit: {allowed}, '
                f'currently allocated: {already_allocated}, '
                f'available slots: {max(0, allowed - already_allocated)}, '
                f'requested: {requesting}.'
            )
        }, status=status.HTTP_400_BAD_REQUEST)

    # Company.dealer FK now directly encodes the dealer relationship (no join table).
    dealer = company.dealer

    updated = ETMDevice.objects.filter(
        serial_number__in=serial_numbers,
        allocation_status=ETMDevice.AllocationStatus.STOCK,
    ).update(
        company=company,
        dealer=dealer,
        allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
    )

    log_action(
        actor=user, action=AuditLog.ActionType.DEVICE_ALLOCATE,
        target_model='ETMDevice',
        target_display=company.company_name,
        details={'company_id': company.id, 'count': updated},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': f'{updated} device(s) allocated to company.',
        'assigned': updated,
        'skipped': len(serial_numbers) - updated,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def allocate_to_company(request, device_id):
    """
    Dealer assigns one of their DealerPool devices to a client company.
    Body: { company_id: <int> }
    Dealer admin only — company must be under their dealer.
    """
    user = request.user
    if not _is_dealer_admin(user):
        return Response({'error': 'Dealer admin only'}, status=status.HTTP_403_FORBIDDEN)
    if not user.dealer_id:
        return Response({'error': 'No dealer linked to your account'}, status=status.HTTP_403_FORBIDDEN)

    company_id = request.data.get('company_id')
    if not company_id:
        return Response({'error': 'company_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        device = ETMDevice.objects.get(
            pk=device_id,
            dealer_id=user.dealer_id,
            allocation_status=ETMDevice.AllocationStatus.DEALER_POOL,
        )
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found in your pool'}, status=status.HTTP_404_NOT_FOUND)

    # Verify the target company belongs to this dealer (Company.dealer FK).
    if not Company.objects.filter(id=company_id, dealer_id=user.dealer_id, is_active=True).exists():
        return Response({'error': 'Company is not under your dealer'}, status=status.HTTP_403_FORBIDDEN)

    # Cap check: company must not exceed its device limit
    already_at_company = ETMDevice.objects.filter(
        company_id=company_id,
        allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
    ).count()
    company_obj = Company.objects.get(pk=company_id)
    allowed = company_obj.palmtec_count or 0
    if allowed > 0 and already_at_company >= allowed:
        return Response({
            'error': (
                f'Company has reached its device limit '
                f'({already_at_company}/{allowed} devices allocated).'
            )
        }, status=status.HTTP_400_BAD_REQUEST)

    device.company_id        = company_id
    device.allocation_status = ETMDevice.AllocationStatus.ALLOCATED
    device.source_dealer     = device.dealer
    device.save(update_fields=['company_id', 'allocation_status', 'source_dealer', 'updated_at'])

    log_action(
        actor=user, action=AuditLog.ActionType.DEVICE_ALLOCATE,
        target_model='ETMDevice', target_id=device.pk,
        target_display=device.serial_number,
        details={'company_id': company_id},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({'message': 'Device allocated to company', 'data': ETMDeviceSerializer(device).data}, status=status.HTTP_200_OK)


# ── Permission helpers ────────────────────────────────────────────────────────

def _can_deactivate(user, device):
    """Returns (True, None) or (False, reason_string)."""
    if _is_superadmin(user):
        return True, None
    if _is_executive(user):
        if device.company and device.company.created_by_id == user.id:
            return True, None
        return False, 'Executives can only deactivate devices under companies they created.'
    if _is_dealer_admin(user):
        if not user.dealer_id:
            return False, 'No dealer linked to your account.'
        if device.company and device.company.dealer_id == user.dealer_id:
            return True, None
        if device.dealer_id == user.dealer_id and device.allocation_status == ETMDevice.AllocationStatus.DEALER_POOL:
            return True, None
        return False, 'You can only deactivate devices under your dealer.'
    if _is_company_admin(user):
        if device.company_id == user.company_id:
            return True, None
        return False, "You can only deactivate your own company's devices."
    return False, 'Insufficient permissions.'


def _can_unmap(user, device):
    """Returns (True, None) or (False, reason_string)."""
    if _is_superadmin(user):
        return True, None
    if _is_executive(user):
        if device.company and device.company.created_by_id == user.id:
            return True, None
        return False, 'Executives can only unmap devices under companies they created.'
    if _is_dealer_admin(user):
        if not user.dealer_id:
            return False, 'No dealer linked to your account.'
        if device.company and device.company.dealer_id == user.dealer_id:
            return True, None
        if device.dealer_id == user.dealer_id and device.allocation_status == ETMDevice.AllocationStatus.DEALER_POOL:
            return True, None
        return False, 'You can only unmap devices under your dealer.'
    return False, 'Company admins cannot unmap devices. Contact your dealer or superadmin.'


def _can_return_to_stock(user, device):
    """Returns (True, None) or (False, reason_string)."""
    if _is_superadmin(user):
        return True, None
    if _is_dealer_admin(user):
        if not user.dealer_id:
            return False, 'No dealer linked to your account.'
        if device.dealer_id == user.dealer_id:
            return True, None
        return False, 'This device is not in your pool.'
    return False, 'Only dealer admin or superadmin can return devices to stock.'


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def deactivate_device(request, device_id):
    """
    Deactivate an allocated or DealerPool device.
    Sets is_active=False. Device stays mapped. Inbound data will be rejected.
    """
    from django.utils import timezone as tz
    user = request.user

    try:
        device = ETMDevice.objects.select_related('company', 'dealer').get(pk=device_id)
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found.'}, status=status.HTTP_404_NOT_FOUND)

    allowed, reason = _can_deactivate(user, device)
    if not allowed:
        return Response({'error': reason}, status=status.HTTP_403_FORBIDDEN)

    if not device.is_active:
        return Response({'error': 'Device is already inactive.'}, status=status.HTTP_400_BAD_REQUEST)

    device.is_active      = False
    device.deactivated_at = tz.now()
    device.deactivated_by = user
    device.save(update_fields=['is_active', 'deactivated_at', 'deactivated_by', 'updated_at'])

    log_action(
        actor=user, action=AuditLog.ActionType.DEACTIVATE,
        target_model='ETMDevice', target_id=device.pk,
        target_display=device.serial_number,
        details={'allocation_status': device.allocation_status},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': 'Device deactivated. It remains mapped but inbound data will be rejected.',
        'data': ETMDeviceSerializer(device).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def reactivate_device(request, device_id):
    """
    Re-enable a deactivated (is_active=False) device in-place.
    Clears is_active=False, deactivated_at, deactivated_by.
    Device stays at its current allocation_status and company/dealer assignment.
    Superadmin only.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        device = ETMDevice.objects.get(pk=device_id)
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found'}, status=status.HTTP_404_NOT_FOUND)

    if device.is_active:
        return Response(
            {'error': 'Device is already active.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    device.is_active      = True
    device.deactivated_at = None
    device.deactivated_by = None
    device.save(update_fields=['is_active', 'deactivated_at', 'deactivated_by', 'updated_at'])

    log_action(
        actor=user, action=AuditLog.ActionType.ACTIVATE,
        target_model='ETMDevice', target_id=device.pk,
        target_display=device.serial_number,
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({'message': 'Device reactivated.', 'data': ETMDeviceSerializer(device).data}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def unmap_device(request, device_id):
    """
    Remove a device from its company mapping.
    Returns device to DealerPool (if source_dealer is set) or Stock (if superadmin-allocated).
    Prerequisites: device.is_active must be False; device.allocation_status must be ALLOCATED.
    """
    from django.utils import timezone as tz
    from django.db import transaction as db_transaction
    user = request.user

    try:
        device = ETMDevice.objects.select_related('company', 'dealer', 'source_dealer').get(pk=device_id)
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found.'}, status=status.HTTP_404_NOT_FOUND)

    if device.allocation_status != ETMDevice.AllocationStatus.ALLOCATED:
        return Response(
            {'error': 'Only ALLOCATED devices can be unmapped from a company.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if device.is_active:
        return Response(
            {'error': 'Device must be deactivated before it can be unmapped.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    allowed, reason = _can_unmap(user, device)
    if not allowed:
        return Response({'error': reason}, status=status.HTTP_403_FORBIDDEN)

    prev_company = device.company.company_name if device.company else None
    prev_palmtec = device.palmtec_id
    returning_to_dealer = device.source_dealer is not None

    with db_transaction.atomic():
        profile_removed = SettingsProfile.objects.filter(device=device).delete()[0] > 0

        if returning_to_dealer:
            destination_label = f'DealerPool ({device.source_dealer.dealer_name})'
            device.dealer            = device.source_dealer
            device.allocation_status = ETMDevice.AllocationStatus.DEALER_POOL
        else:
            destination_label = 'Stock'
            device.dealer            = None
            device.allocation_status = ETMDevice.AllocationStatus.STOCK

        device.company           = None
        device.palmtec_id        = None
        device.source_dealer     = None
        device.is_active         = True
        device.deactivated_at    = None
        device.deactivated_by    = None
        device.has_fetched_setup = False
        device.setup_fetched_at  = None
        device.last_seen_at      = None

        device.save(update_fields=[
            'company', 'dealer', 'palmtec_id', 'source_dealer',
            'allocation_status', 'is_active', 'deactivated_at', 'deactivated_by',
            'has_fetched_setup', 'setup_fetched_at', 'last_seen_at',
            'updated_at',
        ])

    log_action(
        actor=user, action=AuditLog.ActionType.DEVICE_DEALLOCATE,
        target_model='ETMDevice', target_id=device.pk,
        target_display=device.serial_number,
        details={
            'previous_company': prev_company, 'previous_palmtec': prev_palmtec,
            'returned_to': destination_label, 'profile_removed': profile_removed,
        },
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': f'Device unmapped and returned to {destination_label}.',
        'data': ETMDeviceSerializer(device).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def return_device_to_stock(request, device_id):
    """
    Return an inactive DealerPool device back to Stock.
    Prerequisites: device.allocation_status must be DEALER_POOL; device.is_active must be False.
    """
    user = request.user

    try:
        device = ETMDevice.objects.select_related('dealer').get(pk=device_id)
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found.'}, status=status.HTTP_404_NOT_FOUND)

    if device.allocation_status != ETMDevice.AllocationStatus.DEALER_POOL:
        return Response(
            {'error': 'Only DealerPool devices can be returned to Stock. Unmap from company first if needed.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if device.is_active:
        return Response(
            {'error': 'Device must be deactivated before it can be returned to Stock.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    allowed, reason = _can_return_to_stock(user, device)
    if not allowed:
        return Response({'error': reason}, status=status.HTTP_403_FORBIDDEN)

    prev_dealer = device.dealer.dealer_name if device.dealer else None

    device.dealer            = None
    device.source_dealer     = None
    device.allocation_status = ETMDevice.AllocationStatus.STOCK
    device.is_active         = True
    device.deactivated_at    = None
    device.deactivated_by    = None

    device.save(update_fields=[
        'dealer', 'source_dealer', 'allocation_status',
        'is_active', 'deactivated_at', 'deactivated_by',
        'updated_at',
    ])

    log_action(
        actor=user, action=AuditLog.ActionType.DEVICE_DEALLOCATE,
        target_model='ETMDevice', target_id=device.pk,
        target_display=device.serial_number,
        details={'previous_dealer': prev_dealer, 'returned_to': 'Stock'},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': f'Device returned to Stock from {prev_dealer}.',
        'data': ETMDeviceSerializer(device).data,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def set_palmtec_id(request, device_id):
    """
    Company admin assigns the physical Palmtec ID to an allocated device.

    The Palmtec ID is the integer identifier the ETM device broadcasts in
    ticket / trip payloads (TransactionData.palmtec_id, TripData.palmtec_id, etc.).
    Setting it here links the physical box to all its operational data.

    Body: { palmtec_id: <exactly 5 digits> }
    Company admin only — device must be ALLOCATED to their company.
    """
    user = request.user
    if not _is_company_admin(user):
        return Response({'error': 'Company admin only'}, status=status.HTTP_403_FORBIDDEN)
    if not user.company_id:
        return Response({'error': 'No company linked to your account'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        device = ETMDevice.objects.get(
            pk=device_id,
            company_id=user.company_id,
            allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
        )
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found in your company'}, status=status.HTTP_404_NOT_FOUND)

    raw_id = request.data.get('palmtec_id')
    if raw_id is None:
        return Response({'error': 'palmtec_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    if not re.fullmatch(r'\d{5}', str(raw_id).strip()):
        return Response({'error': 'palmtec_id must be exactly 5 digits'}, status=status.HTTP_400_BAD_REQUEST)

    palmtec_id = int(raw_id)

    # Check for conflicts within the company
    conflict = ETMDevice.objects.filter(
        company_id=user.company_id,
        palmtec_id=palmtec_id,
    ).exclude(pk=device_id).first()
    if conflict:
        return Response({
            'error': f'Palmtec ID {palmtec_id} is already assigned to device {conflict.serial_number}.'
        }, status=status.HTTP_400_BAD_REQUEST)

    device.palmtec_id = palmtec_id
    device.save(update_fields=['palmtec_id', 'updated_at'])

    # Keep the profile's mirrored palmtec_id in sync — device stays mapped, so
    # unmap's cascade-delete never fires here; without this the profile would
    # silently go stale and later match whichever device inherits the old ID.
    SettingsProfile.objects.filter(device=device).update(palmtec_id=palmtec_id)

    log_action(
        actor=user, action=AuditLog.ActionType.UPDATE,
        target_model='ETMDevice', target_id=device.pk,
        target_display=device.serial_number,
        details={'palmtec_id': palmtec_id},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': f'Palmtec ID {palmtec_id} assigned to device {device.serial_number}.',
        'data': ETMDeviceSerializer(device).data,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def set_aggregator_tid(request, device_id):
    """
    Company admin manually assigns the Aggregator Terminal ID to an allocated device.

    The TID is globally unique (assigned by the payment aggregator per device). It can also
    arrive automatically via getEtmSetupDetails when the device boots, but this
    endpoint allows an admin to set it when the device cannot send it.

    Body: { aggregator_tid: <string> }
    Company admin only — device must be ALLOCATED to their company.
    """
    user = request.user
    if not _is_company_admin(user):
        return Response({'error': 'Company admin only'}, status=status.HTTP_403_FORBIDDEN)
    if not user.company_id:
        return Response({'error': 'No company linked to your account'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        device = ETMDevice.objects.get(
            pk=device_id,
            company_id=user.company_id,
            allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
        )
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found in your company'}, status=status.HTTP_404_NOT_FOUND)

    tid = request.data.get('aggregator_tid', '').strip()
    if not tid:
        return Response({'error': 'aggregator_tid is required'}, status=status.HTTP_400_BAD_REQUEST)

    conflict = ETMDevice.objects.filter(aggregator_tid=tid).exclude(pk=device_id).first()
    if conflict:
        return Response({
            'error': f'Payment Aggregator TID {tid} is already assigned to device {conflict.serial_number}.'
        }, status=status.HTTP_400_BAD_REQUEST)

    device.aggregator_tid = tid
    device.save(update_fields=['aggregator_tid', 'updated_at'])

    log_action(
        actor=user, action=AuditLog.ActionType.UPDATE,
        target_model='ETMDevice', target_id=device.pk,
        target_display=device.serial_number,
        details={'aggregator_tid': tid},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': f'Payment Aggregator TID {tid} assigned to device {device.serial_number}.',
        'data': ETMDeviceSerializer(device).data,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def sync_aggregator_tids(request):
    """
    POST /etm-devices/sync-aggregator-tids

    Fetches TerminalMap from the license server for the logged-in company
    and populates aggregator_tid on devices that have it unset.
    Only devices with serial_number matching TerminalMap SER are updated.
    Already-set TIDs are never overwritten.
    """
    from .company import fetch_company_from_license_server

    user = request.user
    company = getattr(user, 'company', None)
    if not company:
        return Response({'error': 'No company associated with this account.'}, status=status.HTTP_400_BAD_REQUEST)

    result = fetch_company_from_license_server(company.company_id)
    if not result.get('success'):
        return Response({'error': result.get('error', 'License server error.')}, status=status.HTTP_502_BAD_GATEWAY)

    terminal_map_raw = result['data'].get('TerminalMap')
    if not terminal_map_raw:
        return Response({'error': 'No TerminalMap in license server response.'}, status=status.HTTP_502_BAD_GATEWAY)

    try:
        terminal_map = json.loads(terminal_map_raw) if isinstance(terminal_map_raw, str) else terminal_map_raw
    except (json.JSONDecodeError, TypeError):
        return Response({'error': 'Invalid TerminalMap format from license server.'}, status=status.HTTP_502_BAD_GATEWAY)

    ser_to_tid = {entry['SER']: entry['TER'] for entry in terminal_map if entry.get('SER') and entry.get('TER')}

    all_devices = ETMDevice.objects.filter(
        company=company,
        allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
    )

    updated = 0
    not_found = 0

    from django.db import transaction as db_transaction
    with db_transaction.atomic():
        for device in all_devices.select_for_update():
            tid = ser_to_tid.get(device.serial_number)
            if not tid:
                not_found += 1
                continue
            if device.aggregator_tid == tid:
                continue
            conflict = ETMDevice.objects.filter(aggregator_tid=tid).exclude(pk=device.pk).first()
            if conflict:
                logger.warning("Sync: TID %s already assigned to %s, skipping %s", tid, conflict.serial_number, device.serial_number)
                # not_found += 1
                return Response(
                    {
                        'error': (
                            f'TID {tid} is already assigned to device '
                            f'{conflict.serial_number}. '
                            f'Cannot assign it to device {device.serial_number}.'
                        )
                    },
                    status=status.HTTP_409_CONFLICT
                )
                # continue
            device.aggregator_tid = tid
            device.save(update_fields=['aggregator_tid', 'updated_at'])
            updated += 1

    return Response({
        'message': f'Sync complete. {updated} device(s) updated.',
        'updated': updated,
        'not_found_in_map': not_found,
    }, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, LicensePermission])
def delete_device(request, device_id):
    """
    DELETE /etm-devices/<id>/delete

    Permanently removes an ETM device. Only Stock devices (never allocated
    to a dealer or company) may be deleted — anything else must be returned
    to Stock first via unmap / return-to-stock. Superadmin only.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        device = ETMDevice.objects.get(pk=device_id)
    except ETMDevice.DoesNotExist:
        return Response({'error': 'Device not found.'}, status=status.HTTP_404_NOT_FOUND)

    if device.allocation_status != ETMDevice.AllocationStatus.STOCK:
        return Response({
            'error': 'Only Stock devices can be deleted. Return this device to Stock first.'
        }, status=status.HTTP_400_BAD_REQUEST)

    serial_number = device.serial_number
    device_pk = device.pk
    device.delete()

    log_action(
        actor=user, action=AuditLog.ActionType.DELETE,
        target_model='ETMDevice', target_id=device_pk,
        target_display=serial_number,
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({'message': f'Device {serial_number} deleted.'}, status=status.HTTP_200_OK)




