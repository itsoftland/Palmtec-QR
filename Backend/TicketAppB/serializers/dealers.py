import json
import os
from rest_framework import serializers
from ..models import Dealer


def _load_states_districts():
    json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'utils', 'indiaStatesDistricts.json')
    with open(json_path, 'r') as f:
        return json.load(f)

_STATES_DISTRICTS = _load_states_districts()


class DealerSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    gst_number = serializers.CharField(required=True, allow_blank=False, allow_null=False)
    district = serializers.CharField(required=True, allow_blank=False, allow_null=False)

    class Meta:
        model = Dealer
        fields = [
            'id',
            'dealer_code',
            'dealer_name',
            'contact_person',
            'contact_number',
            'email',
            'address',
            'state',
            'district',
            'gst_number',
            'is_active',
            'authentication_status',
            'product_registration_id',
            'unique_identifier',
            'product_from_date',
            'product_to_date',
            # Total counts (license-granted)
            'number_of_licences',
            'palmtec_count',
            'total_user_count',
            'premium_user_count',
            'intermediate_user_count',
            # License error
            'error_message',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'authentication_status',
            'product_registration_id',
            'unique_identifier',
            'number_of_licences',
            'palmtec_count',
            'total_user_count',
            'premium_user_count',
            'intermediate_user_count',
            'error_message',
            'created_by',
            'created_at',
            'updated_at',
        ]

    def validate_state(self, value):
        if value and value not in _STATES_DISTRICTS:
            raise serializers.ValidationError(
                f"'{value}' is not a valid Indian state or union territory."
            )
        return value

    def validate(self, attrs):
        state    = attrs.get('state') or (self.instance.state if self.instance else None)
        district = attrs.get('district')
        if district and state:
            valid_districts = _STATES_DISTRICTS.get(state, [])
            if district not in valid_districts:
                raise serializers.ValidationError({
                    'district': f"'{district}' is not a valid district for {state}."
                })
        return attrs
