"""
GlobalSettings views — Phase 5 (About page)
============================================
GET  /about              → any authenticated user (company/dealer/admin) — support contact info
GET  /global-settings    → superadmin only — full settings record
PUT  /global-settings    → superadmin only — update support contact info
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models import GlobalSettings
from ...permissions import LicensePermission
from ..utils import _is_superadmin


# ── About page (read — any role) ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def about(request):
    """
    Returns the developer/support contact information shown on every About page.
    Accessible to all authenticated users regardless of role.
    """
    user = request.user

    gs = GlobalSettings.get()
    return Response({
        'message': 'Success',
        'data': {
            'support_company_name': gs.support_company_name,
            'support_email':        gs.support_email,
            'support_phone':        gs.support_phone,
        },
    }, status=status.HTTP_200_OK)


# ── GlobalSettings CRUD (superadmin only) ────────────────────────────────────

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated, LicensePermission])
def global_settings(request):
    """
    GET  — Return the full GlobalSettings record (superadmin).
    PUT  — Update support contact info (superadmin).
           Accepts any subset of { support_company_name, support_email, support_phone }.
    """
    user = request.user
    if not _is_superadmin(user):
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    gs = GlobalSettings.get()

    if request.method == 'GET':
        return Response({
            'message': 'Success',
            'data': {
                'support_company_name': gs.support_company_name,
                'support_email':        gs.support_email,
                'support_phone':        gs.support_phone,
                'updated_at':           gs.updated_at.isoformat() if gs.updated_at else None,
                'updated_by':           gs.updated_by_id,
            },
        }, status=status.HTTP_200_OK)

    # PUT
    data = request.data or {}
    changed = False

    name  = data.get('support_company_name')
    email = data.get('support_email')
    phone = data.get('support_phone')

    if name is not None:
        gs.support_company_name = name.strip() or None
        changed = True
    if email is not None:
        gs.support_email = email.strip() or None
        changed = True
    if phone is not None:
        gs.support_phone = phone.strip() or None
        changed = True

    if not changed:
        return Response({'error': 'No fields provided to update.'}, status=status.HTTP_400_BAD_REQUEST)

    gs.updated_by = user
    gs.save()

    return Response({
        'message': 'Global settings updated.',
        'data': {
            'support_company_name': gs.support_company_name,
            'support_email':        gs.support_email,
            'support_phone':        gs.support_phone,
        },
    }, status=status.HTTP_200_OK)
