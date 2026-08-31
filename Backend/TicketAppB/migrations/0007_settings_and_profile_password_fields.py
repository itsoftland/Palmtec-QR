from django.db import migrations, models


def backfill_profile_passwords(apps, schema_editor):
    """
    For existing profiles, copy supervisor_pwd/remove_pwd from the company's
    Settings record if present; otherwise use VB-compatible defaults.
    """
    SettingsProfile = apps.get_model('TicketAppB', 'SettingsProfile')
    Settings = apps.get_model('TicketAppB', 'Settings')

    settings_map = {s.company_id: s for s in Settings.objects.all()}

    to_update = []
    for profile in SettingsProfile.objects.all():
        cs = settings_map.get(profile.company_id)
        profile.supervisor_pwd = (cs.supervisor_pwd if cs and cs.supervisor_pwd else '987654')
        profile.remove_pwd     = (cs.remove_pwd     if cs and cs.remove_pwd     else '123456')
        to_update.append(profile)

    if to_update:
        SettingsProfile.objects.bulk_update(to_update, ['supervisor_pwd', 'remove_pwd'])


class Migration(migrations.Migration):

    dependencies = [
        ('TicketAppB', '0006_mosambeetransaction_company_mosambee_payout_company'),
    ]

    operations = [
        # ── Settings new fields ──────────────────────────────────────────────
        migrations.AddField(
            model_name='settings',
            name='ladies_ratio',
            field=models.IntegerField(default=0, help_text='Ladies concession % (LadiPer)'),
        ),
        migrations.AddField(
            model_name='settings',
            name='senior_ratio',
            field=models.IntegerField(default=0, help_text='Senior citizen concession % (SeniorPer)'),
        ),
        migrations.AddField(
            model_name='settings',
            name='big_font',
            field=models.BooleanField(default=False, help_text='Enable big font on ETM (bigfontenable)'),
        ),
        migrations.AddField(
            model_name='settings',
            name='refund_enable',
            field=models.BooleanField(default=False, help_text='Enable refund on ETM (ucRefundEnable)'),
        ),
        migrations.AddField(
            model_name='settings',
            name='keyhitdelay',
            field=models.IntegerField(default=12),
        ),
        migrations.AddField(
            model_name='settings',
            name='supervisor_pwd',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='settings',
            name='remove_pwd',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        # ── SettingsProfile new fields ───────────────────────────────────────
        migrations.AddField(
            model_name='settingsprofile',
            name='supervisor_pwd',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='settingsprofile',
            name='remove_pwd',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        # ── Backfill existing profiles ───────────────────────────────────────
        migrations.RunPython(backfill_profile_passwords, migrations.RunPython.noop),
    ]
