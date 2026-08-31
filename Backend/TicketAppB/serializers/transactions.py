from decimal import Decimal
from rest_framework import serializers
from ..models import TransactionData, TripData, ScheduleData


class TicketDataSerializer(serializers.ModelSerializer):
    TICKET_TYPE_BITS = {
        1:  'Full',
        2:  'Half',
        4:  'Luggage',
        8:  'PH',
        16: 'Student',
    }

    ticket_type_display   = serializers.SerializerMethodField()
    formatted_ticket_date = serializers.SerializerMethodField()
    from_stage_name       = serializers.SerializerMethodField()
    to_stage_name         = serializers.SerializerMethodField()
    trip_no               = serializers.SerializerMethodField()
    schedule_no           = serializers.SerializerMethodField()
    route_code            = serializers.SerializerMethodField()
    depot_code            = serializers.SerializerMethodField()
    company_name          = serializers.SerializerMethodField()

    class Meta:
        model = TransactionData
        fields = [
            'id',
            'unique_code',
            'palmtec_id',
            'trip_id',
            'schedule_id',
            'ticket_number',
            'ticket_date',
            'formatted_ticket_date',
            'ticket_time',
            'trip_start_date',
            'trip_start_time',
            'from_stage',
            'to_stage',
            'from_stage_name',
            'to_stage_name',
            'trip_no',
            'schedule_no',
            'ticket_type',
            'ticket_type_display',
            'route_code',
            'depot_code',
            'company_name',
            'full_count',
            'half_count',
            'st_count',
            'phy_count',
            'lugg_count',
            'total_tickets',
            'passenger_count',
            'ticket_amount',
            'full_total_amount',
            'st_total_amount',
            'lugg_amount',
            'adjust_amount',
            'pass_id',
            'warrant_amount',
            'refund_status',
            'refund_amount',
            'ladies_count',
            'senior_count',
            'transaction_id',
            'ticket_status',
            'manual_verified_upi',
            'reference_number',
            'bqr_merchant_id',
            'up_down_trip',
            'battery_percentage',
            'checksum',
            'created_at',
        ]

    def get_ticket_type_display(self, obj):
        try:
            val = int(obj.ticket_type)
        except (TypeError, ValueError):
            return obj.ticket_type or 'Unknown'
        labels = [label for bit, label in self.TICKET_TYPE_BITS.items() if val & bit]
        return ' + '.join(labels) if labels else 'Unknown'

    def get_formatted_ticket_date(self, obj):
        if obj.ticket_date:
            return obj.ticket_date.strftime('%d-%m-%Y')
        return None

    def get_from_stage_name(self, obj):
        if obj.from_stage_id_id and obj.from_stage_id:
            return obj.from_stage_id.stage.stage_name
        return obj.from_stage

    def get_to_stage_name(self, obj):
        if obj.to_stage_id_id and obj.to_stage_id:
            return obj.to_stage_id.stage.stage_name
        return obj.to_stage

    def get_trip_no(self, obj):
        return obj.trip_id.trip_no if obj.trip_id else None

    def get_schedule_no(self, obj):
        return obj.schedule_id.schedule_no if obj.schedule_id else None

    def get_route_code(self, obj):
        if obj.route_id:
            return obj.route_id.route_code
        return None

    def get_depot_code(self, obj):
        if not obj.route_id:
            return None
        rd = obj.route_id.route_depots.first()
        return rd.depot.depot_code if rd else None

    def get_company_name(self, obj):
        return obj.company_code.company_name if obj.company_code else None


