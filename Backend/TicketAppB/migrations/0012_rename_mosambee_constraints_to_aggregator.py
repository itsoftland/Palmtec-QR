from django.db import migrations


class Migration(migrations.Migration):
    """
    Hand-written: 0010/0011 renamed the model/table/column/explicit-index names,
    but MySQL does not auto-rename implicitly-created indexes or FK/CHECK
    constraint identifiers when a table or column is renamed. This migration
    cleans up the remaining DB-level names that still say "mosambee_*",
    purely as metadata renames (RENAME INDEX, DROP+ADD CONSTRAINT with the
    same column/reference) — no data or behavior changes.
    """

    dependencies = [
        ('TicketAppB', '0011_rename_mosambee_indexes_to_aggregator'),
    ]

    operations = [
        # ── aggregator_transaction: plain (non-FK) indexes ──────────────────
        migrations.RunSQL(
            sql="""
            ALTER TABLE aggregator_transaction
                RENAME INDEX `mosambee_transaction_processing_status_865c7e0f` TO `aggregator_transaction_processing_status_865c7e0f`,
                RENAME INDEX `mosambee_transaction_verification_status_97d49bf8` TO `aggregator_transaction_verification_status_97d49bf8`,
                RENAME INDEX `mosambee_transaction_is_checksum_valid_2d4f5871` TO `aggregator_transaction_is_checksum_valid_2d4f5871`,
                RENAME INDEX `mosambee_transaction_reconciliation_status_37a0c83a` TO `aggregator_transaction_reconciliation_status_37a0c83a`,
                RENAME INDEX `mosambee_transaction_settlement_batch_id_f725dcd4` TO `aggregator_transaction_settlement_batch_id_f725dcd4`,
                RENAME INDEX `mosambee_transaction_merchantId_0b34db67` TO `aggregator_transaction_merchantId_0b34db67`,
                RENAME INDEX `mosambee_transaction_transaction_date_3a41170a` TO `aggregator_transaction_transaction_date_3a41170a`,
                RENAME INDEX `mosambee_transaction_transaction_datetime_7e459e85` TO `aggregator_transaction_transaction_datetime_7e459e85`,
                RENAME INDEX `mosambee_transaction_transactionRRN_951a3694` TO `aggregator_transaction_transactionRRN_951a3694`,
                RENAME INDEX `mosambee_transaction_tgTransactionId_2a28df09` TO `aggregator_transaction_tgTransactionId_2a28df09`,
                RENAME INDEX `mosambee_transaction_responseCode_208f33ec` TO `aggregator_transaction_responseCode_208f33ec`,
                RENAME INDEX `mosambee_transaction_transactionTerminalId_f0cf651a` TO `aggregator_transaction_transactionTerminalId_f0cf651a`,
                RENAME INDEX `mosambee_transaction_invoiceNumber_75627ff1` TO `aggregator_transaction_invoiceNumber_75627ff1`,
                RENAME INDEX `mosambee_transaction_related_ticket_id_df9c9e15_fk_transacti` TO `aggregator_transaction_related_ticket_id_df9c9e15_fk_transacti`,
                RENAME INDEX `mosambee_transaction_manually_reconciled__5b845f65_fk_custom_us` TO `aggregator_transaction_manually_reconciled_5b845f65_fk_custom_us`,
                RENAME INDEX `mosambee_transaction_verified_by_id_9345737a_fk_custom_user_id` TO `aggregator_transaction_verified_by_id_9345737a_fk_custom_user_id`,
                RENAME INDEX `mosambee_transaction_company_id_9be59ad3_fk_company_id` TO `aggregator_transaction_company_id_9be59ad3_fk_company_id`;
            """,
            reverse_sql="""
            ALTER TABLE aggregator_transaction
                RENAME INDEX `aggregator_transaction_processing_status_865c7e0f` TO `mosambee_transaction_processing_status_865c7e0f`,
                RENAME INDEX `aggregator_transaction_verification_status_97d49bf8` TO `mosambee_transaction_verification_status_97d49bf8`,
                RENAME INDEX `aggregator_transaction_is_checksum_valid_2d4f5871` TO `mosambee_transaction_is_checksum_valid_2d4f5871`,
                RENAME INDEX `aggregator_transaction_reconciliation_status_37a0c83a` TO `mosambee_transaction_reconciliation_status_37a0c83a`,
                RENAME INDEX `aggregator_transaction_settlement_batch_id_f725dcd4` TO `mosambee_transaction_settlement_batch_id_f725dcd4`,
                RENAME INDEX `aggregator_transaction_merchantId_0b34db67` TO `mosambee_transaction_merchantId_0b34db67`,
                RENAME INDEX `aggregator_transaction_transaction_date_3a41170a` TO `mosambee_transaction_transaction_date_3a41170a`,
                RENAME INDEX `aggregator_transaction_transaction_datetime_7e459e85` TO `mosambee_transaction_transaction_datetime_7e459e85`,
                RENAME INDEX `aggregator_transaction_transactionRRN_951a3694` TO `mosambee_transaction_transactionRRN_951a3694`,
                RENAME INDEX `aggregator_transaction_tgTransactionId_2a28df09` TO `mosambee_transaction_tgTransactionId_2a28df09`,
                RENAME INDEX `aggregator_transaction_responseCode_208f33ec` TO `mosambee_transaction_responseCode_208f33ec`,
                RENAME INDEX `aggregator_transaction_transactionTerminalId_f0cf651a` TO `mosambee_transaction_transactionTerminalId_f0cf651a`,
                RENAME INDEX `aggregator_transaction_invoiceNumber_75627ff1` TO `mosambee_transaction_invoiceNumber_75627ff1`,
                RENAME INDEX `aggregator_transaction_related_ticket_id_df9c9e15_fk_transacti` TO `mosambee_transaction_related_ticket_id_df9c9e15_fk_transacti`,
                RENAME INDEX `aggregator_transaction_manually_reconciled_5b845f65_fk_custom_us` TO `mosambee_transaction_manually_reconciled__5b845f65_fk_custom_us`,
                RENAME INDEX `aggregator_transaction_verified_by_id_9345737a_fk_custom_user_id` TO `mosambee_transaction_verified_by_id_9345737a_fk_custom_user_id`,
                RENAME INDEX `aggregator_transaction_company_id_9be59ad3_fk_company_id` TO `mosambee_transaction_company_id_9be59ad3_fk_company_id`;
            """,
        ),

        # ── aggregator_transaction: FK constraints (drop + re-add, same column/reference) ──
        migrations.RunSQL(
            sql="""
            ALTER TABLE aggregator_transaction
                DROP FOREIGN KEY `mosambee_transaction_company_id_9be59ad3_fk_company_id`,
                ADD CONSTRAINT `aggregator_transaction_company_id_9be59ad3_fk_company_id` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
                DROP FOREIGN KEY `mosambee_transaction_manually_reconciled__5b845f65_fk_custom_us`,
                ADD CONSTRAINT `aggregator_transaction_manually_reconciled_5b845f65_fk_custom_us` FOREIGN KEY (`manually_reconciled_by_id`) REFERENCES `custom_user` (`id`),
                DROP FOREIGN KEY `mosambee_transaction_related_ticket_id_df9c9e15_fk_transacti`,
                ADD CONSTRAINT `aggregator_transaction_related_ticket_id_df9c9e15_fk_transacti` FOREIGN KEY (`related_ticket_id`) REFERENCES `transaction_data` (`id`),
                DROP FOREIGN KEY `mosambee_transaction_verified_by_id_9345737a_fk_custom_user_id`,
                ADD CONSTRAINT `aggregator_transaction_verified_by_id_9345737a_fk_custom_user_id` FOREIGN KEY (`verified_by_id`) REFERENCES `custom_user` (`id`);
            """,
            reverse_sql="""
            ALTER TABLE aggregator_transaction
                DROP FOREIGN KEY `aggregator_transaction_company_id_9be59ad3_fk_company_id`,
                ADD CONSTRAINT `mosambee_transaction_company_id_9be59ad3_fk_company_id` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
                DROP FOREIGN KEY `aggregator_transaction_manually_reconciled_5b845f65_fk_custom_us`,
                ADD CONSTRAINT `mosambee_transaction_manually_reconciled__5b845f65_fk_custom_us` FOREIGN KEY (`manually_reconciled_by_id`) REFERENCES `custom_user` (`id`),
                DROP FOREIGN KEY `aggregator_transaction_related_ticket_id_df9c9e15_fk_transacti`,
                ADD CONSTRAINT `mosambee_transaction_related_ticket_id_df9c9e15_fk_transacti` FOREIGN KEY (`related_ticket_id`) REFERENCES `transaction_data` (`id`),
                DROP FOREIGN KEY `aggregator_transaction_verified_by_id_9345737a_fk_custom_user_id`,
                ADD CONSTRAINT `mosambee_transaction_verified_by_id_9345737a_fk_custom_user_id` FOREIGN KEY (`verified_by_id`) REFERENCES `custom_user` (`id`);
            """,
        ),

        # ── aggregator_transaction: CHECK constraint on the renamed JSON column ──
        migrations.RunSQL(
            # MariaDB ties this CHECK to the column definition itself — neither
            # "DROP CHECK" (MySQL syntax, invalid here) nor "DROP CONSTRAINT"
            # (only works for table-level constraints) can target it directly.
            # MODIFY COLUMN redeclares it, which MariaDB (re)names after the
            # current column name automatically.
            sql="""
            ALTER TABLE aggregator_transaction
                MODIFY COLUMN `response_sent_to_aggregator` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
                CHECK (json_valid(`response_sent_to_aggregator`));
            """,
            reverse_sql="""
            ALTER TABLE aggregator_transaction
                MODIFY COLUMN `response_sent_to_aggregator` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
                CHECK (json_valid(`response_sent_to_aggregator`));
            """,
        ),

        # ── aggregator_payout_callback: plain index + FK constraint ─────────
        migrations.RunSQL(
            sql="""
            ALTER TABLE aggregator_payout_callback
                RENAME INDEX `mosambee_payout_callback_utrNumber_a63beb31` TO `aggregator_payout_callback_utrNumber_a63beb31`,
                RENAME INDEX `mosambee_payout_callback_company_id_3c960405_fk_company_id` TO `aggregator_payout_callback_company_id_3c960405_fk_company_id`;
            """,
            reverse_sql="""
            ALTER TABLE aggregator_payout_callback
                RENAME INDEX `aggregator_payout_callback_utrNumber_a63beb31` TO `mosambee_payout_callback_utrNumber_a63beb31`,
                RENAME INDEX `aggregator_payout_callback_company_id_3c960405_fk_company_id` TO `mosambee_payout_callback_company_id_3c960405_fk_company_id`;
            """,
        ),
        migrations.RunSQL(
            sql="""
            ALTER TABLE aggregator_payout_callback
                DROP FOREIGN KEY `mosambee_payout_callback_company_id_3c960405_fk_company_id`,
                ADD CONSTRAINT `aggregator_payout_callback_company_id_3c960405_fk_company_id` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`);
            """,
            reverse_sql="""
            ALTER TABLE aggregator_payout_callback
                DROP FOREIGN KEY `aggregator_payout_callback_company_id_3c960405_fk_company_id`,
                ADD CONSTRAINT `mosambee_payout_callback_company_id_3c960405_fk_company_id` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`);
            """,
        ),

        # ── etm_device: unique index backing aggregator_tid ─────────────────
        migrations.RunSQL(
            sql="ALTER TABLE etm_device RENAME INDEX `mosambee_tid` TO `aggregator_tid`;",
            reverse_sql="ALTER TABLE etm_device RENAME INDEX `aggregator_tid` TO `mosambee_tid`;",
        ),
    ]
