"""
Auth views
==========
Cookie name: pqr_session (single HttpOnly cookie — no access_token,
             refresh_token, or session_uid cookies).

request.user and request.auth (session_uid) are set by
TicketAppB.authentication.SessionAuthentication for all authenticated views.

Login check order:
  1.  Input validation
  2.  Credentials + is_active
  3.  Entity checks (company/dealer active, license valid)
  4.  Platform restriction (superadmin/company_admin cannot use APK)
  5.  Device approval check (APK + company_user only)
  6.  Session conflict check — returns SESSION_CONFLICT or kills old session
      if force_login=True, inside atomic block with select_for_update
  7.  Tier / concurrent session cap (company_user only)
  8.  Create UserSession (DB + Redis)
  9.  Issue pqr_session cookie
  10. Side effects (last_login, audit log, notifications)
"""

import uuid
import logging

from django.db import transaction
from django.utils import timezone
from django.core.mail import send_mail
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.contrib.auth import get_user_model, authenticate
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from ...models import Company, UserSession, AuditLog, UserApprovedDevice, DevicePendingApproval, UserTier
from ...authentication import (
    set_session_cache, delete_session_cache, set_session_revoked,
    kill_session, session_key_exists, get_session_timeout, SessionInfo, COOKIE_NAME,
)
from .audit_logs import log_action

logger = logging.getLogger(__name__)
_token_generator = PasswordResetTokenGenerator()
User = get_user_model()


# ── Helpers ───────────────────────────────────────────────────────────────────

# Source - https://stackoverflow.com/a/5976065
# Posted by Sævar
# Retrieved 2026-05-13, License - CC BY-SA 3.0
def _get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[-1].strip()
    return request.META.get('REMOTE_ADDR')


def _is_apk_request(request):
    if hasattr(request, 'data') and isinstance(request.data, dict):
        hint = str(request.data.get('device_type', '')).lower()
        return hint in ('android', 'ios')
    return False


def _detect_device_type(request):
    if hasattr(request, 'data') and isinstance(request.data, dict):
        hint = str(request.data.get('device_type', '')).lower()
        mapping = {
            'android':     UserSession.DeviceType.ANDROID,
            'ios':         UserSession.DeviceType.IOS,
            'web_desktop': UserSession.DeviceType.WEB_DESKTOP,
            'web_mobile':  UserSession.DeviceType.WEB_MOBILE,
        }
        if hint in mapping:
            return mapping[hint]
    ua = request.META.get('HTTP_USER_AGENT', '').lower()
    if 'android' in ua:
        return UserSession.DeviceType.ANDROID
    if 'iphone' in ua or 'ipad' in ua:
        return UserSession.DeviceType.IOS
    if 'mobile' in ua:
        return UserSession.DeviceType.WEB_MOBILE
    return UserSession.DeviceType.WEB_DESKTOP



def _user_payload(user, company):
    valid_till = None
    if company and company.product_to_date:
        valid_till = company.product_to_date.strftime('%d-%m-%Y')
    return {
        'id':             user.id,
        'username':       user.username,
        'email':          user.email,
        'role':           user.role,
        'tier':           user.tier,
        'state':          user.state,
        'is_verified':    user.is_verified,
        'company_name':   company.company_name   if company else None,
        'company_id':     company.company_id     if company else None,
        'valid_till':     valid_till,
        'license_status': company.authentication_status if company else None,
    }


def _set_session_cookie(response, session_uid: str, device_type: str = 'web_desktop') -> None:
    timeout = get_session_timeout(device_type)
    # Add a 300s buffer so the cookie outlasts the frontend idle timer even when
    # the last keepalive was sent up to 5 minutes before the user went idle.
    response.set_cookie(
        key=COOKIE_NAME,
        value=str(session_uid),
        max_age=timeout + 300,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite='Lax',
        path='/',
    )


def _clear_session_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, path='/')


