from rest_framework import serializers
from ..models import CustomUser, UserRole, UserTier


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    tier_display = serializers.CharField(source='get_tier_display', read_only=True)
    company_name = serializers.CharField(source='company.company_name', read_only=True)
    dealer_name  = serializers.CharField(source='dealer.dealer_name',  read_only=True)

    class Meta:
        model  = CustomUser
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'role_display',
            'tier',
            'tier_display',
            'state',
            'company',
            'company_name',
            'dealer',
            'dealer_name',
            'is_active',
            'is_verified',
            'created_by',
            'date_joined',
            'last_login',
        ]
        read_only_fields = [
            'id',
            'role_display',
            'tier_display',
            'company_name',
            'dealer_name',
            'date_joined',
            'last_login',
        ]
