import React, { useState, useEffect, useCallback } from 'react';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertTriangle, RefreshCw, RotateCcw, Eye, Search, X,
  ChevronLeft, ChevronRight, Building2, Clock, Bug, Layers,
} from 'lucide-react';

// ─── Protocol field maps (matches tasks.py comments exactly) ─────────────────
const PROTOCOL_FIELDS = {
  transaction: [
    'fn', 'unique_code', 'palmtec_id', 'route_code', 'trip_no', 'ticket_no',
    'schedule_start_date', 'schedule_start_time', 'ticket_date', 'ticket_time',
    'from_stage', 'to_stage',
    'full', 'half', 'st', 'phy', 'lugg', 'amount', 'lugg_amount',
    'ticket_type', 'adjust_amount', 'pass_id', 'warrant', 'refund_status',
    'refund_amount', 'ladies', 'senior',
    'bus_no', 'schedule_no', 'driver', 'conductor', 'up_down_trip',
    'trip_start_date', 'trip_start_time', 'battery', 'passenger_count',
    'full_total', 'half_total', 'phy_total', 'ladies_total',
    'senior_total', 'lugg_total', 'st_total',
    'transaction_id', 'ticket_status', 'bqr_merchant_id', 'license_code','checksum',
  ],
  trip_open: [
    'fn', 'unique_code', 'palmtec_id', 'license_code', 'schedule_no', 'route_code',
    'up_down_trip', 'trip_no', 'bus_no', 'driver', 'conductor',
    'schedule_start_date', 'schedule_start_time', 'trip_start_date', 'trip_start_time',
    'battery',
  ],
  trip_close: [
    'fn', 'unique_code', 'palmtec_id', 'license_code', 'route_code', 'schedule_no', 'trip_no',
    'schedule_start_date', 'schedule_start_time', 'trip_start_date', 'trip_start_time',
    'trip_end_date', 'trip_end_time', 'driver', 'conductor', 'total_km',
    'start_ticket_no', 'end_ticket_no',
    'full', 'half', 'st', 'lugg', 'phy', 'pass', 'ladies', 'senior',
    'full_coll', 'half_coll', 'st_coll', 'lugg_coll', 'phy_coll',
    'ladies_coll', 'senior_coll', 'adjust_coll', 'expense_amount', 'total_coll',
    'upi_count', 'upi_amount', 'up_down_trip', 'total_passengers',
  ],
  trip_close_summary: [
    'fn', 'unique_code', 'palmtec_id', 'license_code', 'route_code', 'schedule_no', 'trip_no',
    'schedule_start_date', 'schedule_start_time', 'trip_start_date', 'trip_start_time',
    'trip_end_date', 'trip_end_time', 'driver', 'conductor', 'total_km',
    'start_ticket_no', 'end_ticket_no',
    'full', 'half', 'st', 'lugg', 'phy', 'pass', 'ladies', 'senior',
    'full_coll', 'half_coll', 'st_coll', 'lugg_coll', 'phy_coll',
    'ladies_coll', 'senior_coll', 'adjust_coll', 'expense_amount', 'total_coll',
    'upi_count', 'upi_amount', 'up_down_trip', 'total_passengers',
  ],
  schedule_open: [
    'fn', 'unique_code', 'palmtec_id', 'license_code', 'schedule_no',
    'start_date', 'start_time', 'driver', 'conductor', 'bus_no', 'battery',
  ],
  schedule_close: [
    'fn', 'unique_code', 'palmtec_id', 'license_code', 'route_code', 'schedule_no',
    'schedule_start_date', 'schedule_start_time', 'end_date', 'end_time',
    'driver', 'conductor', 'bus_no', 'total_tickets',
    'full', 'half', 'phy', 'ladies', 'senior', 'lugg', 'st', 'adjust',
    'total_coll', 'full_coll', 'half_coll', 'phy_coll', 'ladies_coll',
    'senior_coll', 'st_coll', 'adjust_coll', 'lugg_coll',
    'upi_total', 'upi_full', 'upi_half', 'upi_phy', 'upi_ladies',
    'upi_senior', 'upi_st', 'upi_lugg',
    'upi_full_cnt', 'upi_half_cnt', 'upi_phy_cnt', 'upi_ladies_cnt',
    'upi_senior_cnt', 'upi_lugg_cnt', 'upi_st_cnt',
    'battery',
  ],
  schedule_close_summary: [
    'fn', 'unique_code', 'palmtec_id', 'license_code', 'route_code', 'schedule_no',
    'schedule_start_date', 'schedule_start_time', 'end_date', 'end_time',
    'driver', 'conductor', 'bus_no', 'total_tickets',
    'full', 'half', 'phy', 'ladies', 'senior', 'lugg', 'st', 'adjust',
    'total_coll', 'full_coll', 'half_coll', 'phy_coll', 'ladies_coll',
    'senior_coll', 'st_coll', 'adjust_coll', 'lugg_coll',
    'upi_total', 'upi_full', 'upi_half', 'upi_phy', 'upi_ladies',
    'upi_senior', 'upi_st', 'upi_lugg',
    'upi_full_cnt', 'upi_half_cnt', 'upi_phy_cnt', 'upi_ladies_cnt',
    'upi_senior_cnt', 'upi_lugg_cnt', 'upi_st_cnt',
    'battery',
  ],
};