# ── Login ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Full login flow — see module docstring for check order.

    On SESSION_CONFLICT the response includes device_type and active_since so
    the frontend can display a meaningful prompt. If the user chooses to proceed,
    the frontend re-submits with force_login=True to kill the old session.
    """
    if not request.data:
        return Response(
            {'error': 'Invalid request. No credentials provided.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'error': 'Please provide username and password.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    force_login = bool(request.data.get('force_login', False))

    # ── 1+2: Credentials + is_active ─────────────────────────────────────────
    user = authenticate(username=username, password=password)

    if not user:
        try:
            existing = User.objects.get(username=username)
            if not existing.is_active:
                return Response(
                    {'error': 'Account is inactive. Contact administrator.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except User.DoesNotExist:
            pass
        return Response(
            {'error': 'Invalid credentials.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {'error': 'Account is inactive. Contact administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # ── 3: Entity checks ──────────────────────────────────────────────────────
    company = user.company
    if company:
        print(company.company_id)
        if not company.is_active:
            return Response(
                {'error': 'Company account is deactivated. Contact administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if company.product_to_date and timezone.now().date() > company.product_to_date:
            return Response(
                {'error': f'License expired (ID: {company.company_id}). Contact administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if company.authentication_status and company.authentication_status != Company.AuthStatus.APPROVED:
            return Response(
                {'error': 'License not yet approved. Contact administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )

    dealer = user.dealer
    if dealer and not dealer.is_active:
        return Response(
            {'error': 'Dealer account is deactivated. Contact administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    is_apk = _is_apk_request(request)

    # ── 4: Platform restriction ───────────────────────────────────────────────
    if user.role in ('superadmin', 'company_admin') and is_apk:
        return Response(
            {'error': 'This account can only log in via the web dashboard.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # ── 5: Device approval check (APK + company_user only) ───────────────────
    device_uuid = None
    if is_apk and user.role == 'company_user':
        device_uuid = (
            request.data.get('uuid') or request.data.get('device_uuid') or ''
        ).strip() or None

        if not device_uuid:
            return Response(
                {
                    'error': 'Device identifier required for mobile login. Please update your app.',
                    'error_code': 'DEVICE_UUID_MISSING',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        approved = UserApprovedDevice.objects.filter(
            user=user, device_uuid=device_uuid, is_revoked=False,
        ).exists()

        if not approved:
            DevicePendingApproval.objects.get_or_create(
                user=user,
                device_uuid=device_uuid,
                defaults={
                    'device_type': str(_detect_device_type(request)),
                    'status': DevicePendingApproval.Status.PENDING,
                },
            )
            return Response(
                {
                    'error': 'Initial login on this device. Contact your company admin for approval.',
                    'error_code': 'DEVICE_PENDING',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

    # ── 5b: Hard block — company_user with no tier cannot login ──────────────
    if user.role == 'company_user' and (not user.tier or user.tier == UserTier.NONE):
        return Response({
            'error': 'Your account has no tier assigned. Contact your company administrator.',
            'error_code': 'NO_TIER_ASSIGNED',
        }, status=status.HTTP_403_FORBIDDEN)

    # ── 6–8: Session conflict + tier check + session creation (atomic) ────────
    with transaction.atomic():
        # Row-level lock: serialises concurrent logins for the same user.
        User.objects.select_for_update().get(pk=user.pk)

        existing_session = UserSession.objects.filter(
            user=user, is_active=True,
        ).select_related('user').first()

        if existing_session:
            # Ghost session detection: Redis key absent can mean two things —
            # either the session genuinely expired (TTL elapsed naturally) or
            # Redis evicted/restarted while the session was still active.
            # We use last_seen_at age against the correct timeout to tell them apart.
            # No extra DB read — existing_session is already in memory.
            if not session_key_exists(str(existing_session.session_uid)):
                idle_seconds = (
                    timezone.now() - existing_session.last_seen_at
                ).total_seconds()
                session_timeout = get_session_timeout(str(existing_session.device_type))

                if idle_seconds > session_timeout:
                    # Genuinely expired: last activity is older than the idle
                    # timeout. The Celery sweep hasn't cleaned this row yet.
                    # Safe to treat as ghost — clear it and allow login.
                    existing_session.is_active = False
                    existing_session.save(update_fields=['is_active'])
                    existing_session = None
                else:
                    # Redis key is absent but last_seen_at is recent — Redis was
                    # evicted or restarted. The session is still legitimately active.
                    # Repopulate the cache so subsequent requests work correctly,
                    # then fall through to SESSION_CONFLICT below.
                    set_session_cache(
                        str(existing_session.session_uid),
                        existing_session.user_id,
                        str(existing_session.device_type),
                    )

        if existing_session:
            if not force_login:
                return Response(
                    {
                        'error': (
                            'You are already logged in on another device. '
                            'Log out from there first, or choose to log out remotely.'
                        ),
                        'error_code': 'SESSION_CONFLICT',
                        'conflict': {
                            'device_type': existing_session.device_type,
                            'active_since': existing_session.created_at.isoformat(),
                        },
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            else:
                kill_session(existing_session)

        # ── 7: Tier / concurrent session cap (company_user only) ──────────────
        if user.role == 'company_user' and company:
            if company.total_user_count > 0:
                active_count = UserSession.objects.filter(
                    user__company=company, is_active=True,
                ).count()
                if active_count >= company.total_user_count:
                    return Response(
                        {'error': 'All login slots are in use. Another user must log out first.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

            if user.tier == UserTier.PREMIUM and company.premium_user_count > 0:
                premium_active = UserSession.objects.filter(
                    user__company=company, user__tier=UserTier.PREMIUM, is_active=True,
                ).count()
                if premium_active >= company.premium_user_count:
                    return Response(
                        {'error': 'All premium tier slots are in use.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

            if user.tier == UserTier.INTERMEDIATE and company.intermediate_user_count > 0:
                intermediate_active = UserSession.objects.filter(
                    user__company=company, user__tier=UserTier.INTERMEDIATE, is_active=True,
                ).count()
                if intermediate_active >= company.intermediate_user_count:
                    return Response(
                        {'error': 'All intermediate tier slots are in use.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

        # ── 8: Create session ──────────────────────────────────────────────────
        session = UserSession.objects.create(
            user=user,
            session_uid=uuid.uuid4(),
            device_type=_detect_device_type(request),
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:500],
            is_active=True,
            last_seen_at=timezone.now(),
            device_uuid=device_uuid,
        )
        session_uid = str(session.session_uid)
        device_type = str(session.device_type)
        set_session_cache(session_uid, user.pk, device_type)

    # ── 9: Issue cookie ───────────────────────────────────────────────────────
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])

    response = Response({
        'message': 'Login successful.',
        'user': _user_payload(user, company),
        'session_timeout_seconds': get_session_timeout(device_type),
    })
    _set_session_cookie(response, session_uid, device_type)

    # ── 10: Side effects ──────────────────────────────────────────────────────
    try:
        from .notifications import get_login_notifications
        notifications = get_login_notifications(user, company)
        if notifications:
            response.data['notifications'] = notifications
    except Exception as exc:
        logger.warning(f'Failed to compute login notifications: {exc}')

    log_action(
        actor=user, action=AuditLog.ActionType.LOGIN,
        target_model='CustomUser', target_id=user.pk,
        target_display=user.username,
        details={'device_type': str(_detect_device_type(request))},
        ip_address=_get_client_ip(request),
    )

    return response


# ── Logout ────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """
    Logout. Clears the pqr_session cookie and invalidates the session.
    AllowAny so the cookie is always cleared even if the session is already expired.
    """
    session_uid = request.COOKIES.get(COOKIE_NAME)
    logged_out_user = getattr(request, 'user', None)
    if logged_out_user and not logged_out_user.is_authenticated:
        logged_out_user = None

    if session_uid:
        try:
            session = UserSession.objects.get(session_uid=session_uid, is_active=True)
            kill_session(session)
            if not logged_out_user:
                logged_out_user = session.user
        except UserSession.DoesNotExist:
            delete_session_cache(session_uid)

    if logged_out_user:
        log_action(
            actor=logged_out_user, action=AuditLog.ActionType.LOGOUT,
            target_model='CustomUser', target_id=logged_out_user.pk,
            target_display=logged_out_user.username,
            ip_address=_get_client_ip(request),
        )

    response = Response({'message': 'Logged out successfully.'})
    _clear_session_cookie(response)
    return response


# ── Keepalive ─────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def session_keepalive(request):
    """
    Lightweight session keepalive. Resets the Redis TTL and updates last_seen_at.
    Called by the web frontend when the user is active (interaction-event-driven,
    at most once per 5 minutes). APK uses passive debounce via regular requests.
    Returns the remaining session timeout so the frontend can sync its idle timer.
    """
    session_uid = request.auth.session_uid
    device_type = request.auth.device_type
    user = request.user

    set_session_cache(session_uid, user.pk, device_type)

    UserSession.objects.filter(
        session_uid=session_uid, is_active=True,
    ).update(last_seen_at=timezone.now())

    response = Response({
        'alive': True,
        'session_timeout_seconds': get_session_timeout(device_type),
    })
    # Refresh the cookie on every keepalive so the browser cookie expiry tracks
    # user activity, preventing SESSION_CONFLICT when idle logout fires after
    # the original login cookie has already expired.
    _set_session_cookie(response, session_uid, device_type)
    return response


# ── Verify Auth ───────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verify_auth(request):
    """
    Auth check called on page load and tab focus. Returns current user payload.
    request.user is already resolved by SessionAuthentication — one Redis read total.
    Uses _user_payload for a consistent shape with the login response (including state).
    """
    return Response({
        'authenticated': True,
        'user': _user_payload(request.user, request.user.company),
        'session_timeout_seconds': get_session_timeout(request.auth.device_type),
    })


# ── Password Reset ────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    """
    Initiate self-service password reset.
    Accepts { email }.  Always responds with 200 to prevent email enumeration.
    """
    email = (request.data.get('email') or '').strip().lower()
    if not email:
        return Response({'error': 'email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(email__iexact=email, is_active=True)
    except User.DoesNotExist:
        return Response({'message': 'If an account with that email exists, a reset link has been sent.'}, status=status.HTTP_200_OK)

    uid   = urlsafe_base64_encode(force_bytes(user.pk))
    token = _token_generator.make_token(user)

    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    reset_link   = f'{frontend_url}/reset-password?uid={uid}&token={token}'

    subject = 'Password Reset Request'
    body = (
        f'Hello {user.username},\n\n'
        f'We received a request to reset your password.\n\n'
        f'Click the link below to set a new password (expires in 3 days):\n'
        f'{reset_link}\n\n'
        f'If you did not request a password reset, ignore this email — your password will not change.\n\n'
        f'— Bus Management App'
    )

    try:
        send_mail(
            subject,
            body,
            getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@busmanagement.app'),
            [user.email],
            fail_silently=False,
        )
        logger.info(f"Password reset email sent to {user.email} (user_id={user.pk})")
    except Exception as exc:
        logger.error(f"Failed to send password reset email to {user.email}: {exc}")

    return Response({'message': 'If an account with that email exists, a reset link has been sent.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """
    Complete self-service password reset.
    Accepts { uid, token, new_password }.
    """
    uid_b64      = (request.data.get('uid')          or '').strip()
    token        = (request.data.get('token')         or '').strip()
    new_password = (request.data.get('new_password')  or '').strip()

    if not uid_b64 or not token or not new_password:
        return Response({'error': 'uid, token, and new_password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if len(new_password) < 8:
        return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        uid  = force_str(urlsafe_base64_decode(uid_b64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response({'error': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    if not _token_generator.check_token(user, token):
        return Response({'error': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()

    log_action(
        actor=user, action=AuditLog.ActionType.PASSWORD_RESET,
        target_model='CustomUser', target_id=user.pk,
        target_display=user.username,
        details={'self_service': True},
        ip_address=_get_client_ip(request),
    )

    # Fix 5: kill all active sessions — DB and Redis both.
    # The original code only bulk-updated the DB, leaving Redis keys alive for up
    # to 20 minutes. An attacker holding a stolen cookie could still authenticate
    # during that window because SessionAuthentication finds the Redis key first.
    active_sessions = list(
        UserSession.objects.filter(user=user, is_active=True).values_list('session_uid', flat=True)
    )
    UserSession.objects.filter(user=user, is_active=True).update(is_active=False)
    for uid in active_sessions:
        uid_str = str(uid)
        set_session_revoked(uid_str)
        delete_session_cache(uid_str)

    logger.info(f"Password reset completed for user_id={user.pk} ({user.username})")
    return Response({'message': 'Password reset successfully. Please log in with your new password.'}, status=status.HTTP_200_OK)








# ── Apk Login ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def apk_login_view(request):
    """
    Full login flow — see module docstring for check order.

    On SESSION_CONFLICT the response includes device_type and active_since so
    the frontend can display a meaningful prompt. If the user chooses to proceed,
    the frontend re-submits with force_login=True to kill the old session.
    """
    if not request.data:
        return Response(
            {'error': 'Invalid request. No credentials provided.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    username = request.data.get('username')
    password = request.data.get('password')
    company_code = request.data.get('company_code')

    if not username or not password:
        return Response(
            {'error': 'Please provide username and password.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    force_login = bool(request.data.get('force_login', False))

    # ── 1+2: Credentials + is_active ─────────────────────────────────────────
    user = authenticate(username=username, password=password)

    if not user:
        try:
            existing = User.objects.get(username=username)
            if not existing.is_active:
                return Response(
                    {'error': 'Account is inactive. Contact administrator.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except User.DoesNotExist:
            pass
        return Response(
            {'error': 'Invalid credentials.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {'error': 'Account is inactive. Contact administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # ── 3: Entity checks ──────────────────────────────────────────────────────
    company = user.company
    if company:
        if company_code != company.company_id:
              return Response(
                {'error': 'The entered company code does not match the provided credentials.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not company.is_active:
            return Response(
                {'error': 'Company account is deactivated. Contact administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if company.product_to_date and timezone.now().date() > company.product_to_date:
            return Response(
                {'error': f'License expired (ID: {company.company_id}). Contact administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if company.authentication_status and company.authentication_status != Company.AuthStatus.APPROVED:
            return Response(
                {'error': 'License not yet approved. Contact administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )

    dealer = user.dealer
    if dealer and not dealer.is_active:
        return Response(
            {'error': 'Dealer account is deactivated. Contact administrator.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    is_apk = _is_apk_request(request)

    # ── 4: Platform restriction ───────────────────────────────────────────────
    if user.role in ('superadmin', 'company_admin') and is_apk:
        return Response(
            {'error': 'This account can only log in via the web dashboard.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # ── 5: Device approval check (APK + company_user only) ───────────────────
    device_uuid = None
    if is_apk and user.role == 'company_user':
        device_uuid = (
            request.data.get('uuid') or request.data.get('device_uuid') or ''
        ).strip() or None

        if not device_uuid:
            return Response(
                {
                    'error': 'Device identifier required for mobile login. Please update your app.',
                    'error_code': 'DEVICE_UUID_MISSING',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        approved = UserApprovedDevice.objects.filter(
            user=user, device_uuid=device_uuid, is_revoked=False,
        ).exists()

        if not approved:
            DevicePendingApproval.objects.get_or_create(
                user=user,
                device_uuid=device_uuid,
                defaults={
                    'device_type': str(_detect_device_type(request)),
                    'status': DevicePendingApproval.Status.PENDING,
                },
            )
            return Response(
                {
                    'error': 'Initial login on this device. Contact your company admin for approval.',
                    'error_code': 'DEVICE_PENDING',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

    # ── 5b: Hard block — company_user with no tier cannot login ──────────────
    if user.role == 'company_user' and (not user.tier or user.tier == UserTier.NONE):
        return Response({
            'error': 'Your account has no tier assigned. Contact your company administrator.',
            'error_code': 'NO_TIER_ASSIGNED',
        }, status=status.HTTP_403_FORBIDDEN)

    # ── 6–8: Session conflict + tier check + session creation (atomic) ────────
    with transaction.atomic():
        # Row-level lock: serialises concurrent logins for the same user.
        User.objects.select_for_update().get(pk=user.pk)

        existing_session = UserSession.objects.filter(
            user=user, is_active=True,
        ).select_related('user').first()

        if existing_session:
            # Ghost session detection: Redis key absent can mean two things —
            # either the session genuinely expired (TTL elapsed naturally) or
            # Redis evicted/restarted while the session was still active.
            # We use last_seen_at age against the correct timeout to tell them apart.
            # No extra DB read — existing_session is already in memory.
            if not session_key_exists(str(existing_session.session_uid)):
                idle_seconds = (
                    timezone.now() - existing_session.last_seen_at
                ).total_seconds()
                session_timeout = get_session_timeout(str(existing_session.device_type))

                if idle_seconds > session_timeout:
                    # Genuinely expired: last activity is older than the idle
                    # timeout. The Celery sweep hasn't cleaned this row yet.
                    # Safe to treat as ghost — clear it and allow login.
                    existing_session.is_active = False
                    existing_session.save(update_fields=['is_active'])
                    existing_session = None
                else:
                    # Redis key is absent but last_seen_at is recent — Redis was
                    # evicted or restarted. The session is still legitimately active.
                    # Repopulate the cache so subsequent requests work correctly,
                    # then fall through to SESSION_CONFLICT below.
                    set_session_cache(
                        str(existing_session.session_uid),
                        existing_session.user_id,
                        str(existing_session.device_type),
                    )

        if existing_session:
            if not force_login:
                return Response(
                    {
                        'error': (
                            'You are already logged in on another device. '
                            'Log out from there first, or choose to log out remotely.'
                        ),
                        'error_code': 'SESSION_CONFLICT',
                        'conflict': {
                            'device_type': existing_session.device_type,
                            'active_since': existing_session.created_at.isoformat(),
                        },
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            else:
                kill_session(existing_session)

        # ── 7: Tier / concurrent session cap (company_user only) ──────────────
        if user.role == 'company_user' and company:
            if company.total_user_count > 0:
                active_count = UserSession.objects.filter(
                    user__company=company, is_active=True,
                ).count()
                if active_count >= company.total_user_count:
                    return Response(
                        {'error': 'All login slots are in use. Another user must log out first.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

            if user.tier == UserTier.PREMIUM and company.premium_user_count > 0:
                premium_active = UserSession.objects.filter(
                    user__company=company, user__tier=UserTier.PREMIUM, is_active=True,
                ).count()
                if premium_active >= company.premium_user_count:
                    return Response(
                        {'error': 'All premium tier slots are in use.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

            if user.tier == UserTier.INTERMEDIATE and company.intermediate_user_count > 0:
                intermediate_active = UserSession.objects.filter(
                    user__company=company, user__tier=UserTier.INTERMEDIATE, is_active=True,
                ).count()
                if intermediate_active >= company.intermediate_user_count:
                    return Response(
                        {'error': 'All intermediate tier slots are in use.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

        # ── 8: Create session ──────────────────────────────────────────────────
        session = UserSession.objects.create(
            user=user,
            session_uid=uuid.uuid4(),
            device_type=_detect_device_type(request),
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:500],
            is_active=True,
            last_seen_at=timezone.now(),
            device_uuid=device_uuid,
        )
        session_uid = str(session.session_uid)
        device_type = str(session.device_type)
        set_session_cache(session_uid, user.pk, device_type)

    # ── 9: Issue cookie ───────────────────────────────────────────────────────
    user.last_login = timezone.now()
    user.save(update_fields=['last_login'])

    response = Response({
        'message': 'Login successful.',
        'user': _user_payload(user, company),
        'session_timeout_seconds': get_session_timeout(device_type),
    })
    _set_session_cookie(response, session_uid, device_type)

    # ── 10: Side effects ──────────────────────────────────────────────────────
    try:
        from .notifications import get_login_notifications
        notifications = get_login_notifications(user, company)
        if notifications:
            response.data['notifications'] = notifications
    except Exception as exc:
        logger.warning(f'Failed to compute login notifications: {exc}')

    log_action(
        actor=user, action=AuditLog.ActionType.LOGIN,
        target_model='CustomUser', target_id=user.pk,
        target_display=user.username,
        details={'device_type': str(_detect_device_type(request))},
        ip_address=_get_client_ip(request),
    )

    return response