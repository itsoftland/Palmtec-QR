"""
Session management and device approval views.

force-logout now has two layers (DB + Redis cache delete) instead of three.
No JWT blacklisting — there are no refresh tokens to blacklist.
request.user and request.auth are set by SessionAuthentication.
"""

import logging
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import UserSession, UserApprovedDevice, DevicePendingApproval, Company, UserTier
from ...authentication import kill_session
from ...permissions import LicensePermission

logger = logging.getLogger(__name__)


# ── Internal helpers ──────────────────────────────────────────────────────────



def _tier_slot_available(company, user):
    if not company or company.total_user_count == 0:
        return True, None
    active_total = UserSession.objects.filter(
        user__company=company, is_active=True,
    ).count()
    if active_total >= company.total_user_count:
        return False, 'All login slots are in use. Deactivate a user first.'
    if user.tier == UserTier.PREMIUM and company.premium_user_count > 0:
        active_premium = UserSession.objects.filter(
            user__company=company, user__tier=UserTier.PREMIUM, is_active=True,
        ).count()
        if active_premium >= company.premium_user_count:
            return False, 'All premium tier slots are in use.'
    if user.tier == UserTier.INTERMEDIATE and company.intermediate_user_count > 0:
        active_intermediate = UserSession.objects.filter(
            user__company=company, user__tier=UserTier.INTERMEDIATE, is_active=True,
        ).count()
        if active_intermediate >= company.intermediate_user_count:
            return False, 'All intermediate tier slots are in use.'
    return True, None


