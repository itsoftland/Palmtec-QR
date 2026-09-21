from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('TicketAppB', '0024_transactiondata_pass_number'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='scheduledata',
            name='uniq_schedule_data',
        ),
        migrations.AddConstraint(
            model_name='scheduledata',
            constraint=models.UniqueConstraint(
                fields=['palmtec_id', 'company_code', 'schedule_no', 'start_date', 'start_time'],
                name='uniq_schedule_data',
            ),
        ),
    ]
