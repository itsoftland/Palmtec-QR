import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from django.utils import timezone as tz
from rest_framework import status
from ...models import TransactionData, Company, AggregatorTransaction, AggregatorPayoutCallback, UserRole
from django.http import HttpResponse, JsonResponse
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from ...serializers.payments import AggregatorTransactionSerializer, SettlementVerificationSerializer
import json
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from ...permissions import LicensePermission
from django.db.models import Count, Sum, Q
from django.conf import settings

logger = logging.getLogger(__name__)

@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_payout_data(request):
    user = request.user

    if user.role != UserRole.COMPANY_ADMIN:
        return Response({'error': 'Insufficient permissions'}, status=status.HTTP_403_FORBIDDEN)

    try:
        from_date = request.GET.get('from_date')
        to_date = request.GET.get('to_date')

        if not from_date or not to_date:
            return Response({'error': 'from_date and to_date are required'}, status=status.HTTP_400_BAD_REQUEST)

        IST = ZoneInfo('Asia/Kolkata')
        from_dt = datetime.strptime(from_date, '%Y-%m-%d').replace(tzinfo=IST)
        to_dt = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59, tzinfo=IST)

        payouts = list(AggregatorPayoutCallback.objects.filter(
            company=user.company,
            payoutDate__gte=from_dt,
            payoutDate__lte=to_dt,
        ).order_by('-payoutDate')[:200])

        # Collect all txn_ids across all payouts, then hit DB once
        payout_txn_map = {}
        all_txn_ids = set()
        for p in payouts:
            ids = set()
            for t in p.transactions:
                raw = t.get('transactionId') or t.get('transactionID')
                try:
                    ids.add(int(raw))
                except (TypeError, ValueError):
                    pass
            payout_txn_map[p.id] = ids
            all_txn_ids.update(ids)

        verified_ids = set(
            AggregatorTransaction.objects.filter(
                transactionID__in=all_txn_ids,
                verification_status='VERIFIED',
            ).values_list('transactionID', flat=True)
        ) if all_txn_ids else set()

        result = []
        for p in payouts:
            verified_count = len(payout_txn_map[p.id] & verified_ids)

            result.append({
                'id': p.id,
                'statementId': p.statementId,
                'payoutAmount': str(p.payoutAmount/100),
                'utrNumber': p.utrNumber,
                'payoutDate': p.payoutDate.isoformat(),
                'payoutAccount': p.payoutAccount,
                'payoutBank': p.payoutBank,
                'payoutStatus': p.payoutStatus,
                'transactions': p.transactions,
                'deductions': p.deductions,
                'transaction_count': len(p.transactions),
                'verified_count': verified_count,
                'created_at': p.created_at.isoformat(),
            })

        return Response({'message': 'success', 'data': result, 'count': len(result)}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("Error fetching payout data")
        return Response({'message': 'Failed to fetch payout data', 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_settlement_data(request):
    """
    Fetch payment aggregator transactions for settlement verification.

    Query Parameters:
    - from_date: Start date (YYYY-MM-DD) - required
    - to_date: End date (YYYY-MM-DD) - required
    - verification_status: Filter by verification status (optional)
    - reconciliation_status: Filter by reconciliation status (optional)
    - payment_status: 'approved' or 'declined' (optional)
    """
    user = request.user
    
    if user.role != UserRole.COMPANY_ADMIN:
        return Response({'error': 'Insufficient permissions'}, status=status.HTTP_403_FORBIDDEN)
    
    try:
        # Get date range
        from_date = request.GET.get('from_date')
        to_date = request.GET.get('to_date')
        
        if not from_date or not to_date:
            return Response({'error': 'from_date and to_date are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Base queryset
        queryset = AggregatorTransaction.objects.filter(
            company=user.company,
            transaction_date__gte=from_date,
            transaction_date__lte=to_date,
        )

        # Filter by verification status
        verification_status = request.GET.get('verification_status')
        if verification_status and verification_status != 'ALL':
            queryset = queryset.filter(verification_status=verification_status)
        
        # Filter by reconciliation status
        reconciliation_status = request.GET.get('reconciliation_status')
        if reconciliation_status and reconciliation_status != 'ALL':
            queryset = queryset.filter(reconciliation_status=reconciliation_status)
        
        # Filter by payment status (approved/declined)
        payment_status = request.GET.get('payment_status')
        if payment_status == 'approved':
            queryset = queryset.filter(responseCode__in=['0', '00', '000'])
        elif payment_status == 'declined':
            queryset = queryset.exclude(responseCode__in=['0', '00', '000'])
        
        # Filter by merchant ID
        merchant_id = request.GET.get('merchant_id')
        if merchant_id and merchant_id != 'ALL':
            queryset = queryset.filter(merchantId=merchant_id)
        
        # Order by datetime (newest first)
        queryset = queryset.select_related('related_ticket', 'verified_by')
        queryset = queryset.order_by('-transaction_datetime')
        
        # Limit to 500 records
        queryset = queryset[:500]
        
        # Serialize
        serializer = AggregatorTransactionSerializer(queryset, many=True)
        
        return Response({'message': 'success','data': serializer.data,'count': len(serializer.data)}, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.exception("Error fetching settlement data")
        return Response({'message': 'Data fetching failed','error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def verify_settlement(request):
    """
    Manager verifies/rejects a settlement transaction.

    Request body:
    {
        "transaction_id": 123,
        "verification_status": "VERIFIED" | "REJECTED" | "FLAGGED",
        "verification_notes": "Optional notes"
    }
    """
    user = request.user
    
    if user.role != UserRole.COMPANY_ADMIN:
        return Response({'error': 'Insufficient permissions'}, status=status.HTTP_403_FORBIDDEN)
    
    try:
        # Validate input
        serializer = SettlementVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': 'Invalid data','details': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get transaction
        transaction_id = serializer.validated_data['transaction_id']
        transaction = AggregatorTransaction.objects.get(id=transaction_id)
        
        # Check if already verified by someone else
        if transaction.verification_status == AggregatorTransaction.VerificationStatus.VERIFIED:
            return Response({
                'error': 'Transaction already verified',
                'verified_by': transaction.verified_by.username if transaction.verified_by else None
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update verification
        new_status = serializer.validated_data['verification_status']
        notes = serializer.validated_data.get('verification_notes', '')
        
        transaction.verification_status = new_status
        transaction.verified_by = user
        # uses django utils timezone class
        transaction.verified_at = tz.now()
        transaction.verification_notes = notes
        
        # If verified, update processing status
        if new_status == 'VERIFIED':
            transaction.processing_status = AggregatorTransaction.ProcessingStatus.PENDING_VERIFICATION

        transaction.save()

        # Return updated transaction
        response_serializer = AggregatorTransactionSerializer(transaction)
        
        return Response({'message': 'Transaction verified successfully','data': response_serializer.data}, status=status.HTTP_200_OK)
        
    except AggregatorTransaction.DoesNotExist:
        return Response({'error': 'Transaction not found'}, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        logger.exception("Error verifying settlement")
        return Response({'message': 'Verification failed','error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_settlement_summary(request):
    """
    Get summary statistics for settlement verification dashboard.

    Query Parameters:
    - from_date: Start date (YYYY-MM-DD) - required
    - to_date: End date (YYYY-MM-DD) - required
    """
    user = request.user
    
    if user.role != UserRole.COMPANY_ADMIN:
        return Response({'error': 'Insufficient permissions'}, status=status.HTTP_403_FORBIDDEN)
    
    try:
        from_date = request.GET.get('from_date')
        to_date = request.GET.get('to_date')
        
        if not from_date or not to_date:
            return Response({'error': 'from_date and to_date are required'}, status=status.HTTP_400_BAD_REQUEST)

        # Base queryset
        queryset = AggregatorTransaction.objects.filter(
            company=user.company,
            transaction_date__gte=from_date,
            transaction_date__lte=to_date,
        )

        APPROVED_CODES = ['0', '00', '000']
        VS = AggregatorTransaction.VerificationStatus
        RS = AggregatorTransaction.ReconciliationStatus

        stats = queryset.aggregate(
            total=Count('id'),
            unverified=Count('id', filter=Q(verification_status=VS.UNVERIFIED)),
            verified=Count('id', filter=Q(verification_status=VS.VERIFIED)),
            rejected=Count('id', filter=Q(verification_status=VS.REJECTED)),
            flagged=Count('id', filter=Q(verification_status=VS.FLAGGED)),
            auto_matched=Count('id', filter=Q(reconciliation_status=RS.AUTO_MATCHED)),
            amount_mismatch=Count('id', filter=Q(reconciliation_status=RS.AMOUNT_MISMATCH)),
            not_found=Count('id', filter=Q(reconciliation_status=RS.NOT_FOUND)),
            duplicate=Count('id', filter=Q(reconciliation_status=RS.DUPLICATE)),
            approved=Count('id', filter=Q(responseCode__in=APPROVED_CODES)),
            declined=Count('id', filter=~Q(responseCode__in=APPROVED_CODES)),
            total_amount=Sum('transactionAmount', filter=Q(responseCode__in=APPROVED_CODES)),
            verified_amount=Sum(
                'transactionAmount',
                filter=Q(verification_status=VS.VERIFIED, responseCode__in=APPROVED_CODES),
            ),
            checksum_valid=Count('id', filter=Q(is_checksum_valid=True)),
            checksum_invalid=Count('id', filter=Q(is_checksum_valid=False)),
        )

        total_amount = stats['total_amount'] or 0
        verified_amount = stats['verified_amount'] or 0

        return Response({
            'message': 'success',
            'data': {
                'verification_summary': {
                    'total': stats['total'],
                    'unverified': stats['unverified'],
                    'verified': stats['verified'],
                    'rejected': stats['rejected'],
                    'flagged': stats['flagged'],
                },
                'reconciliation_summary': {
                    'auto_matched': stats['auto_matched'],
                    'amount_mismatch': stats['amount_mismatch'],
                    'not_found': stats['not_found'],
                    'duplicate': stats['duplicate'],
                },
                'payment_summary': {
                    'approved': stats['approved'],
                    'declined': stats['declined'],
                },
                'amount_summary': {
                    'total_amount': float(total_amount),
                    'verified_amount': float(verified_amount),
                    'pending_amount': float(total_amount - verified_amount),
                },
                'security_summary': {
                    'checksum_valid': stats['checksum_valid'],
                    'checksum_invalid': stats['checksum_invalid'],
                },
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.exception("Error fetching settlement summary")
        return Response({'message': 'Summary fetch failed','error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)