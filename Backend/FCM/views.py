from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from TicketAppB.models.auth import UserSession

# Create your views here.
# getting FCM Token from apk
class FCMTokenView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):

        fcm_token = request.data.get('fcm_token')

        if not fcm_token:
            return Response(
                {
                    "error": "fcm_token is required"
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user

        active_session = UserSession.objects.filter(
            user=user,
            is_active=True,
            # device_type="android"
        ).first()


        if not active_session:
            return Response(
                {
                    "error": "UserSession not found"
                },
                status=status.HTTP_404_NOT_FOUND
            )

        active_session.fcm_token = fcm_token
        active_session.save(update_fields=['fcm_token'])


        return Response(
            {
                "message": "FCM token saved successfully"
            },
            status=status.HTTP_200_OK
        )