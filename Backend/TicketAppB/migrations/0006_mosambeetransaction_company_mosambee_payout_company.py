from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('TicketAppB', '0005_remove_transactiondata_uniq_device_unique_code_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='mosambeetransaction',
            name='company',
            field=models.ForeignKey(
                blank=True,
                db_index=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='mosambee_transactions',
                to='TicketAppB.company',
            ),
        ),
        migrations.AddField(
            model_name='mosambeepayoutcallback',
            name='company',
            field=models.ForeignKey(
                blank=True,
                db_index=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='mosambee_payout_callbacks',
                to='TicketAppB.company',
            ),
        ),
    ]
