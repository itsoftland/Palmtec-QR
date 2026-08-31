# ExecutiveCompanyMapping has been removed.
# Executive visibility is now handled via:
#   - CustomUser.state     → which state the executive is restricted to
#   - Company.created_by   → which companies this executive created
#
# Executive dashboard queries:
#   Company.objects.filter(created_by=request.user)
#
# This file is retained as a placeholder. Reimplement executive-specific
# serializers here when Phase 4 (User Management Layer) is built.
