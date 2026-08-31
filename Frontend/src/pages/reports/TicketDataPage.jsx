import React, { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import cacheManager from '../../assets/js/reportCache';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KpiCard } from '@/components/ui/kpi-card';
import {
  Ticket, IndianRupee, CreditCard, Banknote, Download, RefreshCw,
  AlertCircle, Eye, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, Cpu, Bus,
} from 'lucide-react';

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmt = {
  inr: (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  date: (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  },
};

const getTodayDate = () => new Date().toISOString().split('T')[0];

// ─── Featured "total collection" dark card ────────────────────────────────────
function FeaturedKpi({ value, sub }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 text-white p-4 shadow-sm h-full">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Total Collection</p>
      <p className="mt-1.5 text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-white/70 mt-1">{sub}</p>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300">
        <TrendingUp size={12} />
        <span>Live — updates automatically</span>
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-10">
        <IndianRupee size={92} color="#fff" />
      </div>
    </div>
  );
}

// ─── Payment split bar card ───────────────────────────────────────────────────
function PaymentSplitCard({ upiCount, cashCount, upiAmt, cashAmt }) {
  const total = upiAmt + cashAmt || 1;
  const upiPct  = (upiAmt / total) * 100;
  const cashPct = 100 - upiPct;
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm h-full">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Payment Mix</p>
      <div className="flex items-end gap-1 mt-1.5">
        <span className="text-3xl font-bold text-slate-900">{Math.round(upiPct)}%</span>
        <span className="text-sm text-slate-500 mb-1">UPI</span>
      </div>
      <div className="mt-3">
        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
          <div className="bg-blue-500 transition-all"  style={{ width: `${upiPct}%` }} />
          <div className="bg-amber-500 transition-all" style={{ width: `${cashPct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-slate-700 font-semibold">UPI</span>
          <span className="text-slate-400">{upiCount}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-slate-700 font-semibold">Cash</span>
          <span className="text-slate-400">{cashCount}</span>
        </span>
      </div>
    </div>
  );
}

// ─── FieldBlock for detail modal ──────────────────────────────────────────────
function FieldBlock({ label, value, accent }) {
  const accents = {
    blue:    'bg-blue-50 border-blue-100 text-blue-800',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    slate:   'bg-slate-100 border-slate-200 text-slate-800',
  };
  if (accent) {
    return (
      <div className={`rounded-lg border px-3 py-3 text-center ${accents[accent]}`}>
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{label}</p>
        <p className="text-base font-bold mt-1">{value}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800 mt-0.5 break-all">{value ?? '—'}</p>
    </div>
  );
}

function FieldGroup({ title, children, columns = 2 }) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };
  return (
    <div>
      {title && <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">{title}</p>}
      <div className={`grid ${cols[columns] || 'grid-cols-2'} gap-2`}>{children}</div>
    </div>
  );
}

// ─── Ticket table row ─────────────────────────────────────────────────────────
function TicketRow({ ticket: t, onView, isNew }) {
  const isUpi = t.ticket_status === 'UPI';
  return (
    <tr className={`transition-colors hover:bg-slate-50/70 group ${isNew ? 'bg-slate-100/60' : ''}`}>
      {/* Payment icon */}
      <td className="px-4 py-3.5">
        <div className="relative inline-flex">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${
            isUpi ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {isUpi ? <CreditCard size={15} /> : <Banknote size={15} />}
          </div>
          {isUpi && t.manual_verified_upi === true && (
            <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-blue-600 text-white rounded px-1 leading-4">MV</span>
          )}
        </div>
      </td>

      {/* Ticket number */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-800">{t.ticket_number || '—'}</span>
          {t.up_down_trip && (
            <span className={`text-[10px] font-semibold rounded px-1.5 py-px ${
              t.up_down_trip === 'Up' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'
            }`}>{t.up_down_trip}</span>
          )}
        </div>
        <span className="text-[11px] text-slate-500">{t.ticket_type_display}</span>
      </td>

      {/* Device + trip */}
      <td className="px-4 py-3.5">
        <div className="text-sm font-medium text-slate-700 font-mono">{t.palmtec_id}</div>
        <div className="text-[11px] text-slate-500">Trip #{t.trip_no ?? t.trip_id}{t.schedule_no != null ? ` · Sch #${t.schedule_no}` : ''}</div>
      </td>

      {/* Route segment */}
      <td className="px-4 py-3.5">
        {t.from_stage_name || t.to_stage_name ? (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-800 truncate max-w-[90px]" title={t.from_stage_name}>{t.from_stage_name}</span>
            <Bus size={12} className="text-slate-300 shrink-0" />
            <span className="text-slate-800 truncate max-w-[90px]" title={t.to_stage_name}>{t.to_stage_name}</span>
          </div>
        ) : <span className="text-slate-400 text-xs">—</span>}
        {t.route_code && <div className="text-[11px] text-slate-500 mt-0.5">{t.route_code}</div>}
      </td>

      {/* Date + Time */}
      <td className="px-4 py-3.5">
        <div className="text-sm font-medium text-slate-700 tabular-nums">{t.ticket_time ? t.ticket_time.slice(0, 5) : '—'}</div>
        <div className="text-[11px] text-slate-400">{t.formatted_ticket_date || fmt.date(t.ticket_date)}</div>
      </td>

      {/* Pax count */}
      <td className="px-4 py-3.5 text-center">
        <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-slate-100 text-slate-700 text-sm font-bold tabular-nums">
          {t.total_tickets}
        </span>
      </td>

      {/* Amount */}
      <td className="px-4 py-3.5 text-right">
        <div className="font-bold text-slate-900 tabular-nums">{fmt.inr(t.ticket_amount)}</div>
        <div className={`text-[10px] font-medium ${isUpi ? 'text-blue-600' : 'text-amber-700'}`}>
          {t.ticket_status}
        </div>
      </td>

      {/* Eye */}
      <td className="px-4 py-3.5">
        <button
          onClick={onView}
          className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Eye size={14} />
        </button>
      </td>
    </tr>
  );
}

// ─── Ticket detail modal ──────────────────────────────────────────────────────
function TicketDetailModal({ ticket: t, onClose }) {
  const isUpi = t.ticket_status === 'UPI';
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[85vh] overflow-y-auto">
        <span tabIndex={0} className="sr-only" />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Ticket size={16} className="text-slate-600" /> Ticket {t.ticket_number || t.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Receipt-style header */}
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                  isUpi ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  {isUpi ? <CreditCard size={22} /> : <Banknote size={22} />}
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-slate-900">{t.ticket_number || '—'}</p>
                  <p className="text-xs text-slate-500">{t.ticket_type_display}{t.up_down_trip ? ` · ${t.up_down_trip}-trip` : ''}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmt.inr(t.ticket_amount)}</p>
                <p className="text-[11px] text-slate-500">{t.ticket_status}</p>
              </div>
            </div>

            {/* Route visualization */}
            {(t.from_stage_name || t.to_stage_name) && (
              <div className="flex items-center gap-3 pt-4 border-t border-dashed border-slate-300">
                <div className="flex-1">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">From</p>
                  <p className="text-sm font-semibold text-slate-800">{t.from_stage_name || '—'}</p>
                </div>
                <div className="flex flex-col items-center text-slate-400">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <div className="w-8 h-px bg-slate-300" />
                    <Bus size={14} className="text-slate-500" />
                    <div className="w-8 h-px bg-slate-300" />
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  </div>
                  {t.route_code && <p className="text-[10px] text-slate-500 mt-1">{t.route_code}</p>}
                </div>
                <div className="flex-1 text-right">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">To</p>
                  <p className="text-sm font-semibold text-slate-800">{t.to_stage_name || '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Identity */}
          <FieldGroup title="Identity" columns={3}>
            <FieldBlock label="Company"      value={t.company_name} />
            <FieldBlock label="Unique Code"  value={t.unique_code || '—'} />
            <FieldBlock label="Checksum"     value={t.checksum || '—'} />
          </FieldGroup>

          {/* Trip context */}
          <FieldGroup title="Trip Context" columns={3}>
            <FieldBlock label="Palmtec ID"       value={t.palmtec_id} />
            <FieldBlock label="Trip No"          value={t.trip_no ?? '—'} />
            <FieldBlock label="Schedule No"      value={t.schedule_no ?? '—'} />
            <FieldBlock label="Route Code"       value={t.route_code} />
            <FieldBlock label="Trip Start Date"  value={t.trip_start_date || '—'} />
            <FieldBlock label="Trip Start Time"  value={t.trip_start_time || '—'} />
            <FieldBlock label="Ticket Date"      value={t.formatted_ticket_date || fmt.date(t.ticket_date)} />
            <FieldBlock label="Ticket Time"      value={t.ticket_time} />
            <FieldBlock label="Ticket Type"      value={t.ticket_type_display} />
            <FieldBlock label="Battery %"        value={t.battery_percentage ?? '—'} />
            <FieldBlock label="Passenger Count"  value={t.passenger_count ?? '—'} />
          </FieldGroup>

          {/* Passenger counts */}
          <FieldGroup title="Passenger Counts" columns={4}>
            <FieldBlock label="Full"     value={t.full_count} />
            <FieldBlock label="Half"     value={t.half_count} />
            <FieldBlock label="Student"  value={t.st_count} />
            <FieldBlock label="Physical" value={t.phy_count} />
            <FieldBlock label="Luggage"  value={t.lugg_count} />
            <FieldBlock label="Ladies"   value={t.ladies_count} />
            <FieldBlock label="Senior"   value={t.senior_count} />
            <FieldBlock label="Total"    value={t.total_tickets} />
          </FieldGroup>

          {/* Amounts */}
          <FieldGroup title="Amount Details" columns={3}>
            <FieldBlock label="Full Amount"    value={fmt.inr(t.full_total_amount)} />
            <FieldBlock label="Student Amount" value={fmt.inr(t.st_total_amount)} />
            <FieldBlock label="Luggage Amount" value={fmt.inr(t.lugg_amount)} />
            <FieldBlock label="Adjust Amount"  value={fmt.inr(t.adjust_amount)} />
            <FieldBlock label="Warrant Amount" value={fmt.inr(t.warrant_amount)} />
            <FieldBlock label="Refund Amount"  value={fmt.inr(t.refund_amount)} />
          </FieldGroup>

          {t.bqr_merchant_id && (
            <FieldGroup title="BQR / Merchant" columns={2}>
              <FieldBlock label="BQR Merchant ID" value={t.bqr_merchant_id} />
            </FieldGroup>
          )}

          {/* UPI reference — only when payment is UPI */}
          {isUpi && (
            <FieldGroup title="UPI Reference" columns={3}>
              <FieldBlock label="Transaction ID"   value={t.transaction_id || '—'} />
              <FieldBlock label="Reference Number" value={t.reference_number || '—'} />
              <FieldBlock
                label="UPI Verification"
                value={t.manual_verified_upi === true ? 'Manual' : t.manual_verified_upi === false ? 'Auto' : '—'}
                accent={t.manual_verified_upi === true ? 'blue' : t.manual_verified_upi === false ? 'emerald' : undefined}
              />
            </FieldGroup>
          )}

          {/* Pass info if present */}
          {(t.pass_id || t.refund_status) && (
            <FieldGroup title="Other Details" columns={2}>
              {t.pass_id      && <FieldBlock label="Pass ID"       value={t.pass_id} />}
              {t.refund_status && <FieldBlock label="Refund Status" value={t.refund_status} />}
            </FieldGroup>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FieldBlock label="Payment Mode"  value={t.ticket_status}   accent={isUpi ? 'blue' : undefined} />
            <FieldBlock label="Total Amount"  value={fmt.inr(t.ticket_amount)} accent="slate" />
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button onClick={onClose} variant="outline" className="text-slate-600">Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sortable column header ───────────────────────────────────────────────────
function SortHead({ label, sortKey, currentKey, direction, onSort, align = 'left' }) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-4 py-3 font-semibold cursor-pointer select-none hover:text-slate-800 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {currentKey !== sortKey
          ? <ArrowUpDown size={11} className="text-slate-300" />
          : direction === 'asc'
            ? <ArrowUp size={11} className="text-slate-600" />
            : <ArrowDown size={11} className="text-slate-600" />}
      </span>
    </th>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function TicketDataPage() {
  const [transactions,       setTransactions]       = useState([]);
  const [isRefreshing,       setIsRefreshing]       = useState(false);
  const [error,              setError]              = useState(null);
  const [dateError,          setDateError]          = useState('');
  const [lastUpdated,        setLastUpdated]        = useState(null);
  const [lastUpdateDuration, setLastUpdateDuration] = useState(0);
  const [isPolling,          setIsPolling]          = useState(false);
  const [pollingPaused,      setPollingPaused]      = useState(false);
  const [newTicketIds,       setNewTicketIds]       = useState(new Set());
  const [isPageVisible,      setIsPageVisible]      = useState(true);
  const [sortConfig,         setSortConfig]         = useState({ key: null, direction: null });

  const [filters, setFilters] = useState({
    startDate: '', endDate: '',
    deviceId: 'ALL', depotCode: 'ALL', paymentMode: 'ALL', routeCode: 'ALL',
  });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: '', endDate: '' });
  const [currentPage,  setCurrentPage]  = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedTx,   setSelectedTx]   = useState(null);

  const pollingIntervalRef = useRef(null);
  const latestTimestampRef = useRef(null);

  const hasPendingChanges =
    appliedFilters.startDate !== filters.startDate ||
    appliedFilters.endDate   !== filters.endDate;

  const isDateRangeEnded = () => {
    if (!appliedFilters.endDate) return false;
    const end = new Date(appliedFilters.endDate);
    const today = new Date(); today.setHours(0,0,0,0); end.setHours(0,0,0,0);
    return today > end;
  };

  // Page visibility
  useEffect(() => {
    const handler = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Init
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user.id;
    const cached = cacheManager.getDateRange('ticket', userId);
    const startDate = cached?.fromDate || getTodayDate();
    const endDate   = cached?.toDate   || getTodayDate();

    setFilters(p => ({ ...p, startDate, endDate }));
    setAppliedFilters({ startDate, endDate });

    const cacheKey = cacheManager.getCacheKey('ticket', userId, startDate, endDate);
    const cachedData = cacheManager.get(cacheKey);
    if (cachedData) {
      setTransactions(cachedData);
      if (cachedData.length > 0) latestTimestampRef.current = cachedData[0].created_at;
      setIsPolling(true);
      setLastUpdated(new Date());
    } else {
      fetchTransactions(startDate, endDate);
    }
  }, []);

  // Polling
  useEffect(() => {
    if (isPolling && !pollingPaused && isPageVisible && appliedFilters.startDate && appliedFilters.endDate) {
      pollingIntervalRef.current = setInterval(pollForNew, 10000);
      return () => clearInterval(pollingIntervalRef.current);
    }
    clearInterval(pollingIntervalRef.current);
  }, [isPolling, pollingPaused, isPageVisible, appliedFilters.startDate, appliedFilters.endDate]);

  useEffect(() => {
    if (isDateRangeEnded()) { setPollingPaused(true); setIsPolling(false); }
    else setPollingPaused(false);
  }, [appliedFilters.endDate]);

  const fetchTransactions = async (startDate, endDate, sinceTimestamp = null) => {
    try {
      if (!sinceTimestamp) setIsRefreshing(true);
      const t0 = Date.now();
      let url = `${BASE_URL}/get_all_transaction_data?from_date=${startDate}&to_date=${endDate}`;
      if (sinceTimestamp) url += `&since=${encodeURIComponent(sinceTimestamp)}`;

      const response = await api.get(url);
      const duration = Date.now() - t0;

      if (response.data.message === 'success') {
        if (sinceTimestamp) {
          const incoming = response.data.data || [];
          if (incoming.length > 0) {
            setTransactions(prev => {
              const existingIds = new Set(prev.map(t => t.id));
              const brandNew = incoming.filter(t => !existingIds.has(t.id));
              if (!brandNew.length) return prev;
              const newIds = new Set(brandNew.map(t => t.id));
              setNewTicketIds(newIds);
              setTimeout(() => setNewTicketIds(new Set()), 2500);
              return [...brandNew, ...prev];
            });
            latestTimestampRef.current = incoming[0].created_at;
          }
          setLastUpdated(new Date());
          setLastUpdateDuration(duration);
        } else {
          const data = response.data.data || [];
          setTransactions(data);
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          const cacheKey = cacheManager.getCacheKey('ticket', user.id, startDate, endDate);
          cacheManager.set(cacheKey, data);
          cacheManager.setDateRange('ticket', user.id, startDate, endDate);
          if (data.length > 0) latestTimestampRef.current = data[0].created_at;
          setIsPolling(true);
          setLastUpdated(new Date());
          setLastUpdateDuration(duration);
        }
        setError(null); setDateError('');
      } else {
        setError('Failed to fetch ticket data');
      }
    } catch (err) {
      if (err.response) {
        setError(`Server Error: ${err.response.status} - ${err.response.data?.message || err.response.data?.error}`);
      } else if (err.request) {
        setError('No response from server.');
      } else {
        setError('Error: ' + err.message);
      }
    } finally {
      if (!sinceTimestamp) setIsRefreshing(false);
    }
  };

  const pollForNew = async () => {
    if (isDateRangeEnded()) { setPollingPaused(true); setIsPolling(false); return; }
    try {
      await fetchTransactions(appliedFilters.startDate, appliedFilters.endDate, latestTimestampRef.current || null);
    } catch (err) {
      console.error('Ticket polling error:', err);
    }
  };

  // Dynamic options
  const deviceIds   = [...new Set(transactions.map(t => t.palmtec_id).filter(Boolean))].sort();
  const depotCodes  = [...new Set(transactions.map(t => t.depot_code).filter(Boolean))].sort();
  const routeCodes  = [...new Set(transactions.map(t => t.route_code).filter(Boolean))].sort();
  const paymentModes = [...new Set(transactions.map(t => t.ticket_status).filter(Boolean))].sort();

  // Client-side filter
  const filteredData = transactions.filter(t => {
    if (filters.deviceId    !== 'ALL' && t.palmtec_id    !== filters.deviceId)    return false;
    if (filters.depotCode   !== 'ALL' && t.depot_code    !== filters.depotCode)   return false;
    if (filters.paymentMode !== 'ALL' && t.ticket_status !== filters.paymentMode) return false;
    if (filters.routeCode   !== 'ALL' && t.route_code    !== filters.routeCode)   return false;
    return true;
  });

  // Sort
  const numericKeys = ['total_tickets', 'ticket_amount'];
  const sortedData = sortConfig.key && sortConfig.direction
    ? [...filteredData].sort((a, b) => {
        const av = a[sortConfig.key] ?? '';
        const bv = b[sortConfig.key] ?? '';
        const cmp = numericKeys.includes(sortConfig.key)
          ? parseFloat(av) - parseFloat(bv)
          : String(av).localeCompare(String(bv));
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      })
    : filteredData;

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: null };
    });
    setCurrentPage(1);
  };

  // Summary
  const upiRows  = filteredData.filter(t => t.ticket_status === 'UPI');
  const cashRows = filteredData.filter(t => t.ticket_status !== 'UPI');
  const summary = {
    tickets:  filteredData.reduce((s, t) => s + (t.total_tickets || 0), 0),
    amount:   filteredData.reduce((s, t) => s + Number(t.ticket_amount || 0), 0),
    upiCount: upiRows.length,
    cashCount: cashRows.length,
    upiAmt:   upiRows.reduce((s, t) => s + Number(t.ticket_amount || 0), 0),
    cashAmt:  cashRows.reduce((s, t) => s + Number(t.ticket_amount || 0), 0),
    devices:  new Set(filteredData.map(t => t.palmtec_id)).size,
  };

  // Pagination
  const totalPages  = Math.ceil(sortedData.length / itemsPerPage);
  const currentData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Handlers
  const handleApplyFilters = () => {
    if (filters.endDate < filters.startDate) { setDateError('End date cannot be before start date'); return; }
    setDateError('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    cacheManager.invalidate(cacheManager.getCacheKey('ticket', user.id, appliedFilters.startDate, appliedFilters.endDate));
    setIsPolling(false); clearInterval(pollingIntervalRef.current);
    setAppliedFilters({ startDate: filters.startDate, endDate: filters.endDate });
    latestTimestampRef.current = null;
    fetchTransactions(filters.startDate, filters.endDate);
    setCurrentPage(1);
  };

  const handleClientFilter = (key, value) => {
    setFilters(p => ({ ...p, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    const today = getTodayDate();
    const user  = JSON.parse(localStorage.getItem('user') || '{}');
    cacheManager.invalidate(cacheManager.getCacheKey('ticket', user.id, appliedFilters.startDate, appliedFilters.endDate));
    const reset = { startDate: today, endDate: today, deviceId: 'ALL', depotCode: 'ALL', paymentMode: 'ALL', routeCode: 'ALL' };
    setFilters(reset);
    setAppliedFilters({ startDate: today, endDate: today });
    setDateError('');
    setIsPolling(false); clearInterval(pollingIntervalRef.current);
    latestTimestampRef.current = null;
    fetchTransactions(today, today);
    setCurrentPage(1);
  };

  // Excel export
  const exportToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ticket Data');
    ws.columns = [
      { header: 'Company',         key: 'company_name',          width: 20 },
      { header: 'Palmtec ID',      key: 'palmtec_id',            width: 14 },
      { header: 'Trip No',         key: 'trip_no',               width: 14 },
      { header: 'Schedule No',     key: 'schedule_no',           width: 14 },
      { header: 'Ticket Number',   key: 'ticket_number',         width: 16 },
      { header: 'Unique Code',     key: 'unique_code',           width: 30 },
      { header: 'Date',            key: 'formatted_ticket_date', width: 14 },
      { header: 'Time',            key: 'ticket_time',           width: 12 },
      { header: 'Trip Start Date', key: 'trip_start_date',       width: 16 },
      { header: 'Trip Start Time', key: 'trip_start_time',       width: 16 },
      { header: 'Route Code',      key: 'route_code',            width: 14 },
      { header: 'From Stage',      key: 'from_stage_name',       width: 18 },
      { header: 'To Stage',        key: 'to_stage_name',         width: 18 },
      { header: 'Total Tickets',   key: 'total_tickets',         width: 14 },
      { header: 'Passenger Count', key: 'passenger_count',       width: 14 },
      { header: 'Amount',          key: 'ticket_amount',         width: 14 },
      { header: 'Payment Mode',    key: 'ticket_status',         width: 14 },
      { header: 'Ticket Type',     key: 'ticket_type_display',   width: 14 },
      { header: 'Full Count',      key: 'full_count',            width: 12 },
      { header: 'Half Count',      key: 'half_count',            width: 12 },
      { header: 'ST Count',        key: 'st_count',              width: 12 },
      { header: 'Physical Count',  key: 'phy_count',             width: 14 },
      { header: 'Luggage Count',   key: 'lugg_count',            width: 14 },
      { header: 'Ladies Count',    key: 'ladies_count',          width: 14 },
      { header: 'Senior Count',    key: 'senior_count',          width: 14 },
      { header: 'Full Amount',     key: 'full_total_amount',     width: 14 },
      { header: 'Student Amount',  key: 'st_total_amount',       width: 14 },
      { header: 'Luggage Amount',  key: 'lugg_amount',           width: 14 },
      { header: 'Adjust Amount',   key: 'adjust_amount',         width: 14 },
      { header: 'Warrant Amount',  key: 'warrant_amount',        width: 14 },
      { header: 'Refund Amount',   key: 'refund_amount',         width: 14 },
      { header: 'Transaction ID',  key: 'transaction_id',        width: 22 },
      { header: 'Reference No',    key: 'reference_number',      width: 20 },
      { header: 'BQR Merchant ID', key: 'bqr_merchant_id',       width: 22 },
      { header: 'UPI Verification', key: 'manual_verified_upi',  width: 16 },
      { header: 'Battery %',       key: 'battery_percentage',    width: 12 },
      { header: 'Pass ID',         key: 'pass_id',               width: 18 },
      { header: 'Refund Status',   key: 'refund_status',         width: 14 },
    ];
    filteredData.forEach(t => ws.addRow({
      ...t,
      manual_verified_upi: t.manual_verified_upi === true ? 'Manual' : t.manual_verified_upi === false ? 'Auto' : '',
    }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = await wb.xlsx.writeBuffer();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    link.download = `ticket_data_${getTodayDate()}.xlsx`;
    link.click();
  };

  // Time-ago display
  const [timeAgo, setTimeAgo] = useState('');
  useEffect(() => {
    const tick = () => {
      if (!lastUpdated) return;
      const s = Math.floor((new Date() - lastUpdated) / 1000);
      if (s < 2 && lastUpdateDuration > 0) setTimeAgo(`${Math.round(lastUpdateDuration / 1000)}s ago`);
      else if (s < 10) setTimeAgo('just now');
      else if (s < 60) setTimeAgo(`${s}s ago`);
      else setTimeAgo(`${Math.floor(s / 60)}m ago`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const getPaginationRange = (current, total, win = 5) => {
    const half = Math.floor(win / 2);
    let start = Math.max(1, current - half);
    let end   = Math.min(total, start + win - 1);
    if (end - start < win - 1) start = Math.max(1, end - win + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <div className="text-red-600 font-medium">{error}</div>
          <Button onClick={() => { setError(null); fetchTransactions(getTodayDate(), getTodayDate()); }}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
            <Ticket size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ticket Data</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-slate-500">Real-time ticket transactions</p>
              {lastUpdated && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${isPolling && !pollingPaused && isPageVisible ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                  {isPageVisible ? `Updated ${timeAgo}` : 'Paused (tab inactive)'}
                </div>
              )}
            </div>
          </div>
        </div>
        <Button onClick={exportToExcel} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white shadow-md">
          <Download size={15} /> Download Report
        </Button>
      </div>

      {pollingPaused && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle size={15} className="shrink-0" />
          Date range ended — live updates paused
        </div>
      )}

      {/* KPI grid — featured layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-3">
          <FeaturedKpi
            value={isRefreshing ? '...' : fmt.inr(summary.amount)}
            sub={isRefreshing ? '' : `${summary.tickets} tickets issued`}
          />
        </div>
        <div className="lg:col-span-3">
          <PaymentSplitCard
            upiCount={summary.upiCount}  cashCount={summary.cashCount}
            upiAmt={summary.upiAmt}      cashAmt={summary.cashAmt}
          />
        </div>
        <div className="lg:col-span-6 grid grid-cols-2 gap-4">
          <KpiCard title="UPI Tickets"    value={isRefreshing ? '...' : String(summary.upiCount)}  subtitle={fmt.inr(summary.upiAmt)}  icon={CreditCard} color="#3b82f6" loading={isRefreshing} />
          <KpiCard title="Cash Tickets"   value={isRefreshing ? '...' : String(summary.cashCount)} subtitle={fmt.inr(summary.cashAmt)} icon={Banknote}   color="#f59e0b" loading={isRefreshing} />
          <KpiCard title="Avg per Ticket" value={isRefreshing ? '...' : fmt.inr(summary.amount / Math.max(1, filteredData.length))}    icon={Ticket}     color="#6366f1" loading={isRefreshing} />
          <KpiCard title="Active Devices" value={isRefreshing ? '...' : String(summary.devices)} subtitle="reporting" icon={Cpu}      color="#8b5cf6" loading={isRefreshing} />
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 border-slate-200 shadow-sm rounded-2xl">
        <CardContent className="p-4 md:p-5">
          {dateError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle size={14} className="shrink-0" /> {dateError}
            </div>
          )}
          {hasPendingChanges && !dateError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
              <span className="animate-pulse">●</span>
              Date filters modified — click Apply Filters to refresh data
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {[
              { label: 'Depot Code', key: 'depotCode', options: depotCodes },
            ].map(f => {
              const empty = f.options.length === 0;
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className={`text-xs font-medium ${empty ? 'text-slate-300' : 'text-slate-500'}`}>{f.label}</label>
                  <select
                    disabled={empty}
                    value={filters[f.key]}
                    onChange={e => handleClientFilter(f.key, e.target.value)}
                    className={`h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                      empty
                        ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <option value="ALL">ALL</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            })}
            {[
              { label: 'Start Date', key: 'startDate', type: 'date' },
              { label: 'End Date',   key: 'endDate',   type: 'date' },
            ].map(f => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">{f.label}</label>
                <Input type="date" max={getTodayDate()} value={filters[f.key]}
                  onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))}
                  className="text-sm h-9" />
              </div>
            ))}
            {[
              { label: 'Route Code',    key: 'routeCode',   options: routeCodes },
              { label: 'Palmtec ID',    key: 'deviceId',    options: deviceIds },
              { label: 'Payment Mode',  key: 'paymentMode', options: paymentModes },
            ].map(f => {
              const empty = f.options.length === 0;
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className={`text-xs font-medium ${empty ? 'text-slate-300' : 'text-slate-500'}`}>{f.label}</label>
                  <select
                    disabled={empty}
                    value={filters[f.key]}
                    onChange={e => handleClientFilter(f.key, e.target.value)}
                    className={`h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                      empty
                        ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <option value="ALL">ALL</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end mt-4 gap-2">
            <Button variant="outline" onClick={clearFilters} className="text-slate-600 text-sm h-9">Clear Filters</Button>
            <Button onClick={handleApplyFilters} disabled={!filters.startDate || !filters.endDate}
              className={`text-sm h-9 text-white ${hasPendingChanges ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-800'}`}>
              <RefreshCw size={13} className="mr-1.5" /> Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-400 mb-2 px-1">
        Showing {currentData.length} of {sortedData.length} tickets
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-0 relative">
          {isRefreshing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
              <div className="flex items-center gap-2 text-slate-600 font-medium text-sm">
                <RefreshCw size={16} className="animate-spin" /> Loading data...
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50/60 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold w-12"></th>
                  <SortHead label="Ticket"       sortKey="ticket_number"         currentKey={sortConfig.key} direction={sortConfig.direction} onSort={handleSort} />
                  <SortHead label="Device · Trip" sortKey="palmtec_id"           currentKey={sortConfig.key} direction={sortConfig.direction} onSort={handleSort} />
                  <th className="px-4 py-3 font-semibold">Route Segment</th>
                  <SortHead label="Time"         sortKey="ticket_time"           currentKey={sortConfig.key} direction={sortConfig.direction} onSort={handleSort} />
                  <SortHead label="Pax"          sortKey="total_tickets"         currentKey={sortConfig.key} direction={sortConfig.direction} onSort={handleSort} align="center" />
                  <SortHead label="Amount"       sortKey="ticket_amount"         currentKey={sortConfig.key} direction={sortConfig.direction} onSort={handleSort} align="right" />
                  <th className="px-4 py-3 font-semibold w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isRefreshing && !currentData.length
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {[40,90,90,130,60,50,70,30].map((w, j) => (
                          <td key={j} className="px-4 py-3.5">
                            <div className="h-3 bg-slate-200 rounded-full animate-pulse" style={{ width: w }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : currentData.length
                    ? currentData.map(t => (
                        <TicketRow
                          key={t.id}
                          ticket={t}
                          onView={() => setSelectedTx(t)}
                          isNew={newTicketIds.has(t.id)}
                        />
                      ))
                    : (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center">
                          <Ticket size={28} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-slate-400 text-sm">No tickets found for selected filters</p>
                        </td>
                      </tr>
                    )
                }
              </tbody>
              {currentData.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr className="text-xs">
                    <td className="px-4 py-3"></td>
                    <td colSpan={4} className="px-4 py-3 font-semibold text-slate-600 uppercase tracking-wider">Page total</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-800">
                      {currentData.reduce((s, t) => s + (t.total_tickets || 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      {fmt.inr(currentData.reduce((s, t) => s + Number(t.ticket_amount || 0), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-5">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)}
            disabled={currentPage === 1} className="h-8 px-3 text-xs">Prev</Button>
          {getPaginationRange(currentPage, totalPages).map(p => (
            <Button key={p} size="sm" onClick={() => setCurrentPage(p)}
              className={`h-8 w-8 p-0 text-xs ${currentPage === p
                ? 'bg-slate-900 hover:bg-slate-700 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {p}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)}
            disabled={currentPage === totalPages} className="h-8 px-3 text-xs">Next</Button>
        </div>
      )}

      {/* Detail modal */}
      {selectedTx && (
        <TicketDetailModal ticket={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}
