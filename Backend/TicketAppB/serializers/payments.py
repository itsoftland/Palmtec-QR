from rest_framework import serializers
from ..models import AggregatorTransaction, ETMDevice


class AggregatorTransactionSerializer(serializers.ModelSerializer):
    related_ticket_number = serializers.SerializerMethodField()
    related_ticket_amount = serializers.SerializerMethodField()
    related_ticket_date = serializers.SerializerMethodField()
    payment_status_display = serializers.SerializerMethodField()
    formatted_transaction_date = serializers.SerializerMethodField()
    needs_attention = serializers.SerializerMethodField()
    verified_by_username = serializers.SerializerMethodField()
    palmtecID = serializers.SerializerMethodField()
    palmtecSerialNumber = serializers.SerializerMethodField()

    class Meta:
        model = AggregatorTransaction
        fields = [
            'id',
            'transactionID',
            'transactionRRN',
            'merchantId',
            'transaction_date',
            'formatted_transaction_date',
            'transaction_time',
            'transaction_datetime',
            'transactionAmount',
            'cashBack',
            'tipAmount',
            'processing_status',
            'verification_status',
            'reconciliation_status',
            'responseCode',
            'transactionStatus',
            'payment_status_display',
            'invoiceNumber',
            'billNumber',
            'tgTransactionId',
            'narration',
            'related_ticket_number',
            'related_ticket_amount',
            'related_ticket_date',
            'palmtecID',
            'palmtecSerialNumber',
            'transactionCardNumber',
            'cardType',
            'cardHolderName',
            'transactionTerminalId',
            'acquirerName',
            'businessName',
            'addressLine1',
            'is_checksum_valid',
            'validation_error',
            'reconciliation_error',
            'reconciled_at',
            'verified_by_username',
            'verified_at',
            'verification_notes',
            'needs_attention',
            'settlement_batch_id',
            'settled_at',
            'repost_count',
            'first_received_at',
            'last_received_at',
            'created_at',
        ]

    def get_related_ticket_number(self, obj):
        if obj.related_ticket:
            return obj.related_ticket.ticket_number
        return None

    def get_related_ticket_amount(self, obj):
        if obj.related_ticket:
            return str(obj.related_ticket.ticket_amount)
        return None

    def get_related_ticket_date(self, obj):
        if obj.related_ticket:
            return obj.related_ticket.ticket_date.strftime('%d-%m-%Y')
        return None

    def get_payment_status_display(self, obj):
        if obj.responseCode in ['0', '00', '000']:
            return "Approved"
        return "Declined"

    def get_formatted_transaction_date(self, obj):
        if obj.transaction_date:
            return obj.transaction_date.strftime('%d-%m-%Y')
        return None

    def get_needs_attention(self, obj):
        return obj.needs_manager_attention

    def get_verified_by_username(self, obj):
        if obj.verified_by:
            return obj.verified_by.username
        return None

    def get_palmtecID(self, obj):
        if obj.related_ticket:
            return obj.related_ticket.palmtec_id
        return None

    def get_palmtecSerialNumber(self, obj):
        if obj.related_ticket and obj.related_ticket.palmtec_id:
            device = ETMDevice.objects.filter(
                company=obj.company,
                palmtec_id=obj.related_ticket.palmtec_id,
            ).first()
            if device:
                return device.serial_number
        return None


class SettlementVerificationSerializer(serializers.Serializer):
    transaction_id = serializers.IntegerField(required=True)
    verification_status = serializers.ChoiceField(
        choices=['VERIFIED', 'REJECTED', 'FLAGGED'],
        required=True
    )
    verification_notes = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000
    )

    def validate_transaction_id(self, value):
        try:
            AggregatorTransaction.objects.get(id=value)
        except AggregatorTransaction.DoesNotExist:
            raise serializers.ValidationError("Transaction not found")
        return value
