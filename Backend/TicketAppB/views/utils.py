from functools import wraps
from django.http import JsonResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError as DRFValidationError
from django.core.cache import cache
from ..models.auth import UserRole

# ── Role constants (aliases for the canonical enum) ───────────────────────────
ROLE_SUPERADMIN    = UserRole.SUPERADMIN
ROLE_EXECUTIVE     = UserRole.EXECUTIVE
ROLE_DEALER_ADMIN  = UserRole.DEALER_ADMIN
ROLE_COMPANY_ADMIN = UserRole.COMPANY_ADMIN

# ── Role checkers ─────────────────────────────────────────────────────────────
def _is_superadmin(user):
    return user and user.role == ROLE_SUPERADMIN

def _is_executive(user):
    return user and user.role == ROLE_EXECUTIVE

def _is_dealer_admin(user):
    return user and user.role == ROLE_DEALER_ADMIN

def _is_company_admin(user):
    return user and user.role == ROLE_COMPANY_ADMIN

def _is_superadmin_or_executive(user):
    return user and user.role in (ROLE_SUPERADMIN, ROLE_EXECUTIVE)

# ── Tier access ───────────────────────────────────────────────────────────────
_TIER_ORDER = {'basic': 0, 'intermediate': 1, 'premium': 2}
_TIER_ERROR = {"error": "This report requires Intermediate tier or above."}
_PREMIUM_TIER_ERROR = {"error": "This feature requires Premium tier or above."}

def _meets_tier(user, minimum: str) -> bool:
    """
    True if user's tier is >= minimum. Non-company roles are always allowed.

    This gate runs at the plain Django path() level, outside the wrapped
    view's own @api_view/@permission_classes — so request.user here is set by
    Django's built-in AuthenticationMiddleware, not by this project's custom
    cookie-based DRF SessionAuthentication. For a request with no valid Django
    session that's always AnonymousUser, which has no .role. Let those through
    so the inner view's IsAuthenticated permission can reject them with a
    proper 401 instead of crashing here with an AttributeError.
    """
    if not getattr(user, 'is_authenticated', False):
        return True
    if user.role not in (UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER):
        return True
    return _TIER_ORDER.get(user.tier or 'basic', 0) >= _TIER_ORDER.get(minimum, 0)


def require_tier_for_apk(minimum: str, error: dict):
    """
    URL-registration-level tier gate for views shared between the web dashboard
    and the APK (e.g. views/apk/master_send.py, dual-mounted in urls.py and
    apk_urls.py). Apply this wrapper only on the apk_urls.py path() entries so
    the web-mounted route for the same view function stays ungated.
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not _meets_tier(request.user, minimum):
                return JsonResponse(error, status=403)
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def _get_company(company_id):
    key = f"company:{company_id}"
    company = cache.get(key)
    if company is None:
        from ..models import Company
        company = Company.objects.filter(company_id=company_id).first()
        if company:
            cache.set(key, company, timeout=3600)
    return company


def _get_authenticated_company_admin(request):
    """
    Validates that the request comes from an authenticated company_admin with a
    mapped company. Raises DRF exceptions on failure — DRF catches these
    automatically and returns the correct HTTP response (401/403/400), so callers
    never need to check a return value for errors.

    Usage:
        user, company = _get_authenticated_company_admin(request)
        # proceed — no error check needed
    """
    user = request.user
    if not user or not user.is_authenticated:
        raise AuthenticationFailed('Authentication required.')
    if user.role != UserRole.COMPANY_ADMIN:
        raise PermissionDenied('Only company admins can access this.')
    company = user.company
    if not company:
        raise DRFValidationError({'error': 'No company mapped to this user.'})
    return user, company


def _get_object_or_404(model, pk, company):
    try:
        obj = model.objects.get(pk=pk, company=company)
        return obj, None
    except model.DoesNotExist:
        return None, Response(
            {'error': f'{model.__name__} not found.'},
            status=status.HTTP_404_NOT_FOUND
        )



CACHE_MISS_SENTINEL = "__NOT_FOUND__"

def _get_company_for_palmtec(company_id):
    key = f"company:{company_id}"
    cached_pk = cache.get(key)

    if cached_pk == CACHE_MISS_SENTINEL:
        return None  # already know it doesn't exist

    from ..models import Company
    if cached_pk is not None:
        return Company.objects.get(pk=cached_pk)

    company = Company.objects.filter(company_id=company_id).first()

    if company:
        cache.set(key, company.pk, timeout=3600)
    else:
        cache.set(key, CACHE_MISS_SENTINEL, timeout=300)  # cache the "not found" too

    return company



def _validate_checksum(endpoint: str, raw: str) -> bool:
    # Device computes: sum of HttpDataBuff[1..len-1] where HttpDataBuff =
    # "{endpoint}?fn={pipe_string_up_to_pipe_before_checksum}" and len = len of that string.
    # Wraps: if running_sum > 30000, subtract 30000.
    # Checksum is parts[-2]; parts[-1] is trailing empty.
    parts = raw.split("|")
    if len(parts) < 2:
        return False
    try:
        received = int(parts[-2])
    except ValueError:
        return False

    payload = endpoint + "?fn=" + "|".join(parts[:-2]) + "|"
    total = 0
    for ch in payload[1:]:
        total += ord(ch)
        if total > 30000:
            total -= 30000

    return total == received
    


def _get_route_for_palmtec(route_code: str, company_instance):
    from ..models import Route
    cache_key=f"route:{company_instance.pk}:{route_code}"
    cached_pk=cache.get(cache_key)

    if cached_pk == CACHE_MISS_SENTINEL:
        # cache returned "__not_found__"
        # we stored this before — route doesn't exist
        return None
    
    if cached_pk is not None:
        # cache returned an actual PK like 7
        # use it to fetch from DB
        return Route.objects.filter(pk=cached_pk).first()
    else:
        # cache returned None — key was never stored
        # we have no choice, so ask the database
        route=Route.objects.filter(route_code=route_code, company=company_instance).first()

        if route:
            cache.set(key=cache_key,value=route.pk,timeout=3600)
            return route
        else:
            cache.set(key=cache_key, value=CACHE_MISS_SENTINEL, timeout=300) 
            return None