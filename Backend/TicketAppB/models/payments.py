from decimal import Decimal
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.conf import settings
from .company import Company, Depot

# Payment processing (AggregatorTransaction)


# For reconciliation with TransactionData (bus tickets).
# Requires MANUAL VERIFICATION by managers before settlement.
class AggregatorTransaction(models.Model):
    class ProcessingStatus(models.TextChoices):
        RECEIVED = 'RECEIVED', 'Received'
        VALIDATED = 'VALIDATED', 'Validated'
        VALIDATION_FAILED = 'VALIDATION_FAILED', 'Validation Failed'
        RECONCILING = 'RECONCILING', 'Reconciling'
        PENDING_VERIFICATION = 'PENDING_VERIFICATION', 'Pending Verification'
    
    class VerificationStatus(models.TextChoices):
        UNVERIFIED = 'UNVERIFIED', 'Unverified'
        VERIFIED = 'VERIFIED', 'Verified'
        REJECTED = 'REJECTED', 'Rejected'
        FLAGGED = 'FLAGGED', 'Flagged for Review'
        DISPUTED = 'DISPUTED', 'Disputed'
    
    class ReconciliationStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        AUTO_MATCHED = 'AUTO_MATCHED', 'Auto-Matched'
        AMOUNT_MISMATCH = 'AMOUNT_MISMATCH', 'Amount Mismatch'
        NOT_FOUND = 'NOT_FOUND', 'Ticket Not Found'
        DUPLICATE = 'DUPLICATE', 'Duplicate Payment'
        MANUAL_MATCH = 'MANUAL_MATCH', 'Manually Matched'
    
    processing_status = models.CharField(
        max_length=30,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.RECEIVED,
        db_index=True
    )
    
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.UNVERIFIED,
        db_index=True
    )
    
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_aggregator_transactions'
    )
    
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(null=True, blank=True)
    
    checksum_received = models.CharField(max_length=512)
    checksum_calculated = models.CharField(max_length=512, null=True, blank=True)
    is_checksum_valid = models.BooleanField(default=False, db_index=True)
    validation_error = models.TextField(null=True, blank=True)
    
    related_ticket = models.ForeignKey(
        'TransactionData',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payment_transactions'
    )
    
    reconciliation_status = models.CharField(
        max_length=20,
        choices=ReconciliationStatus.choices,
        default=ReconciliationStatus.PENDING,
        db_index=True
    )
    
    reconciliation_error = models.TextField(null=True, blank=True)
    reconciled_at = models.DateTimeField(null=True, blank=True)
    
    manually_reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manually_reconciled_transactions'
    )
    
    settlement_batch_id = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    settlement_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    
    repost_count = models.IntegerField(default=0)
    first_received_at = models.DateTimeField(auto_now_add=True)
    last_received_at = models.DateTimeField(auto_now=True)
    
    company = models.ForeignKey(
        'Company',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='aggregator_transactions',
        db_index=True,
    )

    name = models.CharField(max_length=100)
    merchantId = models.CharField(max_length=45, db_index=True)
    businessName = models.CharField(max_length=100, null=True, blank=True)
    addressLine1 = models.CharField(max_length=255, null=True, blank=True)
    addressLine2 = models.CharField(max_length=255, null=True, blank=True)
    
    transaction_date = models.DateField(db_index=True)
    transaction_time = models.TimeField()
    transaction_datetime = models.DateTimeField(db_index=True)
    
    transactionLat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    transactionLong = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    transactionSTAN = models.CharField(max_length=6, null=True, blank=True)
    transactionRRN = models.CharField(max_length=50, db_index=True)
    transactionID = models.BigIntegerField(unique=True, db_index=True)
    tgTransactionId = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    
    transactionAmount = models.DecimalField(max_digits=15, decimal_places=2)
    cashBack = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    tipAmount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    
    responseCode = models.CharField(max_length=6, db_index=True)
    transactionStatus = models.CharField(max_length=100)
    transactionAuthCode = models.CharField(max_length=60, null=True, blank=True)
    
    transactionCardNumber = models.CharField(max_length=50)
    cardHolderName = models.CharField(max_length=150, null=True, blank=True)
    cardType = models.CharField(max_length=45)
    creditDebitCardType = models.CharField(max_length=15, null=True, blank=True)
    
    transactionTerminalId = models.CharField(max_length=30, db_index=True)
    transactionBatchNumber = models.IntegerField(null=True, blank=True)
    appVersion = models.CharField(max_length=20, null=True, blank=True)
    
    invoiceNumber = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    billNumber = models.CharField(max_length=100, null=True, blank=True)
    refTxnId = models.CharField(max_length=45, null=True, blank=True)
    
    transactionTypeId = models.IntegerField()
    transactionTypeName = models.CharField(max_length=50, null=True, blank=True)
    currencyId = models.CharField(max_length=5)
    acquirerName = models.CharField(max_length=50)
    narration = models.CharField(max_length=100, null=True, blank=True)
    
    aid = models.CharField(max_length=50, null=True, blank=True)
    ici = models.CharField(max_length=5, null=True, blank=True)
    apn = models.CharField(max_length=55, null=True, blank=True)
    appLabel = models.CharField(max_length=60, null=True, blank=True)
    tvr = models.CharField(max_length=10, null=True, blank=True)
    tsi = models.CharField(max_length=4, null=True, blank=True)
    ac = models.CharField(max_length=20, null=True, blank=True)
    cid = models.CharField(max_length=2, null=True, blank=True)
    cvm = models.CharField(max_length=6, null=True, blank=True)
    
    tipProcessing = models.BooleanField(default=False)
    transactionMode = models.CharField(max_length=20, null=True, blank=True)
    MsrAndPinVerification = models.BooleanField(default=False)
    
    raw_request_data = models.JSONField()
    response_sent_to_aggregator = models.JSONField(null=True, blank=True)
    manager_notes = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'aggregator_transaction'
        verbose_name = 'Payment Aggregator Transaction'
        verbose_name_plural = 'Payment Aggregator Transactions'
        indexes = [
            models.Index(fields=['transaction_date']),
            models.Index(fields=['-transaction_datetime']),
            models.Index(fields=['verification_status', 'transaction_date']),
            models.Index(fields=['verification_status', 'merchantId']),
            models.Index(fields=['processing_status', 'transaction_date']),
            models.Index(fields=['reconciliation_status']),
            models.Index(fields=['invoiceNumber']),
            models.Index(fields=['transactionRRN']),
            models.Index(fields=['settlement_batch_id']),
            models.Index(fields=['merchantId', 'transaction_date']),
            models.Index(fields=['responseCode', 'transaction_date']),
            models.Index(fields=['is_checksum_valid', 'processing_status']),
            models.Index(fields=['transactionTerminalId', 'transaction_date']),
        ]
        ordering = ['-transaction_datetime']
    
    def __str__(self):
        return f"[{self.verification_status}] TXN-{self.transactionID} | Ticket-{self.invoiceNumber} | ₹{self.transactionAmount}"
    
    @property
    def is_payment_successful(self):
        return self.responseCode in ['0', '00', '000']
    
    @property
    def is_ready_for_settlement(self):
        return (
            self.verification_status == self.VerificationStatus.VERIFIED and
            self.is_payment_successful and
            self.settlement_batch_id is None
        )
    
    @property
    def needs_manager_attention(self):
        return (
            self.verification_status == self.VerificationStatus.UNVERIFIED or
            self.verification_status == self.VerificationStatus.FLAGGED or
            not self.is_checksum_valid or
            self.reconciliation_status in [
                self.ReconciliationStatus.AMOUNT_MISMATCH,
                self.ReconciliationStatus.NOT_FOUND,
                self.ReconciliationStatus.DUPLICATE
            ]
        )
    
    @property
    def display_status_for_ui(self):
        if not self.is_checksum_valid:
            return "⚠️ Security Check Failed"
        if not self.is_payment_successful:
            return "❌ Payment Declined"
        if self.verification_status == self.VerificationStatus.VERIFIED:
            return "✅ Verified"
        if self.verification_status == self.VerificationStatus.REJECTED:
            return "❌ Rejected"
        if self.verification_status == self.VerificationStatus.FLAGGED:
            return "🚩 Flagged"
        if self.reconciliation_status == self.ReconciliationStatus.AMOUNT_MISMATCH:
            return "⚠️ Amount Mismatch"
        if self.reconciliation_status == self.ReconciliationStatus.NOT_FOUND:
            return "⚠️ No Matching Ticket"
        return "⏳ Awaiting Verification"
    
    def get_total_amount(self):
        return self.transactionAmount + self.cashBack + self.tipAmount
    
    def can_be_verified_by(self, user):
        return (
            user.is_authenticated and
            user.role in ['company_admin', 'superadmin'] and
            self.verification_status == self.VerificationStatus.UNVERIFIED
        )


class AggregatorPayoutCallback(models.Model):
    company = models.ForeignKey(
        'Company',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='aggregator_payout_callbacks',
        db_index=True,
    )

    statementId = models.CharField(max_length=150, unique=True, db_index=True)
    payoutAmount = models.DecimalField(max_digits=15, decimal_places=2)
    utrNumber = models.CharField(max_length=150, db_index=True)
    payoutDate = models.DateTimeField()
    payoutAccount = models.CharField(max_length=100)
    payoutBank = models.CharField(max_length=150)
    payoutStatus = models.CharField(max_length=100)

    # Array fields stored as JSON
    transactions = models.JSONField(default=list)
    deductions = models.JSONField(default=list)

    raw_request_data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'aggregator_payout_callback'
        verbose_name = 'Payment Aggregator Payout Callback'
        verbose_name_plural = 'Payment Aggregator Payout Callbacks'
        ordering = ['-created_at']

    def __str__(self):
        return f"Payout {self.statementId} | ₹{self.payoutAmount} | {self.payoutBank} | {self.payoutStatus}"