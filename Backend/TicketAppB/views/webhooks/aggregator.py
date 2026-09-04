import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from django.utils import timezone as tz
from rest_framework import status
from ...models import TransactionData, Company, AggregatorTransaction, AggregatorPayoutCallback, ETMDevice
from django.http import HttpResponse, JsonResponse
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from ...serializers.payments import AggregatorTransactionSerializer, SettlementVerificationSerializer
from django.views.decorators.csrf import csrf_exempt
import json
from rest_framework.decorators import api_view
from django.db.models import Count
import hashlib
from django.conf import settings
from FCM.firebase import send_push_notification
from FCM.models import FCMLog
from TicketAppB.models.auth import UserSession, FCMSession


logger = logging.getLogger(__name__)
logger_txn = logging.getLogger('aggregator.transactions')
logger_payout = logging.getLogger('aggregator.payouts')


def _resolve_company_for_aggregator(terminal_id, narration, merchant_id=None):
    # 1. Payment aggregator merchant ID on Company
    if merchant_id:
        company = Company.objects.filter(aggregator_merchant_id=merchant_id).first()
        if company:
            return company
    # 2. Device aggregator_tid
    if terminal_id:
        device = ETMDevice.objects.filter(aggregator_tid=terminal_id).select_related('company').first()
        if device and device.company_id:
            return device.company
    # 3. Company code embedded in bqrMerchantId (narration[6:11]), zero-padded to 5 digits
    if narration and len(narration) >= 11:
        try:
            code = str(int(narration[6:11]))
            company = Company.objects.filter(company_id=code).first()
            if company:
                return company
        except ValueError:
            pass
    # 4. Last 5 digits of narration as palmtec_id (last resort — palmtec_id not globally unique)
    if narration and len(narration) >= 5:
        try:
            palmtec_int = int(narration[-5:])
            device = ETMDevice.objects.filter(palmtec_id=palmtec_int).select_related('company').first()
            if device and device.company_id:
                return device.company
        except ValueError:
            pass
    return None