class TripDataSerializer(serializers.ModelSerializer):
    status            = serializers.SerializerMethodField()
    route_code        = serializers.SerializerMethodField()
    depot_code        = serializers.SerializerMethodField()
    total_cash_amount = serializers.SerializerMethodField()
    company_name      = serializers.SerializerMethodField()

    class Meta:
        model = TripData
        fields = [
            'id',
            'open_unique_code',
            'close_unique_code',
            'palmtec_id',
            'trip_no',
            'schedule_no',
            'schedule_start_date',
            'schedule_start_time',
            'up_down_trip',
            'route_code',
            'depot_code',
            'company_name',
            'status',
            'auto_opened',
            'ghost_note',
            'start_date',
            'start_time',
            'start_datetime',
            'end_date',
            'end_time',
            'end_datetime',
            'battery_percentage',
            'start_ticket_no',
            'end_ticket_no',
            'total_tickets',
            'total_cash_tickets',
            'total_passengers',
            'upi_ticket_count',
            'upi_ticket_amount',
            'total_collection',
            'total_cash_amount',
            'total_km',
            'bus_no',
            'driver',
            'conductor',
            'expense_amount',
            'full_count',
            'half_count',
            'st_count',
            'luggage_count',
            'physical_count',
            'pass_count',
            'ladies_count',
            'senior_count',
            'full_collection',
            'half_collection',
            'st_collection',
            'luggage_collection',
            'physical_collection',
            'ladies_collection',
            'senior_collection',
            'adjust_collection',
            'updated_at',
            'created_at',
        ]

    def get_status(self, obj):
        return 'closed' if obj.is_closed else 'open'

    def get_route_code(self, obj):
        if obj.route_id:
            return obj.route_id.route_code
        return None

    def get_depot_code(self, obj):
        if not obj.route_id:
            return None
        rd = obj.route_id.route_depots.first()
        return rd.depot.depot_code if rd else None

    def get_total_cash_amount(self, obj):
        total = obj.total_collection or Decimal('0.00')
        upi = obj.upi_ticket_amount or Decimal('0.00')
        return max(Decimal('0.00'), total - upi)

    def get_company_name(self, obj):
        return obj.company_code.company_name if obj.company_code else None


class ScheduleDataSerializer(serializers.ModelSerializer):
    status        = serializers.SerializerMethodField()
    route_code    = serializers.SerializerMethodField()
    depot_code    = serializers.SerializerMethodField()
    battery_start = serializers.SerializerMethodField()
    battery_end   = serializers.SerializerMethodField()
    trips_count   = serializers.SerializerMethodField()
    company_name  = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleData
        fields = [
            'id',
            'open_unique_code',
            'close_unique_code',
            'palmtec_id',
            'schedule_no',
            'route_code',
            'depot_code',
            'company_name',
            'status',
            'auto_opened',
            'ghost_note',
            'start_date',
            'start_time',
            'start_datetime',
            'end_date',
            'end_time',
            'end_datetime',
            'battery_start',
            'battery_end',
            'trips_count',
            'total_tickets',
            'total_collection',
            'upi_total_collection',
            'bus_no',
            'driver',
            'conductor',
            'full_count',
            'half_count',
            'st_count',
            'physical_count',
            'ladies_count',
            'senior_count',
            'luggage_count',
            'adjust_count',
            'upi_full_count',
            'upi_half_count',
            'upi_physical_count',
            'upi_ladies_count',
            'upi_senior_count',
            'upi_luggage_count',
            'upi_st_count',
            'full_collection',
            'half_collection',
            'st_collection',
            'physical_collection',
            'ladies_collection',
            'senior_collection',
            'luggage_collection',
            'adjust_collection',
            'upi_full_collection',
            'upi_half_collection',
            'upi_physical_collection',
            'upi_ladies_collection',
            'upi_senior_collection',
            'upi_st_collection',
            'upi_luggage_collection',
            'updated_at',
            'created_at',
        ]

    def get_status(self, obj):
        return 'closed' if obj.is_closed else 'open'

    def get_route_code(self, obj):
        if obj.route_id:
            return obj.route_id.route_code
        return None

    def get_depot_code(self, obj):
        if not obj.route_id:
            return None
        rd = obj.route_id.route_depots.first()
        return rd.depot.depot_code if rd else None

    def get_battery_start(self, obj):
        return obj.battery_open

    def get_battery_end(self, obj):
        return obj.battery_close

    def get_trips_count(self, obj):
        if hasattr(obj, '_trips_count'):
            return obj._trips_count
        return obj.trips.count()

    def get_company_name(self, obj):
        return obj.company_code.company_name if obj.company_code else None
