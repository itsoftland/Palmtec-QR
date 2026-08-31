"""
Dealer views — Phase 3
======================
Dealer registration follows the same two-step flow as company registration:
  1. POST /create-dealer            → save to DB (status = Pending)
  2. POST /register-dealer-license/<pk>  → register with license server
  3. POST /validate-dealer-license/<pk>  → poll for approval, populate pool counts

Pool counts (remaining_*) are initialised to equal total counts on first approval.
When a company is created under the dealer, pool counts are decremented.
When a company is deleted, pool counts are restored.
"""

import threading
import logging

import requests
from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model

from ...models import Dealer, Company, ETMDevice, AuditLog, UserRole, UserTier
from ...serializers.dealers import DealerSerializer
from ...serializers.company import CompanySerializer
from ...permissions import LicensePermission
from ..utils import _is_superadmin, _is_dealer_admin
from .audit_logs import log_action

logger = logging.getLogger(__name__)
User = get_user_model()


# ── Dealer–company mapping stubs (410 Gone) ────────────────────────────────────
# DealerCustomerMapping has been replaced by Company.dealer FK.
# These stubs keep old clients from silently getting 404s.

_MAPPING_GONE = {
    "error_code": "ENDPOINT_REMOVED",
    "error": (
        "Dealer–company mappings have been removed. "
        "Link a company to a dealer by setting Company.dealer on company creation. "
        "See ARCHITECTURE.md for details."
    ),
}


# ── License server helpers ────────────────────────────────────────────────────

def _build_dealer_registration_payload(dealer):
    return {
        "CustomerName":          dealer.dealer_name,
        "PhoneNumber":           dealer.contact_number,
        "CustomerEmail":         dealer.email,
        "GSTNumber":             dealer.gst_number or '',
        "CustomerContactPerson": dealer.contact_person,
        "CustomerAddress":       dealer.address,
        # Differentiates dealers on the license server — without it the server
        # can return a stale CustomerId from an earlier registration. See
        # build_license_registration_payload in company.py for the same field.
        "DeviceIdentifier1":     dealer.dealer_name,
        "DeviceModel":           settings.DEVICE_MODEL,
        "DeviceType":            settings.DEVICE_TYPE,
        "ProjectName":           settings.PROJECT_NAME,
    }


def _register_dealer_with_license_server(dealer):
    """Register dealer and return {'success', 'customer_id'} or {'success', 'error'}."""
    payload = _build_dealer_registration_payload(dealer)
    logger.debug(f"Dealer registration payload: {payload}")
    try:
        resp = requests.post(settings.PRODUCT_REGISTRATION_URL, json=payload, timeout=30)
        logger.debug(f"Dealer registration response [{resp.status_code}]: {resp.text}")
        resp.raise_for_status()
        data = resp.json()
        if data.get('status') == 'Success' and data.get('CustomerId'):
            return {'success': True, 'customer_id': data['CustomerId']}
        logger.error(f"Dealer registration failed. Response data: {data}")
        return {'success': False, 'error': f"License server error: {data.get('message', 'Unknown')}"}
    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'License server timeout.'}
    except requests.exceptions.ConnectionError:
        return {'success': False, 'error': 'Cannot connect to license server.'}
    except Exception as e:
        logger.exception(f"Dealer registration error: {e}")
        return {'success': False, 'error': str(e)}


