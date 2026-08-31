import atexit
import json
import logging
import logging.handlers
import os
import queue
from datetime import datetime

_listener = None


class JsonFormatter(logging.Formatter):
    """Emits each log record as a single JSON line."""

    EXTRA_FIELDS = ('company_id', 'record_type', 'device_id', 'request_id')

    def format(self, record):
        data = {
            'level': record.levelname,
            'time': datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S'),
            'logger': record.name,
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
            'message': record.getMessage(),
        }
        for field in self.EXTRA_FIELDS:
            val = getattr(record, field, None)
            if val is not None:
                data[field] = str(val)
        if record.exc_info:
            data['exception'] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False)


class LoggerFilter(logging.Filter):
    """Passes only records whose logger name matches the given names/prefixes."""

    def __init__(self, *names):
        super().__init__()
        self.names = names

    def filter(self, record):
        return any(
            record.name == n or record.name.startswith(n + '.')
            for n in self.names
        )


class NonBlockingQueueHandler(logging.handlers.QueueHandler):
    """Drops records silently when queue is full; never blocks the caller thread."""

    # Class-level singleton queue shared by all instances and the QueueListener.
    _queue: queue.Queue = queue.Queue(maxsize=5000)

    def __init__(self):
        super().__init__(self._queue)

    def enqueue(self, record):
        try:
            self.queue.put_nowait(record)
        except queue.Full:
            pass


# ── Handler factories ─────────────────────────────────────────────────────────

def _rotating(path, name, max_mb, backups, fmt, level=logging.INFO):
    h = logging.handlers.RotatingFileHandler(
        os.path.join(path, name),
        maxBytes=max_mb * 1024 * 1024,
        backupCount=backups,
        encoding='utf-8',
    )
    h.setLevel(level)
    h.setFormatter(fmt)
    return h


def _timed(path, name, backups, fmt, level=logging.INFO):
    h = logging.handlers.TimedRotatingFileHandler(
        os.path.join(path, name),
        when='midnight',
        backupCount=backups,
        encoding='utf-8',
    )
    h.setLevel(level)
    h.setFormatter(fmt)
    return h


# ── Main entry point ──────────────────────────────────────────────────────────

def configure_logging(base_dir, debug=False):
    """
    Sets up the full logging stack:
      - JSON-formatted file handlers
      - Async writes (QueueListener thread) for INFO/DEBUG loggers
      - Sync writes for ERROR-only transaction loggers
      - Console output in debug mode only
    """
    global _listener

    logs_dir = os.path.join(str(base_dir), 'logs')
    os.makedirs(logs_dir, exist_ok=True)

    json_fmt = JsonFormatter()
    simple_fmt = logging.Formatter(
        '{levelname} {asctime} {message}',
        style='{',
        datefmt='%Y-%m-%d %H:%M:%S',
    )

    # ── Console handler (dev only, human-readable) ────────────────────────
    console_h = None
    if debug:
        console_h = logging.StreamHandler()
        console_h.setLevel(logging.DEBUG)
        console_h.setFormatter(simple_fmt)

    # ── Async file handlers (INFO/DEBUG loggers) ──────────────────────────
    # All go into a single QueueListener; each handler filters by logger name
    # so records only land in the correct file.

    general_level = logging.DEBUG if debug else logging.INFO

    django_fh = _rotating(logs_dir, 'django.log', 15, 10, json_fmt, general_level)
    django_fh.addFilter(LoggerFilter('django', 'TicketAppB'))

    # Async: non-critical palmtec events + report API (non-blocking)
    _ASYNC_PALMTEC_NAMES = (
        'trip_open',
        'trip_close',
        'trip_close_summary',
        'schedule_open',
        'schedule_close',
        'schedule_close_summary',
        'odometer',
        'expense',
        'apk_upload',
    )

    palmtec_fhs = {}
    for pname in _ASYNC_PALMTEC_NAMES:
        h = _timed(logs_dir, f'palmtec_{pname}.log', 30, json_fmt, logging.INFO)
        h.addFilter(LoggerFilter(f'ticket.palmtec.{pname}'))
        palmtec_fhs[pname] = h

    # ticket.ticket_report → async (web UI report endpoints, non-blocking)
    ticket_report_fh = _timed(logs_dir, 'ticket_report.log', 30, json_fmt, logging.INFO)
    ticket_report_fh.addFilter(LoggerFilter('ticket.ticket_report'))

    async_dest_handlers = [django_fh, ticket_report_fh, *palmtec_fhs.values()]

    _listener = logging.handlers.QueueListener(
        NonBlockingQueueHandler._queue,
        *async_dest_handlers,
        respect_handler_level=True,
    )
    _listener.start()
    atexit.register(_listener.stop)

    # ── Sync file handlers (written immediately in caller thread) ─────────
    _SYNC_LOGGER_MAP = {
        'ticket.palmtec.ticket_data': ('palmtec_ticket_data.log',   logging.INFO),   # ETM device ticket reception
        'aggregator.transactions':    ('aggregator_transactions.log', logging.ERROR),
        'aggregator.payouts':         ('aggregator_payouts.log',      logging.ERROR),
    }

    # ── Wire loggers ──────────────────────────────────────────────────────

    queue_h = NonBlockingQueueHandler()

    def _wire(name, level, handlers):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.setLevel(level)
        lg.propagate = False
        for h in handlers:
            lg.addHandler(h)

    base_async = [queue_h] + ([console_h] if console_h else [])

    # General async loggers
    _wire('django', general_level, base_async)
    _wire('TicketAppB', general_level, base_async)

    # Per-palmtec-event loggers (async)
    for pname in _ASYNC_PALMTEC_NAMES:
        _wire(f'ticket.palmtec.{pname}', logging.INFO, [queue_h])

    # ticket.ticket_report (async, web UI report endpoints)
    _wire('ticket.ticket_report', logging.INFO, [queue_h])

    # Sync loggers — plain FileHandler avoids TimedRotatingFileHandler rename
    # conflicts when IIS runs multiple worker processes (WinError 32).
    for logger_name, (filename, level) in _SYNC_LOGGER_MAP.items():
        sync_h = logging.FileHandler(
            os.path.join(logs_dir, filename),
            mode='a',
            encoding='utf-8',
            delay=False,
        )
        sync_h.setLevel(level)
        sync_h.setFormatter(json_fmt)
        sync_handlers = [sync_h] + ([console_h] if console_h else [])
        _wire(logger_name, level, sync_handlers)

    # Suppress SQL query spam from django.db.backends (DEBUG level floods terminal + django.log)
    logging.getLogger('django.db.backends').setLevel(logging.WARNING)
