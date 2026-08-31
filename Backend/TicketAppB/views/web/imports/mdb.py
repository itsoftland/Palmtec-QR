"""
mdb_views.py — MDB import service

Import uses non-DUP MDB tables only.

Response is streamed as Server-Sent Events (SSE) so the UI gets live per-table
progress via axios onDownloadProgress:
  data: {"type": "table_done", "table": "BusType", "imported": 5, "existing": 3, "skipped": 0, "errors": []}
  data: {"type": "done", "total_imported": 50, "total_existing": 20, "total_skipped": 2, "errors": [...], "read_errors": {}}
  data: {"type": "error", "message": "..."}   ← fatal errors only
"""

import os
import sys
import json
import subprocess
import csv
import io

from django.conf import settings as django_settings
from django.db import transaction
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from ....models.master_data import (
    BusType, EmployeeType, Employee, Currency,
    Stage, Route, RouteStage, Fare, RouteBusType,
    VehicleType, Settings
)
from ....models.operations import ExpenseMaster, Expense, CrewAssignment, InspectorDetails
from ....models.company import Company
from ...utils import _is_superadmin


# ================================================================
# CUSTOM EXCEPTIONS
# ================================================================

class MdbPasswordError(Exception):
    pass

class MdbReadError(Exception):
    pass


# ================================================================
# VIEW — receives file, validates, delegates to service
# ================================================================

