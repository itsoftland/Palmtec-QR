"""
User management views — Phase 4
================================
Permission matrix:
  superadmin    → create: executive, dealer_admin, company_admin, production
               → view / edit / toggle all non-superadmin users
  executive     → create: company_admin (their own created companies only)
  dealer_admin  → create: company_admin (their dealer's companies only)
               → view / edit company_admins under their dealer
  company_admin → create: company_user (own company only, auto-scoped)
               → view / edit / toggle company_users in own company
               → see tier capacity (remaining slots)
  nobody        → create: superadmin (blocked)
"""

from django.utils import timezone

from django.contrib.auth import get_user_model
from django.db.models import Q as models_Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import Company, Dealer, CustomUser, AuditLog, UserRole, UserTier
from ...serializers.auth import UserSerializer
from ...permissions import LicensePermission
from ..utils import _is_superadmin, _is_executive, _is_dealer_admin, _is_company_admin
from .audit_logs import log_action


User = get_user_model()

_VALID_TIERS = {UserTier.BASIC, UserTier.INTERMEDIATE, UserTier.PREMIUM}
# 'none' is excluded — it's the unassigned state, not a selectable tier


# ── Slot helpers ──────────────────────────────────────────────────────────────

def _check_tier_availability(company, new_tier, exclude_user_id=None):
    """
    Check whether a tier slot is available for assignment.
    Called at user creation and at tier change.

    exclude_user_id: pass the PK of the user being edited so their current
    tier is not double-counted when changing from one tier to another.

    Returns (ok: bool, error: str | None).
    """
    if not company:
        return True, None

    qs = CustomUser.objects.filter(
        company=company,
        role=UserRole.COMPANY_USER,
        is_active=True,
    )
    if exclude_user_id:
        qs = qs.exclude(pk=exclude_user_id)

    # Check total cap first
    total_limit = company.total_user_count or 0
    if total_limit > 0:
        total_assigned = qs.exclude(tier=UserTier.NONE).count()
        if total_assigned >= total_limit:
            return False, (
                f'All user tier slots are in use ({total_assigned}/{total_limit}). '
                'Remove a tier assignment before adding a new one.'
            )

    if new_tier == UserTier.PREMIUM:
        premium_limit = company.premium_user_count or 0
        if premium_limit == 0:
            return False, 'Premium tier is not available for this company.'
        premium_assigned = qs.filter(tier=UserTier.PREMIUM).count()
        if premium_assigned >= premium_limit:
            return False, (
                f'All premium slots are in use ({premium_assigned}/{premium_limit}). '
                'Remove a premium user first.'
            )

    elif new_tier == UserTier.INTERMEDIATE:
        inter_limit = company.intermediate_user_count or 0
        if inter_limit == 0:
            return False, 'Intermediate tier is not available for this company.'
        inter_assigned = qs.filter(tier=UserTier.INTERMEDIATE).count()
        if inter_assigned >= inter_limit:
            return False, (
                f'All intermediate slots are in use ({inter_assigned}/{inter_limit}). '
                'Remove an intermediate user first.'
            )

    elif new_tier == UserTier.BASIC:
        if total_limit > 0:
            basic_limit = total_limit - (company.premium_user_count or 0) - (company.intermediate_user_count or 0)
            basic_assigned = qs.filter(tier=UserTier.BASIC).count()
            if basic_limit <= 0:
                return False, 'No basic slots configured for this company.'
            if basic_assigned >= basic_limit:
                return False, (
                    f'All basic slots are in use ({basic_assigned}/{basic_limit}). '
                    'Remove a basic user or increase total user count.'
                )

    return True, None


# Keep old name as alias so toggle_user_active call-site still works.
_check_user_slot = _check_tier_availability


