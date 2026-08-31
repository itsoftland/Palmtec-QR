from decimal import Decimal
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.conf import settings
from .master_data import VehicleType
from .master_data import Employee

# Operational data (Expense, CrewAssignment, etc.)

class ExpenseMaster(models.Model):
    """Expense category master data"""
    expense_code = models.CharField(
        max_length=50,
        help_text="Expense category code"
    )
    expense_name = models.CharField(
        max_length=100,
        help_text="Expense category name"
    )
    palmtec_id = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Device identifier"
    )
    company = models.ForeignKey(
        'Company',
        on_delete=models.CASCADE,
        related_name='expense_masters'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expense_masters_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expense_masters_updated'
    )
    
    class Meta:
        # db_table = 'expense_master'
        db_table = 'mdb_expense_master'
        unique_together = ['company', 'expense_code']
        indexes = [
            models.Index(fields=['company', 'expense_code']),
            models.Index(fields=['palmtec_id']),
        ]
    
    def __str__(self):
        return f"{self.expense_code} - {self.expense_name}"


class Expense(models.Model):
    """Trip expense records"""
    expense_code = models.CharField(
        max_length=50,
        help_text="Expense code reference"
    )
    expense_name = models.CharField(
        max_length=100,
        help_text="Expense description"
    )
    date = models.DateField()
    time = models.TimeField()
    palmtec_id = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Device identifier"
    )
    schedule_no = models.IntegerField(
        help_text="Schedule number"
    )
    bus_number = models.CharField(
        max_length=50,
        help_text="Bus registration number"
    )
    driver = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='expenses',
        help_text="Driver who incurred expense"
    )
    tripmaster_ref_id = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Reference to trip master"
    )
    receipt_no = models.CharField(
        max_length=50,
        null=True,
        blank=True
    )
    expense_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    company = models.ForeignKey(
        'Company',
        on_delete=models.CASCADE,
        related_name='expenses'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses_updated'
    )
    
    class Meta:
        # db_table = 'expense'
        db_table = 'mdb_expense'
        indexes = [
            models.Index(fields=['company', 'date']),
            models.Index(fields=['palmtec_id', 'date']),
            models.Index(fields=['tripmaster_ref_id']),
            models.Index(fields=['driver']),
        ]
    
    def __str__(self):
        return f"{self.expense_name} - ₹{self.expense_amount} ({self.date})"



class CrewAssignment(models.Model):
    """Crew assignment - links driver, conductor, cleaner to vehicle"""
    driver = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='driver_assignments',
        limit_choices_to={'emp_type__emp_type_name': 'Driver'}
    )
    conductor = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='conductor_assignments',
        limit_choices_to={'emp_type__emp_type_name': 'Conductor'},
        null=True,
        blank=True
    )
    cleaner = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='cleaner_assignments',
        limit_choices_to={'emp_type__emp_type_name': 'Cleaner'},
        null=True,
        blank=True
    )
    vehicle = models.ForeignKey(
        VehicleType,
        on_delete=models.PROTECT,
        related_name='crew_assignments'
    )
    company = models.ForeignKey(
        'Company',
        on_delete=models.CASCADE,
        related_name='crew_assignments'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='crew_assignments_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='crew_assignments_updated'
    )
    
    class Meta:
        # db_table = 'crew_assignment'
        db_table = 'mdb_crew_assignment'
        indexes = [
            models.Index(fields=['company', 'vehicle']),
            models.Index(fields=['driver']),
            models.Index(fields=['conductor']),
        ]
    
    def __str__(self):
        return f"{self.vehicle.bus_reg_num}: D-{self.driver.employee_name}, C-{self.conductor.employee_name if self.conductor else 'N/A'}"


class InspectorDetails(models.Model):
    """Inspector check records during trips"""
    tripmaster_ref_id = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Reference to trip master"
    )
    inspector = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='inspections',
        limit_choices_to={'emp_type__emp_type_name__iexact': 'Inspector'}
    )
    station_no = models.CharField(
        max_length=50,
        help_text="Station/checkpoint number"
    )
    date = models.DateField()
    time = models.TimeField()
    palmtec_id = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Device identifier"
    )
    schedule_no = models.IntegerField()
    trip_no = models.IntegerField()
    company = models.ForeignKey(
        'Company',
        on_delete=models.CASCADE,
        related_name='inspector_details'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inspector_details_created'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inspector_details_updated'
    )
    
    class Meta:
        # db_table = 'inspector_details'
        db_table = 'mdb_inspector_details'
        indexes = [
            models.Index(fields=['company', 'date']),
            models.Index(fields=['tripmaster_ref_id']),
            models.Index(fields=['palmtec_id', 'date']),
            models.Index(fields=['inspector']),
        ]
    
    def __str__(self):
        return f"Inspector {self.inspector.employee_name} - {self.date} {self.time}"
