from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes

from ...models.company import ETMDevice
from ...permissions import LicensePermission


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