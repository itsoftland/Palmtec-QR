"""
LicensePermission
=================
DRF permission class that replaces LicenseExpiryMiddleware.
Runs after authentication resolves request.user, so no token decoding needed here.
Returns 403 with a clear message if the user's company or dealer is not in good standing.
Superadmin is fully exempt.
"""

from django.utils import timezone
from rest_framework.permissions import BasePermission


class LicensePermission(BasePermission):
    """
    Blocks requests from users whose company license has expired or whose
    company/dealer account is deactivated.
    Superadmin is exempt. Unauthenticated requests pass through (IsAuthenticated
    handles the 401 before this class is reached).
    """

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return True

        if user.is_superuser or user.role == 'superadmin':
            return True

        company = getattr(user, 'company', None)
        if company:
            if not company.is_active:
                self.message = 'Company account is deactivated. Contact Administrator.'
                return False
            if company.product_to_date and timezone.now().date() > company.product_to_date:
                self.message = f'License Expired (ID: {company.company_id}). Contact Administrator.'
                return False

        dealer = getattr(user, 'dealer', None)
        if dealer and not dealer.is_active:
            self.message = 'Dealer account is deactivated. Contact Administrator.'
            return False

        return True
