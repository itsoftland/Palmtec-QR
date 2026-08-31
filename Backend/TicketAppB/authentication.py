"""
SessionAuthentication
=====================
DRF authentication backend that reads the pqr_session HttpOnly cookie,
validates it against Redis (cache) then DB (source of truth), and sets
request.user and request.auth for all authenticated views.

request.user  → the authenticated CustomUser instance
request.auth  → SessionInfo(session_uid, device_type)

Per-request cost (normal path):
  1 x Redis GET  (cache hit → user_id)
  1 x DB  GET    (User with select_related company/dealer — hot PK row)
  1 x Redis SET  (TTL reset, only if >60s since last reset — see _maybe_extend_ttl)

On Redis miss (cold start, cache eviction, Redis restart):
  1 x DB  GET    (UserSession with is_active=True)
  1 x Redis SET  (repopulate cache)
  1 x DB  GET    (User with select_related)

On force-logout or natural expiry:
  Cache miss → DB lookup → is_active=False → 401. No stale state possible.
"""

from collections import namedtuple

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import UserSession, UserRole, UserTier

# Carried on request.auth for all authenticated requests.
# session_uid  — the opaque session identifier (UUID string)
# device_type  — the device type string from the session ('android', 'ios',
#                'web_desktop', 'web_mobile'). Used to select the correct
#                idle timeout without an extra DB or Redis read.
SessionInfo = namedtuple('SessionInfo', ['session_uid', 'device_type'])


User=get_user_model()

COOKIE_NAME = 'pqr_session'
_CACHE_KEY_PREFIX = 'pqr:session:'
_REVOKED_KEY_PREFIX = 'pqr:revoked:'

# How long to keep the revocation marker in Redis after a session is killed.
# Covers any in-flight requests that already passed the cache check.
_REVOKED_TTL = 60  # seconds




def _cache_key(session_uid:str)->str:
    return f'{_CACHE_KEY_PREFIX}{session_uid}'


def _revoked_key(session_uid: str) -> str:
    return f'{_REVOKED_KEY_PREFIX}{session_uid}'


def get_session_timeout(device_type: str = None) -> int:
    """
    Returns the idle timeout in seconds for the given device type.
    Android/iOS sessions use SESSION_IDLE_TIMEOUT_APK (default 12h).
    All other sessions use SESSION_IDLE_TIMEOUT (default 20min).
    """
    if device_type in ('android', 'ios'):
        return int(getattr(settings, 'SESSION_IDLE_TIMEOUT_APK', 43200))
    return int(getattr(settings, 'SESSION_IDLE_TIMEOUT', 1200))


def set_session_cache(session_uid: str, user_id: int, device_type: str = 'web_desktop') -> None:
    """
    Write the Redis cache entry for this session.
    Value format: "user_id:device_type" — device_type is stored so the auth
    backend can apply the correct idle timeout on every subsequent request
    without an extra DB read.
    Called at login, keepalive, and on a cache miss during auth.
    """
    cache.set(
        _cache_key(session_uid),
        f'{user_id}:{device_type}',
        timeout=get_session_timeout(device_type),
    )


def delete_session_cache(session_uid: str) -> None:
    """
    Remove the Redis cache entry for this session.
    Called at logout and force-logout. After this call, the session is dead
    on the next request regardless of what the DB says.
    """
    cache.delete(_cache_key(session_uid))


def set_session_revoked(session_uid: str) -> None:
    """
    Write a short-lived revocation marker before deleting the session cache key.
    Blocks _maybe_extend_ttl from re-adding the session to Redis on any
    in-flight request that already passed the cache-hit check — preventing
    a killed session from being silently resurrected for the TTL window.
    """
    cache.set(_revoked_key(session_uid), '1', timeout=_REVOKED_TTL)


def kill_session(session) -> None:
    """
    Canonical session termination used by auth.py, sessions.py, and signals.py.
    Order matters:
      1. DB: is_active = False  (source of truth — survives Redis restart)
      2. Revocation marker set  (blocks _maybe_extend_ttl resurrection for 60s)
      3. Cache key deleted      (instant 401 on next request)
    """
    session.is_active = False
    session.save(update_fields=['is_active'])
    uid = str(session.session_uid)
    set_session_revoked(uid)
    delete_session_cache(uid)

