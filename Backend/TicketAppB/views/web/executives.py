# Executive visibility is now handled via:
#   - Company.created_by  → which companies this executive created
#   - CustomUser.state    → which state the executive is restricted to (Phase 4)
#
# The old ExecutiveCompanyMapping join table has been removed.
# The three old mapping endpoints return 410 Gone.
# executive_dashboard has been rewritten to use the new pattern.

from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model

from ...models import Company, UserRole
from ...serializers.company import CompanySerializer
from ...permissions import LicensePermission
from ..utils import _is_superadmin


User = get_user_model()

_MAPPING_GONE = {
    "error_code": "ENDPOINT_REMOVED",
    "error": (
        "Executive–company mappings have been removed. "
        "Executive visibility is now derived from Company.created_by. "
        "See ARCHITECTURE.md for the new model."
    ),
}


# ── Removed mapping endpoints (410 Gone) ─────────────────────────────────────

@api_view(['POST'])
def create_executive_mapping(request):
    return Response(_MAPPING_GONE, status=status.HTTP_410_GONE)


@api_view(['GET'])
def get_executive_mappings(request):
    return Response(_MAPPING_GONE, status=status.HTTP_410_GONE)


@api_view(['PUT'])
def update_executive_mapping(request, pk):
    return Response(_MAPPING_GONE, status=status.HTTP_410_GONE)


# ── Executive Dashboard ───────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def executive_dashboard(request):
    """
    Executive dashboard.
    Returns all active companies created by this executive.

    TODO Phase 4: also filter by executive's state (CustomUser.state) if set,
                  so state-restricted executives only see their own state's companies.

    Also accessible to superadmin when ?executive=<user_id> is provided.
    """
    user = request.user

    if _is_superadmin(user):
        exec_id = request.query_params.get('executive')
        if not exec_id:
            return Response(
                {'error': 'Pass ?executive=<user_id> as superadmin'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            target_user = User.objects.get(id=exec_id, role=UserRole.EXECUTIVE)
        except User.DoesNotExist:
            return Response({'error': 'Executive user not found'}, status=status.HTTP_404_NOT_FOUND)

    elif user.role == UserRole.EXECUTIVE:
        target_user = user

    else:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    companies = (
        Company.objects
        .filter(created_by=target_user, is_active=True)
        .order_by('company_name')
    )
    serializer = CompanySerializer(companies, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)