class MdbImportView(APIView):
    """
    POST /import-mdb/
    multipart/form-data:
        mdb_file    — .mdb file
        company_id  — which company to link all records to
        password    — (optional) mdb file password

    Returns text/event-stream (SSE). Each completed table yields one event.
    Final event has type "done". Fatal errors yield type "error".

    Pre-stream validation failures (missing file, bad company) still return
    normal JSON 4xx so the frontend can check response status before reading.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        user = self.request.user
        if not _is_superadmin(user):
            return Response({'message': 'Superadmin only.'}, status=status.HTTP_403_FORBIDDEN)

        mdb_file   = request.FILES.get('mdb_file')
        company_id = request.data.get('company_id')
        password   = request.data.get('password', None) or None

        if not mdb_file:
            return Response({'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not company_id:
            return Response({'message': 'company_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not mdb_file.name.lower().endswith('.mdb'):
            return Response({'message': 'Only .mdb files are accepted.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            return Response({'message': 'Company not found.'}, status=status.HTTP_400_BAD_REQUEST)

        # Save to permanent backup before streaming — chunked reads can't happen inside a generator.
        # Path: uploads/{company_code}/mdb/{YYYY-MM-DD}/{HH-MM-SS}.mdb
        tmp_path = None
        try:
            now        = timezone.now()
            backup_dir = os.path.join(
                django_settings.MEDIA_ROOT, company.company_id, 'mdb', now.strftime('%Y-%m-%d')
            )
            os.makedirs(backup_dir, exist_ok=True)
            tmp_path = os.path.join(backup_dir, f"{now.strftime('%H-%M-%S')}.mdb")
            with open(tmp_path, 'wb') as f:
                for chunk in mdb_file.chunks():
                    f.write(chunk)
        except Exception as e:
            return Response({'message': f'Failed to save upload: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        def sse_stream():
            try:
                for event in MdbImportService.run_stream(tmp_path, company, user, password):
                    yield f"data: {json.dumps(event)}\n\n"
            except MdbPasswordError:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Could not open file. Password incorrect or unsupported encryption.'})}\n\n"
            except MdbReadError as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to read MDB: {str(e)}'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Unexpected error: {str(e)}'})}\n\n"
            # NOTE: tmp_path is intentionally NOT deleted here.
            # The file was saved as a permanent backup at the start of the request.
            # Path: MEDIA_ROOT/<company_code>/mdb/<YYYY-MM-DD>/<HH-MM-SS>.mdb

        response = StreamingHttpResponse(sse_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'  # prevent nginx from buffering the stream
        return response


# ================================================================
# SERVICE — orchestrates all table processing
# ================================================================

class MdbImportService:

    @staticmethod
    def run_stream(mdb_path, company, user, password=None):
        """
        Generator — yields one SSE event dict per completed table, then a final
        'done' event. The view wraps each dict in "data: <json>\\n\\n".

        Processor return signature: (imported, existing, skipped, errors)
          imported — rows newly written to the DB
          existing — rows already present (get_or_create found a match, no write)
          skipped  — rows that failed validation or FK lookup
          errors   — human-readable skip reasons

        Each table runs in its own atomic block. If a table crashes, only that
        table rolls back — all previously committed tables stay saved.
        Re-importing the same file is safe: get_or_create prevents duplicates
        and the existing counter shows what was already there.
        """
        from django.db import connection

        lock_name = f"mdb_import_{company.id}"
        with connection.cursor() as cursor:
            cursor.execute("SELECT GET_LOCK(%s, 0)", [lock_name])
            row = cursor.fetchone()
            lock_acquired = bool(row and row[0] == 1)

        if not lock_acquired:
            yield {
                'type': 'error',
                'message': 'Another import is already in progress for this company. Please wait and try again.',
            }
            return

        try:
            yield from MdbImportService._run_stream_inner(mdb_path, company, user, password)
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT RELEASE_LOCK(%s)", [lock_name])

    @staticmethod
    def _run_stream_inner(mdb_path, company, user, password=None):
        raw_tables, read_errors = MdbReader.read_all_tables(mdb_path, password)
        bus_type_source_map = MdbImportService._build_bus_type_source_map(raw_tables.get('bustype', []))

        total_imported = 0
        total_existing = 0
        total_skipped  = 0
        all_errors     = []

        # Each tuple: (display_name, raw_table_key, processor_function)
        # ORDER MATTERS — each table may depend on previously imported ones
        processors = [
            # ---- PASS 1: No dependencies ----
            ('BusType',          'bustype',       MdbImportService._process_bus_types),
            ('EmployeeType',     'EMPLOYEETYPE',  MdbImportService._process_employee_types),
            ('Currency',         'CURRENCY',      MdbImportService._process_currency),
            ('Stage',            'STAGE',         MdbImportService._process_stages),

            # ---- PASS 2: Depend on Pass 1 ----
            ('Employee',         'CREW',          MdbImportService._process_employees),
            ('Route',            'ROUTE',         MdbImportService._process_routes),

            # ---- PASS 3: Depend on Pass 2 ----
            # RouteStage re-reads STAGE rows to build route-stage links
            ('RouteStage',       'STAGE',         MdbImportService._process_route_stages),
            # RouteBusType derived from ROUTE table + bustype id map
            ('RouteBusType',     'ROUTE',         MdbImportService._process_route_bus_types),
            # Fare matrix — needs Route + Stage both existing
            ('Fare',             'FARE',          MdbImportService._process_fares),
            # VehicleType needs BusType
            ('VehicleType',      'VEHICLETYPE',   MdbImportService._process_vehicles),
            # Settings — one row per company from SETTINGS table
            ('Settings',         'SETTINGS',      MdbImportService._process_settings),

            # ---- PASS 4: Depend on Pass 2/3 ----
            ('ExpenseMaster',    'EXPMASTER',     MdbImportService._process_expense_masters),
            ('Expense',          'EXPENSE',       MdbImportService._process_expenses),
            ('CrewAssignment',   'CREWDET',       MdbImportService._process_crew_assignments),
            ('InspectorDetails', 'INSPECTORDET',  MdbImportService._process_inspector_details),
        ]

        total_replaced = 0

        for table_name, raw_key, processor_fn in processors:
            rows = raw_tables.get(raw_key, [])

            # Rebuild lookups AFTER each table so newly saved rows are findable
            # e.g. BusType rows saved above are now in lookups when Route runs
            lookups = MdbImportService._build_lookups(company, bus_type_source_map)

            try:
                # Each table gets its OWN atomic block (savepoint).
                # If THIS table fails, only THIS table rolls back.
                with transaction.atomic():
                    result = processor_fn(rows, company, user, lookups)
                    if len(result) == 5:
                        imported, existing, skipped, errors, replaced = result
                    else:
                        imported, existing, skipped, errors = result
                        replaced = 0
            except Exception as e:
                # Entire table processor crashed — mark all rows skipped and continue
                imported = 0
                existing = 0
                skipped  = len(rows)
                replaced = 0
                errors   = [f"Table {table_name} failed entirely: {str(e)}"]

            all_errors.extend(errors)
            total_imported += imported
            total_existing += existing
            total_skipped  += skipped
            total_replaced += replaced

            # Yield one event per table as it completes — frontend gets live updates
            yield {
                'type':     'table_done',
                'table':    table_name,
                'imported': imported,
                'existing': existing,
                'skipped':  skipped,
                'replaced': replaced,
                'errors':   errors,
            }

        # ── Audit log — written before the final yield so it's always recorded
        # even if the SSE connection drops after the last event.
        try:
            from ....models.audit import AuditLog
            from ..audit_logs import log_action
            log_action(
                actor          = user,
                action         = AuditLog.ActionType.MDB_IMPORT,
                target_model   = 'Company',
                target_id      = company.id,
                target_display = company.company_name,
                details        = {
                    'total_imported': total_imported,
                    'total_existing': total_existing,
                    'total_skipped':  total_skipped,
                    'error_count':    len(all_errors),
                },
            )
        except Exception:
            pass  # audit failure must never break the import stream

        # Final summary event — frontend transitions to results view on this
        yield {
            'type':            'done',
            'total_imported':  total_imported,
            'total_existing':  total_existing,
            'total_skipped':   total_skipped,
            'total_replaced':  total_replaced,
            'errors':          all_errors,
            'read_errors':     read_errors,
        }


    # ================================================================
    # LOOKUP BUILDER
    # Loads all existing DB objects into dicts for O(1) access per row.
    # Called after each table so new inserts are immediately available.
    # ================================================================

    @staticmethod
    def _build_lookups(company, bus_type_source_map=None):
        return {
            # BusType: keyed by name lowercase
            # Used by: Route, VehicleType, RouteBusType
            'bus_types': {
                bt.name.strip().lower(): bt
                for bt in BusType.objects.filter(company=company)
            },

            # EmployeeType: keyed by normalized code string ("1.0" → "1")
            # Used by: Employee
            'emp_types_by_code': {
                str(et.emp_type_code).strip(): et
                for et in EmployeeType.objects.filter(company=company)
            },

            # Employee: keyed by name lowercase
            # Used by: Expense, CrewAssignment, InspectorDetails
            'employees_by_name': {
                e.employee_name.strip().lower(): e
                for e in Employee.objects.filter(company=company, is_deleted=False)
            },

            # Employee: keyed by employee_code string
            # Used by: InspectorDetails (MDB stores InspectorID as code)
            'employees_by_code': {
                str(e.employee_code).strip(): e
                for e in Employee.objects.filter(company=company, is_deleted=False)
            },

            # Stage: keyed by stage_code string
            # Used by: RouteStage, Fare
            'stages_by_code': {
                str(s.stage_code).strip(): s
                for s in Stage.objects.filter(company=company, is_deleted=False)
            },

            # Stage: keyed by stage_name lowercase
            # Used as fallback if code lookup fails
            'stages_by_name': {
                s.stage_name.strip().lower(): s
                for s in Stage.objects.filter(company=company, is_deleted=False)
            },

            # Route: keyed by route_code string
            # Used by: RouteStage, RouteBusType, Fare
            'routes_by_code': {
                r.route_code.strip(): r
                for r in Route.objects.filter(company=company)
            },

            # VehicleType: keyed by bus_reg_num lowercase
            # Used by: CrewAssignment
            'vehicles': {
                v.bus_reg_num.strip().lower(): v
                for v in VehicleType.objects.filter(company=company, is_deleted=False)
            },

            # ExpenseMaster: keyed by expense_code string
            # Used by: Expense (optional cross-reference)
            'expense_masters': {
                str(em.expense_code).strip(): em
                for em in ExpenseMaster.objects.filter(company=company)
            },

            # MDB bustype source ID ("1") -> bustype name lowercase ("ordinary")
            'bus_type_source_map': bus_type_source_map or {},
        }

    @staticmethod
    def _build_bus_type_source_map(rows):
        """
        MDB bustype rows:
          id, name, comments
        Build:
          { normalized_id: lowercase_name }
        """
        mapping = {}
        for row in rows:
            source_id = MdbImportService._normalize_id(row.get('id'))
            bt_name = str(row.get('name', '') or '').strip().lower()
            if source_id and bt_name:
                mapping[source_id] = bt_name
        return mapping


    # ================================================================
    # HELPER FUNCTIONS — used across multiple processors
    # ================================================================

    @staticmethod
    def _to_bool(val):
        """Convert MDB integer flag (0/1 or "0"/"1" or "0.0") to Python bool"""
        if isinstance(val, bool):
            return val
        try:
            return bool(int(float(str(val or 0))))
        except (ValueError, TypeError):
            return False

    @staticmethod
    def _to_float(val, default=0.0):
        """Safely convert any MDB value to float"""
        try:
            return float(str(val or default))
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _to_int(val, default=0):
        """Safely convert any MDB value to int (handles "1.0" → 1)"""
        try:
            return int(float(str(val or default)))
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _normalize_id(val):
        """Normalize MDB integer IDs exported as floats: "1.0" → "1" """
        try:
            return str(int(float(str(val).strip())))
        except (ValueError, TypeError):
            return str(val or '').strip()

    @staticmethod
    def _sanitize_settings_text(val, max_len=None):
        """
        Restrict SETTINGS text fields (passwords, display/header/footer lines)
        to letters, digits, space, and common punctuation. MDB free-text
        fields can carry stray symbols/control bytes that break ETM device
        display rendering — strip anything outside the allowed set instead
        of rejecting the whole row.
        """
        import re
        raw = str(val or '').strip()
        if not raw:
            return None
        cleaned = re.sub(r"[^A-Za-z0-9 .,\-_@#&()':;!/]", '', raw).strip()
        if not cleaned:
            return None
        return cleaned[:max_len] if max_len else cleaned

    @staticmethod
    def _parse_date(val):
        """
        Safely parse a date value from MDB export.
        mdbtools (Linux) yields strings like "01/15/2024" or "2024-01-15".
        pyodbc (Windows) yields native datetime/date objects directly.
        Returns a date object or raises ValueError if unparseable.
        Non-nullable DateField — so we raise on empty, caller must handle.
        """
        from datetime import datetime, date
        if isinstance(val, datetime):
            return val.date()
        if isinstance(val, date):
            return val
        raw = str(val or "").strip()
        if not raw:
            raise ValueError("Empty date value")
        # Try common formats mdbtools uses
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
        raise ValueError(f"Cannot parse date: '{raw}'")

    @staticmethod
    def _parse_time(val):
        """
        Safely parse a time value from MDB export.
        mdbtools (Linux) yields strings like "08:30:00" or "08:30:00 AM".
        pyodbc (Windows) yields native datetime/time objects directly.
        Returns a time object or raises ValueError if unparseable.
        Non-nullable TimeField — so we raise on empty, caller must handle.
        """
        from datetime import datetime, time as time_type
        if isinstance(val, datetime):
            return val.time()
        if isinstance(val, time_type):
            return val
        raw = str(val or "").strip()
        if not raw:
            raise ValueError("Empty time value")
        for fmt in ("%H:%M:%S", "%I:%M:%S %p", "%H:%M"):
            try:
                return datetime.strptime(raw, fmt).time()
            except ValueError:
                continue
        raise ValueError(f"Cannot parse time: '{raw}'")


    # ================================================================
    # PASS 1 — No dependencies
    # ================================================================

    @staticmethod
    def _process_bus_types(rows, company, user, lookups):
        """
        MDB bustype: id, name, comments
        Django BusType: bustype_code, name, company
        Uses name as code since MDB has no separate code field.
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                name = str(row.get('name', '') or '').strip()
                if not name:
                    raise ValueError("Missing name")

                _, created = BusType.objects.get_or_create(
                    company=company,
                    bustype_code=name[:50],
                    defaults={'name': name, 'created_by': user}
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} bustype: {str(e)}")
        return imported, existing, skipped, errors


    @staticmethod
    def _process_employee_types(rows, company, user, lookups):
        """
        MDB EMPLOYEETYPE: EmployeeTypeId, TypeName
        Django EmployeeType: emp_type_code, emp_type_name, company

        EmployeeTypeId may export as "1.0" from mdbtools — normalize to "1".
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                raw_id    = str(row.get('EmployeeTypeId', '') or '').strip()
                type_name = str(row.get('TypeName', '') or '').strip()

                if not raw_id or not type_name:
                    raise ValueError(f"Missing EmployeeTypeId or TypeName — got '{raw_id}', '{type_name}'")

                type_code = MdbImportService._normalize_id(raw_id)

                _, created = EmployeeType.objects.get_or_create(
                    company=company,
                    emp_type_code=type_code,
                    defaults={'emp_type_name': type_name, 'created_by': user}
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} EMPLOYEETYPE: {str(e)}")
        return imported, existing, skipped, errors


    @staticmethod
    def _process_currency(rows, company, user, lookups):
        """
        MDB CURRENCY: CURRENCY, COUNTRY, RECORDID
        Django Currency: currency, country, company
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                currency_code = str(row.get('CURRENCY', '') or '').strip()
                country       = str(row.get('COUNTRY', '') or '').strip()

                if not currency_code:
                    raise ValueError("Missing CURRENCY code")

                _, created = Currency.objects.get_or_create(
                    company=company,
                    currency=currency_code[:3],
                    defaults={'country': country or '', 'created_by': user}
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} CURRENCY: {str(e)}")
        return imported, existing, skipped, errors


    @staticmethod
    def _process_stages(rows, company, user, lookups):
        """
        MDB STAGE: Number, StageName, Distance, route, id
        Django Stage: stage_code, stage_name, company

        Number is used as stage_code.
        Distance and route are stored in RouteStage (processed later).
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                raw_num    = str(row.get('Number', '') or '').strip()
                stage_name = str(row.get('StageName', '') or '').strip()

                if not stage_name:
                    raise ValueError("Missing StageName")
                if not raw_num:
                    raise ValueError("Missing Number")

                stage_code = MdbImportService._normalize_id(raw_num)

                _, created = Stage.objects.get_or_create(
                    company=company,
                    stage_code=stage_code,
                    defaults={'stage_name': stage_name, 'created_by': user}
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} STAGE: {str(e)}")
        return imported, existing, skipped, errors


    # ================================================================
    # PASS 2 — Depend on Pass 1
    # ================================================================

    @staticmethod
    def _process_employees(rows, company, user, lookups):
        """
        MDB CREW: EMPLOYEEID, EMPLOYEENAME, EMPLOYEETYPEID, PSWD
        Django Employee: employee_code, employee_name, emp_type (FK), password, company

        EMPLOYEETYPEID → looked up in emp_types_by_code
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                raw_emp_id  = str(row.get('EMPLOYEEID',    '') or '').strip()
                emp_name    = str(row.get('EMPLOYEENAME',  '') or '').strip()
                raw_type_id = str(row.get('EMPLOYEETYPEID','') or '').strip()
                password    = str(row.get('PSWD',          '') or '').strip()

                if not emp_name:
                    raise ValueError("Missing EMPLOYEENAME")
                if not raw_emp_id:
                    raise ValueError("Missing EMPLOYEEID")

                emp_code  = MdbImportService._normalize_id(raw_emp_id)
                type_code = MdbImportService._normalize_id(raw_type_id)

                emp_type = lookups['emp_types_by_code'].get(type_code)
                if not emp_type:
                    raise ValueError(
                        f"EmployeeType '{type_code}' not found. "
                        f"Available codes: {list(lookups['emp_types_by_code'].keys())}"
                    )

                _, created = Employee.objects.get_or_create(
                    company=company,
                    employee_code=emp_code,
                    defaults={
                        'employee_name': emp_name,
                        'emp_type':      emp_type,
                        'password':      password,
                        'created_by':    user,
                    }
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} CREW: {str(e)}")
        return imported, existing, skipped, errors


    @staticmethod
    def _process_routes(rows, company, user, lookups):
        """
        MDB ROUTE: rutcode, rutname, minfare, faretype, bustype(int),
                   Half, luggage, adjust, conc, ph, PASSALLOW
        Django Route: route_code, route_name, min_fare, fare_type,
                      bus_type(FK), half, luggage,
                      adjust, conc, ph, company

        Bus type is resolved through:
          ROUTE.bustype (source id) -> bustype.id/name map -> DB BusType.
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                route_code     = str(row.get('rutcode', '') or '').strip()
                route_name     = str(row.get('rutname', '') or '').strip()
                raw_bustype_id = row.get('bustype')

                if not route_code:
                    raise ValueError("Missing rutcode")

                source_bustype_id = MdbImportService._normalize_id(raw_bustype_id)
                bustype_name = lookups['bus_type_source_map'].get(source_bustype_id)
                if not bustype_name:
                    raise ValueError(
                        f"BusType source id '{source_bustype_id}' not found in bustype table map"
                    )

                bus_type_obj = lookups['bus_types'].get(bustype_name)
                if not bus_type_obj:
                    raise ValueError(
                        f"BusType '{bustype_name}' not found. "
                        f"Available: {list(lookups['bus_types'].keys())}"
                    )

                _, created = Route.objects.get_or_create(
                    company=company,
                    route_code=route_code,
                    defaults={
                        'route_name': route_name,
                        'min_fare':   MdbImportService._to_float(row.get('minfare')),
                        'fare_type':  MdbImportService._to_int(row.get('faretype')),
                        'bus_type':   bus_type_obj,
                        'half':       MdbImportService._to_bool(row.get('Half')),
                        'luggage':    MdbImportService._to_bool(row.get('luggage')),
                        'adjust':     MdbImportService._to_bool(row.get('adjust')),
                        'conc':       MdbImportService._to_bool(row.get('conc')),
                        'ph':         MdbImportService._to_bool(row.get('ph')),
                        'pass_allow': MdbImportService._to_bool(row.get('PASSALLOW')),
                        'start_from': MdbImportService._to_int(row.get('startfrom')),
                        'created_by': user,
                    }
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} ROUTE: {str(e)}")
        return imported, existing, skipped, errors


    # ================================================================
    # PASS 3 — Depend on Pass 2
    # ================================================================

    @staticmethod
    def _process_route_stages(rows, company, user, lookups):
        """
        Source: STAGE table (same rows as _process_stages, but now Route exists)
        MDB STAGE: Number(stage), StageName, Distance, route(route_code), id(sequence)

        Django RouteStage: route(FK), stage(FK), sequence_no, distance,
                           stage_local_lang, company

        STAGE.route  → route_code → looked up in routes_by_code
        STAGE.Number → stage_code → looked up in stages_by_code
        STAGE.id     → sequence_no
        STAGE.Distance → distance
        STG_LOCAL_LANGUAGE → stage_local_lang

        Bulk approach — 1 SELECT to load existing keys, 1 INSERT for new rows.
        """
        if not rows:
            return 0, 0, 0, []

        imported, existing, skipped, errors = 0, 0, 0, []

        # Load existing (route_id, stage_id) pairs once
        existing_keys = set(
            RouteStage.objects.filter(company=company)
            .values_list('route_id', 'stage_id')
        )

        to_create = []

        for i, row in enumerate(rows):
            try:
                raw_num      = str(row.get('Number',   '') or '').strip()
                route_code   = str(row.get('route',    '') or '').strip()
                raw_seq      = str(row.get('id',       '') or '').strip()
                raw_distance = row.get('Distance', 0)
                local_lang   = str(row.get('STG_LOCAL_LANGUAGE', '') or '').strip()

                if not route_code:
                    raise ValueError("Missing route code in STAGE row — cannot link to RouteStage")

                stage_code = MdbImportService._normalize_id(raw_num)
                seq_no     = MdbImportService._to_int(raw_seq)
                distance   = MdbImportService._to_float(raw_distance)

                stage = lookups['stages_by_code'].get(stage_code)
                if not stage:
                    raise ValueError(f"Stage code '{stage_code}' not found")

                route = lookups['routes_by_code'].get(route_code)
                if not route:
                    raise ValueError(f"Route '{route_code}' not found")

                key = (route.id, stage.id)
                if key in existing_keys:
                    existing += 1
                else:
                    to_create.append(RouteStage(
                        company=company,
                        route=route,
                        stage=stage,
                        sequence_no=seq_no,
                        distance=distance,
                        stage_local_lang=local_lang or None,
                        created_by=user,
                    ))

            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} RouteStage: {str(e)}")

        if to_create:
            RouteStage.objects.bulk_create(to_create, ignore_conflicts=True)
            imported = len(to_create)

        return imported, existing, skipped, errors


    @staticmethod
    def _process_route_bus_types(rows, company, user, lookups):
        """
        Source: ROUTE (same rows as _process_routes)
        Django RouteBusType: route(FK), bus_type(FK), company

        One RouteBusType entry per route using ROUTE.bustype source id.
        This records which bus types are allowed on each route.
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                route_code        = str(row.get('rutcode', '') or '').strip()
                raw_bustype_id    = row.get('bustype')
                source_bustype_id = MdbImportService._normalize_id(raw_bustype_id)
                bustype_name      = lookups['bus_type_source_map'].get(source_bustype_id)

                if not route_code or not bustype_name:
                    raise ValueError("Missing rutcode or unresolved bustype source id")

                route = lookups['routes_by_code'].get(route_code)
                if not route:
                    raise ValueError(f"Route '{route_code}' not found")

                bus_type = lookups['bus_types'].get(bustype_name)
                if not bus_type:
                    raise ValueError(f"BusType '{bustype_name}' not found")

                _, created = RouteBusType.objects.get_or_create(
                    company=company,
                    route=route,
                    bus_type=bus_type,
                    defaults={'created_by': user}
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} RouteBusType: {str(e)}")
        return imported, existing, skipped, errors


    @staticmethod
    def _process_fares(rows, company, user, lookups):
        """
        Full-refresh approach per route — avoids stale fare data on re-import.

        Steps:
          1. First pass: collect all valid fare objects and track which routes
             appear in this import batch.
          2. Delete ALL existing fares for those routes (clean slate).
          3. bulk_create the fresh fare records — 1 INSERT query total.

        This ensures re-importing an updated MDB always reflects the latest
        fare amounts rather than silently keeping stale values.
        """
        if not rows:
            return 0, 0, 0, []

        imported, existing, skipped, errors, replaced = 0, 0, 0, [], 0
        to_create = []
        routes_in_batch = set()   # route PKs whose fares we will fully replace

        for i, row in enumerate(rows):
            try:
                route_code = str(row.get('route', '') or '').strip()
                raw_row    = str(row.get('row',   '') or '').strip()
                raw_col    = str(row.get('col',   '') or '').strip()
                raw_number = str(row.get('Number','') or '').strip()
                fare_amt   = MdbImportService._to_int(row.get('fare'))

                if not route_code:
                    raise ValueError("Missing route code")

                route = lookups['routes_by_code'].get(route_code)
                if not route:
                    raise ValueError(f"Route '{route_code}' not found")

                row_val    = MdbImportService._to_int(raw_row)
                col_val    = MdbImportService._to_int(raw_col)
                number_val = MdbImportService._to_int(raw_number)

                routes_in_batch.add(route.id)
                to_create.append(Fare(
                    company=company,
                    route=route,
                    row=row_val,
                    col=col_val,
                    number=number_val,
                    fare_amount=fare_amt,
                    route_name=route.route_name,
                    created_by=user,
                ))

            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} FARE: {str(e)}")

        if to_create:
            # Delete existing fares only for routes present in this batch so
            # that routes not covered by the MDB are left untouched.
            replaced = Fare.objects.filter(
                company=company, route_id__in=routes_in_batch
            ).count()
            Fare.objects.filter(
                company=company, route_id__in=routes_in_batch
            ).delete()

            # ignore_conflicts=True guards against duplicate Number values
            # within the same batch (MDB quirk) without aborting the whole insert.
            Fare.objects.bulk_create(to_create, ignore_conflicts=True)
            # Only count as "imported/new" if there was nothing before (first import).
            # On re-import the replaced counter carries the story — not imported.
            imported = 0 if replaced > 0 else len(to_create)

        return imported, existing, skipped, errors, replaced


    @staticmethod
    def _process_vehicles(rows, company, user, lookups):
        """
        MDB VEHICLETYPE: BUSID, BUSNO, BUSTYPE(name string)
        Django VehicleType: bus_reg_num, bus_type(FK), company
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                bus_no       = str(row.get('BUSNO',   '') or '').strip()
                bustype_name = str(row.get('BUSTYPE', '') or '').strip().lower()

                if not bus_no:
                    raise ValueError("Missing BUSNO")

                bus_type_obj = lookups['bus_types'].get(bustype_name)
                if not bus_type_obj:
                    raise ValueError(
                        f"BusType '{bustype_name}' not found. "
                        f"Available: {list(lookups['bus_types'].keys())}"
                    )

                _, created = VehicleType.objects.get_or_create(
                    company=company,
                    bus_reg_num=bus_no,
                    defaults={'bus_type': bus_type_obj, 'created_by': user}
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} VEHICLETYPE: {str(e)}")
        return imported, existing, skipped, errors


    @staticmethod
    def _process_settings(rows, company, user, lookups):
        """
        MDB SETTINGS: one row with all settings for the device/company
        Django Settings: OneToOne with Company — one Settings per company

        If Settings already exists for this company, updates it.
        If not, creates it.

        MDB column → Django field mapping documented inline.
        """
        imported, existing, skipped, errors = 0, 0, 0, []

        # SETTINGS table typically has only one row
        if not rows:
            return 0, 0, 0, []

        # Take first row (should only be one)
        row = rows[0]
        try:
            defaults = {
                # Passwords
                'user_pwd':    MdbImportService._sanitize_settings_text(row.get('UserPWD'), 255),
                'master_pwd':  MdbImportService._sanitize_settings_text(row.get('MasterPWD'), 255),

                # Fare percentages
                'half_per':    MdbImportService._to_float(row.get('HalfPer'), 50.0),
                'con_per':     MdbImportService._to_float(row.get('ConPer')),
                'st_max_amt':  MdbImportService._to_float(row.get('STMaxAmt')),
                'st_min_con':  MdbImportService._to_float(row.get('STMinCon')),
                'phy_per':     MdbImportService._to_float(row.get('PhyPer')),
                'round_amt':   MdbImportService._to_float(row.get('RoundAmt')),
                'luggage_unit_rate': MdbImportService._to_float(row.get('LuggageUnitRate')),

                # Display settings
                'main_display':  MdbImportService._sanitize_settings_text(row.get('MainDisplay'),  50),
                'main_display2': MdbImportService._sanitize_settings_text(row.get('MainDisplay2'), 50),
                'header1':       MdbImportService._sanitize_settings_text(row.get('Header1'), 100),
                'header2':       MdbImportService._sanitize_settings_text(row.get('Header2'), 100),
                'header3':       MdbImportService._sanitize_settings_text(row.get('Header3'), 100),
                'footer1':       MdbImportService._sanitize_settings_text(row.get('Footer1'), 100),
                'footer2':       MdbImportService._sanitize_settings_text(row.get('Footer2'), 100),

                # Boolean flags (MDB stores as SMALLINT 0/1)
                'roundoff':             MdbImportService._to_bool(row.get('Roundoff')),
                'round_up':             MdbImportService._to_bool(row.get('RoundUp')),
                'remove_ticket_flag':   MdbImportService._to_bool(row.get('RemoveTicketFlag')),
                'stage_font_flag':      MdbImportService._to_bool(row.get('StageFontFlag')),
                'next_fare_flag':       MdbImportService._to_bool(row.get('NextFareFlag')),
                'odometer_entry':       MdbImportService._to_bool(row.get('OdometerEntry')),
                'ticket_no_big_font':   MdbImportService._to_bool(row.get('TicketNoBigFont')),

                'gprs_enable':          MdbImportService._to_bool(row.get('GprsEnable')),
                'tripsend_enable':      MdbImportService._to_bool(row.get('TripsendEnable')),
                'schedulesend_enable':  MdbImportService._to_bool(row.get('SchedulesendEnable')),
                'sendpend':             MdbImportService._to_bool(row.get('Sendpend')),
                'inspect_rpt':          MdbImportService._to_bool(row.get('InspectRpt')),
                'st_roundoff_enable':   MdbImportService._to_bool(row.get('StRoundoffEnable')),
                'st_fare_edit':         MdbImportService._to_bool(row.get('StFareEdit')),
                'multiple_pass':        MdbImportService._to_bool(row.get('MultiplePass')),
                'simple_report':        MdbImportService._to_bool(row.get('SimpleReport')),
                'inspector_sms':        MdbImportService._to_bool(row.get('InspectorSMS')),
                'auto_shut_down':       MdbImportService._to_bool(row.get('AutoShutDown')),
                'userpswd_enable':      MdbImportService._to_bool(row.get('UserpswdEnable')),

                # Integer settings
                'report_flag':          MdbImportService._to_int(row.get('ReportFlag')),
                'language_option':      MdbImportService._to_int(row.get('LanguageOption')),
                'stage_updation_msg':   MdbImportService._to_int(row.get('StageUpdationMsg')),
                'default_stage':        MdbImportService._to_int(row.get('DefaultStage')),
                'report_font':          MdbImportService._to_int(row.get('ReportFONT')),
                'st_roundoff_amt':      MdbImportService._to_int(row.get('StRoundoffAmt')),

                # Communication
                'ph_no2':        str(row.get('PhNo2',       '') or '').strip() or None,
                'ph_no3':        str(row.get('PhNo3',       '') or '').strip() or None,
                'access_point':  str(row.get('AccessPoint', '') or '').strip() or None,
                'dest_adds':     str(row.get('DestAdds',    '') or '').strip() or None,
                'username':      str(row.get('Username',    '') or '').strip() or None,
                'password':      str(row.get('Password',    '') or '').strip() or None,
                'uploadpath':    str(row.get('Uploadpath',  '') or '').strip() or None,
                'downloadpath':  str(row.get('Downloadpath','') or '').strip() or None,
                'http_url':      str(row.get('HttpUrl',     '') or '').strip() or None,

                # Feature flags (stored as varchar in Django)
                'smart_card':           str(row.get('SmartCard',         '0') or '0'),
                'exp_enable':           str(row.get('ExpEnable',         '0') or '0'),
                'ftp_enable':           str(row.get('FtpEnable',         '0') or '0'),
                'gprs_enable_message':  str(row.get('GprsEnableMessage', '0') or '0'),
                'sendbill_enable':      str(row.get('sendbillEnable',    '0') or '0'),

                'currency':   str(row.get('Currency', '') or '').strip() or None,

                # ETM concession ratios & flags (previously unimported)
                'ladies_ratio':  MdbImportService._to_int(row.get('ladies_ratio')),
                'senior_ratio':  MdbImportService._to_int(row.get('senior_ratio')),
                'big_font':      MdbImportService._to_bool(row.get('big_fond')),
                'refund_enable': MdbImportService._to_bool(row.get('REFUND')),

                'created_by': user,
            }

            # update_or_create — Settings is OneToOne with Company
            # If already exists, update all fields. If not, create.
            _, created = Settings.objects.update_or_create(
                company=company,
                defaults=defaults
            )
            if created:
                imported = 1
            else:
                existing = 1
        except Exception as e:
            skipped = 1
            errors.append(f"Row 1 SETTINGS: {str(e)}")

        return imported, existing, skipped, errors


    # ================================================================
    # PASS 4 — Depend on Pass 2/3
    # ================================================================

    @staticmethod
    def _process_expense_masters(rows, company, user, lookups):
        """
        MDB EXPMASTER: EXP_CODE, EXP_NAME, PalmID, ID
        Django ExpenseMaster: expense_code, expense_name, palmtec_id, company
        """
        imported, existing, skipped, errors = 0, 0, 0, []
        for i, row in enumerate(rows):
            try:
                raw_code = str(row.get('EXP_CODE', '') or '').strip()
                exp_name = str(row.get('EXP_NAME', '') or '').strip()
                palm_id  = str(row.get('PalmID',   '') or '').strip()

                if not raw_code:
                    raise ValueError("Missing EXP_CODE")

                exp_code = MdbImportService._normalize_id(raw_code)

                _, created = ExpenseMaster.objects.get_or_create(
                    company=company,
                    expense_code=exp_code,
                    defaults={
                        'expense_name': exp_name,
                        'palmtec_id':   palm_id or None,
                        'created_by':   user,
                    }
                )
                if created:
                    imported += 1
                else:
                    existing += 1
            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} EXPMASTER: {str(e)}")
        return imported, existing, skipped, errors


    @staticmethod
    def _process_expenses(rows, company, user, lookups):
        """
        MDB EXPENSE: ExpCode, ExpName, Date, Time, PalmID, ScheduleNo,
                     BusNo, DriverName, TripMasterReferenceId, rcpt_No, ExpAmt
        Django Expense: expense_code, expense_name, date, time, palmtec_id,
                        schedule_no, bus_number, driver(FK), tripmaster_ref_id,
                        receipt_no, expense_amount, company

        Unique key: (company, palmtec_id, expense_code, date, schedule_no)
        — same device + expense type + date + schedule won't duplicate on re-import.
        DriverName matched against Employee.employee_name lowercase.

        Bulk approach — 1 SELECT to load existing keys, 1 INSERT for new rows.
        """
        if not rows:
            return 0, 0, 0, []

        imported, existing, skipped, errors = 0, 0, 0, []

        # Load existing (palmtec_id, expense_code, date, schedule_no) tuples once
        existing_keys = set(
            Expense.objects.filter(company=company)
            .values_list('palmtec_id', 'expense_code', 'date', 'schedule_no')
        )

        to_create = []

        for i, row in enumerate(rows):
            try:
                driver_name = str(row.get('DriverName', '') or '').strip().lower()
                if not driver_name:
                    raise ValueError("Missing DriverName")

                driver = lookups['employees_by_name'].get(driver_name)
                if not driver:
                    raise ValueError(
                        f"Driver '{driver_name}' not found. "
                        f"Ensure CREW was imported first."
                    )

                palm_id      = str(row.get('PalmID',    '') or '').strip()
                expense_code = str(row.get('ExpCode',   '') or '').strip()
                date         = MdbImportService._parse_date(row.get('Date'))
                schedule_no  = MdbImportService._to_int(row.get('ScheduleNo'))

                key = (palm_id, expense_code, date, schedule_no)
                if key in existing_keys:
                    existing += 1
                else:
                    to_create.append(Expense(
                        company=company,
                        palmtec_id=palm_id,
                        expense_code=expense_code,
                        date=date,
                        schedule_no=schedule_no,
                        expense_name=str(row.get('ExpName', '') or '').strip(),
                        time=MdbImportService._parse_time(row.get('Time')),
                        bus_number=str(row.get('BusNo', '') or '').strip(),
                        driver=driver,
                        tripmaster_ref_id=str(row.get('TripMasterReferenceId', '') or '').strip(),
                        receipt_no=str(row.get('rcpt_No', '') or '').strip() or None,
                        expense_amount=MdbImportService._to_float(row.get('ExpAmt')),
                        created_by=user,
                    ))

            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} EXPENSE: {str(e)}")

        if to_create:
            Expense.objects.bulk_create(to_create, ignore_conflicts=True)
            imported = len(to_create)

        return imported, existing, skipped, errors


    @staticmethod
    def _process_crew_assignments(rows, company, user, lookups):
        """
        MDB CREWDET: DR_ID, DR_NAME, CDTR_ID, CDTR_NAME, CLNR_ID, CLNR_NAME,
                     BUS_NO, BUSTYPENAME, BUSTYPEID
        Django CrewAssignment: driver(FK), conductor(FK nullable),
                               cleaner(FK nullable), vehicle(FK), company

        Unique key: (company, driver, vehicle)
        — a driver+vehicle pair represents one assignment snapshot.
        Conductor and cleaner are optional.

        Bulk approach — 1 SELECT to load existing keys, 1 INSERT for new rows.
        """
        if not rows:
            return 0, 0, 0, []

        imported, existing, skipped, errors = 0, 0, 0, []

        # Load existing (driver_id, vehicle_id) pairs once
        existing_keys = set(
            CrewAssignment.objects.filter(company=company)
            .values_list('driver_id', 'vehicle_id')
        )

        to_create = []

        for i, row in enumerate(rows):
            try:
                driver_name    = str(row.get('DR_NAME',   '') or '').strip().lower()
                conductor_name = str(row.get('CDTR_NAME', '') or '').strip().lower()
                cleaner_name   = str(row.get('CLNR_NAME', '') or '').strip().lower()
                bus_no         = str(row.get('BUS_NO',    '') or '').strip().lower()

                if not driver_name:
                    raise ValueError("Missing DR_NAME")
                if not bus_no:
                    raise ValueError("Missing BUS_NO")

                driver = lookups['employees_by_name'].get(driver_name)
                if not driver:
                    raise ValueError(f"Driver '{driver_name}' not found")

                vehicle = lookups['vehicles'].get(bus_no)
                if not vehicle:
                    raise ValueError(f"Vehicle '{bus_no}' not found")

                key = (driver.id, vehicle.id)
                if key in existing_keys:
                    existing += 1
                else:
                    conductor = lookups['employees_by_name'].get(conductor_name) if conductor_name else None
                    cleaner   = lookups['employees_by_name'].get(cleaner_name)   if cleaner_name   else None
                    to_create.append(CrewAssignment(
                        company=company,
                        driver=driver,
                        vehicle=vehicle,
                        conductor=conductor,
                        cleaner=cleaner,
                        created_by=user,
                    ))

            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} CREWDET: {str(e)}")

        if to_create:
            CrewAssignment.objects.bulk_create(to_create, ignore_conflicts=True)
            imported = len(to_create)

        return imported, existing, skipped, errors


    @staticmethod
    def _process_inspector_details(rows, company, user, lookups):
        """
        MDB INSPECTORDET: TripMasterReferenceId, InspectorID, StationNo,
                          Date, Time, PalmID, ScheduleNo, TripNo
        Django InspectorDetails: tripmaster_ref_id, inspector(FK), station_no,
                                 date, time, palmtec_id, schedule_no, trip_no, company

        Unique key: (company, tripmaster_ref_id, inspector, date)
        — an inspector records one check per trip per date.
        InspectorID matched against Employee.employee_code first,
        then falls back to employee_name if code not found.

        Bulk approach — 1 SELECT to load existing keys, 1 INSERT for new rows.
        """
        if not rows:
            return 0, 0, 0, []

        imported, existing, skipped, errors = 0, 0, 0, []

        # Load existing (tripmaster_ref_id, inspector_id, date) tuples once
        existing_keys = set(
            InspectorDetails.objects.filter(company=company)
            .values_list('tripmaster_ref_id', 'inspector_id', 'date')
        )

        to_create = []

        for i, row in enumerate(rows):
            try:
                inspector_id = str(row.get('InspectorID', '') or '').strip()
                if not inspector_id:
                    raise ValueError("Missing InspectorID")

                # Try by code first, then by name as fallback
                inspector = lookups['employees_by_code'].get(
                    MdbImportService._normalize_id(inspector_id)
                )
                if not inspector:
                    inspector = lookups['employees_by_name'].get(inspector_id.lower())
                if not inspector:
                    raise ValueError(
                        f"Inspector '{inspector_id}' not found by code or name. "
                        f"Ensure CREW was imported first."
                    )

                tripmaster_ref_id = str(row.get('TripMasterReferenceId', '') or '').strip()
                date              = MdbImportService._parse_date(row.get('Date'))

                key = (tripmaster_ref_id, inspector.id, date)
                if key in existing_keys:
                    existing += 1
                else:
                    to_create.append(InspectorDetails(
                        company=company,
                        tripmaster_ref_id=tripmaster_ref_id,
                        inspector=inspector,
                        date=date,
                        station_no=str(row.get('StationNo', '') or '').strip(),
                        time=MdbImportService._parse_time(row.get('Time')),
                        palmtec_id=str(row.get('PalmID', '') or '').strip(),
                        schedule_no=MdbImportService._to_int(row.get('ScheduleNo')),
                        trip_no=MdbImportService._to_int(row.get('TripNo')),
                        created_by=user,
                    ))

            except Exception as e:
                skipped += 1
                errors.append(f"Row {i+1} INSPECTORDET: {str(e)}")

        if to_create:
            InspectorDetails.objects.bulk_create(to_create, ignore_conflicts=True)
            imported = len(to_create)

        return imported, existing, skipped, errors


# ================================================================
# MDB READER
# Uses mdbtools via subprocess.
# Password via MDB_JET_PASSWORD env var (not -p flag).
# ================================================================

class MdbReader:

    @staticmethod
    def read_all_tables(mdb_path, password=None):
        tables_to_read = [
            'bustype',
            'EMPLOYEETYPE',
            'CURRENCY',
            'CREW',
            'STAGE',
            'ROUTE',
            'FARE',
            'VEHICLETYPE',
            'SETTINGS',
            'EXPMASTER',
            'EXPENSE',
            'CREWDET',
            'INSPECTORDET',
        ]

        result = {}
        read_errors = {}
        for table in tables_to_read:
            try:
                rows = MdbReader._read_table(mdb_path, table, password)
                result[table] = rows
            except MdbPasswordError:
                raise
            except Exception as e:
                result[table] = []
                read_errors[table] = str(e)

        return result, read_errors

    @staticmethod
    def _read_table(mdb_path, table_name, password=None):
        if sys.platform == 'win32':
            return MdbReader._read_table_pyodbc(mdb_path, table_name, password)
        return MdbReader._read_table_mdbtools(mdb_path, table_name, password)

    @staticmethod
    def _read_table_mdbtools(mdb_path, table_name, password=None):
        """Linux path: shells out to mdb-export (mdbtools)."""
        cmd = ['mdb-export', mdb_path, table_name]

        env = os.environ.copy()
        if password:
            env['MDB_JET_PASSWORD'] = password

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                env=env
            )
        except FileNotFoundError:
            raise MdbReadError("mdbtools not installed. Run: sudo apt install mdbtools")
        except subprocess.TimeoutExpired:
            raise MdbReadError(f"Timed out reading table '{table_name}'")

        if result.returncode != 0:
            stderr = result.stderr.lower()
            if 'password' in stderr or 'encrypt' in stderr or 'access denied' in stderr:
                raise MdbPasswordError()
            raise MdbReadError(f"mdb-export failed for '{table_name}': {result.stderr}")

        if not result.stdout.strip():
            return []

        reader = csv.DictReader(io.StringIO(result.stdout))
        return [
            {k: MdbReader._strip_control_chars(v) for k, v in row.items()}
            for row in reader
        ]

    @staticmethod
    def _strip_control_chars(value):
        """mdb-export leaks NUL/control bytes from fixed-length Jet text field
        padding; these survive str.strip() (not whitespace) and render as an
        invisible tofu glyph in the UI."""
        if not isinstance(value, str):
            return value
        return ''.join(ch for ch in value if ch == '\t' or ch >= ' ')

    @staticmethod
    def _read_table_pyodbc(mdb_path, table_name, password=None):
        """
        Windows path: reads via ODBC using the Microsoft Access Database
        Engine driver. Bitness of the driver must match the Python
        interpreter (32-bit vs 64-bit) — install "Microsoft Access Database
        Engine 2016 Redistributable" matching the server's Python build.
        Returns native Python types (int, float, Decimal, datetime, date,
        time, str, None) — callers already normalize these via str()/
        isinstance() so no CSV-string conversion is needed here.
        """
        try:
            import pyodbc
        except ImportError:
            raise MdbReadError(
                "pyodbc not installed. Run: pip install pyodbc"
            )

        conn_str = (
            r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
            f"DBQ={mdb_path};"
        )
        if password:
            conn_str += f"PWD={password};"

        try:
            conn = pyodbc.connect(conn_str, timeout=30)
        except pyodbc.Error as e:
            msg = str(e).lower()
            if 'password' in msg or 'not a valid password' in msg or 'permission' in msg:
                raise MdbPasswordError()
            if 'data source name not found' in msg or 'im002' in msg:
                raise MdbReadError(
                    "Microsoft Access Database Engine driver not installed, or its "
                    "bitness (32/64-bit) doesn't match this Python install. "
                    "Install the matching 'Access Database Engine Redistributable'."
                )
            raise MdbReadError(f"Failed to open MDB file: {e}")

        try:
            cursor = conn.cursor()
            try:
                cursor.execute(f"SELECT * FROM [{table_name}]")
            except pyodbc.Error as e:
                msg = str(e).lower()
                if 'password' in msg or 'permission' in msg:
                    raise MdbPasswordError()
                raise MdbReadError(f"query failed for '{table_name}': {e}")

            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, record)) for record in cursor.fetchall()]
            return rows
        finally:
            conn.close()
