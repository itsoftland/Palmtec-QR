"""
Login notifications — Phase 5
==============================
Checks run on every successful login and appended to the login response.
Kept in a separate module so they're cheap to test and extend.

Severity levels: 'error' | 'warning' | 'info'
"""

from django.utils import timezone

from ...models import Depot, ETMDevice, RouteDepot, UserRole

# Days before expiry at which we start warning
_EXPIRY_WARNING_DAYS = 30


def get_login_notifications(user, company):
    """
    Return a list of notification dicts for the logged-in user.
    All checks are fast single-count queries — no heavy aggregations.
    """
    alerts = []

    # ── 1. Company license expiry ─────────────────────────────────────────────
    if company and company.product_to_date:
        days = (company.product_to_date - timezone.now().date()).days
        if days < 0:
            alerts.append({
                'type':     'license_expired',
                'severity': 'error',
                'message':  (
                    f'License expired {abs(days)} day(s) ago '
                    f'(ID: {company.company_id}). Contact your administrator.'
                ),
            })
        elif days <= _EXPIRY_WARNING_DAYS:
            alerts.append({
                'type':     'license_expiry_warning',
                'severity': 'warning',
                'message':  (
                    f'License expires in {days} day(s) '
                    f'(ID: {company.company_id}). Please renew soon.'
                ),
                'days_remaining': days,
            })

    # ── 2. Dealer license expiry (for dealer_admin users) ────────────────────
    dealer = getattr(user, 'dealer', None)
    if dealer and dealer.product_to_date:
        days = (dealer.product_to_date - timezone.now().date()).days
        if days < 0:
            alerts.append({
                'type':     'dealer_license_expired',
                'severity': 'error',
                'message':  f'Dealer license expired {abs(days)} day(s) ago. Contact support.',
            })
        elif days <= _EXPIRY_WARNING_DAYS:
            alerts.append({
                'type':     'dealer_license_expiry_warning',
                'severity': 'warning',
                'message':  f'Dealer license expires in {days} day(s). Please renew.',
                'days_remaining': days,
            })

    # ── 3. ETM devices allocated but missing Palmtec ID ──────────────────────
    if company and user.role == UserRole.COMPANY_ADMIN:
        devices_without_palmtec = list(
            ETMDevice.objects.filter(
                company=company,
                allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
                palmtec_id__isnull=True,
            ).values_list('serial_number', flat=True)
        )
        if devices_without_palmtec:
            alerts.append({
                'type':           'unmapped_devices',
                'severity':       'warning',
                'message':        (
                    f'{len(devices_without_palmtec)} ETM device(s) have no Palmtec ID assigned. '
                    'Please assign Palmtec IDs for proper data input and management.'
                ),
                'count':          len(devices_without_palmtec),
                'serial_numbers': devices_without_palmtec,
            })

    # ── 4. Depots with no route mapped ────────────────────────────────────────
    if company and user.role == UserRole.COMPANY_ADMIN:
        mapped_depot_ids = RouteDepot.objects.filter(
            company=company,
        ).values_list('depot_id', flat=True)

        depots_without_route = Depot.objects.filter(
            company=company,
            is_active=True,
        ).exclude(id__in=mapped_depot_ids).count()

        if depots_without_route:
            alerts.append({
                'type':     'unmapped_depots',
                'severity': 'info',
                'message':  (
                    f'{depots_without_route} depot(s) have no route assigned. '
                    'Assign routes to depots to establish the depot-route connection.'
                ),
                'count': depots_without_route,
            })

    return alerts
