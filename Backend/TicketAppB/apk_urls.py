from django.urls import path
from .views.web import auth as auth_views
from .views.apk import reports as apk_views
from .views.apk import apk_upload as apk_upload_views
from .views.apk import master_send as apk_download_views
from .views import setup_data as setup_data_views
from .views.utils import require_tier_for_apk, _PREMIUM_TIER_ERROR

# Data-transfer endpoints (device master-data download + .DAT upload) require
# Premium tier when reached via the APK. Wrapped only here, not in urls.py, so
# the web dashboard's DeviceDownload.jsx page (same view functions, mounted in
# urls.py) stays ungated for company_admin's own manual downloads.
_premium = require_tier_for_apk('premium', _PREMIUM_TIER_ERROR)


urlpatterns = [
    # auth
    # path('login',       auth_views.login_view,   name='apk_login'),
    path('login',       auth_views.apk_login_view,   name='apk_login'),
    path('logout',      auth_views.logout_view,  name='apk_logout'),
    path('verify-auth', auth_views.verify_auth,  name='apk_verify_auth'),

    # dashboard
    path('apk/dashboard',  apk_views.apk_dashboard, name='apk_dashboard'),

    # drill-down flow: buses → schedules → trips → tickets / passengers
    path('apk/buses',      apk_views.apk_bus_list,  name='apk_buses'),
    path('apk/schedules',  apk_views.apk_schedules, name='apk_schedules'),
    path('apk/trips',      apk_views.apk_trips,     name='apk_trips'),
    path('apk/tickets',    apk_views.apk_tickets,   name='apk_tickets'),
    path('apk/passengers', apk_views.apk_passengers, name='apk_passengers'),

    # reports
    path('reports/duty',          apk_views.duty_report,          name='apk_duty_report'),
    path('reports/bus-summary',   apk_views.bus_summary_report,   name='apk_bus_summary'),
    path('reports/payment-type',  apk_views.payment_type_report,  name='apk_payment_type'),
    path('reports/farewise',      apk_views.farewise_report,      name='apk_farewise'),
    path('reports/expense',                apk_views.expense_report,                name='apk_expense'),
    path('reports/aggregator-transactions', apk_views.aggregator_transaction_report, name='apk_aggregator_transactions'),
    path('reports/payout-settlement', apk_views.payout_settlement_report_apk, name='apk_payout_settlement'),


    # etm version for apk (open to everyone, no tier gate)
    path('device/getEtmVersion', setup_data_views.get_etm_device_version_for_apk),

    # masterdata download (data transfer — Premium tier required on the APK)
    path('device/routes',      _premium(apk_download_views.get_routes_list)),
    path('device/settings',    _premium(apk_download_views.get_settings_file)),
    path('device/crew',        _premium(apk_download_views.get_crew_file)),
    path('device/vehicles',    _premium(apk_download_views.get_vehicles_file)),
    path('device/expenses',    _premium(apk_download_views.get_expenses_file)),
    # Route group — individual files or single bundled ZIP
    path('device/masterdata',  _premium(apk_download_views.get_masterdata_bundle)),
    path('device/routelst',    _premium(apk_download_views.get_routelst_file)),
    path('device/stagelst',    _premium(apk_download_views.get_stagelst_file)),
    path('device/languagedat', _premium(apk_download_views.get_languagedat_file)),
    path('device/rtedat',      _premium(apk_download_views.get_rtedat_file)),
    # Settings group
    path('device/currency',    _premium(apk_download_views.get_currency_file)),

    # masterdata file upload (data transfer — Premium tier required on the APK)
    path('upload/odometer-dat', _premium(apk_upload_views.uploadOdometerDat), name='upload_odometer_dat'),
    path('upload/expense-dat', _premium(apk_upload_views.uploadExpenseDat), name='upload_expense_dat'),

]
