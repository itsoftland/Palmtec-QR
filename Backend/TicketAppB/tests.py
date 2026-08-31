"""
Tests for get_etm_initial_data view.

Run with: python manage.py test yourapp.tests.GetEtmInitialDataTests
"""

from unittest.mock import patch
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from .models import ETMDevice, DeviceRejectionLog, Company


class GetEtmInitialDataTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("get_etm_initial_data")  # adjust to your actual url name

        # A real company to attach to devices
        self.company = Company.objects.create(
            company_id="1001",
            company_name="Test Corp",
            contact_person="John",
        )

        # A fully valid, happy-path device — tests that need a broken device
        # will override specific fields
        self.device = ETMDevice.objects.create(
            serial_number="SN-001",
            allocation_status=ETMDevice.AllocationStatus.ALLOCATED,
            company=self.company,
            is_active=True,
            has_fetched_setup=False,
            aggregator_tid=None,
        )

    # ─── Gate 0: missing serial number ───────────────────────────────────────

    def test_missing_serial_number_returns_400(self):
        response = self.client.get(self.url)  # no serialnumber param
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["message"], "Serial number is required")

    # ─── Gate 0: serial number not in database ────────────────────────────────

    def test_unknown_serial_number_returns_404(self):
        response = self.client.get(self.url, {"serialnumber": "DOES-NOT-EXIST"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["message"], "Serial number is unmapped")

    # ─── Gate 1: device not allocated ────────────────────────────────────────

    def test_unallocated_device_returns_403_and_logs_rejection(self):
        self.device.allocation_status = ETMDevice.AllocationStatus.UNALLOCATED
        self.device.save()

        response = self.client.get(self.url, {"serialnumber": "SN-001"})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["message"], "Device is not allocated to any company.")

        # A rejection log should have been created
        log = DeviceRejectionLog.objects.get(serial_number_claimed="SN-001")
        self.assertEqual(log.rejection_reason, DeviceRejectionLog.RejectionReason.NOT_ALLOCATED)

    # ─── Gate 2: device has no company ───────────────────────────────────────

    def test_device_with_no_company_returns_403_and_logs_rejection(self):
        self.device.company = None
        self.device.save()

        response = self.client.get(self.url, {"serialnumber": "SN-001"})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["message"], "Device has no company assigned.")

        log = DeviceRejectionLog.objects.get(serial_number_claimed="SN-001")
        self.assertEqual(log.rejection_reason, DeviceRejectionLog.RejectionReason.NO_COMPANY)

    # ─── Gate 3: device inactive ──────────────────────────────────────────────

    def test_inactive_device_returns_403_and_logs_rejection(self):
        self.device.is_active = False
        self.device.save()

        response = self.client.get(self.url, {"serialnumber": "SN-001"})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["message"], "Device is deactivated.")

        log = DeviceRejectionLog.objects.get(serial_number_claimed="SN-001")
        self.assertEqual(log.rejection_reason, DeviceRejectionLog.RejectionReason.DEVICE_INACTIVE)

    # ─── Happy path: first time fetch ─────────────────────────────────────────

    def test_valid_device_returns_200_with_expected_fields(self):
        response = self.client.get(self.url, {"serialnumber": "SN-001"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "success")

        # Check all expected keys are present in data
        data = response.data["data"]
        expected_keys = [
            "upiDeviceSerialNumber",
            "uniqueIdentifier",
            "customerCode",
            "customerName",
            "cLicenseURL",
            "versionDetails",
            "devicetype",
            "company",
            "date",
        ]
        for key in expected_keys:
            self.assertIn(key, data, msg=f"Missing key: {key}")

    def test_first_fetch_marks_has_fetched_setup(self):
        # Device hasn't been fetched yet
        self.assertFalse(self.device.has_fetched_setup)

        self.client.get(self.url, {"serialnumber": "SN-001"})

        self.device.refresh_from_db()
        self.assertTrue(self.device.has_fetched_setup)
        self.assertIsNotNone(self.device.setup_fetched_at)

    def test_second_fetch_does_not_overwrite_setup_fetched_at(self):
        # Simulate device that already fetched setup
        from django.utils import timezone
        original_time = timezone.now()
        self.device.has_fetched_setup = True
        self.device.setup_fetched_at = original_time
        self.device.save()

        self.client.get(self.url, {"serialnumber": "SN-001"})

        self.device.refresh_from_db()
        self.assertEqual(self.device.setup_fetched_at, original_time)  # unchanged

    # ─── aggregator_tid behaviour ───────────────────────────────────────────────

    def test_aggregator_tid_is_saved_when_passed_and_not_already_set(self):
        self.client.get(self.url, {"serialnumber": "SN-001", "aggregator_tid": "TID-999"})

        self.device.refresh_from_db()
        self.assertEqual(self.device.aggregator_tid, "TID-999")

    def test_aggregator_tid_is_not_overwritten_if_already_set(self):
        self.device.aggregator_tid = "EXISTING-TID"
        self.device.save()

        self.client.get(self.url, {"serialnumber": "SN-001", "aggregator_tid": "NEW-TID"})

        self.device.refresh_from_db()
        self.assertEqual(self.device.aggregator_tid, "EXISTING-TID")  # unchanged

    # ─── Response data values ─────────────────────────────────────────────────

    def test_customer_code_is_integer_when_company_id_is_numeric(self):
        # company_id "1001" should become int 1001, not string "1001"
        response = self.client.get(self.url, {"serialnumber": "SN-001"})
        customer_code = response.data["data"]["customerCode"]
        self.assertIsInstance(customer_code, int)

    def test_serial_number_in_response_matches_request(self):
        response = self.client.get(self.url, {"serialnumber": "SN-001"})
        self.assertEqual(response.data["data"]["upiDeviceSerialNumber"], "SN-001")

    @patch.dict("os.environ", {"LICENSE_SERVER_BASE_URL": "http://my-license-server.com"})
    def test_license_url_uses_env_variable_when_set(self):
        response = self.client.get(self.url, {"serialnumber": "SN-001"})
        self.assertEqual(response.data["data"]["cLicenseURL"], "http://my-license-server.com")