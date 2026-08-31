import React, { useState, useEffect, useCallback } from 'react';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  RefreshCw, Search, X, Eye,
  ChevronLeft, ChevronRight, FileText,
} from 'lucide-react';

// ─── Action color families ─────────────────────────────────────────────────────
function getActionStyle(action) {
  if (!action) return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
  const a = action.toLowerCase();
  if (a.includes('create') || a.includes('add') || a === 'activate')
    return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
  if (a.includes('update') || a.includes('edit') || a.includes('change'))
    return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (a.includes('delete') || a.includes('deactivate') || a.includes('remove') || a.includes('revoke'))
    return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
  if (a.includes('login') || a.includes('logout') || a.includes('auth'))
    return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
}

function ActionBadge({ action }) {
  const s = getActionStyle(action);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      {action || '—'}
    </span>
  );
}

function fmtDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ─── Detail modal ─────────────────────────────────────────────────────────────
function DetailModal({ log, onClose }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <span tabIndex={0} className="sr-only" />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <FileText size={16} className="text-slate-500" />
            Audit Log #{log.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Timestamp', value: fmtDatetime(log.timestamp) },
              { label: 'Actor',     value: log.actor_username_snapshot || '—' },
              { label: 'Action',    value: <ActionBadge action={log.action} /> },
              { label: 'Target Model', value: <span className="text-xs text-slate-500 font-mono">{log.target_model || '—'}</span> },
              { label: 'Target',    value: log.target_display || log.target_id || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                <div className="text-sm font-medium text-slate-800">{value}</div>
              </div>
            ))}
          </div>

          {log.details && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Details</span>
              </div>
              <div className="px-4 py-3 bg-white overflow-x-auto max-h-72 overflow-y-auto">
                <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-all leading-relaxed">
                  {typeof log.details === 'object'
                    ? JSON.stringify(log.details, null, 2)
                    : log.details}
                </pre>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button onClick={onClose} variant="outline" className="text-slate-600 text-sm h-9">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AuditLogPage() {
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [actionTypes, setActionTypes] = useState([]);

  const today = todayISO();
  const [filters, setFilters] = useState({ action: '', from: today, to: today, search: '' });
  const [applied, setApplied] = useState({ action: '', from: today, to: today, search: '' });

  // Fetch action types once
  useEffect(() => {
    api.get(`${BASE_URL}/audit-logs/action-types`)
      .then(res => {
        const raw = res.data?.data ?? res.data ?? [];
        setActionTypes(raw.map(a => typeof a === 'object' ? { value: a.value, label: a.label } : { value: a, label: a }));
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (f = applied, pg = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: pg, page_size: PAGE_SIZE });
      if (f.action) params.set('action', f.action);
      if (f.from)   params.set('from',   f.from);
      if (f.to)     params.set('to',     f.to);
      if (f.search) params.set('search', f.search);

      const res = await api.get(`${BASE_URL}/audit-logs?${params}`);
      const meta = res.data?.pagination ?? {};
      setLogs(res.data?.data ?? []);
      setTotal(meta.total ?? 0);
      setTotalPages(meta.total_pages ?? 1);
      setPage(pg);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { fetchLogs(applied, 1); }, []);

  const handleApply = () => {
    setApplied({ ...filters });
    fetchLogs(filters, 1);
  };

  const handleClear = () => {
    const reset = { action: '', from: todayISO(), to: todayISO(), search: '' };
    setFilters(reset);
    setApplied(reset);
    fetchLogs(reset, 1);
  };

  const getPaginationRange = (current, total, win = 5) => {
    const half = Math.floor(win / 2);
    let start = Math.max(1, current - half);
    let end   = Math.min(total, start + win - 1);
    if (end - start < win - 1) start = Math.max(1, end - win + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
            <FileText size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Logs</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {total > 0 ? `${total} action${total !== 1 ? 's' : ''} recorded` : 'Management action history'}
            </p>
          </div>
        </div>
        <Button
          onClick={() => fetchLogs(applied, page)}
          disabled={loading}
          variant="outline"
          className="flex items-center gap-2 text-slate-600 text-sm h-9"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-5 border-slate-200 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Action</label>
              <select
                value={filters.action}
                onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="">All Actions</option>
                {actionTypes.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">From Date</label>
              <Input type="date" value={filters.from}
                onChange={e => setFilters(p => ({ ...p, from: e.target.value }))}
                className="text-sm h-9" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">To Date</label>
              <Input type="date" value={filters.to}
                onChange={e => setFilters(p => ({ ...p, to: e.target.value }))}
                className="text-sm h-9" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Search</label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="actor, target…"
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

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
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
                  <th className="px-4 py-3 font-semibold">Timestamp</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold w-20 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading && !logs.length
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {[110, 80, 90, 70, 100, 40].map((w, j) => (
                          <td key={j} className="px-4 py-3.5">
                            <div className="h-3 bg-slate-200 rounded-full animate-pulse" style={{ width: w }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : logs.length
                    ? logs.map((log, i) => (
                        <tr key={log.id ?? i} className="hover:bg-slate-50/70 transition-colors group">
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <p className="text-xs text-slate-700 font-medium">{fmtDatetime(log.timestamp)}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-slate-700 font-medium">{log.actor_username_snapshot || '—'}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <ActionBadge action={log.action} />
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs text-slate-400 font-mono">{log.target_model || '—'}</span>
                          </td>
                          <td className="px-4 py-3.5 max-w-[160px]">
                            <span className="text-sm text-slate-600 truncate block" title={log.target_display || log.target_id}>
                              {log.target_display || log.target_id || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {log.details ? (
                              <button
                                onClick={() => setSelected(log)}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                title="View details"
                              >
                                <Eye size={14} />
                              </button>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    : (
                      <tr>
                        <td colSpan={6} className="px-4 py-14 text-center">
                          <FileText size={28} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-slate-400 text-sm">No audit logs found</p>
                          <p className="text-slate-300 text-xs mt-1">Try adjusting the filters</p>
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
            <Button variant="outline" size="sm" onClick={() => fetchLogs(applied, page - 1)}
              disabled={page === 1} className="h-8 px-2.5 text-xs">
              <ChevronLeft size={13} />
            </Button>
            {getPaginationRange(page, totalPages).map(p => (
              <Button key={p} size="sm" onClick={() => fetchLogs(applied, p)}
                className={`h-8 w-8 p-0 text-xs ${page === p
                  ? 'bg-slate-900 hover:bg-slate-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {p}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => fetchLogs(applied, page + 1)}
              disabled={page === totalPages} className="h-8 px-2.5 text-xs">
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <DetailModal log={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
