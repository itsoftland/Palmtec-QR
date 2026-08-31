from django.contrib import admin
from django.urls import path, include


urlpatterns = [
    # Web dashboard (React)
    path('ticket-app/', include('TicketAppB.urls')),

    # APK / mobile clients — only APK-relevant endpoints exposed here
    path('api/v1/', include('TicketAppB.apk_urls')),

    # apk FCM
    path('api-fcm/', include('FCM.urls')),
]
