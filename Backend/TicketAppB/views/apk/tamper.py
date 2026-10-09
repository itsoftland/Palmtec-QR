import secrets

from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError

from django.shortcuts import get_object_or_404

from ...models.company import ETMDevice
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

    if sl_no is None:
            raise ValidationError("Serial Number is required.")

    device = get_object_or_404(
        ETMDevice,
        serial_number=sl_no,
        company=company_instance
    )

    otp = generate_otp()
    device.scert_code = otp
    device.save()


    return Response(
         {
              "success": True,
              "message": "scert key refreshed successfully",
              "data":{
                   "scert_key": device.scert_code,
                #    "otp": otp,
              },
         },
         status=status.HTTP_200_OK,
    )