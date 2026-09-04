import json
import os
from pathlib import Path
import time
import logging
import requests
from datetime import datetime
from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from django.db import transaction
from django.http import JsonResponse
from ...serializers.company import CompanySerializer
from rest_framework.response import Response
from django.forms.models import model_to_dict
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from ...permissions import LicensePermission
from django.db.utils import OperationalError, ProgrammingError
from django.db.models import Sum, Q, Count, Case, When, IntegerField
from ...models import Company, TransactionData, TripData, ScheduleData, Route, VehicleType, AggregatorTransaction, Dealer, ETMDevice, UserSession, UserRole, UserTier
from ..utils import _is_superadmin, _is_executive, _is_dealer_admin, _is_company_admin
from .audit_logs import log_action
from ...models import AuditLog


# Setup logger
logger = logging.getLogger(__name__)
User = get_user_model()

_STATES_DISTRICTS = json.loads(
    (Path(__file__).resolve().parent.parent.parent / 'utils' / 'indiaStatesDistricts.json').read_text()
)


def check_datetime(date_str):
    try:
        if not date_str:
            return None
        if isinstance(date_str, str):
            return datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
        return date_str
    except Exception:
        return None


def _check_user_count_reduction(company, new_total, new_premium, new_inter):
    """
    Block reducing user counts below currently assigned users.
    Returns (ok: bool, errors: list[str]).
    Called before saving new count values on an existing company.
    """
    stats = User.objects.filter(
        company=company,
        role=UserRole.COMPANY_USER,
        is_active=True,
    ).exclude(tier=UserTier.NONE).aggregate(
        total         = Count('id'),
        premium_count = Count(Case(When(tier=UserTier.PREMIUM,      then=1), output_field=IntegerField())),
        inter_count   = Count(Case(When(tier=UserTier.INTERMEDIATE, then=1), output_field=IntegerField())),
    )

    errors = []
    if new_total is not None and new_total < stats['total']:
        errors.append(
            f'Cannot reduce total_user_count to {new_total}: '
            f'{stats["total"]} users currently have a tier assigned. '
            'Remove tier assignments first.'
        )
    if new_premium is not None and new_premium < stats['premium_count']:
        errors.append(
            f'Cannot reduce premium_user_count to {new_premium}: '
            f'{stats["premium_count"]} users are currently premium.'
        )
    if new_inter is not None and new_inter < stats['inter_count']:
        errors.append(
            f'Cannot reduce intermediate_user_count to {new_inter}: '
            f'{stats["inter_count"]} users are currently intermediate.'
        )
    return len(errors) == 0, errors


def _parse_license_date(raw):
    """Return the date part of a license server datetime string, or None on any failure."""
    dt = check_datetime(raw)
    return dt.date() if dt is not None else None


def build_license_registration_payload(company):
    """
    Build payload for license server registration.
    Maps Company model fields to license server expected format.
    """
    payload = {
        "CustomerName":          company.company_name,
        "PhoneNumber":           company.contact_number,
        "CustomerEmail":         company.company_email,
        "GSTNumber":             company.gst_number or '',
        "CustomerContactPerson": company.contact_person,
        "CustomerAddress":       company.address,
        # this is important. 
        # ig this differentiates diff companies else it'll return some same older ID again. 
        "DeviceIdentifier1":     company.company_name,
        "DeviceModel":           settings.DEVICE_MODEL,
        "DeviceType":            settings.DEVICE_TYPE,
        "ProjectName":           settings.PROJECT_NAME,
    }
    
    logger.info(f"Built registration payload for company: {company.company_name}")
    return payload


def register_with_license_server(company):
    """
    Register company with external license server.
    Returns customer_id on success.
    """
    payload = build_license_registration_payload(company)
    
    try:
        logger.info(f"Sending registration request to: {settings.PRODUCT_REGISTRATION_URL}")
        logger.debug(f"Registration payload: {payload}")
        
        response = requests.post(
            settings.PRODUCT_REGISTRATION_URL,
            json=payload,
            timeout=30
        )
        
        logger.info(f"Registration response status: {response.status_code}")
        logger.debug(f"Registration response: {response.text}")
        
        response.raise_for_status()
        data = response.json()
        
        if data.get('status') == 'Success' and data.get('CustomerId'):
            logger.info(f"Registration successful. Customer ID: {data.get('CustomerId')}")
            return {
                'success': True,
                'customer_id': data['CustomerId']
            }
        else:
            logger.error(f"Registration failed. Response data: {data}")
            return {
                'success': False,
                'error': f"Registration failed: {data.get('message', 'Invalid response from license server')}"
            }
    
    except requests.exceptions.Timeout as e:
        logger.error(f"License server timeout: {str(e)}")
        return {
            'success': False,
            'error': 'License server timeout. Please try again later.'
        }
    except requests.exceptions.ConnectionError as e:
        logger.error(f"License server connection error: {str(e)}")
        return {
            'success': False,
            'error': 'Cannot connect to license server. Please check your network connection.'
        }
    except requests.exceptions.HTTPError as e:
        logger.error(f"License server HTTP error: {str(e)}")
        return {
            'success': False,
            'error': f'License server error: {e.response.status_code}'
        }
    except Exception as e:
        logger.exception(f"Unexpected error during registration: {str(e)}")
        return {
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }


