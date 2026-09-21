from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('TicketAppB', '0025_schedule_data_unique_with_start_time'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='tripdata',
            name='uniq_trip_data',
        ),
        migrations.AddConstraint(
            model_name='tripdata',
            constraint=models.UniqueConstraint(
                fields=['palmtec_id', 'company_code', 'schedule_no', 'trip_no', 'start_date', 'start_time'],
                name='uniq_trip_data',
            ),
        ),
    ]
