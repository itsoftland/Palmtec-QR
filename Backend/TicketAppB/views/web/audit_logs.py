"""
Audit log views + write helper — Phase 5
=========================================
log_action()  — call this from any view/service that does a significant action.
list_audit_logs() — superadmin-only paginated read.

AuditLog is append-only; no update or delete endpoints are exposed.
"""

import logging
from datetime import datetime, timedelta

from django.utils import timezone as tz
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import AuditLog
from ...permissions import LicensePermission
from ..utils import _is_superadmin

logger = logging.getLogger(__name__)

_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE     = 200


# ── Write helper ──────────────────────────────────────────────────────────────

def log_action(
    actor,
    action,
    target_model,
    target_id     = None,
    target_display= None,
    details       = None,
    ip_address    = None,
):
    """
    Append a record to AuditLog.  Safe to call from any context — exceptions
    are caught and logged so an audit failure never breaks the main flow.

    Usage:
        log_action(
            actor=user,
            action=AuditLog.ActionType.CREATE,
            target_model='Company',
            target_id=company.pk,
            target_display=company.company_name,
            details={'client_type': 'direct'},
            ip_address=_get_client_ip(request),
        )
    """
    try:
        AuditLog.objects.create(
            actor                  = actor,
            actor_username_snapshot= (actor.username if actor else 'system'),
            action                 = action,
            target_model           = target_model,
            target_id              = str(target_id) if target_id is not None else None,
            target_display         = target_display,
            details                = details,
            ip_address             = ip_address,
        )
    except Exception as exc:
        logger.error(f"[audit] Failed to write log entry: {exc}", exc_info=True)


# ── Serialiser (inline — no DRF ModelSerializer needed for a read-only view) ──

def _serialize_entry(entry):
    return {
        'id':                     entry.id,
        'timestamp':              entry.timestamp.isoformat() if entry.timestamp else None,
        'actor_id':               entry.actor_id,
        'actor_username':         entry.actor_username_snapshot,
        'action':                 entry.action,
        'action_display':         entry.get_action_display(),
        'target_model':           entry.target_model,
        'target_id':              entry.target_id,
        'target_display':         entry.target_display,
        'details':                entry.details,
        'ip_address':             entry.ip_address,
    }


# ── Views ─────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def list_audit_logs(request):
    """
    GET /audit-logs
    Superadmin only.  Paginated, newest-first.

    Query params:
      ?action=<str>       — filter by AuditLog.ActionType value
      ?model=<str>        — filter by target_model (e.g. 'Company')
      ?actor_id=<int>     — filter by actor user ID
      ?from=YYYY-MM-DD    — earliest timestamp (inclusive)
      ?to=YYYY-MM-DD      — latest timestamp (inclusive, extends to end of day)
      ?page=<int>         — 1-based page number (default 1)
      ?page_size=<int>    — records per page (default 50, max 200)
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    qs = AuditLog.objects.select_related('actor').order_by('-timestamp')

    # ── Filters ───────────────────────────────────────────────────────────────
    action_filter = request.query_params.get('action')
    if action_filter:
        qs = qs.filter(action=action_filter)

    model_filter = request.query_params.get('model')
    if model_filter:
        qs = qs.filter(target_model__iexact=model_filter)

    actor_filter = request.query_params.get('actor_id')
    if actor_filter:
        qs = qs.filter(actor_id=actor_filter)

    search_filter = request.query_params.get('search')
    if search_filter:
        from django.db.models import Q
        qs = qs.filter(
            Q(actor_username_snapshot__icontains=search_filter) |
            Q(target_display__icontains=search_filter)
        )

    from_date = request.query_params.get('from')
    if from_date:
        d = parse_date(from_date)
        if d:
            qs = qs.filter(timestamp__gte=tz.make_aware(datetime.combine(d, datetime.min.time())))

    to_date = request.query_params.get('to')
    if to_date:
        d = parse_date(to_date)
        if d:
            qs = qs.filter(timestamp__lt=tz.make_aware(datetime.combine(d + timedelta(days=1), datetime.min.time())))

    # ── Pagination ────────────────────────────────────────────────────────────
    try:
        page      = max(1, int(request.query_params.get('page', 1)))
        page_size = min(_MAX_PAGE_SIZE, max(1, int(request.query_params.get('page_size', _DEFAULT_PAGE_SIZE))))
    except (TypeError, ValueError):
        page, page_size = 1, _DEFAULT_PAGE_SIZE

    total   = qs.count()
    offset  = (page - 1) * page_size
    entries = qs[offset: offset + page_size]

    return Response({
        'message': 'Success',
        'pagination': {
            'total':      total,
            'page':       page,
            'page_size':  page_size,
            'total_pages': -(-total // page_size),   # ceiling division
        },
        'data': [_serialize_entry(e) for e in entries],
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def audit_log_action_types(request):
    """
    GET /audit-logs/action-types
    Returns the list of valid action type choices for frontend filter dropdowns.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    return Response({
        'message': 'Success',
        'data': [
            {'value': value, 'label': label}
            for value, label in AuditLog.ActionType.choices
        ],
    }, status=status.HTTP_200_OK)
