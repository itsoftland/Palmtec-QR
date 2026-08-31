from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ....models import ExpenseMaster, InspectorDetails, Expense
from ....serializers.masterdata import ExpenseMasterSerializer, InspectorDetailsSerializer, ExpenseSerializer
from ...utils import _get_authenticated_company_admin, _get_object_or_404


# ── Expense Master ─────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_expense_masters(request):
    user, company = _get_authenticated_company_admin(request)
    qs = ExpenseMaster.objects.filter(company=company).order_by('expense_code')
    return Response({'message': 'Success', 'data': ExpenseMasterSerializer(qs, many=True).data})


@api_view(['POST'])
def create_expense_master(request):
    user, company = _get_authenticated_company_admin(request)
    serializer = ExpenseMasterSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(company=company, created_by=user)
        return Response(
            {'message': 'Expense category created.', 'data': serializer.data},
            status=status.HTTP_201_CREATED,
        )
    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT'])
def update_expense_master(request, pk):
    user, company = _get_authenticated_company_admin(request)
    obj, err = _get_object_or_404(ExpenseMaster, pk, company)
    if err:
        return err
    serializer = ExpenseMasterSerializer(obj, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save(updated_by=user)
        return Response({'message': 'Expense category updated.', 'data': serializer.data})
    return Response({'message': 'Validation failed', 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
def delete_expense_master(request, pk):
    user, company = _get_authenticated_company_admin(request)
    obj, err = _get_object_or_404(ExpenseMaster, pk, company)
    if err:
        return err
    obj.delete()
    return Response({'message': 'Expense category deleted.'}, status=status.HTTP_200_OK)


# ── Inspector Details ──────────────────────────────────────────────────────────

@api_view(['GET'])
def get_inspector_details(request):
    user, company = _get_authenticated_company_admin(request)

    from_date = request.query_params.get('from_date')
    to_date   = request.query_params.get('to_date')

    if not from_date or not to_date:
        return Response(
            {'error': 'from_date and to_date are required (YYYY-MM-DD).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    qs = (
        InspectorDetails.objects
        .filter(company=company, date__gte=from_date, date__lte=to_date)
        .select_related('inspector')
        .order_by('-date', '-time')
    )
    return Response({'message': 'Success', 'data': InspectorDetailsSerializer(qs, many=True).data})


# ── Expense Data ───────────────────────────────────────────────────────────────

@api_view(['GET'])
def get_expenses(request):
    user, company = _get_authenticated_company_admin(request)

    from_date = request.query_params.get('from_date')
    to_date   = request.query_params.get('to_date')

    if not from_date or not to_date:
        return Response(
            {'error': 'from_date and to_date are required (YYYY-MM-DD).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    qs = (
        Expense.objects
        .filter(company=company, date__gte=from_date, date__lte=to_date)
        .select_related('driver')
        .order_by('-date', '-time')
    )
    return Response({'message': 'Success', 'data': ExpenseSerializer(qs, many=True).data})
