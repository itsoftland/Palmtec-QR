# from django.db.models.signals import post_save
# from django.dispatch import receiver

# from TicketAppB.models.payments import AggregatorTransaction
# from TicketAppB.models.company import Depot
# from .firebase import send_push_notification
# from TicketAppB.models.auth import UserSession


# @receiver(
#     post_save,
#     sender=Depot
# )
# def depot_created(
#     sender,
#     instance,
#     created,
#     **kwargs
# ):

#     if not created:
#         return
#     print("-------------------------------------")
#     print(
#         f"New depot created: {instance}"
#     )
#     pr


# # @receiver(
# #     post_save,
# #     sender=AggregatorTransaction
# # )
# # def aggregator_transaction_created(
# #     sender,
# #     instance,
# #     created,
# #     **kwargs
# # ):

# #     if not created:
# #         return

# #     session = UserSession.objects.filter(
# #         user=instance.user,
# #         fcm_token__isnull=False,
# #         is_active=True
# #     ).exclude(
# #         fcm_token=""
# #     ).first()

# #     if not session:
# #         return

# #     try:
# #         send_push_notification(
# #             token=session.fcm_token,
# #             title="New Transaction",
# #             body="A new aggregator transaction has been created.",
# #             data={
# #                 "type": "aggregator_transaction",
# #             }
# #         )

# #     except Exception as e:
# #         print(
# #             f"Failed to send FCM notification: {e}"
# #         )