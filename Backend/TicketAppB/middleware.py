"""
Middleware
==========
UserOnlineMiddleware is removed. Online presence is now derived from the session's
last_seen_at field — no separate Redis key needed.

LicenseExpiryMiddleware is removed. License checks are now handled by
TicketAppB.permissions.LicensePermission (a DRF permission class) which runs
after authentication resolves request.user, eliminating the redundant token
decode and DB read that the old middleware performed.

This file is kept to avoid import errors from any existing references but
contains no active middleware classes. Remove any MIDDLEWARE entries in
settings.py that reference TicketAppB.middleware.UserOnlineMiddleware or
TicketAppB.middleware.LicenseExpiryMiddleware.
"""

# Both middleware classes have been removed. See TicketAppB/permissions.py for
# the license check, and TicketAppB/authentication.py for per-request auth.