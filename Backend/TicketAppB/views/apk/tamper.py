import secrets

from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime

from ...models.company import ETMDevice, TamperedDeviceHistory
from ...permissions import LicensePermission


def generate_otp():
    otp = secrets.randbelow(9000) + 1000
    return str(otp)



@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def allocated_device_list(request):

    company_instance = request.user.company

    serial_number_list = list(
        ETMDevice.objects
        .filter(company=company_instance)
        .values_list("serial_number", flat=True)
    )

    return Response(
        {
            "success": True,
            "message": "Data fetched successfully",
            "data": {
                "serial_numbers": serial_number_list,
            },
        },
        status=status.HTTP_200_OK,
    )



@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_device_credentials(request):

    user = request.user
    company_instance = user.company

    sl_no = request.GET.get('sl_no')

    if sl_no is None:
        raise ValidationError("Serial Number is required.")

    device = get_object_or_404(
        ETMDevice,
        serial_number=sl_no,
        company=company_instance
    )

    device_cred = {
        "serial_number": device.serial_number,
        "mac_address": device.mac_address,
        "scert_key": device.scert_code,
    }

    return Response(
        {
            "success": True,
            "message": "device credentials fetched successfully.",
            "data": {
                "credentials": device_cred,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def refresh_scert_key(request):

    user = request.user
    company_instance = user.company

    sl_no = request.GET.get('sl_no')
    tamper_at = request.GET.get('tamper_at')

    if sl_no is None:
        raise ValidationError("Serial Number is required.")

    if tamper_at is None:
         raise ValidationError("tamper_at is required.")

    device = get_object_or_404(
        ETMDevice,
        serial_number=sl_no,
        company=company_instance
    )

    otp = generate_otp()

    # Validate datetime format
    parsed_tamper_at = parse_datetime(tamper_at)


    # Update device and create history atomically
    with transaction.atomic():

        device.tamper_status = True
        device.save(update_fields=["tamper_status"])

        TamperedDeviceHistory.objects.create(
            device=device,
            company=company_instance,
            tampered_at=parsed_tamper_at,
        )


    return Response(
        {
            "success": True,
            "message": "scert key refreshed successfully",
            "data":{
                "scert_key": otp,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def reset_device_tamper_status(request):

    user = request.user
    company_instance = user.company

    sl_no = request.GET.get('sl_no')
    new_key = request.GET.get('new_key')
    untamper_at = request.GET.get('untamper_at')

    if sl_no is None:
            raise ValidationError("Serial Number is required.")

    if untamper_at is None:
             raise ValidationError("untamper_at is required.")

    device = get_object_or_404(
        ETMDevice,
        serial_number=sl_no,
        company=company_instance
    )

    tampered_device_details = TamperedDeviceHistory.objects.filter(
        device=device,
        company=company_instance,
    ).order_by("-created_at").first()

    parsed_untamper_at = parse_datetime(untamper_at)
    
    # Update device and history atomically
    with transaction.atomic():

        device.scert_code = new_key
        device.tamper_status = False

        device.save(
            update_fields=["scert_code", "tamper_status"]
        )

        tampered_device_details.untampered_by = user
        tampered_device_details.untampered_at = parsed_untamper_at
        tampered_device_details.status = (
            TamperedDeviceHistory.TamperStatus.UNTAMPERED
        )

        tampered_device_details.save(
            update_fields=[
                "untampered_by",
                "untampered_at",
                "status",
            ]
        )

    return Response(
        {
            "success": True,
            "message": "device reset successfully",
        },
        status=status.HTTP_200_OK,
    )