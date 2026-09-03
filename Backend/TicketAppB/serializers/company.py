import json
import os
from rest_framework import serializers
from ..models import Company, Depot, RouteDepot

def _load_states_districts():
    json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'utils', 'indiaStatesDistricts.json')
    with open(json_path, 'r') as f:
        return json.load(f)

_STATES_DISTRICTS = _load_states_districts()


class CompanySerializer(serializers.ModelSerializer):
    is_validated = serializers.ReadOnlyField()
    needs_validation = serializers.ReadOnlyField()
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    dealer = serializers.PrimaryKeyRelatedField(read_only=True)
    gst_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    district = serializers.CharField(required=True, allow_blank=False, allow_null=False)

    class Meta:
        model = Company
        fields = [
            'id',
            'company_id',
            'company_name',
            'company_email',
            'gst_number',
            'aggregator_merchant_id',
            'contact_person',
            'contact_number',
            'address',
            'state',
            'district',
            'client_type',
            'dealer',
            # License / registration
            'authentication_status',
            'product_registration_id',
            'unique_identifier',
            'product_from_date',
            'product_to_date',
            # Counts (from license server or dealer pool)
            'number_of_licences',
            'palmtec_count',
            'total_user_count',
            'premium_user_count',
            'intermediate_user_count',
            # License error (set when NumberOfLicence hard-block triggers)
            'error_message',
            # Status
            'is_active',
            'is_validated',
            'needs_validation',
            # Audit
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'company_id',
            'authentication_status',
            'product_registration_id',
            'unique_identifier',
            'product_from_date',
            'product_to_date',
            'number_of_licences',
            'palmtec_count',
            'total_user_count',
            'premium_user_count',
            'intermediate_user_count',
            'error_message',
            'created_by',
            'dealer',
            'created_at',
            'updated_at',
        ]

    def validate_company_email(self, value):
        if self.instance:
            if Company.objects.exclude(pk=self.instance.pk).filter(company_email=value).exists():
                raise serializers.ValidationError("A company with this email already exists.")
        else:
            if Company.objects.filter(company_email=value).exists():
                raise serializers.ValidationError("A company with this email already exists.")
        return value

    def validate_contact_number(self, value):
        cleaned = value.replace('-', '').replace(' ', '').replace('(', '').replace(')', '')
        if not cleaned.isdigit():
            raise serializers.ValidationError("Contact number must contain only digits and basic formatting characters.")
        if len(cleaned) < 10:
            raise serializers.ValidationError("Contact number must be at least 10 digits.")
        return value

    def validate_state(self, value):
        if value and value not in _STATES_DISTRICTS:
            raise serializers.ValidationError(f"'{value}' is not a valid Indian state or union territory.")
        return value

    def validate(self, attrs):
        if not attrs.get('gst_number'):
            attrs['gst_number'] = '000000000000000'
        state = attrs.get('state') or (self.instance.state if self.instance else None)
        district = attrs.get('district')
        if district and state:
            valid_districts = _STATES_DISTRICTS.get(state, [])
            if district not in valid_districts:
                raise serializers.ValidationError({'district': f"'{district}' is not a valid district for {state}."})
        return attrs


class DepotSerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    routes = serializers.SerializerMethodField()

    class Meta:
        model = Depot
        fields = [
            'id',
            'company',
            'depot_code',
            'depot_name',
            'address',
            'is_active',
            'created_by',
            'routes',
        ]
        read_only_fields = [
            'id',
            'company',
            'is_active',
            'created_by',
            'routes',
        ]

    def get_routes(self, obj):
        route_depots = RouteDepot.objects.filter(depot=obj).select_related('route')
        return [
            {'route_code': rd.route.route_code, 'route_name': rd.route.route_name}
            for rd in route_depots
            if rd.route
        ]

    def validate_depot_code(self, value):
        value = (value or '').strip()
        company = self.context.get('company')
        if company:
            qs = Depot.objects.filter(company=company, depot_code__iexact=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError('Failed! Depot code Already existing')

        return value
