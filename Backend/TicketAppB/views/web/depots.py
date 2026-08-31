import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from ...models import Depot,RouteDepot
from ...serializers.company import DepotSerializer
from ...permissions import LicensePermission


logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([IsAuthenticated, LicensePermission])
def get_all_depots(request):
    user = request.user

    company_instance = user.company
    if not company_instance:
        return Response({"message": "No company mapped to user."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        depots = Depot.objects.filter(company=company_instance).order_by('id')
    except Exception as e:
        logger.error(f"Error fetching depots: {str(e)}")
        return Response({"message": "Error fetching depots"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    serializer = DepotSerializer(depots, many=True)
    return Response({"message": "Depots fetched successfully", "data": serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated, LicensePermission])
def create_depot(request):
    user = request.user

    if not request.data:
        return Response({"message": "No input received"}, status=status.HTTP_400_BAD_REQUEST)

    serializer = DepotSerializer(data=request.data)
    if serializer.is_valid():
        company_instance = user.company
        if not company_instance:
            return Response({"message": "No company to map depot to (User has no mapped company)."}, status=status.HTTP_400_BAD_REQUEST)
        depot = serializer.save(company=company_instance, created_by=user)
        logger.info(f"Created new depot: {depot.depot_name} (ID: {depot.id})")
        return Response({"message": "Depot created successfully", "data": serializer.data}, status=status.HTTP_201_CREATED)

    logger.warning(f"Depot creation failed: {serializer.errors}")
    return Response({"message": "Validation failed", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
@permission_classes([IsAuthenticated, LicensePermission])
def update_depot_details(request, pk):
    user = request.user

    try:
        depot = Depot.objects.get(pk=pk,company=user.company)
    except Depot.DoesNotExist:
        logger.error(f"No Depot found with ID under the user's company: {pk}")
        return Response({"message": "Depot not found"}, status=status.HTTP_404_NOT_FOUND)

    serializer = DepotSerializer(depot, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        logger.info(f"Updated depot: {depot.depot_name} (ID: {pk})")
        return Response({"message": "Depot updated successfully", "data": serializer.data}, status=status.HTTP_200_OK)

    logger.warning(f"Depot update failed for ID {pk}: {serializer.errors}")
    return Response({"message": "Validation failed", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)



@api_view(['DELETE'])
@permission_classes([IsAuthenticated, LicensePermission])
def delete_depot(request,pk):
    user = request.user

    try:
        depot = Depot.objects.get(pk=pk,company=user.company)
    except Depot.DoesNotExist:
        logger.error(f"No Depot found with ID under the user's company: {pk}")
        return Response({"message": "Depot not found"}, status=status.HTTP_404_NOT_FOUND)

    mapped_routes=RouteDepot.objects.filter(depot=depot).select_related('route')
    if mapped_routes:
        get_route_names=[{"id":rd.route.id,"route_code":rd.route.route_code} for rd in mapped_routes]
        return Response({"message": "Depot is actively mapped to a route. Either update the mapping or skip deletion.","routes":get_route_names}, status=status.HTTP_409_CONFLICT)
    else:
        depot.delete()
        return Response({"message": "Depot successfully deleted"}, status=status.HTTP_200_OK)