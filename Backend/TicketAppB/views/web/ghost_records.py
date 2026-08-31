import logging
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from ...models import AggregatorTransaction, AggregatorPayoutCallback, Company, UserRole
from ...permissions import LicensePermission

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_ghost_transactions(request):
    user = request.user
    if user.role != UserRole.SUPERADMIN:
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        qs = AggregatorTransaction.objects.filter(
            company__isnull=True
        ).order_by('-first_received_at')[:500]

        data = [
            {
                'id': t.id,
                'transactionID': t.transactionID,
                'transactionTerminalId': t.transactionTerminalId,
                'narration': t.narration,
                'transactionAmount': str(t.transactionAmount),
                'transaction_date': str(t.transaction_date),
                'merchantId': t.merchantId,
                'responseCode': t.responseCode,
                'verification_status': t.verification_status,
                'first_received_at': t.first_received_at.isoformat(),
            }
            for t in qs
        ]

        return Response({'message': 'success', 'data': data, 'count': len(data)}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("Error fetching ghost transactions")
        return Response({'message': 'Failed to fetch', 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_ghost_payouts(request):
    user = request.user
    if user.role != UserRole.SUPERADMIN:
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        qs = AggregatorPayoutCallback.objects.filter(
            company__isnull=True
        ).order_by('-created_at')[:500]

        data = [
            {
                'id': p.id,
                'statementId': p.statementId,
                'payoutAmount': str(p.payoutAmount),
                'utrNumber': p.utrNumber,
                'payoutDate': p.payoutDate.isoformat(),
                'payoutBank': p.payoutBank,
                'payoutStatus': p.payoutStatus,
                'transaction_count': len(p.transactions),
                'created_at': p.created_at.isoformat(),
            }
            for p in qs
        ]

        return Response({'message': 'success', 'data': data, 'count': len(data)}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("Error fetching ghost payouts")
        return Response({'message': 'Failed to fetch', 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def assign_ghost_company(request):
    user = request.user
    if user.role != UserRole.SUPERADMIN:
        return Response({'error': 'Superadmin only'}, status=status.HTTP_403_FORBIDDEN)

    try:
        record_type = request.data.get('type')
        record_id = request.data.get('id')
        company_id = request.data.get('company_id')

        if record_type not in ('transaction', 'payout'):
            return Response({'error': 'type must be transaction or payout'}, status=status.HTTP_400_BAD_REQUEST)
        if not record_id or not company_id:
            return Response({'error': 'id and company_id are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(pk=company_id)
        except Company.DoesNotExist:
            return Response({'error': f'Company {company_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        if record_type == 'transaction':
            updated = AggregatorTransaction.objects.filter(pk=record_id, company__isnull=True).update(company=company)
            if not updated:
                return Response({'error': 'Transaction not found or already has a company'}, status=status.HTTP_404_NOT_FOUND)
        else:
            updated = AggregatorPayoutCallback.objects.filter(pk=record_id, company__isnull=True).update(company=company)
            if not updated:
                return Response({'error': 'Payout not found or already has a company'}, status=status.HTTP_404_NOT_FOUND)

        logger.info("Superadmin %s assigned company %s to %s id=%s", user.username, company_id, record_type, record_id)
        return Response({'message': 'Company assigned successfully'}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("Error assigning company to ghost record")
        return Response({'message': 'Assignment failed', 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
