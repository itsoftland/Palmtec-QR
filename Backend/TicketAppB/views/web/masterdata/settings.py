import logging
from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....models import Currency, Settings, ETMDevice, SettingsProfile
from ....serializers.masterdata import CurrencySerializer, SettingsSerializer, SettingsProfileSerializer
from ...utils import _get_authenticated_company_admin, _get_object_or_404


logger = logging.getLogger(__name__)


# ── Currency ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_currencies(request):
    user, company = _get_authenticated_company_admin(request)

    currencies = Currency.objects.filter(company=company).order_by('id')
    serializer = CurrencySerializer(currencies, many=True)
    return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_currency(request):
    user, company = _get_authenticated_company_admin(request)

    serializer = CurrencySerializer(data=request.data)
    if serializer.is_valid():
        try:
            serializer.save(company=company, created_by=user)
        except IntegrityError:
            return Response(
                {'message': 'This currency already exists for your company.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'message': 'Currency created successfully', 'data': serializer.data}, status=status.HTTP_201_CREATED)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_currency(request, pk):
    user, company = _get_authenticated_company_admin(request)

    obj, err = _get_object_or_404(Currency, pk, company)
    if err:
        return err

    serializer = CurrencySerializer(obj, data=request.data, partial=True)
    if serializer.is_valid():
        try:
            serializer.save(updated_by=user)
        except IntegrityError:
            return Response(
                {'message': 'This currency already exists for your company.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'message': 'Currency updated successfully', 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Settings ──────────────────────────────────────────────────────────────────

@api_view(['GET', 'PUT'])
def get_settings(request):
    user, company = _get_authenticated_company_admin(request)

    if request.method == 'GET':
        try:
            settings_obj = Settings.objects.get(company=company)
            serializer = SettingsSerializer(settings_obj)
            return Response({'message': 'Success', 'data': serializer.data}, status=status.HTTP_200_OK)
        except Settings.DoesNotExist:
            return Response({'message': 'No settings found', 'data': None}, status=status.HTTP_200_OK)

    settings_obj, created = Settings.objects.get_or_create(
        company=company,
        defaults={'created_by': user}
    )
    serializer = SettingsSerializer(settings_obj, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save(updated_by=user)
        msg = 'Settings created successfully' if created else 'Settings updated successfully'
        return Response({'message': msg, 'data': serializer.data}, status=status.HTTP_200_OK)

    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


# ── Company Devices (read-only picker) ───────────────────────────────────────

@api_view(['GET'])
def list_company_devices(request):
    """GET /masterdata/device-settings/devices — device picker list."""
    user, company = _get_authenticated_company_admin(request)

    devices = ETMDevice.objects.filter(
        company=company,
        allocation_status='Allocated',
    ).order_by('id')
    data = [
        {'id': d.id, 'serial_number': d.serial_number, 'device_type': d.device_type}
        for d in devices
    ]
    return Response({'message': 'Success', 'data': data}, status=status.HTTP_200_OK)


# ── Settings Profiles ──────────────────────────────────────────────────────────

@api_view(['GET'])
def list_profiles(request):
    user, company = _get_authenticated_company_admin(request)
    profiles = SettingsProfile.objects.filter(company=company).order_by('name')
    return Response({'message': 'Success', 'data': SettingsProfileSerializer(profiles, many=True).data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_profile(request):
    user, company = _get_authenticated_company_admin(request)
    serializer = SettingsProfileSerializer(data=request.data, context={'company': company})
    if serializer.is_valid():
        try:
            serializer.save(company=company, created_by=user)
        except IntegrityError:
            return Response(
                {'message': 'This device already has a settings profile.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'message': 'Profile created', 'data': serializer.data}, status=status.HTTP_201_CREATED)
    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
def profile_detail(request, profile_id):
    user, company = _get_authenticated_company_admin(request)
    try:
        profile = SettingsProfile.objects.get(id=profile_id, company=company)
    except SettingsProfile.DoesNotExist:
        return Response({'message': 'Profile not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response({'message': 'Success', 'data': SettingsProfileSerializer(profile).data}, status=status.HTTP_200_OK)

    if request.method == 'DELETE':
        profile.delete()
        return Response({'message': 'Profile deleted.'}, status=status.HTTP_200_OK)

    serializer = SettingsProfileSerializer(profile, data=request.data, partial=True, context={'company': company})
    if serializer.is_valid():
        try:
            serializer.save(updated_by=user)
        except IntegrityError:
            return Response(
                {'message': 'This device already has a settings profile.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'message': 'Profile updated', 'data': serializer.data}, status=status.HTTP_200_OK)
    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


