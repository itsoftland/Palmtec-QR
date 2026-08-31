from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import secrets
from ..models import ETMDevice, DeviceRejectionLog
from ..permissions import LicensePermission
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse

import os


@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def get_etm_intial_data(request):
    uniqueIdentifier = secrets.randbelow(exclusive_upper_bound=8999)
    serialNumber = request.GET.get('serialnumber')

    if not serialNumber:
        return Response({"message": "Serial number is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        etm_object = ETMDevice.objects.select_related('company').get(serial_number=serialNumber)
    except ETMDevice.DoesNotExist:
        return Response({"message": "Serial number is unmapped"}, status=status.HTTP_404_NOT_FOUND)

    # Gate 1: device must be allocated to a company
    if etm_object.allocation_status != ETMDevice.AllocationStatus.ALLOCATED:
        DeviceRejectionLog.objects.create(
            serial_number_claimed=serialNumber,
            rejection_reason=DeviceRejectionLog.RejectionReason.NOT_ALLOCATED,
            source='getEtmSetupDetails',
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response({"message": "Device is not allocated to any company."}, status=status.HTTP_403_FORBIDDEN)

    # Gate 2: device must have a company assigned
    if etm_object.company is None:
        DeviceRejectionLog.objects.create(
            serial_number_claimed=serialNumber,
            rejection_reason=DeviceRejectionLog.RejectionReason.NO_COMPANY,
            source='getEtmSetupDetails',
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response({"message": "Device has no company assigned."}, status=status.HTTP_403_FORBIDDEN)

    # Gate 3: device must be active
    if not etm_object.is_active:
        DeviceRejectionLog.objects.create(
            serial_number_claimed=serialNumber,
            palmtec_id_claimed=etm_object.palmtec_id,
            company_id_claimed=etm_object.company.company_id,
            rejection_reason=DeviceRejectionLog.RejectionReason.DEVICE_INACTIVE,
            source='getEtmSetupDetails',
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response({"message": "Device is deactivated."}, status=status.HTTP_403_FORBIDDEN)
    
    # to collectively update the fields once the changes/ additions are noted
    updated_fields=[]

    # Mark setup as fetched (only on first time)
    if not etm_object.has_fetched_setup:
        etm_object.has_fetched_setup = True
        etm_object.setup_fetched_at  = timezone.now()
        # extend takes iterable, it should be passed inside extend() 
        updated_fields.extend(['has_fetched_setup', 'setup_fetched_at'])

    if updated_fields:
        etm_object.save(update_fields=updated_fields)

    company_obj  = etm_object.company
    customerCode = company_obj.company_id
    try:
        customerCode = int(customerCode)
    except (ValueError, TypeError):
        pass

    licenseUrl = os.environ.get('LICENSE_SERVER_BASE_URL') or 'http://202.88.237.210:8093/LicenceMgmt/public/api'
    version    = os.environ.get('ETM_VERSION')

    data = {
        "upiDeviceSerialNumber": serialNumber,
        "uniqueIdentifier":      str(uniqueIdentifier),
        "customerCode":          customerCode,
        "customerName":          company_obj.contact_person or company_obj.company_name,
        "cLicenseURL":           licenseUrl,
        "versionDetails":        version,
        "devicetype":            etm_object.DeviceType.ETM,
        "company":               company_obj.company_name,
        "date":                  timezone.now().strftime("%d-%m-%Y %H:%M:%S"),
    }

    return Response({"status": "success", "statusCode": status.HTTP_200_OK, "message": "Device Details Fetch Succesfully!", "data": data})




# ---- send etm version to apk ----
@api_view(["GET"])
@permission_classes([AllowAny])
def get_etm_device_version_for_apk(request):
    return HttpResponse("PVT_GEN_12", content_type="text/plain")


# ---- list allocated devices for web download page picker ----
@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_company_devices_for_download(request):
    """
    GET /get_company_devices
    Returns allocated devices for the logged-in company admin.
    Used by the web Device Download page to populate the device selector.
    """
    user = request.user
    company = getattr(user, 'company', None)
    if not company:
        return Response({'error': 'No company associated with this account.'}, status=status.HTTP_400_BAD_REQUEST)

    devices = ETMDevice.objects.filter(
        company=company,
        allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
        is_active=True,
    ).order_by('palmtec_id')

    data = [
        {
            'id': d.id,
            'serial_number': d.serial_number,
            'palmtec_id': d.palmtec_id,
        }
        for d in devices
    ]
    return Response({'message': 'success', 'data': data}, status=status.HTTP_200_OK)