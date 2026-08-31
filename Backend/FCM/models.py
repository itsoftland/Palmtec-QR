from django.conf import settings
from django.db import models


class FCMLog(models.Model):

    STATUS_CHOICES = (
        ("success", "Success"),
        ("failed", "Failed"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fcm_logs",
    )
    token = models.CharField(max_length=255)
    title = models.CharField(max_length=255)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    error = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} - {self.status} - {self.created_at}"