const SOURCE_LABELS = {
  transaction:            'Ticket',
  trip_open:              'Trip Open',
  trip_close:             'Trip Close',
  trip_close_summary:     'Trip Close Summary',
  schedule_open:          'Schedule Open',
  schedule_close:         'Schedule Close',
  schedule_close_summary: 'Schedule Close Summary',
};

const SOURCE_COLORS = {
  transaction:            { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  trip_open:              { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  trip_close:             { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200'  },
  trip_close_summary:     { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200'  },
  schedule_open:          { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  schedule_close:         { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'    },
  schedule_close_summary: { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'    },
};

const getTodayDate = () => new Date().toISOString().split('T')[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ─── Source badge ─────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  const c = SOURCE_COLORS[source] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

// ─── Payload field table ──────────────────────────────────────────────────────
function PayloadFieldTable({ source, rawPayload, errorMessage }) {
  const fields  = PROTOCOL_FIELDS[source] || [];
  const parts   = rawPayload ? rawPayload.split('|') : [];
  const errLower = (errorMessage || '').toLowerCase();

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Payload Fields — {SOURCE_LABELS[source] || source}
        </span>
        <span className="text-[11px] text-slate-400">{parts.length} fields received</span>
      </div>

      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-12">#</th>
              <th className="px-3 py-2 text-left font-semibold w-36">Field Name</th>
              <th className="px-3 py-2 text-left font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {parts.map((val, i) => {
              const fieldName  = fields[i] || '?';
              const isEmpty    = val.trim() === '';
              const isHighlighted = errLower.includes(fieldName.toLowerCase()) && fieldName !== '?';
              return (
                <tr
                  key={i}
                  className={
                    isHighlighted
                      ? 'bg-rose-50'
                      : isEmpty
                        ? 'bg-amber-50/40'
                        : 'hover:bg-slate-50/60'
                  }
                >
                  <td className={`px-3 py-1.5 font-mono tabular-nums text-slate-400 ${isHighlighted ? 'text-rose-500 font-bold' : ''}`}>
                    [{i}]
                  </td>
                  <td className={`px-3 py-1.5 font-mono font-medium ${
                    isHighlighted ? 'text-rose-700' : fieldName === '?' ? 'text-slate-300 italic' : 'text-slate-700'
                  }`}>
                    {fieldName}
                  </td>
                  <td className={`px-3 py-1.5 ${
                    isHighlighted ? 'text-rose-800 font-semibold' :
                    isEmpty       ? 'text-amber-500 italic'       :
                                    'text-slate-800 font-mono'
                  }`}>
                    {isEmpty ? '(empty)' : val}
                  </td>
                </tr>
              );
            })}

            {/* Show unmapped expected fields if device sent fewer than expected */}
            {fields.length > parts.length && fields.slice(parts.length).map((fieldName, j) => {
              const i = parts.length + j;
              return (
                <tr key={`missing-${i}`} className="bg-slate-50/80 opacity-50">
                  <td className="px-3 py-1.5 font-mono tabular-nums text-slate-300">[{i}]</td>
                  <td className="px-3 py-1.5 font-mono text-slate-400">{fieldName}</td>
                  <td className="px-3 py-1.5 text-slate-300 italic">— not received —</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────
function DetailModal({ log, onClose, onRetry, retrying }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-4xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <span tabIndex={0} className="sr-only" />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Bug size={16} className="text-rose-500" />
            Payload #{log.id} — <SourceBadge source={log.source} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Company</p>
              <p className="text-sm font-medium text-slate-800 mt-0.5">{log.company_name || '—'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Received At</p>
              <p className="text-sm font-medium text-slate-800 mt-0.5">{fmtDatetime(log.received_at)}</p>
            </div>
          </div>

          {/* Error banner */}
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider mb-1">Error Message</p>
                <p className="text-sm font-mono text-rose-800 break-all leading-relaxed">
                  {log.error_message || '(no error message recorded)'}
                </p>
              </div>
            </div>
          </div>

          {/* Payload field table */}
          <PayloadFieldTable
            source={log.source}
            rawPayload={log.raw_payload}
            errorMessage={log.error_message}
          />

          {/* Raw payload (collapsed by default) */}
          <details className="rounded-xl border border-slate-200 overflow-hidden">
            <summary className="px-4 py-2.5 bg-slate-50 cursor-pointer text-xs font-semibold text-slate-600 uppercase tracking-wider select-none">
              Raw Payload
            </summary>
            <div className="px-4 py-3 bg-white">
              <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-all leading-relaxed">
                {log.raw_payload || '(empty)'}
              </pre>
            </div>
          </details>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">
              Retrying will reset status to PENDING and re-queue the Celery task.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={onClose} variant="outline" className="text-slate-600 text-sm h-9">
                Close
              </Button>
              <Button
                onClick={() => onRetry(log.id)}
                disabled={retrying}
                className="bg-slate-900 hover:bg-slate-700 text-white text-sm h-9 gap-1.5"
              >
                <RotateCcw size={13} className={retrying ? 'animate-spin' : ''} />
                {retrying ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function FailedPayloadsPage() {
  const [logs,        setLogs]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [selected,    setSelected]    = useState(null);
  const [retrying,    setRetrying]    = useState(false);
  const [toastMsg,    setToastMsg]    = useState(null);
  const [page,        setPage]        = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);
  const [total,       setTotal]       = useState(0);

  const [filters, setFilters] = useState({
    from_date: getTodayDate(),
    to_date:   getTodayDate(),
    source:    '',
    search:    '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    from_date: getTodayDate(),
    to_date:   getTodayDate(),
    source:    '',
    search:    '',
  });

  const PAGE_SIZE = 25;

  const showToast = (msg, type = 'success') => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchLogs = useCallback(async (f = appliedFilters, pg = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: pg, page_size: PAGE_SIZE });
      if (f.from_date) params.set('from_date', f.from_date);
      if (f.to_date)   params.set('to_date',   f.to_date);
      if (f.source)    params.set('source',    f.source);
      if (f.search)    params.set('search',    f.search);

      const res = await api.get(`${BASE_URL}/failed-payloads?${params}`);
      if (res.data.message === 'success') {
        setLogs(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.total_pages);
        setPage(pg);
      } else {
        setError('Failed to fetch failed payloads');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchLogs(appliedFilters, 1);
  }, []);

  const handleApply = () => {
    setAppliedFilters({ ...filters });
    fetchLogs(filters, 1);
  };

  const handleClear = () => {
    const reset = { from_date: getTodayDate(), to_date: getTodayDate(), source: '', search: '' };
    setFilters(reset);
    setAppliedFilters(reset);
    fetchLogs(reset, 1);
  };

  const handleRetry = async (logId) => {
    setRetrying(true);
    try {
      await api.post(`${BASE_URL}/failed-payloads/${logId}/retry`);
      showToast(`Payload #${logId} re-queued for processing.`);
      setSelected(null);
      // Remove from list — it's no longer FAILED
      setLogs(prev => prev.filter(l => l.id !== logId));
      setTotal(prev => prev - 1);
    } catch (err) {
      showToast(err.response?.data?.error || 'Retry failed', 'error');
    } finally {
      setRetrying(false);
    }
  };

  // Group by source for the summary strip
  const sourceCounts = logs.reduce((acc, l) => {
    acc[l.source] = (acc[l.source] || 0) + 1;
    return acc;
  }, {});

  const getPaginationRange = (current, total, win = 5) => {
    const half = Math.floor(win / 2);
    let start = Math.max(1, current - half);
    let end   = Math.min(total, start + win - 1);
    if (end - start < win - 1) start = Math.max(1, end - win + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50">

      {/* Toast */}
      {toastMsg && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toastMsg.type === 'error'
            ? 'bg-rose-600 text-white'
            : 'bg-slate-900 text-white'
        }`}>
          {toastMsg.type === 'error' ? <AlertTriangle size={14} /> : <RotateCcw size={14} />}
          {toastMsg.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Failed Payloads</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {total > 0 ? `${total} failed records` : 'No failed records found'}
              {total > 0 && ' — diagnose and retry from here'}
            </p>
          </div>
        </div>
        <Button
          onClick={() => fetchLogs(appliedFilters, page)}
          disabled={loading}
          variant="outline"
          className="flex items-center gap-2 text-slate-600 text-sm h-9"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Source summary strip */}
      {Object.keys(sourceCounts).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(sourceCounts).map(([src, count]) => {
            const c = SOURCE_COLORS[src] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
            return (
              <button
                key={src}
                onClick={() => {
                  const newSource = filters.source === src ? '' : src;
                  const updated = { ...filters, source: newSource };
                  setFilters(updated);
                  setAppliedFilters(updated);
                  fetchLogs(updated, 1);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all ${c.bg} ${c.text} ${c.border} ${
                  filters.source === src ? 'ring-2 ring-offset-1 ring-slate-400' : 'hover:opacity-80'
                }`}
              >
                <Layers size={11} />
                {SOURCE_LABELS[src] || src}
                <span className="ml-1 bg-white/70 rounded-full px-1.5 py-px font-bold">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <Card className="mb-5 border-slate-200 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">From Date</label>
              <Input type="date" max={getTodayDate()} value={filters.from_date}
                onChange={e => setFilters(p => ({ ...p, from_date: e.target.value }))}
                className="text-sm h-9" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">To Date</label>
              <Input type="date" max={getTodayDate()} value={filters.to_date}
                onChange={e => setFilters(p => ({ ...p, to_date: e.target.value }))}
                className="text-sm h-9" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Source Type</label>
              <select
                value={filters.source}
                onChange={e => setFilters(p => ({ ...p, source: e.target.value }))}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="">All Types</option>
                {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Search</label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="company / error / payload…"
                  value={filters.search}
                  onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleApply()}
                  className="text-sm h-9 pl-7"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApply} disabled={loading}
                className="flex-1 bg-slate-900 hover:bg-slate-700 text-white text-sm h-9">
                Apply
              </Button>
              <Button onClick={handleClear} variant="outline" className="text-slate-500 h-9 px-3">
                <X size={13} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-0 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
              <div className="flex items-center gap-2 text-slate-600 font-medium text-sm">
                <RefreshCw size={16} className="animate-spin" /> Loading…
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50/60 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold w-16">ID</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 font-semibold">Error</th>
                  <th className="px-4 py-3 font-semibold w-24 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading && !logs.length
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {[50, 100, 120, 90, 200, 80].map((w, j) => (
                          <td key={j} className="px-4 py-3.5">
                            <div className="h-3 bg-slate-200 rounded-full animate-pulse" style={{ width: w }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : logs.length
                    ? logs.map(log => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                          onClick={() => setSelected(log)}
                        >
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-slate-500 text-xs">#{log.id}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <SourceBadge source={log.source} />
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <Building2 size={11} className="text-slate-400 shrink-0" />
                              <span className="text-slate-700 text-sm font-medium truncate max-w-[150px]">
                                {log.company_name || '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 text-slate-600">
                              <Clock size={11} className="text-slate-400 shrink-0" />
                              <span className="text-xs">{timeAgo(log.received_at)}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {log.received_at ? new Date(log.received_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 max-w-xs">
                            <p className="text-xs text-rose-700 font-mono truncate" title={log.error_message}>
                              {log.error_message || '—'}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={e => { e.stopPropagation(); setSelected(log); }}
                                className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors"
                                title="View details"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); handleRetry(log.id); }}
                                className="h-7 w-7 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 flex items-center justify-center transition-colors"
                                title="Retry"
                              >
                                <RotateCcw size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    : (
                      <tr>
                        <td colSpan={6} className="px-4 py-14 text-center">
                          <AlertTriangle size={28} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-slate-400 text-sm">No failed payloads found</p>
                          <p className="text-slate-300 text-xs mt-1">Try adjusting the date range or filters</p>
                        </td>
                      </tr>
                    )
                }
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 px-1">
          <p className="text-xs text-slate-400">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => fetchLogs(appliedFilters, page - 1)}
              disabled={page === 1} className="h-8 px-2.5 text-xs">
              <ChevronLeft size={13} />
            </Button>
            {getPaginationRange(page, totalPages).map(p => (
              <Button key={p} size="sm" onClick={() => fetchLogs(appliedFilters, p)}
                className={`h-8 w-8 p-0 text-xs ${page === p
                  ? 'bg-slate-900 hover:bg-slate-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {p}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => fetchLogs(appliedFilters, page + 1)}
              disabled={page === totalPages} className="h-8 px-2.5 text-xs">
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <DetailModal
          log={selected}
          onClose={() => setSelected(null)}
          onRetry={handleRetry}
          retrying={retrying}
        />
      )}
    </div>
  );
}