def poll_license_authentication(customer_id, timeout_seconds=120, interval_seconds=3):
    """
    Poll license server for authentication approval.
    Checks every 3 seconds for up to 2 minutes (40 attempts max).
    Returns authentication data when approved.
    """
    payload = {"CustomerId": customer_id}
    start_time = time.time()
    poll_count = 0
    
    logger.info(f"Starting authentication polling for Customer ID: {customer_id}")
    
    while time.time() - start_time < timeout_seconds:
        poll_count += 1
        
        try:
            logger.debug(f"Poll attempt #{poll_count} for Customer ID: {customer_id}")

            response = requests.post(
                settings.PRODUCT_AUTH_URL,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            auth_status = data.get('Authenticationstatus', '')
            
            logger.debug(f"Poll #{poll_count} status: {auth_status}")
            
            # Success case
            if auth_status == 'Approve':
                logger.info(f"Authentication approved for Customer ID: {customer_id}")
                return {
                    'success': True,
                    'status': 'Approve',
                    'data': data
                }

            # Expired license
            if 'expired' in auth_status.lower():
                logger.warning(f"License expired for Customer ID: {customer_id}")
                return {
                    'success': True,
                    'status': 'Expired',
                    'data': data
                }

            # Blocked
            if auth_status == 'Block':
                logger.warning(f"License blocked for Customer ID: {customer_id}")
                return {
                    'success': True,
                    'status': 'Block',
                    'data': data
                }

            # Still waiting - continue polling
            if 'waiting' in auth_status.lower() or auth_status == 'Pending':
                logger.debug(f"Still waiting for approval. Next poll in {interval_seconds}s")
                time.sleep(interval_seconds)
                continue
            
            # Unknown status - treat as error
            logger.error(f"Unexpected authentication status: {auth_status}")
            return {
                'success': False,
                'error': f'Unexpected authentication status: {auth_status}'
            }
        
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout during poll #{poll_count}: {str(e)}")
            return {
                'success': False,
                'error': 'License server not responding. Please try again later.'
            }
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error during poll #{poll_count}: {str(e)}")
            return {
                'success': False,
                'error': 'Cannot connect to license server. Check your network connection.'
            }
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP error during poll #{poll_count}: {str(e)}")
            return {
                'success': False,
                'error': f'License server error: {e.response.status_code}. Try again later.'
            }
        except Exception as e:
            logger.exception(f"Unexpected error during poll #{poll_count}: {str(e)}")
            return {
                'success': False,
                'error': 'Unexpected error during validation. Please try again.'
            }
    
    # Timeout
    elapsed = time.time() - start_time
    logger.error(f"Validation timeout after {elapsed:.1f}s and {poll_count} polls")
    return {
        'success': False,
        'error': f'Validation timeout - License not approved yet. Please try again later. ({poll_count} attempts over {int(elapsed)}s)'
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def register_company_with_license_server(request, pk):
    """
    Register company with license server only.
    This does NOT validate - only gets customer_id.

    Flow:
    1. Check if company exists
    2. Check if already registered (has company_id)
    3. Register with license server
    4. Save company_id to database
    5. Return success with customer_id
    """
    logger.info(f"License registration requested for company ID: {pk}")

    user = request.user
    
    try:
        company = Company.objects.get(pk=pk)
        logger.info(f"Found company: {company.company_name} (ID: {pk})")
    except Company.DoesNotExist:
        logger.error(f"Company not found with ID: {pk}")
        return Response(
            {"message": "Company not found"}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Check if already registered
    if company.company_id:
        logger.info(f"Company already registered with ID: {company.company_id}")
        return Response(
            {
                "message": "Company already registered with license server",
                "customer_id": company.company_id
            },
            status=status.HTTP_200_OK
        )
    
    # Register with license server
    logger.info(f"Initiating registration for: {company.company_name}")
    registration_result = register_with_license_server(company)
    
    if not registration_result['success']:
        logger.error(f"Registration failed: {registration_result['error']}")
        return Response(
            {
                "message": "License registration failed",
                "error": registration_result['error']
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    # Save company_id
    company.company_id = registration_result['customer_id']
    company.save()
    logger.info(f"Saved customer_id: {company.company_id} for company: {company.company_name}")
    
    return Response(
        {
            "message": f"Registered with license server successfully! Customer ID: {company.company_id}",
            "customer_id": company.company_id
        },
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def validate_company_license(request, pk):
    """
    START license validation by setting status to 'Validating' and
    launching background polling thread.

    Returns immediately - polling happens in background.
    User can refresh to see updated status.

    Flow:
    1. Check if company exists
    2. Check if company is registered (has company_id)
    3. Check if already validating
    4. Set status to 'Validating'
    5. Start background thread
    6. Return immediately
    """
    logger.info(f"License validation requested for company ID: {pk}")

    user = request.user
    
    with transaction.atomic():
        try:
            company = Company.objects.select_for_update().get(pk=pk)
            logger.info(f"Found company: {company.company_name} (ID: {pk})")
        except Company.DoesNotExist:
            logger.error(f"Company not found with ID: {pk}")
            return Response(
                {"message": "Company not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if company is registered
        if not company.company_id:
            logger.error(f"Company not registered yet. Cannot validate.")
            return Response(
                {
                    "message": "Company not registered with license server yet",
                    "error": "Please register the company first before validating"
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if already validating
        if company.authentication_status == Company.AuthStatus.VALIDATING:
            logger.info(f"Company already validating: {company.company_name}")
            return Response(
                {
                    "message": "License validation already in progress",
                    "status": "Validating"
                },
                status=status.HTTP_200_OK
            )
        
        # Set status to Validating
        company.authentication_status = Company.AuthStatus.VALIDATING
        company.save()
    logger.info(f"Set status to 'Validating' for company: {company.company_name}")
    
    # Hand off to Celery — returns immediately, polling runs in the background.
    # Unlike a daemon thread, this survives worker restarts: the task is
    # re-queued from the broker if the worker dies mid-poll.
    from ...tasks import poll_company_license
    poll_company_license.delay(company.id)
    logger.info(f"Queued poll_company_license task for company ID: {pk}")
    
    # Return immediately
    serializer = CompanySerializer(company)
    return Response(
        {
            "message": "License validation started. This may take up to 2 minutes. Refresh to see updated status.",
            "status": "Validating",
            "data": serializer.data
        },
        status=status.HTTP_200_OK
    )


def fetch_company_from_license_server(customer_id):
    """
    Single (non-polling) call to the license server to get current status
    and license details for a given customer_id.
    Used for the import-existing-company preview and atomic import.
    Returns a dict with success, status, and data keys.
    """
    payload = {"CustomerId": customer_id}
    try:
        response = requests.post(
            settings.PRODUCT_AUTH_URL,
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        auth_status = data.get('Authenticationstatus', '')

        if not auth_status:
            return {'success': False, 'error': 'No response from license server.'}

        return {'success': True, 'status': auth_status, 'data': data}

    except requests.exceptions.Timeout:
        return {'success': False, 'error': 'License server timed out. Try again.'}
    except requests.exceptions.ConnectionError:
        return {'success': False, 'error': 'Cannot connect to license server.'}
    except requests.exceptions.HTTPError as e:
        return {'success': False, 'error': f'License server error: {e.response.status_code}'}
    except Exception as e:
        logger.exception(f"Unexpected error fetching from license server: {e}")
        return {'success': False, 'error': f'Unexpected error: {str(e)}'}


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_company_by_company_id(request, company_id):
    """
    Preview endpoint for the 'Add Existing Company' flow.

    1. Blocks if company_id already exists in our DB (returns 409).
    2. Fetches current license status from the license server (single call).
    3. Returns license data so the frontend can show a confirm banner.

    Note: This is read-only — no writes happen here.
    The actual atomic create is handled by POST /import-company.
    """
    user = request.user

    # ── Duplicate check ──────────────────────────────────────────────────────
    existing = Company.objects.filter(company_id=company_id).first()
    if existing:
        logger.warning(f"Import blocked: company_id '{company_id}' already exists as '{existing.company_name}'")
        return Response(
            {'message': f'"{existing.company_name}" is already registered in this system.'},
            status=status.HTTP_409_CONFLICT
        )

    # ── Single license server fetch (no polling loop) ────────────────────────
    result = fetch_company_from_license_server(customer_id=company_id)
    if not result['success']:
        return Response({'message': result['error']}, status=status.HTTP_502_BAD_GATEWAY)

    auth_data   = result['data']
    auth_status = result['status']

    # Map license server response fields for the frontend confirm step
    product_to_date   = auth_data.get('ProductToDate')
    product_from_date = auth_data.get('ProductFromDate')

    expired = False
    if product_to_date:
        try:
            expiry = check_datetime(product_to_date)
            expired = expiry is not None and expiry.date() < timezone.now().date()
        except Exception:
            pass

    # License server does not return company details (name, address, etc.)
    # Only license/config fields are available — returned for the confirm banner.
    # The user fills in company details manually in the confirm step form.
    # TODO: update these keys when license server is updated to new field names
    return Response(
        {
            'message': 'Success',
            'data': {
                'company_id':            company_id,
                'authentication_status': auth_status,
                'product_from_date':     product_from_date,
                'product_to_date':       product_to_date,
                'number_of_licences':    int(auth_data.get('NumberOfLicence', 0)),
                'palmtec_count':         int(auth_data.get('PalmtecCount', 0)),
                'total_user_count':      int(auth_data.get('TotalUserCount', 0)),
                'premium_user_count':    int(auth_data.get('PremiumUserCount', 0)),
                'intermediate_user_count': int(auth_data.get('IntermediateUserCount', 0)),
                'is_expired':            expired,
            }
        },
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
@transaction.atomic
def import_company(request):
    """
    Atomic 'Add Existing Company' endpoint.

    Takes only { company_id } from the frontend.
    Re-fetches all data from the license server server-side and creates
    the Company record in a single DB transaction — no race window.

    Race condition handling:
      select_for_update() ensures that if two requests arrive simultaneously
      for the same company_id, only one proceeds; the other sees the duplicate
      and gets a 409.
    """
    user = request.user

    company_id = request.data.get('company_id', '').strip()
    if not company_id:
        return Response({'message': 'company_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # ── User account validation ───────────────────────────────────────────────
    imp_user_username = request.data.get('user_username', '').strip()
    imp_user_email = request.data.get('user_email', '').strip()
    imp_user_password = request.data.get('user_password', '').strip()
    if not imp_user_username or not imp_user_email or not imp_user_password:
        return Response({'error': 'User account details (username, email, password) are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=imp_user_username).exists():
        return Response({'message': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(email=imp_user_email).exists():
        return Response({'message': 'User email already exists'}, status=status.HTTP_400_BAD_REQUEST)

    # ── Atomic duplicate check with row-level lock ───────────────────────────
    # select_for_update acquires a DB lock so concurrent requests serialise here.
    existing = Company.objects.select_for_update().filter(company_id=company_id).first()
    if existing:
        logger.warning(f"Import duplicate blocked (atomic): company_id '{company_id}' → '{existing.company_name}'")
        return Response(
            {'message': f'"{existing.company_name}" is already registered in this system.'},
            status=status.HTTP_409_CONFLICT
        )

    # ── Re-fetch from license server (single call) ───────────────────────────
    result = fetch_company_from_license_server(customer_id=company_id)
    if not result['success']:
        return Response({'message': result['error']}, status=status.HTTP_502_BAD_GATEWAY)

    auth_data   = result['data']
    auth_status = result['status']

    # Map auth_status string → Company.AuthStatus choice
    status_map = {
        'Approve':  Company.AuthStatus.APPROVED,
        'Expired':  Company.AuthStatus.EXPIRED,
        'Block':    Company.AuthStatus.BLOCKED,
        'Pending':  Company.AuthStatus.PENDING,
    }
    # Anything not in the map (e.g. 'Waiting') falls back to PENDING
    mapped_status = status_map.get(auth_status, Company.AuthStatus.PENDING)

    # Parse dates
    product_from_date = None
    product_to_date   = None
    try:
        raw_from = auth_data.get('ProductFromDate')
        raw_to   = auth_data.get('ProductToDate')
        if raw_from:
            dt = check_datetime(raw_from)
            product_from_date = dt.date() if dt else None
        if raw_to:
            dt = check_datetime(raw_to)
            product_to_date = dt.date() if dt else None
    except Exception:
        pass

    def safe_int(val, default=0):
        try:
            return int(val)
        except (TypeError, ValueError):
            return default

    # ── Validate company detail fields from request ──────────────────────────
    # License server does not return name/address/email, so the frontend
    # supplies these from the form the user filled in on the confirm step.
    form_data = {
        'company_id':     company_id,
        'company_name':   request.data.get('company_name', '').strip(),
        'company_email':  request.data.get('company_email', '').strip(),
        'contact_person': request.data.get('contact_person', '').strip(),
        'contact_number': request.data.get('contact_number', '').strip(),
        'gst_number':     request.data.get('gst_number', '').strip(),
        'address':        request.data.get('address', '').strip(),
        'state':          request.data.get('state', '').strip(),
        'district':       request.data.get('district', '').strip() or None,
    }

    if not form_data['company_name']:
        return Response({'message': 'Company name is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # ── Create Company record ────────────────────────────────────────────────
    company = Company.objects.create(
        **form_data,
        authentication_status   = mapped_status,
        is_active                = (mapped_status == Company.AuthStatus.APPROVED),
        product_registration_id = safe_int(auth_data.get('ProductRegistrationId')),
        unique_identifier       = auth_data.get('UniqueIDentifier', ''),
        product_from_date       = product_from_date,
        product_to_date         = product_to_date,
        number_of_licences      = safe_int(auth_data.get('NumberOfLicence'), 0),
        palmtec_count           = safe_int(auth_data.get('PalmtecCount'), 0),
        total_user_count        = safe_int(auth_data.get('TotalUserCount'), 0),
        premium_user_count      = safe_int(auth_data.get('PremiumUserCount'), 0),
        intermediate_user_count = safe_int(auth_data.get('IntermediateUserCount'), 0),
        client_type             = 'direct',
        created_by              = user,
    )

    # ── Create company_admin user ─────────────────────────────────────────────
    User.objects.create_user(
        username=imp_user_username,
        email=imp_user_email,
        password=imp_user_password,
        role=UserRole.COMPANY_ADMIN,
        company=company,
        is_verified=True,
    )
    logger.info(f"Imported existing company '{company.company_name}' (company_id={company_id}) by user {user}")

    log_action(
        actor=user, action=AuditLog.ActionType.CREATE,
        target_model='Company', target_id=company.pk,
        target_display=company.company_name,
        details={'client_type': 'direct', 'imported': True},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    serializer = CompanySerializer(company)
    return Response(
        {
            'message': f'"{company.company_name}" imported successfully.',
            'data': serializer.data,
        },
        status=status.HTTP_201_CREATED
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def all_company_data(request):
    """
    Retrieve companies based on the requesting user's role.

    Visibility rules:
      - superadmin   → all direct companies (client_type='direct'), or every
                       company (direct + dealer-created) when ?all=true is passed
      - executive    → companies they personally created (created_by=user)
      - dealer_admin → companies under their dealer (Company.dealer FK)
      - company_admin→ only their own company
    """
    user = request.user

    if _is_superadmin(user):
        if request.GET.get('all') == 'true':
            # Full visibility, e.g. for tools (MDB import) that need every company.
            companies = Company.objects.all().order_by('-id')
        else:
            # Superadmin sees all direct companies (not dealer-created sub-companies).
            companies = Company.objects.filter(client_type='direct').order_by('-id')

    elif _is_executive(user):
        qs = Company.objects.filter(created_by=user, is_active=True)
        if user.state:
            qs = qs.filter(state=user.state)
        companies = qs.order_by('-id')

    elif _is_dealer_admin(user):
        if not user.dealer_id:
            return Response({'message': 'No dealer linked to this user'}, status=status.HTTP_400_BAD_REQUEST)
        # Company.dealer FK replaced DealerCustomerMapping join table.
        companies = Company.objects.filter(dealer_id=user.dealer_id, is_active=True).order_by('-id')

    elif _is_company_admin(user):
        if not user.company:
            return Response({'message': 'No company linked to this user'}, status=status.HTTP_400_BAD_REQUEST)
        companies = Company.objects.filter(pk=user.company.pk)

    else:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    serializer = CompanySerializer(companies, many=True)
    logger.info(f"Retrieved {len(companies)} companies for role={user.role}")
    return Response({"message": "Success", "data": serializer.data}, status=status.HTTP_200_OK)


def _safe_int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
@transaction.atomic
def create_company(request):
    """
    Create a new company — two paths:

    Path A  superadmin / executive → client_type='direct'.
            No pool involved. Company starts Pending; register + validate via
            separate endpoints (/register-company-license, /validate-company-license).

    Path B  dealer_admin → client_type='dealer_company'.
            Requires { palmtec_count, total_user_count, premium_user_count,
                       intermediate_user_count } in the request body.
            Validates dealer pool (select_for_update to prevent races).
            On success: validates against live dealer pool properties (slots_remaining,
            users_slots_remaining), sets company authentication_status = Approved,
            inherits dealer product dates.
    """
    user = request.user

    if not _is_superadmin(user) and not _is_executive(user) and not _is_dealer_admin(user):
        return Response({'error': 'Only superadmin, executive, or dealer_admin can create companies.'}, status=status.HTTP_403_FORBIDDEN)

    if not request.data:
        return Response({"message": "No input received"}, status=status.HTTP_400_BAD_REQUEST)

    # ── Company admin user credentials (required for both paths) ─────────────
    user_username    = request.data.get('user_username', '').strip()
    user_email_field = request.data.get('user_email',    '').strip()
    user_password    = request.data.get('user_password', '').strip()

    if not user_username or not user_email_field or not user_password:
        return Response({'error': 'User account details (username, email, password) are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=user_username).exists():
        return Response({'message': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(email=user_email_field).exists():
        return Response({'message': 'User email already exists'}, status=status.HTTP_400_BAD_REQUEST)

    # ── Executive state/district restriction ──────────────────────────────────
    if _is_executive(user):
        if not user.state:
            return Response({'error': 'Your account has no state assigned. Contact superadmin.'}, status=status.HTTP_403_FORBIDDEN)
        company_state = (request.data.get('state') or '').strip()
        company_district = (request.data.get('district') or '').strip()
        if company_state != user.state:
            return Response(
                {'error': f'You can only create companies in {user.state}.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if company_district:
            valid_districts = _STATES_DISTRICTS.get(user.state, [])
            if company_district not in valid_districts:
                return Response(
                    {'error': f'"{company_district}" is not a valid district in {user.state}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    serializer = CompanySerializer(data=request.data)
    if not serializer.is_valid():
        logger.warning(f"Company creation validation failed: {serializer.errors}")
        return Response({"message": "Validation failed", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    # ── Path B: dealer_admin ──────────────────────────────────────────────────
    if _is_dealer_admin(user):
        if not user.dealer_id:
            return Response({'error': 'No dealer linked to this account.'}, status=status.HTTP_400_BAD_REQUEST)

        # Parse requested allocation from body
        alloc_palmtec = _safe_int(request.data.get('palmtec_count', 0))
        alloc_total   = _safe_int(request.data.get('total_user_count', 0))
        alloc_premium = _safe_int(request.data.get('premium_user_count', 0))
        alloc_inter   = _safe_int(request.data.get('intermediate_user_count', 0))

        if alloc_total <= 0:
            return Response({'error': 'total_user_count must be greater than 0.'}, status=status.HTTP_400_BAD_REQUEST)

        if alloc_premium + alloc_inter > alloc_total:
            return Response(
                {'error': 'premium_user_count + intermediate_user_count cannot exceed total_user_count.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Row-level lock on dealer to serialise concurrent company creations
        try:
            dealer = Dealer.objects.select_for_update().get(pk=user.dealer_id)
        except Dealer.DoesNotExist:
            return Response({'error': 'Dealer not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if dealer.authentication_status != Dealer.AuthStatus.APPROVED:
            return Response({'error': 'Dealer license is not approved. Cannot create companies.'}, status=status.HTTP_403_FORBIDDEN)

        # Pool validation (live-computed from child companies)
        slots_rem  = dealer.slots_remaining
        user_slots = dealer.users_slots_remaining
        alloc_basic = alloc_total - alloc_premium - alloc_inter
        errors = []
        if alloc_palmtec > slots_rem:
            errors.append(f"ETM devices: requested {alloc_palmtec}, available {slots_rem}")
        if alloc_total > user_slots['total']:
            errors.append(f"Total users: requested {alloc_total}, available {user_slots['total']}")
        if alloc_premium > user_slots['premium']:
            errors.append(f"Premium users: requested {alloc_premium}, available {user_slots['premium']}")
        if alloc_inter > user_slots['inter']:
            errors.append(f"Intermediate users: requested {alloc_inter}, available {user_slots['inter']}")
        if alloc_basic > user_slots['basic']:
            errors.append(f"Basic users: requested {alloc_basic}, available {user_slots['basic']}")
        if errors:
            return Response({
                'error': 'Insufficient dealer pool capacity.',
                'details': errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Save company — authenticated automatically via dealer pool
        company = serializer.save(
            created_by=user,
            client_type='dealer_company',
            dealer=dealer,
            palmtec_count=alloc_palmtec,
            total_user_count=alloc_total,
            premium_user_count=alloc_premium,
            intermediate_user_count=alloc_inter,
            authentication_status=Company.AuthStatus.APPROVED,
            product_from_date=dealer.product_from_date,
            product_to_date=dealer.product_to_date,
        )

        logger.info(
            f"Dealer company '{company.company_name}' created by {user.username}. "
            f"Allocated: palmtec={alloc_palmtec}, users={alloc_total}"
        )

    # ── Path A: superadmin / executive ───────────────────────────────────────
    else:
        company = serializer.save(
            created_by=user,
            client_type='direct',
            dealer=None,
        )
        logger.info(f"Direct company '{company.company_name}' created by {user.username}.")

    # ── Create company_admin user (shared for both paths) ─────────────────────
    User.objects.create_user(
        username=user_username,
        email=user_email_field,
        password=user_password,
        role=UserRole.COMPANY_ADMIN,
        tier=UserTier.NONE,
        company=company,
        is_verified=True,
        created_by=user,
    )
    logger.info(f"Company admin '{user_username}' created for '{company.company_name}'.")

    log_action(
        actor=user, action=AuditLog.ActionType.CREATE,
        target_model='Company', target_id=company.pk,
        target_display=company.company_name,
        details={'client_type': company.client_type},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({"message": "Company created successfully", "data": serializer.data}, status=status.HTTP_201_CREATED)


def _release_protected_transactional_fks(company):
    """
    Null out company_code on tables where the FK is on_delete=PROTECT
    (RawDataLog, TransactionData, ScheduleData, TripData, OdometerData,
    ExpenseData). These hold ticketing/financial history and must never
    cascade-delete, but PROTECT also blocks Company.delete() outright if
    any rows exist. Bulk-null (field is nullable) so the rows are orphaned
    but preserved, and the company delete can proceed.
    """
    from ...models import RawDataLog, TransactionData, ScheduleData, TripData, OdometerData, ExpenseData

    for model in (RawDataLog, TransactionData, ScheduleData, TripData, OdometerData, ExpenseData):
        updated = model.objects.filter(company_code=company).update(company_code=None)
        if updated:
            logger.info(f"[release_protected_fks] Orphaned {updated} {model.__name__} rows for company '{company.company_name}'.")


def _backup_company_data(company):
    """
    Serialize all company-related management data to a timestamped JSON file.

    Backup path:
        MEDIA_ROOT/backups/<company_id_or_pk>/<YYYY-MM-DD_HH-MM-SS>.json

    Includes: Company record, users, all masterdata (routes, stages, vehicles,
    employees, fares, etc.), operations records, and ETM device allocations.
    Transactional data (TransactionData, TripData, ScheduleData) is excluded
    from the file — it remains in the DB under the company_code FK.

    Returns the backup file path on success, or None on failure.
    Failure is logged but MUST NOT block the caller's deletion.
    """
    import json as _json
    from django.core import serializers as _dj_serializers
    from django.utils import timezone as _tz
    from django.contrib.auth import get_user_model as _get_user_model
    from ...models import (
        BusType, EmployeeType, Employee, Currency,
        Stage, Route, RouteStage, Fare, RouteBusType, RouteDepot,
        VehicleType, Settings, SettingsProfile,
        ExpenseMaster, Expense, CrewAssignment, InspectorDetails,
        ETMDevice,
    )

    try:
        _User = _get_user_model()
        now   = _tz.now()
        slug  = company.company_id or str(company.pk)

        bak_dir  = os.path.join(settings.MEDIA_ROOT, 'backups', slug)
        os.makedirs(bak_dir, exist_ok=True)
        bak_path = os.path.join(bak_dir, f"{now.strftime('%Y-%m-%d_%H-%M-%S')}.json")

        # Tables to snapshot (order doesn't matter — it's read-only here)
        tables = {
            'company':          Company.objects.filter(pk=company.pk),
            'users':            _User.objects.filter(company=company),
            'bus_types':        BusType.objects.filter(company=company),
            'employee_types':   EmployeeType.objects.filter(company=company),
            'employees':        Employee.objects.filter(company=company),
            'currencies':       Currency.objects.filter(company=company),
            'stages':           Stage.objects.filter(company=company),
            'routes':           Route.objects.filter(company=company),
            'route_stages':     RouteStage.objects.filter(company=company),
            'fares':            Fare.objects.filter(company=company),
            'route_bus_types':  RouteBusType.objects.filter(company=company),
            'route_depots':     RouteDepot.objects.filter(company=company),
            'vehicles':         VehicleType.objects.filter(company=company),
            'settings':         Settings.objects.filter(company=company),
            'settings_profiles':SettingsProfile.objects.filter(company=company),
            'expense_masters':  ExpenseMaster.objects.filter(company=company),
            'expenses':         Expense.objects.filter(company=company),
            'crew_assignments': CrewAssignment.objects.filter(company=company),
            'inspector_details':InspectorDetails.objects.filter(company=company),
            'etm_devices':      ETMDevice.objects.filter(company=company),
        }

        snapshot = {
            'meta': {
                'timestamp':    now.isoformat(),
                'company_id':   company.company_id,
                'company_pk':   company.pk,
                'company_name': company.company_name,
                'note':         (
                    'Transactional records (TransactionData, TripData, ScheduleData) '
                    'are not included here — they remain in the DB under company_code FK.'
                ),
            },
            'tables': {},
        }

        for table_name, qs in tables.items():
            try:
                snapshot['tables'][table_name] = _json.loads(
                    _dj_serializers.serialize('json', qs)
                )
            except Exception as exc:
                snapshot['tables'][table_name] = {'_error': str(exc)}
                logger.warning(
                    f"[backup] Could not serialize '{table_name}' for company "
                    f"'{company.company_name}': {exc}"
                )

        with open(bak_path, 'w', encoding='utf-8') as f:
            _json.dump(snapshot, f, ensure_ascii=False, indent=2)

        logger.info(f"[backup] Snapshot for '{company.company_name}' saved → {bak_path}")
        return bak_path

    except Exception as exc:
        logger.error(
            f"[backup] Snapshot failed for '{company.company_name}': {exc}",
            exc_info=True,
        )
        return None


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, LicensePermission])
@transaction.atomic
def delete_company(request, pk):
    """
    Hard-delete a company (superadmin only).
    Restores dealer pool counts if the company was dealer-created.

    Before deletion a full JSON snapshot of all management/masterdata records
    is saved to MEDIA_ROOT/backups/<company_id>/<timestamp>.json.
    Transactional data (tickets, trips, schedules) is not included in the file
    but remains in the DB with a now-orphaned company_code FK.
    """
    user = request.user
    if user.role != UserRole.SUPERADMIN:
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        company = Company.objects.select_for_update().get(pk=pk)
    except Company.DoesNotExist:
        return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    company_name = company.company_name

    # Soft-deactivate all company users before deletion to avoid orphaned logins
    from django.contrib.auth import get_user_model as _get_user_model
    _User = _get_user_model()
    deactivated = _User.objects.filter(company=company, is_active=True).update(is_active=False)
    logger.info(f"Deactivated {deactivated} users for company '{company_name}' before deletion.")

    # ── Snapshot backup ──────────────────────────────────────────────────────
    # Serialise all management/masterdata records to JSON before the hard-delete.
    # Failure is logged but must never block the deletion itself.
    bak_path = _backup_company_data(company)
    if bak_path:
        logger.info(f"[delete_company] Backup written: {bak_path}")
    else:
        logger.warning(f"[delete_company] Backup FAILED for '{company_name}' — proceeding with deletion anyway.")

    _release_protected_transactional_fks(company)
    company.delete()
    logger.warning(f"Company '{company_name}' (pk={pk}) HARD-DELETED by {user.username}.")

    log_action(
        actor=user, action=AuditLog.ActionType.DELETE,
        target_model='Company', target_id=pk,
        target_display=company_name,
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({'message': f'"{company_name}" deleted successfully.'}, status=status.HTTP_200_OK)


@api_view(['PUT'])
@permission_classes([IsAuthenticated, LicensePermission])
@transaction.atomic
def update_company_details(request, pk):
    """
    Update existing company details.
    Cannot update license-related fields directly (use validate_license endpoint),
    except palmtec_count/total_user_count/premium_user_count/intermediate_user_count,
    which a dealer_admin may adjust for their own dealer_company records — validated
    against the dealer's live remaining pool (see create_company Path B for the
    same validation applied at creation time).
    """
    user = request.user

    if not any([_is_superadmin(user), _is_executive(user), _is_dealer_admin(user)]):
        return Response({'error': 'Not authorized to update company details.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        company = Company.objects.select_for_update().get(pk=pk)
    except Company.DoesNotExist:
        logger.error(f"Company not found for update with ID: {pk}")
        return Response({"message": "Company not found"}, status=status.HTTP_404_NOT_FOUND)

    if _is_executive(user):
        if company.created_by_id != user.id:
            return Response({'error': 'You can only update companies you created.'}, status=status.HTTP_403_FORBIDDEN)
    elif _is_dealer_admin(user):
        if company.dealer_id != user.dealer_id:
            return Response({'error': 'You can only update companies under your dealership.'}, status=status.HTTP_403_FORBIDDEN)

    # ── Dealer pool allocation update (dealer_admin, dealer_company only) ────────
    pool_fields = ('palmtec_count', 'total_user_count', 'premium_user_count', 'intermediate_user_count')
    if any(f in request.data for f in pool_fields):
        if not _is_dealer_admin(user) or company.client_type != Company.ClientType.DEALER_COMPANY:
            return Response(
                {'error': 'License unit counts can only be updated by a dealer_admin for a dealer-managed company. Direct companies sync from the license server.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def _pi(name):
            if name not in request.data:
                return getattr(company, name)
            return _safe_int(request.data.get(name), getattr(company, name))

        new_palmtec = _pi('palmtec_count')
        new_total   = _pi('total_user_count')
        new_premium = _pi('premium_user_count')
        new_inter   = _pi('intermediate_user_count')

        if new_premium + new_inter > new_total:
            return Response(
                {'error': 'premium_user_count + intermediate_user_count cannot exceed total_user_count.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ok, errs = _check_user_count_reduction(company, new_total, new_premium, new_inter)
        if not ok:
            return Response({
                'error': 'Cannot reduce user counts below current assignments.',
                'details': errs,
            }, status=status.HTTP_400_BAD_REQUEST)

        allocated_devices = ETMDevice.objects.filter(
            company=company, allocation_status=ETMDevice.AllocationStatus.ALLOCATED
        ).count()
        if new_palmtec < allocated_devices:
            return Response({
                'error': f'Cannot reduce palmtec_count to {new_palmtec}: '
                         f'{allocated_devices} ETM devices are currently allocated to this company.',
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            dealer = Dealer.objects.select_for_update().get(pk=company.dealer_id)
        except Dealer.DoesNotExist:
            return Response({'error': 'Dealer not found.'}, status=status.HTTP_400_BAD_REQUEST)

        # Dealer's live "given" totals already include this company's *current*
        # allocation, so add it back to get the ceiling this company may draw up to.
        user_slots    = dealer.users_slots_remaining
        avail_palmtec = dealer.slots_remaining + company.palmtec_count
        avail_total   = user_slots['total']    + company.total_user_count
        avail_premium = user_slots['premium']  + company.premium_user_count
        avail_inter   = user_slots['inter']    + company.intermediate_user_count

        errors = []
        if new_palmtec > avail_palmtec:
            errors.append(f'ETM devices: requested {new_palmtec}, available {avail_palmtec}')
        if new_total > avail_total:
            errors.append(f'Total users: requested {new_total}, available {avail_total}')
        if new_premium > avail_premium:
            errors.append(f'Premium users: requested {new_premium}, available {avail_premium}')
        if new_inter > avail_inter:
            errors.append(f'Intermediate users: requested {new_inter}, available {avail_inter}')
        if errors:
            return Response({
                'error': 'Insufficient dealer pool capacity.',
                'details': errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        company.palmtec_count           = new_palmtec
        company.total_user_count        = new_total
        company.premium_user_count      = new_premium
        company.intermediate_user_count = new_inter
        company.save(update_fields=list(pool_fields))
        logger.info(
            f"Dealer '{user.username}' updated license allocation for company "
            f"'{company.company_name}' (ID: {pk}): palmtec={new_palmtec}, total={new_total}, "
            f"premium={new_premium}, inter={new_inter}"
        )

    other_data = {k: v for k, v in request.data.items() if k not in pool_fields}
    serializer = CompanySerializer(company, data=other_data, partial=True)

    if serializer.is_valid():
        serializer.save()
        logger.info(f"Updated company: {company.company_name} (ID: {pk})")
        log_action(
            actor=user, action=AuditLog.ActionType.UPDATE,
            target_model='Company', target_id=company.pk,
            target_display=company.company_name,
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response(
            {
                "message": "Company updated successfully",
                "data": serializer.data
            },
            status=status.HTTP_200_OK
        )

    logger.warning(f"Company update failed for ID {pk}: {serializer.errors}")
    return Response(
        {
            "message": "Validation failed",
            "errors": serializer.errors
        },
        status=status.HTTP_400_BAD_REQUEST
    )


# Returns collections, operations, and settlements data for a given date.
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_company_dashboard_metrics(request):
    user = request.user
    
    #  Step 2: Date validation ─
    selected_date = request.GET.get('date')
    if not selected_date:
        return Response(
            {'error': 'Date parameter required (format: YYYY-MM-DD)'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if isinstance(selected_date, str):
        try:
            selected_date = datetime.strptime(selected_date, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    #  Step 3: Company check ─
    company = user.company
    if not company:
        # User has no company — return zeros
        return Response({
            "message": "success",
            "data": {
                "license_expiry_date": None,
                "collections": {
                    "daily_cash": 0,
                    "daily_upi": 0,
                    "monthly_total": 0,
                    "prev_month_total": 0,
                },
                "operations": {
                    "buses_active": 0,
                    "buses_idle": 0,
                    "buses_running": 0,
                    "buses_total": 0,
                    "trips_completed": 0,
                    "trips_scheduled": 0,
                    "routes_active": 0,
                    "routes_total": 0,
                    "total_passengers": 0,
                },
                "settlements": {
                    "total_transactions": 0,
                    "verified": 0,
                    "pending_verification": 0,
                    "failed": 0,
                },
                "recent_activity": [],
            }
        }, status=status.HTTP_200_OK)
    
    #  Initialize response structure ─
    collections = {
        "daily_cash": 0,
        "daily_upi": 0,
        "monthly_total": 0,
    }
    operations = {
        "buses_active": 0,
        "buses_idle": 0,
        "buses_running": 0,
        "buses_total": 0,
        "trips_completed": 0,
        "trips_scheduled": 0,
        "routes_active": 0,
        "routes_total": 0,
        "total_passengers": 0,
    }
    settlements = {
        "total_transactions": 0,
        "verified": 0,
        "pending_verification": 0,
        "failed": 0,
    }
    
    #  Section 1: Collections (from TransactionData) 
    try:
        transaction_base = TransactionData.objects.filter(
            company_code=company,
            ticket_date=selected_date
        )
        
        # Daily cash collection
        daily_cash = transaction_base.filter(
            ticket_status=TransactionData.PaymentMode.CASH
        ).aggregate(total=Sum('ticket_amount'))['total'] or 0
        
        # Daily UPI collection
        daily_upi = transaction_base.filter(
            ticket_status=TransactionData.PaymentMode.UPI
        ).aggregate(total=Sum('ticket_amount'))['total'] or 0
        
        # Monthly total (all transactions in the same month)
        monthly_total = TransactionData.objects.filter(
            company_code=company,
            ticket_date__year=selected_date.year,
            ticket_date__month=selected_date.month
        ).aggregate(total=Sum('ticket_amount'))['total'] or 0
        
        # Previous month total (for month-over-month comparison)
        prev_month_date = selected_date - relativedelta(months=1)
        prev_month_total = TransactionData.objects.filter(
            company_code=company,
            ticket_date__year=prev_month_date.year,
            ticket_date__month=prev_month_date.month
        ).aggregate(total=Sum('ticket_amount'))['total'] or 0

        collections = {
            "daily_cash": float(daily_cash),
            "daily_upi": float(daily_upi),
            "monthly_total": float(monthly_total),
            "prev_month_total": float(prev_month_total),
        }
        
        # Total passengers (from ticket counts)
        total_passengers = transaction_base.aggregate(
            total=Sum('total_tickets')
        )['total'] or 0
        operations["total_passengers"] = int(total_passengers)
        
    except (OperationalError, ProgrammingError) as e:
        logger.warning(f"Collection metrics unavailable: {str(e)}")
    except Exception as e:
        logger.exception(f"Collection metrics error: {str(e)}")
    
    #  Section 2: Operations (from TripCloseData, Route, VehicleType) ─
    try:
        # Trips completed on this date
        trips_completed = TripData.objects.filter(
            company_code=company,
            start_date=selected_date,
            is_closed=True,
        ).count()
        operations["trips_completed"] = trips_completed
        operations["trips_scheduled"] = trips_completed

        # Buses with an open schedule today, split into:
        #   running = schedule open AND a trip currently open under it
        #   idle    = schedule open, no trip currently open
        open_schedule_bus_ids = set(
            ScheduleData.objects.filter(
                company_code=company,
                start_date=selected_date,
                is_closed=False,
                bus_id__isnull=False,
            ).values_list('bus_id', flat=True)
        )
        running_bus_ids = set(
            TripData.objects.filter(
                company_code=company,
                start_date=selected_date,
                is_closed=False,
                bus_id__isnull=False,
            ).values_list('bus_id', flat=True)
        ) & open_schedule_bus_ids
        idle_bus_ids = open_schedule_bus_ids - running_bus_ids

        operations["buses_running"] = len(running_bus_ids)
        operations["buses_idle"] = len(idle_bus_ids)
        operations["buses_active"] = len(open_schedule_bus_ids)

    except (OperationalError, ProgrammingError) as e:
        logger.warning(f"Trip metrics unavailable: {str(e)}")
    except Exception as e:
        logger.exception(f"Trip metrics error: {str(e)}")
    
    try:
        # Total buses registered (not soft-deleted)
        operations["buses_total"] = VehicleType.objects.filter(
            company=company,
            is_deleted=False
        ).count()
        
        # Total routes
        operations["routes_total"] = Route.objects.filter(
            company=company
        ).count()
        
        # Active routes (not soft-deleted)
        operations["routes_active"] = Route.objects.filter(
            company=company,
            is_deleted=False
        ).count()
        
    except (OperationalError, ProgrammingError) as e:
        logger.warning(f"Route/vehicle metrics unavailable: {str(e)}")
    except Exception as e:
        logger.exception(f"Route/vehicle metrics error: {str(e)}")
    
    #  Section 3: Settlements (from AggregatorTransaction) 
    # IMPORTANT FIX: AggregatorTransaction doesn't have a direct company FK.
    # It links to TransactionData via related_ticket → company_code.
    # However, not all aggregator transactions may be reconciled yet (related_ticket could be null).
    # 
    # Solution: We filter by transactions that are EITHER:
    #   1. Already linked to a ticket from this company, OR
    #   2. Have a merchantId that belongs to this company's devices/terminals
    #
    # For now, we use a simpler approach: filter by related_ticket__company_code
    # and include null related_ticket if merchantId matches company terminals.
    # If you don't have a merchantId → company mapping, just use related_ticket filter.
    
    try:
        # Base queryset: all transactions on this date
        settlement_qs = AggregatorTransaction.objects.filter(
            transaction_date=selected_date
        )
        
        # Filter by company:
        # Approach 1 (safer): Only count transactions linked to company's tickets
        settlement_qs = settlement_qs.filter(
            related_ticket__company_code=company
        )
        
        # Count totals
        settlements["total_transactions"] = settlement_qs.count()
        
        # Verified transactions
        settlements["verified"] = settlement_qs.filter(
            verification_status=AggregatorTransaction.VerificationStatus.VERIFIED
        ).count()
        
        # Pending verification (unverified + flagged)
        settlements["pending_verification"] = settlement_qs.filter(
            verification_status__in=[
                AggregatorTransaction.VerificationStatus.UNVERIFIED,
                AggregatorTransaction.VerificationStatus.FLAGGED,
            ]
        ).count()
        
        # Failed (rejected + disputed)
        settlements["failed"] = settlement_qs.filter(
            verification_status__in=[
                AggregatorTransaction.VerificationStatus.REJECTED,
                AggregatorTransaction.VerificationStatus.DISPUTED,
            ]
        ).count()
        
    except (OperationalError, ProgrammingError) as e:
        logger.warning(f"Settlement metrics unavailable: {str(e)}")
    except Exception as e:
        logger.exception(f"Settlement metrics error: {str(e)}")
    
    #  Section 4: Recent Activity (last 8 closed trips + recent settlements) ─
    recent_activity = []
    try:
        # Recent closed trips for this date
        closed_trips = TripData.objects.filter(
            company_code=company,
            start_date=selected_date,
            is_closed=True,
            end_datetime__isnull=False,
        ).select_related('route_id').order_by('-end_datetime')[:6]

        for trip in closed_trips:
            route_code = trip.route_id.route_code if trip.route_id else f"Sch {trip.schedule_no}"
            recent_activity.append({
                "type": "trip_close",
                "label": f"Trip #{trip.trip_no} closed — {trip.palmtec_id}",
                "route": route_code,
                "time": trip.end_datetime.strftime("%H:%M") if trip.end_datetime else "",
                "amount": float(trip.total_collection) if trip.total_collection else None,
            })

        # Recent verified settlements for this date
        recent_settlements = AggregatorTransaction.objects.filter(
            transaction_date=selected_date,
            related_ticket__company_code=company,
            verification_status=AggregatorTransaction.VerificationStatus.VERIFIED,
        ).order_by('-created_at')[:2]

        for s in recent_settlements:
            recent_activity.append({
                "type": "settlement",
                "label": f"Payment verified — {s.transaction_id or 'UPI'}",
                "route": None,
                "time": s.created_at.strftime("%H:%M") if s.created_at else "",
                "amount": float(s.amount) if hasattr(s, 'amount') and s.amount else None,
            })

        # Sort combined list by time desc, keep top 8
        recent_activity = sorted(recent_activity, key=lambda x: x["time"], reverse=True)[:8]

    except Exception as e:
        logger.exception(f"Recent activity error: {str(e)}")
        recent_activity = []

    #  Return response ─
    return Response(
        {
            "message": "success",
            "data": {
                "license_expiry_date": company.product_to_date,
                "collections": collections,
                "operations": operations,
                "settlements": settlements,
                "recent_activity": recent_activity,
            }
        },
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_admin_dashboard_data(request):
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        company_counts = Company.objects.aggregate(
            total=Count('id'),
            validated=Count(Case(When(authentication_status=Company.AuthStatus.APPROVED, then=1), output_field=IntegerField())),
            unvalidated=Count(Case(When(authentication_status=Company.AuthStatus.PENDING, then=1), output_field=IntegerField())),
            validating=Count(Case(When(authentication_status=Company.AuthStatus.VALIDATING, then=1), output_field=IntegerField())),
            expired=Count(Case(When(authentication_status=Company.AuthStatus.EXPIRED, then=1), output_field=IntegerField())),
            blocked=Count(Case(When(authentication_status=Company.AuthStatus.BLOCKED, then=1), output_field=IntegerField())),
        )
        dashboard_data = {
            "company_summary": {},
            "user_summary": {},
            "device_summary": {},
            "dealer_summary": {},
            "session_summary": {},
        }

        dashboard_data['company_summary'].update({
            "total_companies": company_counts['total'],
            "validated_companies": company_counts['validated'],
            "unvalidated_companies": company_counts['unvalidated'],
            "validating_companies": company_counts['validating'],
            "expired_companies": company_counts['expired'],
            "blocked_companies": company_counts['blocked'],
        })

        all_non_admin_users = User.objects.filter(is_superuser=False).count()
        users_by_company_qs = (
            User.objects.filter(is_superuser=False)
            .values('company__company_name')
            .annotate(count=Count('id'))
        )
        users_by_company = [
            {"company_name": row["company__company_name"], "count": row["count"]}
            for row in users_by_company_qs
        ]
        dashboard_data['user_summary'].update({
            "total_users": all_non_admin_users,
            "users_by_company": users_by_company,
        })

        device_counts = ETMDevice.objects.aggregate(
            total=Count('id'),
            stock=Count(Case(When(allocation_status=ETMDevice.AllocationStatus.STOCK, then=1), output_field=IntegerField())),
            dealer_pool=Count(Case(When(allocation_status=ETMDevice.AllocationStatus.DEALER_POOL, then=1), output_field=IntegerField())),
            allocated=Count(Case(When(allocation_status=ETMDevice.AllocationStatus.ALLOCATED, then=1), output_field=IntegerField())),
        )
        dashboard_data['device_summary'].update({
            "total_devices": device_counts['total'],
            "in_stock": device_counts['stock'],
            "dealer_pool": device_counts['dealer_pool'],
            "mapped": device_counts['allocated'],
        })

        dealer_counts = Dealer.objects.aggregate(
            total=Count('id'),
            validated=Count(Case(When(authentication_status=Dealer.AuthStatus.APPROVED, then=1), output_field=IntegerField())),
            unvalidated=Count(Case(When(authentication_status=Dealer.AuthStatus.PENDING, then=1), output_field=IntegerField())),
            validating=Count(Case(When(authentication_status=Dealer.AuthStatus.VALIDATING, then=1), output_field=IntegerField())),
            expired=Count(Case(When(authentication_status=Dealer.AuthStatus.EXPIRED, then=1), output_field=IntegerField())),
            blocked=Count(Case(When(authentication_status=Dealer.AuthStatus.BLOCKED, then=1), output_field=IntegerField())),
        )
        dashboard_data['dealer_summary'].update({
            "total_dealers": dealer_counts['total'],
            "validated_dealers": dealer_counts['validated'],
            "unvalidated_dealers": dealer_counts['unvalidated'],
            "validating_dealers": dealer_counts['validating'],
            "expired_dealers": dealer_counts['expired'],
            "blocked_dealers": dealer_counts['blocked'],
        })

        active_admin_sessions = UserSession.objects.filter(
            is_active=True,
            user__role__in=[
                UserRole.SUPERADMIN, UserRole.COMPANY_ADMIN, UserRole.DEALER_ADMIN,
                UserRole.EXECUTIVE, UserRole.PRODUCTION,
            ],
        ).count()
        dashboard_data['session_summary'].update({
            "active_admin_sessions": active_admin_sessions,
        })

        return Response({"message": "Success", "data": dashboard_data}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"message": "Data fetching failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Sync license (dry-run + confirm) ─────────────────────────────────────────

def _build_company_sync_diff(company, auth_data):
    """
    Compute old vs incoming vs in-use breakdown for the sync confirmation UI.
    Returns a dict with 'current', 'incoming', 'in_use', and 'error' keys.
    error is non-None if NumberOfLicence consistency check fails.
    """
    def _si(val):
        try:
            return int(val or 0)
        except (ValueError, TypeError):
            return 0

    incoming_nol     = _si(auth_data.get('NumberOfLicence'))
    incoming_palmtec = _si(auth_data.get('PalmtecCount'))
    incoming_total   = _si(auth_data.get('TotalUserCount'))
    incoming_premium = _si(auth_data.get('PremiumUserCount'))
    incoming_inter   = _si(auth_data.get('IntermediateUserCount'))

    # Consistency check
    error = None
    if incoming_nol > 0 and (incoming_palmtec + incoming_total) > incoming_nol:
        error = (
            f"License config error: device slots ({incoming_palmtec}) + "
            f"user slots ({incoming_total}) = {incoming_palmtec + incoming_total} "
            f"exceeds total licensed units ({incoming_nol}). "
            "Contact the license server administrator."
        )

    # Live "in use" counts
    palmtec_used = ETMDevice.objects.filter(
        company=company, allocation_status='Allocated',
    ).count()
    sessions_total = UserSession.objects.filter(
        user__company=company, is_active=True,
    ).count()
    sessions_premium = UserSession.objects.filter(
        user__company=company, user__tier=UserTier.PREMIUM, is_active=True,
    ).count()
    sessions_inter = UserSession.objects.filter(
        user__company=company, user__tier=UserTier.INTERMEDIATE, is_active=True,
    ).count()

    raw_from = auth_data.get('ProductFromDate')
    raw_to   = auth_data.get('ProductToDate')
    incoming_from = _parse_license_date(raw_from)
    incoming_to   = _parse_license_date(raw_to)

    return {
        'current': {
            'number_of_licences':      company.number_of_licences or 0,
            'palmtec_count':           company.palmtec_count or 0,
            'total_user_count':        company.total_user_count or 0,
            'premium_user_count':      company.premium_user_count or 0,
            'intermediate_user_count': company.intermediate_user_count or 0,
            'product_from_date':       str(company.product_from_date) if company.product_from_date else None,
            'product_to_date':         str(company.product_to_date)   if company.product_to_date   else None,
        },
        'incoming': {
            'number_of_licences':      incoming_nol,
            'palmtec_count':           incoming_palmtec,
            'total_user_count':        incoming_total,
            'premium_user_count':      incoming_premium,
            'intermediate_user_count': incoming_inter,
            'product_from_date':       str(incoming_from) if incoming_from else None,
            'product_to_date':         str(incoming_to)   if incoming_to   else None,
            'authentication_status':   auth_data.get('Authenticationstatus'),
            'product_registration_id': _si(auth_data.get('ProductRegistrationId')),
            'unique_identifier':       auth_data.get('UniqueIDentifier', ''),
        },
        'in_use': {
            'palmtec_devices_allocated': palmtec_used,
            'active_sessions_total':     sessions_total,
            'active_sessions_premium':   sessions_premium,
            'active_sessions_intermediate': sessions_inter,
        },
        'error': error,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def sync_company_license(request, pk):
    """
    Dry-run sync: fetch latest data from license server, return old vs new diff.
    Does NOT save anything. Call /confirm to apply.

    Access: superadmin, executive (own companies), company_admin (own company).
    """
    user = request.user

    try:
        company = Company.objects.get(pk=pk)
    except Company.DoesNotExist:
        return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Access control
    if _is_company_admin(user):
        if not user.company or user.company_id != company.id:
            return Response({'error': 'You can only sync your own company.'}, status=status.HTTP_403_FORBIDDEN)
    elif _is_executive(user):
        if company.created_by_id != user.id:
            return Response({'error': 'You can only sync companies you created.'}, status=status.HTTP_403_FORBIDDEN)
    elif not _is_superadmin(user):
        return Response({'error': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

    if company.client_type != Company.ClientType.DIRECT:
        return Response({'error': 'Sync is only available for direct companies (not dealer-managed companies).'}, status=status.HTTP_400_BAD_REQUEST)

    if not company.company_id:
        return Response({'error': 'Company is not registered with the license server yet.'}, status=status.HTTP_400_BAD_REQUEST)

    # Fetch from license server (single call, no polling)
    result = fetch_company_from_license_server(company.company_id)
    if not result['success']:
        return Response({'error': result['error']}, status=status.HTTP_502_BAD_GATEWAY)

    diff = _build_company_sync_diff(company, result['data'])
    return Response({'message': 'Sync preview ready.', 'data': diff}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def sync_company_license_confirm(request, pk):
    """
    Apply the sync: re-fetch from license server and write new values to DB.
    Re-fetches rather than trusting client payload to prevent tampering.

    Sync reduction (count decrease with excess users) is deferred — this
    endpoint only applies expansions and date updates cleanly.
    """
    user = request.user

    try:
        company = Company.objects.get(pk=pk)
    except Company.DoesNotExist:
        return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    if _is_company_admin(user):
        if not user.company or user.company_id != company.id:
            return Response({'error': 'You can only sync your own company.'}, status=status.HTTP_403_FORBIDDEN)
    elif _is_executive(user):
        if company.created_by_id != user.id:
            return Response({'error': 'You can only sync companies you created.'}, status=status.HTTP_403_FORBIDDEN)
    elif not _is_superadmin(user):
        return Response({'error': 'Not authorized.'}, status=status.HTTP_403_FORBIDDEN)

    if company.client_type != Company.ClientType.DIRECT:
        return Response({'error': 'Sync is only available for direct companies.'}, status=status.HTTP_400_BAD_REQUEST)

    if not company.company_id:
        return Response({'error': 'Company is not registered with the license server yet.'}, status=status.HTTP_400_BAD_REQUEST)

    result = fetch_company_from_license_server(company.company_id)
    if not result['success']:
        return Response({'error': result['error']}, status=status.HTTP_502_BAD_GATEWAY)

    auth_data = result['data']

    # Re-run consistency check before applying
    diff = _build_company_sync_diff(company, auth_data)
    if diff['error']:
        company.authentication_status = Company.AuthStatus.PENDING
        company.error_message = diff['error']
        company.save(update_fields=['authentication_status', 'error_message'])
        return Response({'error': diff['error']}, status=status.HTTP_400_BAD_REQUEST)

    def _si(val):
        try:
            return int(val or 0)
        except (ValueError, TypeError):
            return 0

    raw_from = auth_data.get('ProductFromDate')
    raw_to   = auth_data.get('ProductToDate')

    status_map = {
        'Approve': Company.AuthStatus.APPROVED,
        'Expired': Company.AuthStatus.EXPIRED,
        'Block':   Company.AuthStatus.BLOCKED,
    }
    new_auth_status = status_map.get(
        auth_data.get('Authenticationstatus', ''),
        company.authentication_status,
    )

    new_total   = _si(auth_data.get('TotalUserCount'))
    new_premium = _si(auth_data.get('PremiumUserCount'))
    new_inter   = _si(auth_data.get('IntermediateUserCount'))

    ok, errs = _check_user_count_reduction(company, new_total, new_premium, new_inter)
    if not ok:
        return Response({
            'error': 'Cannot apply sync: would reduce user counts below current assignments.',
            'details': errs,
        }, status=status.HTTP_400_BAD_REQUEST)

    company.number_of_licences      = _si(auth_data.get('NumberOfLicence'))
    company.palmtec_count           = _si(auth_data.get('PalmtecCount'))
    company.total_user_count        = new_total
    company.premium_user_count      = new_premium
    company.intermediate_user_count = new_inter
    company.product_from_date = _parse_license_date(raw_from) or company.product_from_date
    company.product_to_date   = _parse_license_date(raw_to)   or company.product_to_date
    company.authentication_status   = new_auth_status
    if new_auth_status == Company.AuthStatus.APPROVED:
        company.is_active = True
    company.product_registration_id = _si(auth_data.get('ProductRegistrationId'))
    company.unique_identifier       = auth_data.get('UniqueIDentifier', '') or company.unique_identifier
    company.error_message           = None
    company.save()

    log_action(
        actor=user, action=AuditLog.ActionType.UPDATE,
        target_model='Company', target_id=company.pk,
        target_display=company.company_name,
        details={'action': 'license_sync'},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    serializer = CompanySerializer(company)
    return Response({
        'message': 'License data synced successfully.',
        'data': serializer.data,
    }, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, LicensePermission])
@transaction.atomic
def permanently_delete_company(request, pk):
    """
    Permanently delete a company. Superadmin only.

    Requires the request body to contain {"confirm_name": "<exact company_name>"}
    as an explicit confirmation guard against accidental deletion.

    Takes a full JSON snapshot backup (management/masterdata) before the
    hard-delete. Transactional data (tickets, trips, schedules) is left in
    the DB with an orphaned company_code FK.
    """
    user = request.user
    if user.role != UserRole.SUPERADMIN:
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        company = Company.objects.select_for_update().get(pk=pk)
    except Company.DoesNotExist:
        return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    company_name = company.company_name
    confirm_name = (request.data.get('confirm_name') or '').strip()
    if confirm_name != company_name:
        return Response(
            {'error': f'Confirmation failed. Type the company name "{company_name}" exactly to confirm permanent deletion.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Soft-deactivate all company users before deletion to avoid orphaned logins
    from django.contrib.auth import get_user_model as _get_user_model
    _User = _get_user_model()
    deactivated = _User.objects.filter(company=company, is_active=True).update(is_active=False)
    logger.info(f"Deactivated {deactivated} users for company '{company_name}' before permanent deletion.")

    bak_path = _backup_company_data(company)
    if bak_path:
        logger.info(f"[permanently_delete_company] Backup written: {bak_path}")
    else:
        logger.warning(f"[permanently_delete_company] Backup FAILED for '{company_name}' — proceeding with deletion anyway.")

    _release_protected_transactional_fks(company)
    company.delete()
    logger.warning(f"Company '{company_name}' (pk={pk}) PERMANENTLY DELETED by {user.username}.")

    log_action(
        actor=user, action=AuditLog.ActionType.DELETE,
        target_model='Company', target_id=pk,
        target_display=company_name,
        details={'action': 'permanent_delete'},
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    return Response({'message': f'"{company_name}" permanently deleted.'}, status=status.HTTP_200_OK)

