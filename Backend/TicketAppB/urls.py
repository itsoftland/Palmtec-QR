from django.urls import path
from .views.web import ticket_reports
from .views.web import auth as auth_views
from .views.web import users as user_views
from .views.web import depots as depot_views
from .views.web import dealers as dealer_views
from .views.web.imports import mdb as mdb_views
from .views.web import company as company_views
from .views.web import sessions as session_views
from .views import setup_data as setup_data_views
from .views.apk import master_send as palmtec_views
from .views.web.masterdata import crew as crew_views
from .views.web import audit_logs as audit_log_views
from .views.web import executives as executive_views
from .views.web import raw_data_logs as raw_log_views
from .views.web import settlements as settlement_views
from .views.palmtec import data_post as palmtec_ingest
from .views.webhooks import aggregator as aggregator_webhooks
from .views.web import ghost_records as ghost_record_views
from .views.web.imports import routes as route_import_views
from .views.web.masterdata import settings as settings_views
from .views.web.masterdata import transport as transport_views
from .views.web import device_registry as device_registry_views
from .views.web import global_settings as global_settings_views
from .views.web.masterdata import operations as operations_views

urlpatterns = [
    # authentication
    path('login', auth_views.login_view, name='login'),
    path('logout', auth_views.logout_view, name='logout'),
    path('verify-auth', auth_views.verify_auth, name='verify_auth'),
    path('session/keepalive', auth_views.session_keepalive, name='session_keepalive'),
    # self-service password reset (no auth required)
    path('auth/forgot-password', auth_views.forgot_password, name='forgot_password'),
    path('auth/reset-password',  auth_views.reset_password,  name='reset_password'),
    # user management
    path('create_user',                          user_views.create_user,         name='create-user'),
    path('get_users',                            user_views.get_all_users,        name='get_all_users'),
    path('update_user/<int:user_id>',            user_views.update_user,          name='update_user'),
    path('users/<int:user_id>/toggle-active',    user_views.toggle_user_active,   name='toggle_user_active'),
    path('users/capacity',                       user_views.user_capacity,         name='user_capacity'),
    path('change_user_password/<int:user_id>',   user_views.change_user_password,  name='change_user_password'),

    # session management + device approvals (company_admin)
    path('sessions',                                   session_views.list_sessions,             name='list_sessions'),
    path('sessions/<str:session_uid>/force-logout',    session_views.force_logout_session,      name='force_logout_session'),
    path('device-approvals',                           session_views.list_pending_approvals,    name='list_pending_approvals'),
    path('device-approvals/<int:approval_id>/approve', session_views.approve_device,            name='approve_device'),
    path('device-approvals/<int:approval_id>/reject',  session_views.reject_device,             name='reject_device'),
    path('admin/sessions',                             session_views.list_all_sessions,         name='list_all_sessions'),
    path('admin/sessions/<str:session_uid>/force-logout', session_views.force_logout_session_admin, name='force_logout_session_admin'),

    # company data
    path('customer-data', company_views.all_company_data, name='company_data'),
    path('create-company', company_views.create_company, name='create_company'),
    path('update-company-details/<int:pk>', company_views.update_company_details, name='update_company'),
    path('delete-company/<int:pk>', company_views.delete_company, name='delete_company'),
    path('register-company-license/<int:pk>', company_views.register_company_with_license_server, name='register_company_license'),
    path('validate-company-license/<int:pk>', company_views.validate_company_license, name='validate_company_license'),
    path('sync-company-license/<int:pk>',         company_views.sync_company_license,         name='sync_company_license'),
    path('sync-company-license/<int:pk>/confirm', company_views.sync_company_license_confirm, name='sync_company_license_confirm'),
    path('get-company-by-company-id/<str:company_id>', company_views.get_company_by_company_id, name='get_company_by_company_id'),
    path('import-company', company_views.import_company, name='import_company'),
    path('get_company_dashboard_metrics', company_views.get_company_dashboard_metrics, name='company_dashboard_data'),
    path('get_admin_data', company_views.get_admin_dashboard_data, name='get_admin_dashboard_data'),

    # depot data
    path('depots', depot_views.get_all_depots, name='get_all_depots'),
    path('create-depot', depot_views.create_depot, name='create_depot'),
    path('update-depot-details/<int:pk>', depot_views.update_depot_details, name='update_depot_details'),
    path('delete-depoteva/<int:pk>', depot_views.delete_depot, name='delete_depot'),

    # palmtec initial setup data
    path('getEtmSetupDetails', setup_data_views.get_etm_intial_data),
    path('get_company_devices', setup_data_views.get_company_devices_for_download),

    # ticket data — device push (ETM → server)
    # WARNING: path strings below are used verbatim in _validate_checksum() calls in
    # views/palmtec/data_post.py — update both places when renaming any of these paths.
    path('getScheduleOpen', palmtec_ingest.getScheduleOpenDataFromDevice, name='get_schedule_open_data'),
    path('getSdCl', palmtec_ingest.getScheduleCloseDataFromDevice, name='get_schedule_close_data'),

    path('getTripOpen', palmtec_ingest.getTripOpenDataFromDevice, name='get_trip_open_data'),
    path('getTripClose', palmtec_ingest.getTripCloseDataFromDevice, name='get_trip_close_data'),

    path('getTicket', palmtec_ingest.getTicketDataFromDevice, name='get_ticket_data'),

    path('getTripCloseSummary', palmtec_ingest.getTripCloseSummaryFromDevice, name='get_trip_close_summary'),
    path('getSdClSm', palmtec_ingest.getScheduleCloseSummaryFromDevice, name='get_schedule_close_summary'),

    path('getOdometerDetails', palmtec_ingest.getOdometerDataFromDevice, name='get_odometer_data'),
    path('getExpenseDetails', palmtec_ingest.getExpenseDataFromDevice, name='get_expense_data'),

    # failed payload management (superadmin only)
    path('failed-payloads',                   raw_log_views.get_failed_payloads,   name='get_failed_payloads'),
    path('failed-payloads/<int:log_id>/retry', raw_log_views.retry_failed_payload, name='retry_failed_payload'),

    # ticket data — web fetch
    path('get_all_transaction_data', ticket_reports.get_all_transaction_data, name='get_all_transaction_data'),
    path('get_all_trip_data',        ticket_reports.get_all_trip_data,        name='get_all_trip_data'),
    path('get_all_schedule_data',    ticket_reports.get_all_schedule_data,    name='get_all_schedule_data'),

    # payment aggregator webhooks (aggregator server → us)
    path('postTransactionDetails', aggregator_webhooks.aggregator_settlement_data, name='postTransactionDetails'),
    path('postPayoutDetails', aggregator_webhooks.aggregator_payout_callback, name='postPayoutDetails'),
    # payment aggregator web fetch
    path('get_settlement_data', settlement_views.get_settlement_data, name='get_settlement_data'),
    path('get_payout_data', settlement_views.get_payout_data, name='get_payout_data'),
    path('verify_settlement', settlement_views.verify_settlement, name='verify_settlement'),
    path('get_settlement_summary', settlement_views.get_settlement_summary, name='get_settlement_summary'),

    # dealer data
    path('dealers', dealer_views.get_all_dealers, name='get_all_dealers'),
    path('create-dealer', dealer_views.create_dealer, name='create_dealer'),
    path('update-dealer-details/<int:pk>', dealer_views.update_dealer_details, name='update_dealer_details'),
    path('delete-dealer/<int:pk>', dealer_views.delete_dealer, name='delete_dealer'),
    path('register-dealer-license/<int:pk>', dealer_views.register_dealer_with_license_server, name='register_dealer_license'),
    path('validate-dealer-license/<int:pk>',  dealer_views.validate_dealer_license,             name='validate_dealer_license'),
    path('sync-dealer-license/<int:pk>',         dealer_views.sync_dealer_license,         name='sync_dealer_license'),
    path('sync-dealer-license/<int:pk>/confirm', dealer_views.sync_dealer_license_confirm, name='sync_dealer_license_confirm'),
    path('dealer-mappings', dealer_views.get_dealer_mappings, name='get_dealer_mappings'),
    path('create-dealer-mapping', dealer_views.create_dealer_mapping, name='create_dealer_mapping'),
    path('update-dealer-mapping/<int:pk>', dealer_views.update_dealer_mapping, name='update_dealer_mapping'),
    path('dealer-dashboard', dealer_views.dealer_dashboard, name='dealer_dashboard'),

    # executive data
    path('executive-mappings', executive_views.get_executive_mappings, name='get_executive_mappings'),
    path('create-executive-mapping', executive_views.create_executive_mapping, name='create_executive_mapping'),
    path('update-executive-mapping/<int:pk>', executive_views.update_executive_mapping, name='update_executive_mapping'),
    path('executive-dashboard', executive_views.executive_dashboard, name='executive_dashboard'),

    # mdb upload
    path('import-mdb', mdb_views.MdbImportView.as_view(), name='import-mdb'),

    # About page + GlobalSettings
    path('about',            global_settings_views.about,           name='about'),
    path('global-settings',  global_settings_views.global_settings, name='global_settings'),

    # Audit logs (superadmin)
    path('audit-logs',              audit_log_views.list_audit_logs,        name='audit_logs'),
    path('audit-logs/action-types', audit_log_views.audit_log_action_types, name='audit_log_action_types'),

    # Ghost records — unresolved company (superadmin)
    path('ghost-transactions',    ghost_record_views.get_ghost_transactions, name='ghost_transactions'),
    path('ghost-payouts',         ghost_record_views.get_ghost_payouts,      name='ghost_payouts'),
    path('ghost-assign-company',  ghost_record_views.assign_ghost_company,   name='ghost_assign_company'),

    # Master Data — transport
    path('masterdata/bus-types', transport_views.get_bus_types),
    path('masterdata/bus-types/create', transport_views.create_bus_type),
    path('masterdata/bus-types/update/<int:pk>', transport_views.update_bus_type),
    path('masterdata/stages', transport_views.get_stages),
    path('masterdata/stages/create', transport_views.create_stage),
    path('masterdata/stages/update/<int:pk>', transport_views.update_stage),
    path('masterdata/vehicles', transport_views.get_vehicles),
    path('masterdata/vehicles/create', transport_views.create_vehicle),
    path('masterdata/vehicles/update/<int:pk>', transport_views.update_vehicle),
    path('masterdata/routes', transport_views.get_routes),
    path('masterdata/routes/<int:pk>', transport_views.get_route_detail),
    path('masterdata/routes/create', transport_views.create_route),
    path('masterdata/routes/update/<int:pk>', transport_views.update_route),
    path('masterdata/routes/create-wizard', transport_views.create_route_wizard),
    path('masterdata/routes/import-excel', transport_views.RouteExcelImportView.as_view()),
    path('masterdata/routes/import/validate', route_import_views.RouteImportValidateView.as_view()),
    path('masterdata/routes/import/confirm', route_import_views.RouteImportConfirmView.as_view()),
    path('masterdata/routes/import/template/<str:fare_type>', route_import_views.RouteImportTemplateView.as_view()),
    path('masterdata/routestages/update/<int:pk>', transport_views.update_route_stage),
    path('masterdata/dropdowns/bus-types', transport_views.get_bus_types_dropdown),
    path('masterdata/dropdowns/stages', transport_views.get_stages_dropdown, name='get_stages_dropdown'),
    path('masterdata/dropdowns/vehicles', transport_views.get_vehicles_dropdown),
    path('masterdata/dropdowns/depots',   transport_views.get_depots_dropdown),
    path('masterdata/fares/editor/<int:route_id>', transport_views.get_fare_editor, name='get_fare_editor'),
    path('masterdata/fares/update/<int:route_id>', transport_views.update_fare_table, name='update_fare_table'),

    # Master Data — crew
    path('masterdata/employee-types', crew_views.get_employee_types),
    path('masterdata/employee-types/create', crew_views.create_employee_type),
    path('masterdata/employee-types/update/<int:pk>', crew_views.update_employee_type),
    path('masterdata/employees', crew_views.get_employees),
    path('masterdata/employees/create', crew_views.create_employee),
    path('masterdata/employees/update/<int:pk>', crew_views.update_employee),
    path('masterdata/crew-assignments', crew_views.get_crew_assignments),
    path('masterdata/crew-assignments/create', crew_views.create_crew_assignment),
    path('masterdata/crew-assignments/update/<int:pk>', crew_views.update_crew_assignment),
    path('masterdata/crew-assignments/delete/<int:pk>', crew_views.delete_crew_assignment),
    path('masterdata/expense-masters', operations_views.get_expense_masters),
    path('masterdata/expense-masters/create', operations_views.create_expense_master),
    path('masterdata/expense-masters/update/<int:pk>', operations_views.update_expense_master),
    path('masterdata/expense-masters/delete/<int:pk>', operations_views.delete_expense_master),
    path('masterdata/inspector-details', operations_views.get_inspector_details),
    path('masterdata/expenses', operations_views.get_expenses),
    path('masterdata/dropdowns/employee-types', crew_views.get_employee_types_dropdown),
    path('masterdata/dropdowns/employees', crew_views.get_employees_by_type_dropdown),

    # Master Data — settings & currency
    path('masterdata/currencies', settings_views.get_currencies),
    path('masterdata/currencies/create', settings_views.create_currency),
    path('masterdata/currencies/update/<int:pk>', settings_views.update_currency),
    path('masterdata/settings', settings_views.get_settings),
    path('masterdata/device-settings/devices', settings_views.list_company_devices),
    path('masterdata/settings-profiles', settings_views.list_profiles),
    path('masterdata/settings-profiles/create', settings_views.create_profile),
    path('masterdata/settings-profiles/<int:profile_id>', settings_views.profile_detail),

    # ETM Device Registry
    path('etm-devices/upload',                         device_registry_views.DeviceUploadView.as_view(), name='etm_upload'),
    path('etm-devices',                                device_registry_views.list_devices,               name='etm_list'),
    path('etm-devices/summary',                        device_registry_views.device_summary,             name='etm_summary'),
    path('etm-devices/bulk-assign-dealer',             device_registry_views.bulk_assign_dealer,         name='etm_bulk_dealer'),
    path('etm-devices/bulk-assign-company',            device_registry_views.bulk_assign_company,        name='etm_bulk_company'),
    path('etm-devices/<int:device_id>/allocate',        device_registry_views.allocate_to_company,  name='etm_allocate'),
    path('etm-devices/<int:device_id>/deactivate',     device_registry_views.deactivate_device,   name='etm_deactivate'),
    path('etm-devices/<int:device_id>/reactivate',    device_registry_views.reactivate_device,   name='etm_reactivate'),
    path('etm-devices/<int:device_id>/unmap',          device_registry_views.unmap_device,         name='etm_unmap'),
    path('etm-devices/<int:device_id>/return-to-stock', device_registry_views.return_device_to_stock, name='etm_return_stock'),
    path('etm-devices/<int:device_id>/set-palmtec-id',   device_registry_views.set_palmtec_id,   name='etm_set_palmtec_id'),
    path('etm-devices/<int:device_id>/set-aggregator-tid', device_registry_views.set_aggregator_tid,  name='etm_set_aggregator_tid'),
    path('etm-devices/sync-aggregator-tids',               device_registry_views.sync_aggregator_tids, name='etm_sync_aggregator_tids'),

    # Palmtec device data APIs (server → APK → USB → device)
    path('device/routes',      palmtec_views.get_routes_list),
    path('device/settings',    palmtec_views.get_settings_file),
    path('device/crew',        palmtec_views.get_crew_file),
    path('device/vehicles',    palmtec_views.get_vehicles_file),
    path('device/expenses',    palmtec_views.get_expenses_file),
    # Route group
    path('device/routelst',    palmtec_views.get_routelst_file),
    path('device/stagelst',    palmtec_views.get_stagelst_file),
    path('device/languagedat', palmtec_views.get_languagedat_file),
    path('device/rtedat',      palmtec_views.get_rtedat_file),
    # Settings group
    path('device/currency',    palmtec_views.get_currency_file),
]