def _safe_int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _background_dealer_license_polling(dealer_id):
    """
    Background thread: poll license server for dealer approval,
    then populate total and remaining pool counts.
    """
    logger.info(f"[BACKGROUND] Dealer license polling started for dealer_id={dealer_id}")
    try:
        dealer = Dealer.objects.get(id=dealer_id)

        # Poll (reuses same auth endpoint as company)
        payload = {"CustomerId": dealer.unique_identifier or dealer.product_registration_id}
        import time
        deadline = time.time() + 120
        interval = 3
        poll_count = 0

        while time.time() < deadline:
            poll_count += 1
            try:
                resp = requests.post(settings.PRODUCT_AUTH_URL, json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                auth_status = data.get('Authenticationstatus', '')

                if auth_status == 'Approve':
                    dealer.authentication_status = Dealer.AuthStatus.APPROVED
                    ok, err = _populate_dealer_counts(dealer, data)
                    if not ok:
                        dealer.save()
                        logger.error(f"[BACKGROUND] Dealer {dealer_id} license config error: {err}")
                        return
                    dealer.save()
                    logger.info(f"[BACKGROUND] Dealer {dealer_id} approved.")
                    return

                if 'expired' in auth_status.lower():
                    dealer.authentication_status = Dealer.AuthStatus.EXPIRED
                    dealer.save()
                    return

                if auth_status == 'Block':
                    dealer.authentication_status = Dealer.AuthStatus.BLOCKED
                    dealer.save()
                    return

                time.sleep(interval)

            except Exception as e:
                logger.error(f"[BACKGROUND] Dealer poll #{poll_count} error: {e}")
                time.sleep(interval)

        # Timeout — reset to Pending so admin can retry
        logger.warning(f"[BACKGROUND] Dealer {dealer_id} polling timed out.")

    except Dealer.DoesNotExist:
        logger.error(f"[BACKGROUND] Dealer {dealer_id} not found.")
    except Exception as e:
        logger.exception(f"[BACKGROUND] Dealer polling unexpected error: {e}")
    finally:
        try:
            d = Dealer.objects.get(id=dealer_id)
            if d.authentication_status == Dealer.AuthStatus.VALIDATING:
                d.authentication_status = Dealer.AuthStatus.PENDING
                d.save()
        except Exception:
            pass


def _populate_dealer_counts(dealer, auth_data):
    """
    Fill total counts from license server response and initialise remaining pool.
    remaining_* = total_* − already_allocated (computed from child companies).
    Called on first approval and on license renewal/sync.
    Returns (ok: bool, error_msg: str|None).
    """
    new_number_of_licences = _safe_int(auth_data.get('NumberOfLicence'))
    new_palmtec  = _safe_int(auth_data.get('PalmtecCount'))
    new_total    = _safe_int(auth_data.get('TotalUserCount'))
    new_premium  = _safe_int(auth_data.get('PremiumUserCount'))
    new_inter    = _safe_int(auth_data.get('IntermediateUserCount'))

    # Hard block: profile counts must not exceed NumberOfLicence
    if new_number_of_licences > 0 and (new_palmtec + new_total) > new_number_of_licences:
        msg = (
            f"License config error: device slots ({new_palmtec}) + "
            f"user slots ({new_total}) = {new_palmtec + new_total} "
            f"exceeds total licensed units ({new_number_of_licences}). "
            "Contact the license server administrator."
        )
        dealer.authentication_status = Dealer.AuthStatus.PENDING
        dealer.error_message = msg
        return False, msg

    dealer.number_of_licences      = new_number_of_licences
    dealer.palmtec_count           = new_palmtec
    dealer.total_user_count        = new_total
    dealer.premium_user_count      = new_premium
    dealer.intermediate_user_count = new_inter
    dealer.error_message           = None
    if dealer.authentication_status == Dealer.AuthStatus.APPROVED:
        dealer.is_active = True

    from .company import check_datetime as _check_datetime
    raw_from = auth_data.get('ProductFromDate')
    raw_to   = auth_data.get('ProductToDate')
    if raw_from:
        dt = _check_datetime(raw_from)
        dealer.product_from_date = dt.date() if dt else None
    if raw_to:
        dt = _check_datetime(raw_to)
        dealer.product_to_date = dt.date() if dt else None

    dealer.product_registration_id = _safe_int(auth_data.get('ProductRegistrationId'))
    dealer.unique_identifier        = auth_data.get('UniqueIDentifier', '')
    return True, None


# ── Views ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def create_dealer(request):
    """
    Create a new dealer record (superadmin only).
    Status starts as Pending — call /register-dealer-license/<pk> next.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    if not request.data:
        return Response({'error': 'Invalid Input'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = DealerSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    # Dealer admin user credentials
    username = request.data.get('user_username', '').strip()
    email    = request.data.get('user_email', '').strip()
    password = request.data.get('user_password', '').strip()

    if not username or not email or not password:
        return Response({'message': 'Dealer user details (username, email, password) are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=username).exists():
        return Response({'message': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(email=email).exists():
        return Response({'message': 'Email already exists'}, status=status.HTTP_400_BAD_REQUEST)

    dealer = serializer.save(created_by=user, is_active=False)

    User.objects.create_user(
        username=username,
        email=email,
        password=password,
        role=UserRole.DEALER_ADMIN,
        tier=UserTier.NONE,
        dealer=dealer,
        is_verified=True,
        created_by=user,
    )

    log_action(
        actor=user, action=AuditLog.ActionType.CREATE,
        target_model='Dealer', target_id=dealer.pk,
        target_display=dealer.dealer_name,
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': 'Dealer created. Call /register-dealer-license to register with the license server.',
        'data': serializer.data,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def register_dealer_with_license_server(request, pk):
    """
    Step 2 of dealer registration: send dealer details to the license server
    and save the returned customer_id (product_registration_id).
    Superadmin only.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        dealer = Dealer.objects.get(pk=pk)
    except Dealer.DoesNotExist:
        return Response({'error': 'Dealer not found'}, status=status.HTTP_404_NOT_FOUND)

    if dealer.product_registration_id:
        return Response({
            'message': 'Dealer already registered with license server.',
            'registration_id': dealer.product_registration_id,
        }, status=status.HTTP_200_OK)

    result = _register_dealer_with_license_server(dealer)
    if not result['success']:
        return Response({'error': result['error']}, status=status.HTTP_502_BAD_GATEWAY)

    # License server returns a CustomerId string — store as unique_identifier
    # and use it for subsequent auth polls.
    dealer.unique_identifier = result['customer_id']
    dealer.save(update_fields=['unique_identifier'])

    logger.info(f"Dealer '{dealer.dealer_name}' registered with license server. ID={result['customer_id']}")

    log_action(
        actor=user, action=AuditLog.ActionType.LICENSE_RENEWAL,
        target_model='Dealer', target_id=dealer.pk,
        target_display=dealer.dealer_name,
        details={'step': 'register', 'customer_id': dealer.unique_identifier},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({
        'message': f"Registered with license server. Customer ID: {result['customer_id']}",
        'customer_id': result['customer_id'],
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def validate_dealer_license(request, pk):
    """
    Step 3: start background polling for dealer license approval.
    On approval, populates total counts and initialises remaining pool counts.
    Superadmin only.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    with transaction.atomic():
        try:
            dealer = Dealer.objects.select_for_update().get(pk=pk)
        except Dealer.DoesNotExist:
            return Response({'error': 'Dealer not found'}, status=status.HTTP_404_NOT_FOUND)

        if not dealer.unique_identifier and not dealer.product_registration_id:
            return Response({
                'error': 'Dealer not registered with license server yet. Call /register-dealer-license first.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if dealer.authentication_status == Dealer.AuthStatus.VALIDATING:
            return Response({
                'message': 'Validation already in progress.',
                'status': 'Validating',
            }, status=status.HTTP_200_OK)

        dealer.authentication_status = Dealer.AuthStatus.VALIDATING
        dealer.save(update_fields=['authentication_status'])

    log_action(
        actor=user, action=AuditLog.ActionType.LICENSE_RENEWAL,
        target_model='Dealer', target_id=dealer.pk,
        target_display=dealer.dealer_name,
        details={'step': 'validate_started'},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    threading.Thread(
        target=_background_dealer_license_polling,
        args=(dealer.id,),
        daemon=True,
    ).start()
    logger.info(f"Started license polling for dealer id={pk}")

    return Response({
        'message': 'License validation started. Refresh to see updated status.',
        'status': 'Validating',
        'data': DealerSerializer(dealer).data,
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_all_dealers(request):
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    dealers = Dealer.objects.all().order_by('id')
    serializer = DealerSerializer(dealers, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['PUT'])
@permission_classes([IsAuthenticated, LicensePermission])
def update_dealer_details(request, pk):
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    try:
        dealer = Dealer.objects.get(pk=pk)
    except Dealer.DoesNotExist:
        return Response({'message': 'Dealer not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = DealerSerializer(dealer, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        log_action(
            actor=user, action=AuditLog.ActionType.UPDATE,
            target_model='Dealer', target_id=dealer.pk,
            target_display=dealer.dealer_name,
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response({'message': 'Dealer updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Dealer delete ─────────────────────────────────────────────────────────────

@api_view(['DELETE'])
@permission_classes([IsAuthenticated, LicensePermission])
def delete_dealer(request, pk):
    """
    Hard-delete a dealer. Superadmin only.

    Blocked if the dealer has any companies still linked (is_active=True or False
    — even inactive companies keep FK references). All companies must be deleted
    or reassigned first.

    On success:
      - Devices still in DealerPool for this dealer → returned to Stock
      - All dealer users soft-deactivated (is_active=False)
      - Dealer record hard-deleted (ETMDevice.dealer → SET_NULL via CASCADE)
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        dealer = Dealer.objects.get(pk=pk)
    except Dealer.DoesNotExist:
        return Response({'error': 'Dealer not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Block if any companies (active or inactive) still reference this dealer
    company_count = Company.objects.filter(dealer=dealer).count()
    if company_count:
        return Response({
            'error': (
                f'This dealer has {company_count} linked '
                f'{"company" if company_count == 1 else "companies"}. '
                'Delete all client companies before deleting the dealer.'
            ),
        }, status=status.HTTP_400_BAD_REQUEST)

    dealer_name = dealer.dealer_name

    # Return unallocated pool devices to Stock
    from ...models import ETMDevice
    returned = ETMDevice.objects.filter(
        dealer=dealer,
        allocation_status=ETMDevice.AllocationStatus.DEALER_POOL,
    ).update(dealer=None, allocation_status=ETMDevice.AllocationStatus.STOCK)

    # Soft-deactivate all dealer users
    from django.contrib.auth import get_user_model as _get_user_model
    _User = _get_user_model()
    deactivated = _User.objects.filter(dealer=dealer, is_active=True).update(is_active=False)

    dealer.delete()

    log_action(
        actor=user, action=AuditLog.ActionType.DELETE,
        target_model='Dealer', target_id=pk,
        target_display=dealer_name,
        details={'pool_devices_returned': returned, 'users_deactivated': deactivated},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    logger.warning(f"Dealer '{dealer_name}' (pk={pk}) HARD-DELETED by {user.username}.")
    return Response({
        'message': f'"{dealer_name}" deleted successfully.',
        'pool_devices_returned_to_stock': returned,
        'users_deactivated': deactivated,
    }, status=status.HTTP_200_OK)


# ── Removed mapping endpoints (410 Gone) ─────────────────────────────────────

@api_view(['POST'])
def create_dealer_mapping(request):
    return Response(_MAPPING_GONE, status=status.HTTP_410_GONE)


@api_view(['GET'])
def get_dealer_mappings(request):
    return Response(_MAPPING_GONE, status=status.HTTP_410_GONE)


@api_view(['PUT'])
def update_dealer_mapping(request, pk):
    return Response(_MAPPING_GONE, status=status.HTTP_410_GONE)


# ── Dealer Dashboard ──────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def dealer_dashboard(request):
    """
    Dealer admin dashboard — companies with per-company device breakdowns.
    Superadmin can inspect via ?dealer=<id>.
    """
    from django.db.models import Count, Q

    user = request.user

    if _is_superadmin(user):
        dealer_id = request.query_params.get('dealer')
        if not dealer_id:
            return Response({'error': 'Pass ?dealer=<id> as superadmin'}, status=status.HTTP_400_BAD_REQUEST)
    elif _is_dealer_admin(user):
        dealer_id = user.dealer_id
        if not dealer_id:
            return Response({'message': 'No dealer mapped to user'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    try:
        dealer_obj = Dealer.objects.get(pk=dealer_id)
    except Dealer.DoesNotExist:
        return Response({'error': 'Dealer not found.'}, status=status.HTTP_404_NOT_FOUND)

    companies = (
        Company.objects
        .filter(dealer_id=dealer_id, is_active=True)
        .order_by('company_name')
    )
    company_ids = list(companies.values_list('id', flat=True))

    device_counts = (
        ETMDevice.objects.filter(company_id__in=company_ids)
        .values('company_id')
        .annotate(
            total     = Count('id'),
            active    = Count('id', filter=Q(allocation_status=ETMDevice.AllocationStatus.ALLOCATED, is_active=True)),
            pending   = Count('id', filter=Q(allocation_status=ETMDevice.AllocationStatus.DEALER_POOL)),
            suspended = Count('id', filter=Q(is_active=False)),
        )
    )
    device_map = {row['company_id']: row for row in device_counts}

    companies_data = []
    for company in companies:
        dc = device_map.get(company.id, {})
        company_dict = CompanySerializer(company).data
        company_dict['devices'] = {
            'total':     dc.get('total', 0),
            'active':    dc.get('active', 0),
            'pending':   dc.get('pending', 0),
            'suspended': dc.get('suspended', 0),
        }
        companies_data.append(company_dict)

    # ── Pool balance (live-computed from child companies) ─────────────────────
    user_slots   = dealer_obj.users_slots_remaining
    given        = dealer_obj.users_given_to_companies
    dealer_basic = max(0, dealer_obj.total_user_count - dealer_obj.premium_user_count - dealer_obj.intermediate_user_count)
    given_basic  = max(0, given['total'] - given['premium'] - given['inter'])

    pool = {
        'palmtec': {
            'total':     dealer_obj.palmtec_count,
            'given':     dealer_obj.slots_given_to_companies,
            'remaining': dealer_obj.slots_remaining,
        },
        'total_users': {
            'total':     dealer_obj.total_user_count,
            'given':     given['total'],
            'remaining': user_slots['total'],
        },
        'premium': {
            'total':     dealer_obj.premium_user_count,
            'given':     given['premium'],
            'remaining': user_slots['premium'],
        },
        'inter': {
            'total':     dealer_obj.intermediate_user_count,
            'given':     given['inter'],
            'remaining': user_slots['inter'],
        },
        'basic': {
            'total':     dealer_basic,
            'given':     given_basic,
            'remaining': user_slots['basic'],
        },
        'license_valid_to': str(dealer_obj.product_to_date) if dealer_obj.product_to_date else None,
    }

    return Response({
        'message': 'Success',
        'data': {
            'companies': companies_data,
            'pool': pool,
            'summary': {
                'total_companies':    len(companies_data),
                'total_devices':      sum(d['devices']['total']     for d in companies_data),
                'active_devices':     sum(d['devices']['active']    for d in companies_data),
                'pending_devices':    sum(d['devices']['pending']   for d in companies_data),
                'suspended_devices':  sum(d['devices']['suspended'] for d in companies_data),
            },
        },
    }, status=status.HTTP_200_OK)


# ── Sync license (dry-run + confirm) ─────────────────────────────────────────

def _fetch_dealer_from_license_server(customer_id):
    """Single non-polling call to license server. Returns {success, status, data}."""
    try:
        resp = requests.post(
            settings.PRODUCT_AUTH_URL,
            json={"CustomerId": customer_id},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        auth_status = data.get('Authenticationstatus', '')
        if not auth_status:
            return {'success': False, 'error': 'No response from license server.'}
        return {'success': True, 'status': auth_status, 'data': data}
    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'License server timed out.'}
    except requests.exceptions.ConnectionError:
        return {'success': False, 'error': 'Cannot connect to license server.'}
    except Exception as e:
        logger.exception(f"Dealer license server fetch error: {e}")
        return {'success': False, 'error': str(e)}


def _build_dealer_sync_diff(dealer, auth_data):
    """
    Compute old vs incoming breakdown for dealer sync confirmation UI.
    """
    new_nol     = _safe_int(auth_data.get('NumberOfLicence'))
    new_palmtec = _safe_int(auth_data.get('PalmtecCount'))
    new_total   = _safe_int(auth_data.get('TotalUserCount'))
    new_premium = _safe_int(auth_data.get('PremiumUserCount'))
    new_inter   = _safe_int(auth_data.get('IntermediateUserCount'))

    error = None
    if new_nol > 0 and (new_palmtec + new_total) > new_nol:
        error = (
            f"License config error: device slots ({new_palmtec}) + "
            f"user slots ({new_total}) = {new_palmtec + new_total} "
            f"exceeds total licensed units ({new_nol}). "
            "Contact the license server administrator."
        )

    # Live-computed allocations from child companies
    given = dealer.users_given_to_companies

    from .company import check_datetime as _check_datetime
    raw_from = auth_data.get('ProductFromDate')
    raw_to   = auth_data.get('ProductToDate')
    incoming_from = _check_datetime(raw_from).date() if raw_from else None
    incoming_to   = _check_datetime(raw_to).date()   if raw_to   else None

    return {
        'current': {
            'number_of_licences':      dealer.number_of_licences or 0,
            'palmtec_count':           dealer.palmtec_count,
            'total_user_count':        dealer.total_user_count,
            'premium_user_count':      dealer.premium_user_count,
            'intermediate_user_count': dealer.intermediate_user_count,
            'slots_remaining':            dealer.slots_remaining,
            'devices_total':              dealer.devices_total,
            'devices_in_pool':            dealer.devices_in_pool,
            'devices_at_clients':         dealer.devices_at_clients,
            'devices_capacity_remaining': dealer.devices_capacity_remaining,
            'product_from_date': str(dealer.product_from_date) if dealer.product_from_date else None,
            'product_to_date':   str(dealer.product_to_date)   if dealer.product_to_date   else None,
        },
        'incoming': {
            'number_of_licences':      new_nol,
            'palmtec_count':           new_palmtec,
            'total_user_count':        new_total,
            'premium_user_count':      new_premium,
            'intermediate_user_count': new_inter,
            'product_from_date': str(incoming_from) if incoming_from else None,
            'product_to_date':   str(incoming_to)   if incoming_to   else None,
            'authentication_status': auth_data.get('Authenticationstatus'),
        },
        'in_use': {
            'palmtec_allocated_to_companies': dealer.slots_given_to_companies,
            'total_users_allocated':          given['total'],
            'premium_users_allocated':        given['premium'],
            'intermediate_users_allocated':   given['inter'],
        },
        'error': error,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def sync_dealer_license(request, pk):
    """
    Dry-run sync for dealer: fetch latest data from license server, return diff.
    Does NOT save. Call /confirm to apply.
    Superadmin and executive only.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        dealer = Dealer.objects.get(pk=pk)
    except Dealer.DoesNotExist:
        return Response({'error': 'Dealer not found.'}, status=status.HTTP_404_NOT_FOUND)

    if not dealer.unique_identifier and not dealer.product_registration_id:
        return Response({'error': 'Dealer is not registered with the license server yet.'}, status=status.HTTP_400_BAD_REQUEST)

    customer_id = dealer.unique_identifier or dealer.product_registration_id
    result = _fetch_dealer_from_license_server(customer_id)
    if not result['success']:
        return Response({'error': result['error']}, status=status.HTTP_502_BAD_GATEWAY)

    diff = _build_dealer_sync_diff(dealer, result['data'])
    return Response({'message': 'Sync preview ready.', 'data': diff}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def sync_dealer_license_confirm(request, pk):
    """
    Apply dealer sync: re-fetch from license server and write new values.
    Updates total counts and recalculates remaining pool.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        dealer = Dealer.objects.get(pk=pk)
    except Dealer.DoesNotExist:
        return Response({'error': 'Dealer not found.'}, status=status.HTTP_404_NOT_FOUND)

    if not dealer.unique_identifier and not dealer.product_registration_id:
        return Response({'error': 'Dealer is not registered with the license server yet.'}, status=status.HTTP_400_BAD_REQUEST)

    customer_id = dealer.unique_identifier or dealer.product_registration_id
    result = _fetch_dealer_from_license_server(customer_id)
    if not result['success']:
        return Response({'error': result['error']}, status=status.HTTP_502_BAD_GATEWAY)

    auth_data = result['data']

    # Set auth status before populate (needed if approve→ APPROVED)
    status_map = {
        'Approve': Dealer.AuthStatus.APPROVED,
        'Expired': Dealer.AuthStatus.EXPIRED,
        'Block':   Dealer.AuthStatus.BLOCKED,
    }
    dealer.authentication_status = status_map.get(
        auth_data.get('Authenticationstatus', ''),
        dealer.authentication_status,
    )

    ok, err = _populate_dealer_counts(dealer, auth_data)
    if not ok:
        dealer.save()
        return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

    dealer.save()

    log_action(
        actor=user, action=AuditLog.ActionType.UPDATE,
        target_model='Dealer', target_id=dealer.pk,
        target_display=dealer.dealer_name,
        details={'action': 'license_sync'},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    serializer = DealerSerializer(dealer)
    return Response({
        'message': 'Dealer license data synced successfully.',
        'data': serializer.data,
    }, status=status.HTTP_200_OK)
