from rest_framework import serializers
from ..models import ETMDevice


class ETMDeviceSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.company_name', read_only=True)
    dealer_name = serializers.CharField(source='dealer.dealer_name', read_only=True)

    class Meta:
        model = ETMDevice
        fields = [
            'id',
            'serial_number',
            'device_type',
            'palmtec_id',
            'aggregator_tid',
            'company',
            'company_name',
            'dealer',
            'dealer_name',
            'allocation_status',
            'is_active',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