@csrf_exempt
def aggregator_settlement_data(request):
    try:
        # Check if POST method
        if request.method != 'POST':
            return JsonResponse({'status': 405,'message': 'Method not allowed'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'status': 400,'message': 'Invalid JSON format'}, status=status.HTTP_400_BAD_REQUEST)

        transaction_id = data.get('transactionID')
        merchant_id = data.get('merchantId')
        transaction_rrn = data.get('transactionRRN')
        checksum_received = data.get('checksum')
        transaction_amount = data.get('transactionAmount')
        transaction_date_str = data.get('transactionDate')
        transaction_time_str = data.get('transactionTime')
        response_code = data.get('responseCode')
        transaction_status = data.get('transactionStatus')

        # Optional but important fields
        invoice_number = data.get('invoiceNumber')
        bill_number = data.get('billNumber')
        name = data.get('name', '')
        business_name = data.get('businessName')
        card_number = data.get('transactionCardNumber', '')
        card_type = data.get('cardType', '')
        card_holder_name = data.get('cardHolderName')
        terminal_id = data.get('transactionTerminalId', '')
        acquirer_name = data.get('acquirerName', '')
        
        # Address fields
        address_line1 = data.get('addressLine1')
        address_line2 = data.get('addressLine2')
        
        # Location fields — convert empty string to None for DecimalField
        transaction_lat = data.get('transactionLat') or None
        transaction_long = data.get('transactionLong') or None
        
        # Other transaction details
        transaction_stan = data.get('transactionSTAN')
        transaction_auth_code = data.get('transactionAuthCode')
        raw_batch = data.get('transactionBatchNumber')
        transaction_batch_number = None if raw_batch == '' else raw_batch
        currency_id = data.get('currencyId', '1')
        narration = data.get('narration')
        raw_type_id = data.get('transactionTypeId', 0)
        transaction_type_id = 0 if raw_type_id == '' else raw_type_id
        transaction_type_name = data.get('transactionTypeName')
        
        # Bank/Gateway fields
        tg_transaction_id = data.get('tgTransactionId')
        ref_txn_id = data.get('refTxnId')
        
        # Financial fields
        cash_back = data.get('cashBack', '0.00')
        tip_amount = data.get('tipAmount', '0.00')
        credit_debit_type = data.get('creditDebitCardType')
        
        # Technical fields
        app_version = data.get('appVersion')
        
        # EMV chip data (for chip card transactions)
        aid = data.get('aid')
        ici = data.get('ici')
        apn = data.get('apn')
        app_label = data.get('appLabel')
        tvr = data.get('tvr')
        tsi = data.get('tsi')
        ac = data.get('ac')
        cid = data.get('cid')
        cvm = data.get('cvm')
        
        # Processing flags
        tip_processing = data.get('tipProcessing', False)
        transaction_mode = data.get('transactionMode')
        msr_pin_verification = data.get('MsrAndPinVerification', False)

        # non null values required by api
        required_fields = {
            'transactionID': transaction_id,
            'merchantId': merchant_id,
            'transactionRRN': transaction_rrn,
            'checksum': checksum_received,
            'transactionAmount': transaction_amount,
            'transactionDate': transaction_date_str,
            'transactionTime': transaction_time_str,
            'responseCode': response_code,
            'transactionStatus': transaction_status
        }

        # Check which required fields are missing
        missing_fields = []
        for field_name, field_value in required_fields.items():
            if not field_value:
                missing_fields.append(field_name)

        # If any required field is missing, reject immediately
        if missing_fields:
            logger_txn.error("Missing required fields: %s | request: %s", missing_fields, data)
            return JsonResponse({'status': 400,'message': f'Missing required fields: {", ".join(missing_fields)}'}, status=status.HTTP_400_BAD_REQUEST)

        salt = settings.AGGREGATOR_SALT
        # CHECKSUM: TRANSACTIONID + MERCHANTID + TRANSACTIONRRN + SALT VALUE
        checksum_input=str(transaction_id) + str(merchant_id) + str(transaction_rrn) + salt
        hashed_value = hashlib.sha512(checksum_input.encode('utf-8')).hexdigest()

        if hashed_value.lower() != checksum_received.lower():
            logger_txn.error("Checksum mismatch | transactionID: %s | merchantId: %s | request: %s", transaction_id, merchant_id, data)
            return JsonResponse({'status': 401,'message': 'Checksum Error'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # check if repost
        existing_transaction = AggregatorTransaction.objects.filter(transactionID=transaction_id).first()

        # If transaction already exists (repost from aggregator)
        if existing_transaction:
            # Increment repost counter
            existing_transaction.repost_count += 1
            existing_transaction.last_received_at = timezone.now()
            existing_transaction.save()
            
            # Return success with existing bill/invoice number
            return JsonResponse({'status': 200,'message': 'success','merchant_refTxnId': existing_transaction.billNumber})

        try:
            # Parse date: "02-04-2025" → date object
            transaction_date = datetime.strptime(transaction_date_str, '%d-%m-%Y').date()
            # Parse time: "19:43:03" → time object
            transaction_time = datetime.strptime(transaction_time_str, '%H:%M:%S').time()
            # Combine into full datetime
            transaction_datetime = tz.make_aware(datetime.combine(transaction_date, transaction_time))
            
        except ValueError as e:
            logger_txn.error("Invalid date/time format: %s | request: %s", e, data)
            return JsonResponse({'status': 400,'message': f'Invalid date/time format: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve company via terminal ID or bqrMerchantId (last 5 = palmtec_id)
        company = _resolve_company_for_aggregator(terminal_id, narration, merchant_id=merchant_id)
        if company is None:
            logger_txn.error(
                "Company unresolvable for transactionID=%s terminalId=%s narration=%s",
                transaction_id, terminal_id, narration,
            )

        # save data to db if all okay
        transaction = AggregatorTransaction.objects.create(
            # Critical identifiers
            transactionID=transaction_id,
            merchantId=merchant_id,
            transactionRRN=transaction_rrn,
            
            # Checksum validation results
            checksum_received=checksum_received,
            checksum_calculated=hashed_value,
            is_checksum_valid=True,  # We already validated it above
            
            # Financial details
            transactionAmount=transaction_amount,
            cashBack=cash_back or 0,
            tipAmount=tip_amount or 0,
            
            # Date/Time
            transaction_date=transaction_date,
            transaction_time=transaction_time,
            transaction_datetime=transaction_datetime,
            
            # Payment status
            responseCode=response_code,
            transactionStatus=transaction_status,
            
            # Invoice/Bill references
            invoiceNumber=invoice_number,
            billNumber=bill_number,
            
            # User/Merchant info
            name=name,
            businessName=business_name,
            addressLine1=address_line1,
            addressLine2=address_line2,
            
            # Card details
            transactionCardNumber=card_number,
            cardType=card_type,
            cardHolderName=card_holder_name,
            creditDebitCardType=credit_debit_type,
            
            # Terminal/Location
            transactionTerminalId=terminal_id,
            transactionLat=transaction_lat,
            transactionLong=transaction_long,
            
            # Transaction metadata
            transactionSTAN=transaction_stan,
            transactionAuthCode=transaction_auth_code,
            transactionBatchNumber=transaction_batch_number,
            acquirerName=acquirer_name,
            currencyId=currency_id,
            narration=narration,
            transactionTypeId=transaction_type_id,
            transactionTypeName=transaction_type_name,
            
            # Reference IDs
            tgTransactionId=tg_transaction_id,
            refTxnId=ref_txn_id,
            
            # EMV chip data
            aid=aid,
            ici=ici,
            apn=apn,
            appLabel=app_label,
            tvr=tvr,
            tsi=tsi,
            ac=ac,
            cid=cid,
            cvm=cvm,
            
            # Processing flags
            tipProcessing=tip_processing,
            transactionMode=transaction_mode,
            MsrAndPinVerification=msr_pin_verification,
            appVersion=app_version,
            
            # Store raw data for auditing
            raw_request_data=data,

            company=company,

            # Set initial statuses
            processing_status=AggregatorTransaction.ProcessingStatus.VALIDATED,
            verification_status=AggregatorTransaction.VerificationStatus.UNVERIFIED,
            reconciliation_status=AggregatorTransaction.ReconciliationStatus.PENDING,
        )

        response_data = {'status': 200,'message': 'success','merchant_refTxnId': bill_number}

        transaction.response_sent_to_aggregator = response_data
        transaction.save()


        User = get_user_model()
        company_users = list(User.objects.filter(company=company.company))
        print(f"Users in company '{company.company}': {company_users}")


        print("Active User")
        active_sessions = FCMSession.objects.filter(
            user__in=company_users, is_active=True,
        )
        for session in active_sessions:
            
            # print(f"Active session: user={session.user}, session_uid={session.session_uid}, fcm_token={session.fcm_token}")

            if not session.fcm_token:
                print("token not found")
                return
            title = "New Transaction"
            body = "A new aggregator transaction has been created."
            try:
                send_push_notification(
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    data={
                        "type": "aggregator_transaction",
                    }
                )

                print("notification send")
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="success",
                )

            except Exception as e:
                print(
                    f"Failed to send FCM notification: {e}"
                )
                FCMLog.objects.create(
                    user=session.user,
                    token=session.fcm_token,
                    title=title,
                    body=body,
                    status="failed",
                    error=str(e),
                )

        from ...tasks import reconcile_aggregator_transaction
        reconcile_aggregator_transaction.delay(transaction.id)

        return JsonResponse(response_data,status=status.HTTP_200_OK)

    except Exception as e:
        _co = locals().get('company')
        logger.exception("Unhandled exception in aggregator_settlement_data: %s", e)
        logger_txn.exception("Unhandled exception in aggregator_settlement_data: %s", e, extra={'company_id': _co.company_id} if _co else {})
        return JsonResponse({'status': 500,'message': 'Data Entry failed'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
def aggregator_payout_callback(request):
    try:
        if request.method != 'POST':
            return JsonResponse({'statusCode': '500'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'statusCode': '500'}, status=status.HTTP_400_BAD_REQUEST)

        # Support both camelCase and snake_case field names as aggregator's own spec is inconsistent
        statement_id = data.get('statementId')
        payout_amount = data.get('payoutAmount') or data.get('actual_payout_amount')
        utr_number = data.get('utrNumber') or data.get('utr_number')
        payout_date_str = data.get('payoutDate') or data.get('payout_date')
        payout_account = data.get('payoutAccount') or data.get('payout_account')
        payout_bank = data.get('payoutBank') or data.get('payout_bank')
        payout_status = data.get('payoutStatus') or data.get('payout_status')
        transactions = data.get('transactions', [])
        deductions = data.get('deductions', [])

        # Validate required fields
        missing = [name for name, val in {
            'statementId': statement_id,
            'payoutAmount': payout_amount,
            'utrNumber': utr_number,
            'payoutDate': payout_date_str,
            'payoutAccount': payout_account,
            'payoutBank': payout_bank,
            'payoutStatus': payout_status,
            'transactions': transactions,
        }.items() if not val and val != 0]

        if missing:
            logger_payout.error("Missing required fields: %s | request: %s", missing, data)
            return JsonResponse({'statusCode': '500'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payout_date = datetime.fromisoformat(payout_date_str)
        except ValueError:
            logger_payout.error("Invalid payoutDate: %s | request: %s", payout_date_str, data)
            return JsonResponse({'statusCode': '500'}, status=status.HTTP_400_BAD_REQUEST)

        # Handle repost — same statementId received again
        existing = AggregatorPayoutCallback.objects.filter(statementId=statement_id).first()
        if existing:
            logger.info(f"Payout callback repost received for statementId: {statement_id}")
            return JsonResponse({'statusCode': '100'}, status=status.HTTP_200_OK)

        # Resolve company from linked AggregatorTransaction rows (transactions arrive day before payout)
        txn_ids = []
        for txn in transactions:
            raw = txn.get('transactionId') or txn.get('transactionID')
            try:
                txn_ids.append(int(raw))
            except (TypeError, ValueError):
                pass

        payout_company = None
        if txn_ids:
            related = (
                AggregatorTransaction.objects
                .filter(transactionID__in=txn_ids, company__isnull=False)
                .select_related('company')
                .first()
            )
            if related:
                payout_company = related.company

        if payout_company is None:
            logger_payout.error(
                "Company unresolvable for payout statementId=%s txn_ids=%s",
                statement_id, txn_ids,
            )

        payout = AggregatorPayoutCallback.objects.create(
            statementId=statement_id,
            payoutAmount=payout_amount,
            utrNumber=utr_number,
            payoutDate=payout_date,
            payoutAccount=payout_account,
            payoutBank=payout_bank,
            payoutStatus=payout_status,
            transactions=transactions,
            deductions=deductions,
            raw_request_data=data,
            company=payout_company,
        )

        # Link each transaction in the payout to AggregatorTransaction
        linked = 0
        for txn in transactions:
            txn_id = txn.get('transactionId') or txn.get('transactionID')
            if not txn_id:
                continue
            updated = AggregatorTransaction.objects.filter(transactionID=str(txn_id)).update(
                settlement_batch_id=statement_id,
                settled_at=payout_date,
                settlement_amount=txn.get('amount'),
            )
            linked += updated

        logger.info(f"Payout {statement_id} received, linked {linked} transactions", extra={'company_id': payout_company.company_id} if payout_company else {})
        return JsonResponse({'statusCode': '100'}, status=status.HTTP_200_OK)

    except Exception as e:
        _co = locals().get('payout_company')
        logger_payout.exception("Unhandled exception in aggregator_payout_callback: %s | request: %s", e, data if 'data' in locals() else 'unavailable', extra={'company_id': _co.company_id} if _co else {})
        return JsonResponse({'statusCode': '500'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