# ── Create user ───────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def create_user(request):
    requester = request.user

    if not request.data:
        return Response({'error': 'Invalid Input'}, status=status.HTTP_400_BAD_REQUEST)

    username       = request.data.get('username')
    email          = request.data.get('email')
    role           = request.data.get('role')
    password       = request.data.get('password')
    company_id     = request.data.get('company_id')
    requested_tier = (request.data.get('tier') or '').strip().lower()
    executive_state = (request.data.get('state') or '').strip()

    if not all([username, email, role, password]):
        return Response({'error': 'username, email, role, and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if role == UserRole.SUPERADMIN:
        return Response({'error': 'Creating superadmin accounts is not allowed.'}, status=status.HTTP_403_FORBIDDEN)

    company_instance = None
    dealer_instance  = None
    dealer_id        = request.data.get('dealer_id')

    if _is_superadmin(requester):
        if role not in (UserRole.EXECUTIVE, UserRole.COMPANY_ADMIN, UserRole.DEALER_ADMIN, UserRole.PRODUCTION):
            return Response({'error': 'Superadmin can only create executive, dealer_admin, company_admin, or production users.'}, status=status.HTTP_403_FORBIDDEN)
        if role == UserRole.EXECUTIVE:
            if not executive_state:
                return Response({'error': 'state is required when creating an executive user.'}, status=status.HTTP_400_BAD_REQUEST)
        if role == UserRole.DEALER_ADMIN:
            if not dealer_id:
                return Response({'error': 'dealer_id is required for dealer_admin.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                dealer_instance = Dealer.objects.get(id=dealer_id)
            except Dealer.DoesNotExist:
                return Response({'error': 'Dealer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if role == UserRole.COMPANY_ADMIN:
            if not company_id:
                return Response({'error': 'company_id is required for company_admin.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                company_instance = Company.objects.get(id=company_id)
            except Company.DoesNotExist:
                return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    elif _is_executive(requester):
        if role != UserRole.COMPANY_ADMIN:
            return Response({'error': 'Executive can only create company_admin users.'}, status=status.HTTP_403_FORBIDDEN)
        if not company_id:
            return Response({'error': 'company_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not Company.objects.filter(id=company_id, created_by=requester, is_active=True).exists():
            return Response({'error': 'Company not found or not created by you.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            company_instance = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    elif _is_dealer_admin(requester):
        if role != UserRole.COMPANY_ADMIN:
            return Response({'error': 'Dealer admin can only create company_admin users.'}, status=status.HTTP_403_FORBIDDEN)
        if not company_id:
            return Response({'error': 'company_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not requester.dealer_id:
            return Response({'error': 'No dealer linked to this account.'}, status=status.HTTP_400_BAD_REQUEST)
        if not Company.objects.filter(id=company_id, dealer_id=requester.dealer_id, is_active=True).exists():
            return Response({'error': 'Company not found or not under your dealer.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            company_instance = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    elif _is_company_admin(requester):
        if role != UserRole.COMPANY_USER:
            return Response({'error': 'Company admin can only create company_user accounts.'}, status=status.HTTP_403_FORBIDDEN)
        if not requester.company:
            return Response({'error': 'No company linked to this account.'}, status=status.HTTP_400_BAD_REQUEST)
        company_instance = requester.company

    else:
        return Response({'error': 'You do not have permission to create users.'}, status=status.HTTP_403_FORBIDDEN)

    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already exists.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(email=email).exists():
        return Response({'error': 'Email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

    # Determine tier and apply creation-time checks.
    if role == UserRole.COMPANY_ADMIN:
        # Exactly 1 company_admin per company. Tier is always none (role-based access).
        if company_instance and User.objects.filter(
            company=company_instance, role=UserRole.COMPANY_ADMIN, is_active=True,
        ).exists():
            return Response(
                {'error': 'This company already has an active company admin account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tier = 'none'

    elif role == UserRole.COMPANY_USER:
        # Default to none — user cannot login until tier assigned by company_admin
        tier = requested_tier if requested_tier in _VALID_TIERS else UserTier.NONE
        if tier != UserTier.NONE:
            ok, err = _check_tier_availability(company_instance, tier)
            if not ok:
                return Response({'error': err}, status=status.HTTP_409_CONFLICT)

    else:
        tier = 'none'

    # company_admin is pre-verified (trusted account created by superadmin/dealer).
    # company_user starts unverified — first APK login requires device approval.
    is_verified = role == UserRole.COMPANY_ADMIN

    try:
        new_user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            company=company_instance,
            dealer=dealer_instance,
            role=role,
            tier=tier,
            state=executive_state if role == UserRole.EXECUTIVE else None,
            created_by=requester,
            is_verified=is_verified,
        )
        log_action(
            actor=requester, action=AuditLog.ActionType.CREATE,
            target_model='CustomUser', target_id=new_user.pk,
            target_display=new_user.username,
            details={'role': new_user.role, 'tier': new_user.tier},
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response({'message': 'User added successfully'}, status=status.HTTP_201_CREATED)
    except Exception:
        return Response({'message': 'User creation failed'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── List users ────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_all_users(request):
    requester = request.user

    if _is_superadmin(requester):
        direct_company_ids = Company.objects.filter(client_type='direct').values_list('id', flat=True)
        users = CustomUser.objects.filter(
            models_Q(role=UserRole.COMPANY_ADMIN, company_id__in=direct_company_ids) |
            models_Q(role=UserRole.EXECUTIVE) |
            models_Q(role=UserRole.DEALER_ADMIN) |
            models_Q(role=UserRole.PRODUCTION)
        ).order_by('id')

    elif _is_executive(requester):
        own_company_ids = Company.objects.filter(
            created_by=requester, is_active=True,
        ).values_list('id', flat=True)
        users = CustomUser.objects.filter(
            role=UserRole.COMPANY_ADMIN, company_id__in=own_company_ids,
        ).order_by('id')

    elif _is_dealer_admin(requester):
        if not requester.dealer_id:
            return Response({'error': 'No dealer linked.'}, status=status.HTTP_400_BAD_REQUEST)
        dealer_company_ids = Company.objects.filter(
            dealer_id=requester.dealer_id, is_active=True,
        ).values_list('id', flat=True)
        users = CustomUser.objects.filter(
            role=UserRole.COMPANY_ADMIN, company_id__in=dealer_company_ids,
        ).order_by('id')

    elif _is_company_admin(requester):
        if not requester.company:
            return Response({'error': 'No company linked.'}, status=status.HTTP_400_BAD_REQUEST)
        users = CustomUser.objects.filter(
            role=UserRole.COMPANY_USER, company=requester.company,
        ).order_by('id')

    else:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    serializer = UserSerializer(users, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


# ── Update user ───────────────────────────────────────────────────────────────

@api_view(['PUT'])
@permission_classes([IsAuthenticated, LicensePermission])
def update_user(request, user_id):
    """
    Update username, email, and/or tier for a user.

    Authorization:
      superadmin   → any non-superadmin user
      dealer_admin → company_admin of their dealer's companies
      company_admin→ company_user of their own company (username/email/tier)

    Tier changes are validated against remaining tier slots.
    Role and company cannot be changed here — create a new user instead.
    """
    requester = request.user

    try:
        target = User.objects.select_related('company', 'dealer').get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': f'User {user_id} not found.'}, status=status.HTTP_404_NOT_FOUND)

    # ── Authorization scope ───────────────────────────────────────────────────
    if _is_superadmin(requester):
        if target.role == UserRole.SUPERADMIN:
            return Response({'error': 'Cannot edit another superadmin.'}, status=status.HTTP_403_FORBIDDEN)

    elif _is_executive(requester):
        # Can only edit company_admin users of companies they created
        if target.role != UserRole.COMPANY_ADMIN:
            return Response({'error': 'Executive can only edit company_admin users.'}, status=status.HTTP_403_FORBIDDEN)
        if not target.company or target.company.created_by_id != requester.id:
            return Response({'error': 'User is not under a company you created.'}, status=status.HTTP_403_FORBIDDEN)

    elif _is_dealer_admin(requester):
        if not requester.dealer_id:
            return Response({'error': 'No dealer linked.'}, status=status.HTTP_400_BAD_REQUEST)
        # Can only edit company_admin users under their dealer
        if target.role != UserRole.COMPANY_ADMIN:
            return Response({'error': 'Dealer admin can only edit company_admin users.'}, status=status.HTTP_403_FORBIDDEN)
        if not target.company or target.company.dealer_id != requester.dealer_id:
            return Response({'error': 'User is not under your dealer.'}, status=status.HTTP_403_FORBIDDEN)

    elif _is_company_admin(requester):
        # Can only edit company_user accounts within own company
        if target.role != UserRole.COMPANY_USER:
            return Response({'error': 'Company admin can only edit company_user accounts.'}, status=status.HTTP_403_FORBIDDEN)
        if not requester.company or target.company_id != requester.company_id:
            return Response({'error': 'User is not in your company.'}, status=status.HTTP_403_FORBIDDEN)

    else:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    # ── Field extraction ──────────────────────────────────────────────────────
    new_username = (request.data.get('username') or '').strip()
    new_email    = (request.data.get('email')    or '').strip()
    new_tier     = (request.data.get('tier')     or '').strip().lower()
    new_state    = (request.data.get('state')    or '').strip()

    if not new_username or not new_email:
        return Response({'error': 'username and email are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=new_username).exclude(pk=user_id).exists():
        return Response({'error': 'Username already taken.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(email=new_email).exclude(pk=user_id).exists():
        return Response({'error': 'Email already registered to another user.'}, status=status.HTTP_400_BAD_REQUEST)

    # ── State change (executive only, superadmin only) ────────────────────────
    if target.role == UserRole.EXECUTIVE and _is_superadmin(requester):
        if not new_state:
            return Response({'error': 'state is required for executive users.'}, status=status.HTTP_400_BAD_REQUEST)
        target.state = new_state

    # ── Tier change (company_user only, company_admin only) ───────────────────
    old_tier = target.tier
    tier_changed = False
    if new_tier and target.role == UserRole.COMPANY_USER:
        if new_tier not in _VALID_TIERS and new_tier != UserTier.NONE:
            return Response(
                {'error': f'Invalid tier. Choose from: {", ".join(_VALID_TIERS)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if new_tier != target.tier:
            if not _is_company_admin(requester):
                return Response(
                    {'error': 'Only company admin can assign or change user tiers.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if new_tier != UserTier.NONE:
                ok, err = _check_tier_availability(
                    target.company, new_tier, exclude_user_id=target.pk
                )
                if not ok:
                    return Response({'error': err}, status=status.HTTP_409_CONFLICT)
            target.tier = new_tier
            tier_changed = True

    # ── Save ──────────────────────────────────────────────────────────────────
    target.username = new_username
    target.email    = new_email
    update_fields = ['username', 'email', 'tier']
    if target.role == UserRole.EXECUTIVE:
        update_fields.append('state')
    try:
        target.save(update_fields=update_fields)
    except Exception:
        return Response({'error': 'Update failed.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    log_action(
        actor=requester, action=AuditLog.ActionType.UPDATE,
        target_model='CustomUser', target_id=target.pk,
        target_display=target.username,
        ip_address=request.META.get('REMOTE_ADDR'),
    )
    if tier_changed:
        log_action(
            actor=requester, action=AuditLog.ActionType.TIER_CHANGE,
            target_model='CustomUser', target_id=target.pk,
            target_display=target.username,
            details={'old_tier': old_tier, 'new_tier': target.tier},
            ip_address=request.META.get('REMOTE_ADDR'),
        )

    return Response({
        'status': 'success',
        'message': 'User updated successfully',
        'data': UserSerializer(target).data,
    }, status=status.HTTP_200_OK)


# ── Activate / Deactivate (soft-delete) ───────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def toggle_user_active(request, user_id):
    """
    Toggle a user's is_active flag.
      active   → False  : soft-delete; frees the tier slot; kills active session.
      inactive → True   : reactivate; checks slot capacity before allowing.

    Authorization mirrors update_user.
    """
    requester = request.user

    try:
        target = User.objects.select_related('company').get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': f'User {user_id} not found.'}, status=status.HTTP_404_NOT_FOUND)

    # ── Authorization ─────────────────────────────────────────────────────────
    if _is_superadmin(requester):
        if target.role == UserRole.SUPERADMIN:
            return Response({'error': 'Cannot deactivate another superadmin.'}, status=status.HTTP_403_FORBIDDEN)

    elif _is_executive(requester):
        if target.role != UserRole.COMPANY_ADMIN or not target.company or target.company.created_by_id != requester.id:
            return Response({'error': 'Not authorized to toggle this user.'}, status=status.HTTP_403_FORBIDDEN)

    elif _is_dealer_admin(requester):
        if target.role != UserRole.COMPANY_ADMIN or not target.company or target.company.dealer_id != requester.dealer_id:
            return Response({'error': 'Not authorized to toggle this user.'}, status=status.HTTP_403_FORBIDDEN)

    elif _is_company_admin(requester):
        if target.role != UserRole.COMPANY_USER or target.company_id != requester.company_id:
            return Response({'error': 'Not authorized to toggle this user.'}, status=status.HTTP_403_FORBIDDEN)

    else:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    # ── Prevent self-deactivation ─────────────────────────────────────────────
    if target.pk == requester.pk:
        return Response({'error': 'You cannot deactivate your own account.'}, status=status.HTTP_400_BAD_REQUEST)

    # ── Deactivation guards ───────────────────────────────────────────────────
    if target.is_active:
        # Cannot deactivate the last active company_admin — company would be locked out.
        if target.role == UserRole.COMPANY_ADMIN and target.company:
            remaining = User.objects.filter(
                company=target.company, role=UserRole.COMPANY_ADMIN, is_active=True,
            ).exclude(pk=target.pk).count()
            if remaining == 0:
                return Response(
                    {'error': 'Cannot deactivate the only active company admin. Assign another admin first.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    # ── Reactivation checks (inactive → active) ───────────────────────────────
    if not target.is_active and target.role == UserRole.COMPANY_USER:
        if not target.tier or target.tier == UserTier.NONE:
            return Response(
                {'error': 'Cannot reactivate this user: no tier is assigned. Assign a tier first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.company:
            ok, err = _check_tier_availability(target.company, target.tier)
            if not ok:
                return Response({'error': err}, status=status.HTTP_409_CONFLICT)

    was_active = target.is_active
    new_state = not target.is_active
    target.is_active = new_state
    target.save(update_fields=['is_active'])

    # Kill the active session when deactivating so the token is immediately invalid
    if not new_state:
        from ...models import UserSession
        from ...authentication import kill_session
        sessions_to_kill = list(UserSession.objects.filter(user=target, is_active=True))
        for s in sessions_to_kill:
            kill_session(s)
        killed = len(sessions_to_kill)
        if killed:
            import logging
            logging.getLogger(__name__).info(
                f"Killed {killed} session(s) for deactivated user '{target.username}'."
            )

    toggle_action = AuditLog.ActionType.DEACTIVATE if was_active else AuditLog.ActionType.ACTIVATE
    log_action(
        actor=requester, action=toggle_action,
        target_model='CustomUser', target_id=target.pk,
        target_display=target.username,
        ip_address=request.META.get('REMOTE_ADDR'),
    )

    action = 'reactivated' if new_state else 'deactivated'
    return Response({
        'message': f'User {action} successfully.',
        'data': {'id': target.id, 'username': target.username, 'is_active': target.is_active},
    }, status=status.HTTP_200_OK)


# ── Tier / slot capacity ──────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def user_capacity(request):
    """
    Return tier slot usage and remaining capacity for the requester's company.
    Intended for the company admin dashboard ("Add user" button state).

    company_admin: own company.
    superadmin:    ?company_id=<id> query param.
    dealer_admin:  ?company_id=<id> restricted to their dealer.
    """
    requester = request.user

    if _is_company_admin(requester):
        company = requester.company
        if not company:
            return Response({'error': 'No company linked.'}, status=status.HTTP_400_BAD_REQUEST)

    elif _is_superadmin(requester):
        cid = request.query_params.get('company_id')
        if not cid:
            return Response({'error': 'Pass ?company_id=<id>'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            company = Company.objects.get(pk=cid)
        except Company.DoesNotExist:
            return Response({'error': 'Company not found.'}, status=status.HTTP_404_NOT_FOUND)

    elif _is_dealer_admin(requester):
        cid = request.query_params.get('company_id')
        if not cid:
            return Response({'error': 'Pass ?company_id=<id>'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            company = Company.objects.get(pk=cid, dealer_id=requester.dealer_id, is_active=True)
        except Company.DoesNotExist:
            return Response({'error': 'Company not found under your dealer.'}, status=status.HTTP_404_NOT_FOUND)

    else:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    # Count active company_user accounts per tier (company_admin excluded from counts)
    from django.db.models import Count, Case, When, IntegerField, Value
    stats = User.objects.filter(
        company=company, is_active=True,
        role=UserRole.COMPANY_USER,
    ).aggregate(
        total       = Count('id'),
        basic_count = Count(Case(When(tier=UserTier.BASIC,         then=Value(1)), output_field=IntegerField())),
        inter_count = Count(Case(When(tier=UserTier.INTERMEDIATE, then=Value(1)), output_field=IntegerField())),
        prem_count  = Count(Case(When(tier=UserTier.PREMIUM,      then=Value(1)), output_field=IntegerField())),
    )

    def _remaining(limit, used):
        if limit <= 0:
            return None   # null = no limit configured
        return max(0, limit - used)

    return Response({
        'message': 'Success',
        'data': {
            'company_id':   company.id,
            'company_name': company.company_name,
            'total': {
                'limit':     company.total_user_count or None,
                'used':      stats['total'],
                'remaining': _remaining(company.total_user_count, stats['total']),
            },
            'tiers': {
                'basic': {
                    'limit':     None,   # basic has no sub-limit; bounded by total
                    'used':      stats['basic_count'],
                },
                'intermediate': {
                    'limit':     company.intermediate_user_count or None,
                    'used':      stats['inter_count'],
                    'remaining': _remaining(company.intermediate_user_count, stats['inter_count']),
                },
                'premium': {
                    'limit':     company.premium_user_count or None,
                    'used':      stats['prem_count'],
                    'remaining': _remaining(company.premium_user_count, stats['prem_count']),
                },
            },
        },
    }, status=status.HTTP_200_OK)


# ── Admin password reset ──────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def change_user_password(request, user_id):
    """Superadmin directly sets a new password for any user (UI button)."""
    requester = request.user
    if requester.role != UserRole.SUPERADMIN:
        return Response({'error': 'Only superadmin can reset another user\'s password.'}, status=status.HTTP_403_FORBIDDEN)

    new_password = (request.data.get('new_password') or '').strip()
    if not new_password:
        return Response({'error': 'new_password is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(new_password) < 8:
        return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': f'User {user_id} not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        target.set_password(new_password)
        target.save()
        log_action(
            actor=requester, action=AuditLog.ActionType.PASSWORD_RESET,
            target_model='CustomUser', target_id=target.pk,
            target_display=target.username,
            details={'changed_by': requester.username},
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response({
            'status': 'success',
            'message': 'Password changed successfully.',
            'data': {
                'user_id':             target.id,
                'username':            target.username,
                'password_changed_at': timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
            },
        }, status=status.HTTP_200_OK)
    except Exception:
        return Response({'error': 'Password update failed.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
