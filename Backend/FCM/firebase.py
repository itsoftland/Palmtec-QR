import firebase_admin
from firebase_admin import credentials, messaging
from django.conf import settings


def initialize_firebase():
    """
    Initialize Firebase Admin SDK only once.
    """
    if not firebase_admin._apps:
        cred = credentials.Certificate(
            settings.FCM_CREDENTIALS_PATH
        )

        firebase_admin.initialize_app(cred)


def send_push_notification(
    token,
    title,
    body,
    data=None,
):
    # Make sure Firebase is initialized before sending
    initialize_firebase()

    message = messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        token=token,
        data=data or {},
    )

    return messaging.send(message)