# ── Session listing — company_admin ───────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def list_sessions(request):
    """List active sessions for this company. company_admin only."""
    user = request.user
    if user.role != 'company_admin' or not user.company:
        return Response(
            {'error': 'Company admin access required.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    current_session_uid = request.auth.session_uid

    sessions = UserSession.objects.filter(
        user__company=user.company,
        is_active=True,
    ).select_related('user').order_by('-created_at')

    data = [
        {
            'session_uid':        str(s.session_uid),
            'user_id':            s.user_id,
            'username':           s.user.username,
            'tier':               s.user.tier,
            'device_type':        s.device_type,
            'device_uuid':        s.device_uuid or None,
            'login_time':         s.created_at,
            'last_active':        s.last_seen_at,
            'is_current_session': str(s.session_uid) == current_session_uid,
        }
        for s in sessions
    ]
    return Response({'message': 'Success', 'data': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def force_logout_session(request, session_uid):
    """Force-logout a session by uid. company_admin only."""
    user = request.user
    if user.role != 'company_admin' or not user.company:
        return Response(
            {'error': 'Company admin access required.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        session = UserSession.objects.select_related('user').get(
            session_uid=session_uid, is_active=True,
        )
    except UserSession.DoesNotExist:
        return Response(
            {'error': 'Session not found or already inactive.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if session.user.company_id != user.company_id:
        return Response(
            {'error': 'Not authorised to manage this session.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if session.user_id == user.id:
        return Response(
            {'error': 'Cannot force logout your own session.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    kill_session(session)
    logger.info(
        f"company_admin '{user.username}' force-logged-out "
        f"session {session_uid} for user '{session.user.username}'"
    )
    return Response(
        {'message': f"Session for '{session.user.username}' has been terminated."},
    )


# ── Session listing — superadmin ──────────────────────────────────────────────

_ADMIN_ROLES = ('superadmin', 'company_admin', 'dealer_admin', 'executive', 'production')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_all_sessions(request):
    """Superadmin: list active sessions for all admin-level accounts."""
    if request.user.role != 'superadmin':
        return Response(
            {'error': 'Superadmin access required.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    current_session_uid = request.auth.session_uid

    sessions = UserSession.objects.filter(
        is_active=True,
        user__role__in=_ADMIN_ROLES,
    ).select_related('user', 'user__company').order_by('-created_at')

    data = [
        {
            'session_uid':        str(s.session_uid),
            'user_id':            s.user_id,
            'username':           s.user.username,
            'role':               s.user.role,
            'company_name':       s.user.company.company_name if s.user.company else None,
            'device_type':        s.device_type,
            'device_uuid':        s.device_uuid or None,
            'login_time':         s.created_at,
            'last_active':        s.last_seen_at,
            'is_current_session': str(s.session_uid) == current_session_uid,
        }
        for s in sessions
    ]
    return Response({'message': 'Success', 'data': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def force_logout_session_admin(request, session_uid):
    """Superadmin: force-logout any admin-level session."""
    if request.user.role != 'superadmin':
        return Response(
            {'error': 'Superadmin access required.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        session = UserSession.objects.select_related('user').get(
            session_uid=session_uid, is_active=True,
        )
    except UserSession.DoesNotExist:
        return Response(
            {'error': 'Session not found or already inactive.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if str(session.session_uid) == request.auth.session_uid:
        return Response(
            {'error': 'Cannot force logout your own session.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    kill_session(session)
    logger.info(
        f"superadmin '{request.user.username}' force-logged-out "
        f"session {session_uid} for user '{session.user.username}'"
    )
    return Response(
        {'message': f"Session for '{session.user.username}' has been terminated."},
    )


# ── Device approvals ──────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def list_pending_approvals(request):
    """List pending device approval requests for this company. company_admin only."""
    user = request.user
    if user.role != 'company_admin' or not user.company:
        return Response({'error': 'Company admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    pending = DevicePendingApproval.objects.filter(
        user__company=user.company,
        status=DevicePendingApproval.Status.PENDING,
    ).select_related('user').order_by('-requested_at')

    data = [
        {
            'id':           p.id,
            'user_id':      p.user_id,
            'username':     p.user.username,
            'tier':         p.user.tier,
            'device_uuid':  p.device_uuid,
            'device_type':  p.device_type,
            'requested_at': p.requested_at,
        }
        for p in pending
    ]
    return Response({'message': 'Success', 'data': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def approve_device(request, approval_id):
    """Approve a device login request. Checks tier slot availability before approving."""
    user = request.user
    if user.role != 'company_admin' or not user.company:
        return Response({'error': 'Company admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        approval = DevicePendingApproval.objects.select_related('user').get(
            pk=approval_id, status=DevicePendingApproval.Status.PENDING,
        )
    except DevicePendingApproval.DoesNotExist:
        return Response({'error': 'Approval request not found or already handled.'}, status=status.HTTP_404_NOT_FOUND)

    if approval.user.company_id != user.company_id:
        return Response({'error': 'Not authorized to approve this request.'}, status=status.HTTP_403_FORBIDDEN)

    ok, err = _tier_slot_available(user.company, approval.user)
    if not ok:
        return Response({'error': err}, status=status.HTTP_403_FORBIDDEN)

    UserApprovedDevice.objects.get_or_create(
        user=approval.user,
        device_uuid=approval.device_uuid,
        defaults={'approved_by': user},
    )

    if not approval.user.is_verified:
        approval.user.is_verified = True
        approval.user.save(update_fields=['is_verified'])

    approval.status = DevicePendingApproval.Status.APPROVED
    approval.reviewed_by = user
    approval.reviewed_at = timezone.now()
    approval.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

    has_active_session = UserSession.objects.filter(
        user=approval.user, is_active=True,
    ).exists()

    logger.info(
        f"company_admin '{user.username}' approved device "
        f"{approval.device_uuid[:16]}… for user '{approval.user.username}'"
    )
    return Response(
        {
            'message': (
                f"Device approved for '{approval.user.username}'. "
                "They are currently logged in elsewhere and will need to log out first."
                if has_active_session else
                f"Device approved for '{approval.user.username}'. They can now log in."
            ),
            'has_active_session': has_active_session,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def reject_device(request, approval_id):
    """Reject a device login request."""
    user = request.user
    if user.role != 'company_admin' or not user.company:
        return Response({'error': 'Company admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        approval = DevicePendingApproval.objects.select_related('user').get(
            pk=approval_id, status=DevicePendingApproval.Status.PENDING,
        )
    except DevicePendingApproval.DoesNotExist:
        return Response({'error': 'Approval request not found or already handled.'}, status=status.HTTP_404_NOT_FOUND)

    if approval.user.company_id != user.company_id:
        return Response({'error': 'Not authorized to reject this request.'}, status=status.HTTP_403_FORBIDDEN)

    approval.status = DevicePendingApproval.Status.REJECTED
    approval.reviewed_by = user
    approval.reviewed_at = timezone.now()
    approval.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

    logger.info(
        f"company_admin '{user.username}' rejected device "
        f"{approval.device_uuid[:16]}… for user '{approval.user.username}'"
    )
    return Response(
        {'message': f"Device request rejected for '{approval.user.username}'."},
    )
