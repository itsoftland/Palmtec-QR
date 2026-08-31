from rest_framework import serializers
from ..models import (
    BusType, EmployeeType, Stage, Currency,
    Employee, VehicleType, CrewAssignment, Settings,
    RouteStage, Route, RouteBusType, Fare, SettingsProfile,
    ExpenseMaster, InspectorDetails, Expense, ETMDevice,
)


class BusTypeSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model  = BusType
        fields = [
            'id', 'bustype_code', 'name', 'is_active',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at']


class EmployeeTypeSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model  = EmployeeType
        fields = [
            'id', 'emp_type_name', 'company',
            'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at']


class StageSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model  = Stage
        fields = [
            'id', 'stage_code', 'stage_name', 'is_deleted',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at']

    def validate_stage_code(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Stage code is required.')
        if not value.isdigit():
            raise serializers.ValidationError('Stage code must contain numbers only.')
        return value

    def validate_stage_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Stage name is required.')
        if not value.isalnum():
            raise serializers.ValidationError('Stage name must be alphanumeric.')
        return value


class CurrencySerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model  = Currency
        fields = [
            'id', 'currency', 'country',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at']


class EmployeeSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)
    emp_type_name = serializers.CharField(source='emp_type.emp_type_name', read_only=True)

    class Meta:
        model  = Employee
        fields = [
            'id', 'employee_code', 'employee_name',
            'emp_type', 'emp_type_name',
            'phone_no', 'password', 'is_deleted',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at', 'emp_type_name']

    def validate_emp_type(self, value):
        company = self.context.get('company')
        if company and value.company != company:
            raise serializers.ValidationError("Selected employee type does not belong to your company.")
        return value


class VehicleTypeSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)
    bus_type_name = serializers.CharField(source='bus_type.name', read_only=True)

    class Meta:
        model  = VehicleType
        fields = [
            'id', 'bus_reg_num',
            'bus_type', 'bus_type_name',
            'is_deleted', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at', 'bus_type_name']

    def validate_bus_type(self, value):
        company = self.context.get('company')
        if company and value.company != company:
            raise serializers.ValidationError("Selected bus type does not belong to your company.")
        return value


class CrewAssignmentSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)
    driver_name    = serializers.CharField(source='driver.employee_name', read_only=True)
    conductor_name = serializers.CharField(source='conductor.employee_name', read_only=True)
    cleaner_name   = serializers.CharField(source='cleaner.employee_name', read_only=True)
    vehicle_reg    = serializers.CharField(source='vehicle.bus_reg_num', read_only=True)

    class Meta:
        model  = CrewAssignment
        fields = [
            'id',
            'driver', 'driver_name',
            'conductor', 'conductor_name',
            'cleaner', 'cleaner_name',
            'vehicle', 'vehicle_reg',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'company', 'created_by', 'updated_by',
            'created_at', 'updated_at',
            'driver_name', 'conductor_name', 'cleaner_name', 'vehicle_reg',
        ]


def _validate_password_not_blank(value):
    if value is not None and str(value).strip() == '':
        raise serializers.ValidationError("Password cannot be blank.")
    return value


class SettingsSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)

    def validate_user_pwd(self, value):
        return _validate_password_not_blank(value)

    def validate_master_pwd(self, value):
        return _validate_password_not_blank(value)

    class Meta:
        model  = Settings
        fields = [
            'id',
            'half_per', 'con_per', 'st_max_amt', 'st_min_con', 'phy_per',
            'round_amt', 'luggage_unit_rate',
            'main_display', 'main_display2',
            'header1', 'header2', 'header3', 'footer1', 'footer2',
            'roundoff', 'round_up', 'remove_ticket_flag', 'stage_font_flag',
            'next_fare_flag', 'odometer_entry', 'ticket_no_big_font',
            'gprs_enable', 'tripsend_enable', 'schedulesend_enable',
            'sendpend', 'inspect_rpt', 'st_roundoff_enable', 'st_fare_edit',
            'multiple_pass', 'simple_report', 'inspector_sms', 'auto_shut_down',
            'userpswd_enable',
            'report_flag', 'language_option', 'stage_updation_msg', 'default_stage',
            'report_font', 'st_roundoff_amt',
            'ph_no2', 'ph_no3', 'access_point', 'dest_adds', 'username', 'password',
            'uploadpath', 'downloadpath', 'http_url',
            'smart_card', 'exp_enable', 'ftp_enable', 'gprs_enable_message', 'sendbill_enable',
            'user_pwd', 'master_pwd', 'currency',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at']


# RouteStageSerializer and RouteBusTypeSerializer must be defined before RouteSerializer

class RouteStageSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    stage_name = serializers.CharField(source='stage.stage_name', read_only=True)
    stage_code = serializers.CharField(source='stage.stage_code', read_only=True)

    class Meta:
        model = RouteStage
        fields = [
            'id', 'stage', 'stage_name', 'stage_code',
            'sequence_no', 'distance', 'stage_local_lang',
            'company', 'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'created_at', 'updated_at', 'stage_name', 'stage_code']

    def validate_stage(self, value):
        company = self.context.get('company')
        if company and value.company != company:
            raise serializers.ValidationError("Selected stage does not belong to your company.")
        return value


class RouteBusTypeSerializer(serializers.ModelSerializer):
    company       = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by    = serializers.PrimaryKeyRelatedField(read_only=True)
    bus_type_code = serializers.CharField(source='bus_type.bustype_code', read_only=True)
    bus_type_name = serializers.CharField(source='bus_type.name', read_only=True)

    class Meta:
        model = RouteBusType
        fields = [
            'id', 'bus_type', 'bus_type_code', 'bus_type_name',
            'company', 'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'created_at', 'updated_at', 'bus_type_code', 'bus_type_name']

    def validate_bus_type(self, value):
        company = self.context.get('company')
        if company and value.company != company:
            raise serializers.ValidationError("Selected bus type does not belong to your company.")
        return value


class RouteSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)
    bus_type_name   = serializers.CharField(source='bus_type.name', read_only=True)
    route_stages    = RouteStageSerializer(many=True, read_only=True)
    route_bus_types = RouteBusTypeSerializer(many=True, read_only=True)
    depot_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False, default=list
    )
    depots = serializers.SerializerMethodField(read_only=True)

    def get_depots(self, obj):
        return list(
            obj.route_depots.select_related('depot')
            .values('depot__id', 'depot__depot_code', 'depot__depot_name')
        )

    class Meta:
        model  = Route
        fields = [
            'id', 'route_code', 'route_name', 'min_fare', 'fare_type',
            'bus_type', 'bus_type_name',
            'half', 'luggage', 'adjust', 'conc', 'ph',
            'start_from', 'pass_allow', 'is_deleted',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
            'route_stages', 'route_bus_types', 'depot_ids', 'depots',
        ]
        read_only_fields = [
            'id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
            'bus_type_name', 'route_stages', 'route_bus_types', 'depots',
        ]

    def validate_bus_type(self, value):
        company = self.context.get('company')
        if company and value.company != company:
            raise serializers.ValidationError("Selected bus type does not belong to your company.")
        return value


class RouteListSerializer(serializers.ModelSerializer):
    bus_type_name = serializers.CharField(source='bus_type.name', read_only=True)
    stage_count   = serializers.IntegerField(read_only=True)

    class Meta:
        model  = Route
        fields = [
            'id', 'route_code', 'route_name', 'min_fare', 'fare_type',
            'bus_type', 'bus_type_name',
            'start_from', 'half', 'luggage', 'adjust', 'conc', 'ph',
            'pass_allow', 'is_deleted', 'stage_count',
        ]


class FareSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    route_name = serializers.CharField(read_only=True)

    class Meta:
        model = Fare
        fields = [
            'id', 'number', 'row', 'col', 'fare_amount',
            'route', 'route_name',
            'company', 'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'route_name', 'company', 'created_by', 'created_at', 'updated_at']

    def validate_route(self, value):
        company = self.context.get('company')
        if company and value.company != company:
            raise serializers.ValidationError("Selected route does not belong to your company.")
        return value


class SettingsProfileSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    palmtec_id = serializers.IntegerField(read_only=True)
    device     = serializers.PrimaryKeyRelatedField(read_only=True)
    device_id  = serializers.PrimaryKeyRelatedField(
        source='device', queryset=ETMDevice.objects.all(), write_only=True,
    )
    device_serial_number = serializers.SerializerMethodField()

    def get_device_serial_number(self, obj):
        return obj.device.serial_number if obj.device_id else None

    def validate_device_id(self, device):
        company = self.context.get('company')
        if company and device.company_id != company.id:
            raise serializers.ValidationError("Selected device does not belong to your company.")
        if device.allocation_status != ETMDevice.AllocationStatus.ALLOCATED:
            raise serializers.ValidationError("Selected device is not allocated to your company.")
        if not device.palmtec_id:
            raise serializers.ValidationError("Selected device has no Palmtec ID assigned yet.")
        return device

    def create(self, validated_data):
        validated_data['palmtec_id'] = validated_data['device'].palmtec_id
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'device' in validated_data:
            validated_data['palmtec_id'] = validated_data['device'].palmtec_id
        return super().update(instance, validated_data)

    def validate_user_pwd(self, value):
        return _validate_password_not_blank(value)

    def validate_master_pwd(self, value):
        return _validate_password_not_blank(value)

    def validate_supervisor_pwd(self, value):
        return _validate_password_not_blank(value)

    def validate_remove_pwd(self, value):
        return _validate_password_not_blank(value)

    class Meta:
        model  = SettingsProfile
        fields = [
            'id', 'name', 'company', 'device', 'device_id', 'palmtec_id', 'device_serial_number',
            'user_pwd', 'master_pwd', 'supervisor_pwd', 'remove_pwd',
            'half_per', 'con_per', 'phy_per', 'round_amt', 'luggage_unit_rate',
            'main_display', 'main_display2',
            'header1', 'header2', 'header3', 'footer1', 'footer2',
            'language_option', 'report_font',
            'st_fare_edit', 'st_max_amt', 'st_ratio', 'st_min_amt',
            'st_roundoff_enable', 'st_roundoff_amt',
            'roundoff', 'round_up', 'remove_ticket_flag', 'stage_font_flag',
            'next_fare_flag', 'odometer_entry', 'ticket_no_big_font',
            'tripsend_enable', 'schedulesend_enable',
            'inspect_rpt', 'multiple_pass', 'simple_report', 'inspector_sms',
            'auto_shut_down', 'userpswd_enable', 'exp_enable',
            'stage_updation_msg', 'default_stage',
            'created_at', 'updated_at', 'created_by', 'updated_by',
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'created_by', 'updated_by']


class ExpenseMasterSerializer(serializers.ModelSerializer):
    company    = serializers.PrimaryKeyRelatedField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model  = ExpenseMaster
        fields = [
            'id', 'expense_code', 'expense_name', 'palmtec_id',
            'company', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_by', 'updated_by', 'created_at', 'updated_at']


class ExpenseSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source='driver.employee_name', read_only=True)

    class Meta:
        model  = Expense
        fields = [
            'id', 'expense_code', 'expense_name', 'expense_amount',
            'date', 'time', 'palmtec_id',
            'schedule_no', 'bus_number', 'receipt_no',
            'driver', 'driver_name', 'tripmaster_ref_id',
            'company', 'created_at',
        ]
        read_only_fields = fields


class InspectorDetailsSerializer(serializers.ModelSerializer):
    inspector_name = serializers.CharField(source='inspector.employee_name', read_only=True)
    inspector_code = serializers.CharField(source='inspector.employee_code', read_only=True)

    class Meta:
        model  = InspectorDetails
        fields = [
            'id', 'tripmaster_ref_id', 'inspector', 'inspector_name', 'inspector_code',
            'station_no', 'date', 'time', 'palmtec_id',
            'schedule_no', 'trip_no', 'company',
            'created_at',
        ]
        read_only_fields = fields