def session_key_exists(session_uid: str) -> bool:
    """
    Returns True if the Redis cache key for this session is still alive.
    Used at login to detect ghost sessions: DB shows is_active=True but the
    Redis TTL already expired, meaning the user was auto-logged out and the
    Celery sweep hasn't run yet. One cache.get() — no DB hit.
    """
    return bool(cache.get(_cache_key(session_uid)))


def _maybe_extend_ttl(session_uid: str, user_id: int, device_type: str) -> None:
    """
    Reset the Redis TTL for this session using the correct timeout for its device type.
    Checks the revocation marker first — if the session was killed mid-flight,
    do not write the key back and accidentally resurrect it.
    """
    if cache.get(_revoked_key(session_uid)):
        return  # session was killed mid-flight — do not resurrect it
    cache.set(
        _cache_key(session_uid),
        f'{user_id}:{device_type}',
        timeout=get_session_timeout(device_type),
    )



def _update_last_seen(session_uid: str) -> None:
    """
    Debounced DB write for last_seen_at.
    Updates at most once per 5 minutes per session to keep admin UI current
    without a DB write on every request.
    Called after a successful cache hit — we don't have the session object,
    so we use update() on the queryset directly.
    """
    debounce_key=f'pqr:seen:{session_uid}'
    if cache.get(debounce_key):
        return
    cache.set(debounce_key, 1, timeout=300)  # 5 minute debounce

    UserSession.objects.filter(session_uid=session_uid, is_active=True,).update(last_seen_at=timezone.now())



class SessionAuthentication(BaseAuthentication):
    """
    Reads pqr_session cookie → validates via Redis → falls back to DB.
    Returns (user, session_uid) or raises AuthenticationFailed.
    Returns (None, None) when no session cookie is present (unauthenticated
    request — DRF will then check permissions and return 401 or 403 as needed).
    """
    def authenticate(self, request):
        session_uid=request.COOKIES.get(COOKIE_NAME)
        if not session_uid:
            # no credentials present — let DRF handle as anonymous
            return None
        
        # ── Try Redis cache first ─────────────────────────────────────────────
        cached_value = cache.get(_cache_key(session_uid))
        if cached_value:
            # Parse composite value "user_id:device_type".
            # Backward compat: old-format entries contain only "user_id" (no colon).
            # Treat those as web_desktop so they get the web timeout.
            parts = str(cached_value).split(':', 1)
            cached_user_id_str = parts[0]
            device_type = parts[1] if len(parts) == 2 else 'web_desktop'

            # Revocation marker: set by kill_session for 60s after a force-logout.
            # Prevents _maybe_extend_ttl from resurrecting the session on in-flight
            # requests that already passed the cache check before the kill happened.
            if cache.get(_revoked_key(session_uid)):
                delete_session_cache(session_uid)
                # Return None (not AuthenticationFailed) so AllowAny views (login,
                # logout) still work when a user retries with a killed-session cookie.
                return None

            try:
                user = User.objects.select_related('company', 'dealer').get(
                    pk=int(cached_user_id_str),
                    is_active=True,
                )
            except (User.DoesNotExist, ValueError):
                delete_session_cache(session_uid)
                return None

            _maybe_extend_ttl(session_uid, int(cached_user_id_str), device_type)
            _update_last_seen(session_uid)
            self._check_tier(user)
            return (user, SessionInfo(session_uid, device_type))

        # ── Cache miss: fall back to DB ───────────────────────────────────────
        try:
            session = UserSession.objects.select_related(
                'user', 'user__company', 'user__dealer',
            ).get(session_uid=session_uid, is_active=True)
        except UserSession.DoesNotExist:
            # Dead/expired cookie — treat as anonymous so AllowAny views (login,
            # logout) proceed normally. IsAuthenticated views still get 401 via
            # DRF's NotAuthenticated, so protected routes are unaffected.
            return None

        user = session.user
        if not user.is_active:
            return None

        # Repopulate cache
        device_type = str(session.device_type) if session.device_type else 'web_desktop'
        set_session_cache(session_uid, user.pk, device_type)
        _update_last_seen(session_uid)
        self._check_tier(user)
        return (user, SessionInfo(session_uid, device_type))

    @staticmethod
    def _check_tier(user):
        if user.role == UserRole.COMPANY_USER and user.tier == UserTier.NONE:
            raise AuthenticationFailed({
                'error': 'Your account has no tier assigned. Contact your company administrator.',
                'error_code': 'NO_TIER_ASSIGNED',
            })

    def authenticate_header(self, request):
        return 'Session'
