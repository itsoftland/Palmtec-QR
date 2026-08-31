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
  Route, PlayCircle, CheckCircle2, Users, IndianRupee, CreditCard,
  Download, RefreshCw, AlertCircle, Eye, Bus, IdCard, Ticket, Wallet,
} from 'lucide-react';

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmt = {
  time: (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  },
  date: (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  },
  fullDate: (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  duration: (start, end) => {
    if (!start || !end) return '—';
    const ms = new Date(end) - new Date(start);
    if (ms < 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h ? `${h}h ${m}m` : `${m}m`;
  },
  inr: (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  inrK: (n) => {
    const v = Number(n) || 0;
    if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
    if (v >= 1000)   return `₹${(v / 1000).toFixed(1)}K`;
    return `₹${v.toFixed(0)}`;
  },
};

const getTodayDate = () => new Date().toISOString().split('T')[0];

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const cfg = status === 'closed'
    ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Closed', pulse: false }
    : { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'In Progress', pulse: true };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium px-2.5 py-1 text-xs ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

// ─── Mini stat cell ────────────────────────────────────────────────────────────
function MiniStat({ label, value, color = 'text-slate-800' }) {
  return (
    <div className="text-center px-2">
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${color}`}>{value ?? '—'}</p>
    </div>
  );
}

// ─── Field block (detail modal) ────────────────────────────────────────────────
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

// ─── Trip lifecycle row ────────────────────────────────────────────────────────
function TripRow({ trip, onView, isNew }) {
  const isOpen = trip.status === 'open';
  const upiShare = trip.total_collection ? ((Number(trip.upi_ticket_amount) || 0) / Number(trip.total_collection)) * 100 : 0;

  return (
    <div className={`border border-slate-200 shadow-sm rounded-2xl bg-white overflow-hidden transition-shadow hover:shadow-md ${isNew ? 'ring-2 ring-slate-300' : ''}`}>
      <div className="grid grid-cols-12 gap-4 items-center px-5 py-4">
        {/* Identity */}
        <div className="col-span-3 flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${isOpen ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {isOpen ? <PlayCircle size={18} /> : <CheckCircle2 size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-slate-900">Trip #{trip.trip_no}</span>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-medium text-slate-600">SCH {trip.schedule_no}</span>
              {trip.up_down_trip && (
                <span className={`text-[10px] font-semibold rounded px-1.5 py-px ${
                  trip.up_down_trip === 'Up' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'
                }`}>
                  {trip.up_down_trip}
                </span>
              )}
            </div>
            {trip.route_code && (
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Route size={11} />
                <span className="font-medium text-slate-700">{trip.route_code}</span>
              </div>
            )}
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {trip.palmtec_id}{trip.depot_code ? ` · ${trip.depot_code}` : ''}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="col-span-4">
          <div className="flex items-center gap-2">
            {/* Start */}
            <div className="text-right shrink-0 w-20">
              <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Start</p>
              <p className="text-sm font-bold text-slate-800">{fmt.time(trip.start_datetime)}</p>
              {trip.start_ticket_no && <p className="text-[10px] text-slate-400">#{trip.start_ticket_no}</p>}
            </div>

            {/* Bar */}
            <div className="flex-1">
              <div className="relative h-1.5 rounded-full bg-slate-100 overflow-hidden">
                {isOpen ? (
                  <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-amber-400 to-amber-300 animate-pulse" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400" />
                )}
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />
                {!isOpen && <div className="absolute top-1/2 -translate-y-1/2 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
              </div>
              <p className="text-center text-[10px] mt-1 font-medium text-slate-500">
                {isOpen ? (
                  <span className="text-amber-600 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Running — {fmt.duration(trip.start_datetime, new Date().toISOString())}
                  </span>
                ) : (
                  <span>
                    {fmt.duration(trip.start_datetime, trip.end_datetime)}
                    {trip.total_km ? ` · ${trip.total_km}km` : ''}
                  </span>
                )}
              </p>
            </div>

            {/* End */}
            <div className="text-left shrink-0 w-20">
              {isOpen ? (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">End</p>
                  <p className="text-sm font-medium text-slate-400">In progress</p>
                  <p className="text-[10px] text-slate-300">—</p>
                </>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">End</p>
                  <p className="text-sm font-bold text-slate-800">{fmt.time(trip.end_datetime)}</p>
                  {trip.end_ticket_no && <p className="text-[10px] text-slate-400">#{trip.end_ticket_no}</p>}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div className="col-span-3 flex justify-around items-center border-x border-slate-100">
          <MiniStat label="Tickets"  value={trip.total_tickets} />
          <MiniStat label="Pax"      value={trip.total_passengers} />
          <MiniStat label="UPI"      value={trip.upi_ticket_count} color="text-blue-700" />
        </div>

        {/* Collection + action */}
        <div className="col-span-2 flex items-center justify-end gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Collection</p>
            <p className="text-base font-bold text-slate-900">{fmt.inr(trip.total_collection)}</p>
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <div className="h-1 w-12 rounded-full bg-emerald-100 overflow-hidden">
                {/* UPI SHARE AS NAN IN UI. REQUIRES UI FIX */}
                <div className="h-full bg-blue-500" style={{ width: `${Math.round(upiShare)}%` }} />
              </div>
              <span className="text-[10px] text-slate-500 tabular-nums">{Math.round(upiShare)}%</span>
            </div>
          </div>
          <button
            onClick={onView}
            className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center"
            title="View details"
          >
            <Eye size={15} />
          </button>
        </div>
      </div>

      {/* Crew strip */}
      <div className="flex items-center gap-5 px-5 py-2.5 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-500 flex-wrap">
        {trip.bus_no && (
          <span className="flex items-center gap-1.5">
            <Bus size={11} className="text-slate-400" />
            <span className="font-mono text-slate-700">{trip.bus_no}</span>
          </span>
        )}
        {trip.driver && (
          <span className="flex items-center gap-1.5">
            <IdCard size={11} className="text-slate-400" />
            Driver: <span className="text-slate-700 font-medium ml-1">{trip.driver}</span>
          </span>
        )}
        {trip.conductor && (
          <span className="flex items-center gap-1.5">
            <Ticket size={11} className="text-slate-400" />
            Conductor: <span className="text-slate-700 font-medium ml-1">{trip.conductor}</span>
          </span>
        )}
        {!isOpen && trip.expense_amount && Number(trip.expense_amount) > 0 && (
          <span className="flex items-center gap-1.5 ml-auto">
            <Wallet size={11} className="text-slate-400" />
            Expense <span className="text-slate-700 font-medium ml-1">{fmt.inr(trip.expense_amount)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Trip detail modal ─────────────────────────────────────────────────────────
function TripDetailModal({ trip, onClose }) {
  const isOpen = trip.status === 'open';
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[85vh] overflow-y-auto">
        <span tabIndex={0} className="sr-only" />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Route size={16} className="text-slate-600" />
            Trip #{trip.trip_no} · Schedule {trip.schedule_no}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Lifecycle banner */}
          <div className={`rounded-xl border ${isOpen ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/40'} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <StatusPill status={trip.status} />
              <span className="text-xs text-slate-500">
                {trip.route_code}{trip.up_down_trip ? ` · ${trip.up_down_trip}` : ''}{trip.depot_code ? ` · ${trip.depot_code}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">Trip Started</p>
                <p className="text-lg font-bold text-slate-900">{fmt.time(trip.start_datetime)}</p>
                <p className="text-xs text-slate-500">{fmt.fullDate(trip.start_datetime)}</p>
                {trip.start_ticket_no && <p className="text-[11px] text-slate-400 mt-0.5">Start ticket #{trip.start_ticket_no}</p>}
                {trip.battery_percentage != null && <p className="text-[11px] text-slate-400 mt-0.5">Battery {trip.battery_percentage}%</p>}
              </div>
              <div className="text-center">
                <div className="relative h-2 rounded-full bg-white overflow-hidden shadow-inner">
                  {isOpen ? (
                    <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-amber-400 to-amber-300 animate-pulse" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400" />
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-700 mt-2">
                  {isOpen
                    ? `Running — ${fmt.duration(trip.start_datetime, new Date().toISOString())}`
                    : fmt.duration(trip.start_datetime, trip.end_datetime)}
                </p>
                {!isOpen && (
                  <p className="text-[11px] text-slate-500">
                    {trip.total_km ? `${trip.total_km} km` : ''}
                    {trip.end_ticket_no && trip.start_ticket_no ? ` · ${trip.end_ticket_no - trip.start_ticket_no} tickets issued` : ''}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${isOpen ? 'text-slate-400' : 'text-emerald-700'}`}>
                  Trip {isOpen ? 'Ongoing' : 'Closed'}
                </p>
                {isOpen ? (
                  <p className="text-lg font-bold text-slate-300 italic">— pending —</p>
                ) : (
                  <>
                    <p className="text-lg font-bold text-slate-900">{fmt.time(trip.end_datetime)}</p>
                    <p className="text-xs text-slate-500">{fmt.fullDate(trip.end_datetime)}</p>
                    {trip.end_ticket_no && <p className="text-[11px] text-slate-400 mt-0.5">End ticket #{trip.end_ticket_no}</p>}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Identity */}
          <FieldGroup title="Identity" columns={3}>
            <FieldBlock label="Company"          value={trip.company_name} />
            <FieldBlock label="Open Unique Code"  value={trip.open_unique_code  || '—'} />
            <FieldBlock label="Close Unique Code" value={trip.close_unique_code || '—'} />
          </FieldGroup>

          {/* Ghost / auto-opened warning */}
          {trip.auto_opened && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 flex items-start gap-2">
              <span className="font-semibold shrink-0">⚠ Auto-opened:</span>
              <span>{trip.ghost_note || 'Open signal was missed; record created from close signal.'}</span>
            </div>
          )}

          {/* Schedule reference */}
          <FieldGroup title="Schedule" columns={3}>
            <FieldBlock label="Schedule No"        value={trip.schedule_no} />
            <FieldBlock label="Schedule Start Date" value={trip.schedule_start_date || '—'} />
            <FieldBlock label="Schedule Start Time" value={trip.schedule_start_time || '—'} />
          </FieldGroup>

          {/* Vehicle & Crew */}
          <FieldGroup title="Vehicle & Crew" columns={2}>
            <FieldBlock label="Palmtec Device" value={trip.palmtec_id} />
            <FieldBlock label="Bus No"         value={trip.bus_no} />
            <FieldBlock label="Driver"         value={trip.driver} />
            <FieldBlock label="Conductor"      value={trip.conductor} />
          </FieldGroup>

          {/* Passenger breakdown */}
          <FieldGroup title="Passenger Breakdown" columns={4}>
            <FieldBlock label="Full"     value={trip.full_count} />
            <FieldBlock label="Half"     value={trip.half_count} />
            <FieldBlock label="Student"  value={trip.st_count} />
            <FieldBlock label="Luggage"  value={trip.luggage_count} />
            <FieldBlock label="Physical" value={trip.physical_count} />
            <FieldBlock label="Pass"     value={trip.pass_count} />
            <FieldBlock label="Ladies"   value={trip.ladies_count} />
            <FieldBlock label="Senior"   value={trip.senior_count} />
          </FieldGroup>

          {/* Collection breakdown — only for closed trips */}
          {!isOpen && (
            <FieldGroup title="Collection Breakdown" columns={3}>
              <FieldBlock label="Full"     value={fmt.inr(trip.full_collection)} />
              <FieldBlock label="Half"     value={fmt.inr(trip.half_collection)} />
              <FieldBlock label="Student"  value={fmt.inr(trip.st_collection)} />
              <FieldBlock label="Luggage"  value={fmt.inr(trip.luggage_collection)} />
              <FieldBlock label="Physical" value={fmt.inr(trip.physical_collection)} />
              <FieldBlock label="Ladies"   value={fmt.inr(trip.ladies_collection)} />
              <FieldBlock label="Senior"   value={fmt.inr(trip.senior_collection)} />
              <FieldBlock label="Adjust"   value={fmt.inr(trip.adjust_collection)} />
              <FieldBlock label="Expense"  value={fmt.inr(trip.expense_amount)} />
            </FieldGroup>
          )}

          {/* Financial summary */}
          <div className="grid grid-cols-3 gap-3">
            <FieldBlock label="UPI Amount"       value={fmt.inr(trip.upi_ticket_amount)} accent="blue" />
            <FieldBlock label="Cash Amount"      value={fmt.inr(trip.total_cash_amount)}  accent="emerald" />
            <FieldBlock label="Total Collection" value={fmt.inr(trip.total_collection)}   accent="slate" />
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button onClick={onClose} variant="outline" className="text-slate-600">Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function TripDataPage() {
  const [tripData,          setTripData]          = useState([]);
  const [isRefreshing,      setIsRefreshing]      = useState(false);
  const [error,             setError]             = useState(null);
  const [dateError,         setDateError]         = useState('');
  const [lastUpdated,       setLastUpdated]       = useState(null);
  const [lastUpdateDuration,setLastUpdateDuration]= useState(0);
  const [isPolling,         setIsPolling]         = useState(false);
  const [pollingPaused,     setPollingPaused]     = useState(false);
  const [newTripIds,        setNewTripIds]        = useState(new Set());
  const [isPageVisible,     setIsPageVisible]     = useState(true);

  const [filters, setFilters] = useState({
    startDate: '', endDate: '',
    palmtecId: 'ALL', routeCode: 'ALL', depotCode: 'ALL', status: 'ALL', tripNo: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: '', endDate: '' });
  const [currentPage,  setCurrentPage]  = useState(1);
  const [itemsPerPage] = useState(8);
  const [selectedTrip, setSelectedTrip] = useState(null);

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
    const cached = cacheManager.getDateRange('trip', userId);
    const startDate = cached?.fromDate || getTodayDate();
    const endDate   = cached?.toDate   || getTodayDate();

    setFilters(p => ({ ...p, startDate, endDate }));
    setAppliedFilters({ startDate, endDate });

    const cacheKey = cacheManager.getCacheKey('trip', userId, startDate, endDate);
    const cachedData = cacheManager.get(cacheKey);
    if (cachedData) {
      setTripData(cachedData);
      latestTimestampRef.current = getMaxUpdatedAt(cachedData);
      setIsPolling(true);
      setLastUpdated(new Date());
    } else {
      fetchTripData(startDate, endDate);
    }
  }, []);

  // Polling
  useEffect(() => {
    if (isPolling && !pollingPaused && isPageVisible && appliedFilters.startDate && appliedFilters.endDate) {
      pollingIntervalRef.current = setInterval(pollForUpdates, 8000);
      return () => clearInterval(pollingIntervalRef.current);
    }
    clearInterval(pollingIntervalRef.current);
  }, [isPolling, pollingPaused, isPageVisible, appliedFilters.startDate, appliedFilters.endDate]);

  // Pause polling when date range has passed
  useEffect(() => {
    if (isDateRangeEnded()) { setPollingPaused(true); setIsPolling(false); }
    else setPollingPaused(false);
  }, [appliedFilters.endDate]);

  const getMaxUpdatedAt = (data) => {
    if (!data.length) return null;
    return data.reduce((max, t) => (t.updated_at > max ? t.updated_at : max), data[0].updated_at);
  };

  const fetchTripData = async (startDate, endDate, sinceTimestamp = null) => {
    try {
      if (!sinceTimestamp) setIsRefreshing(true);
      const t0 = Date.now();
      let url = `${BASE_URL}/get_all_trip_data?from_date=${startDate}&to_date=${endDate}`;
      if (sinceTimestamp) url += `&since=${encodeURIComponent(sinceTimestamp)}`;

      const response = await api.get(url);
      const duration = Date.now() - t0;

      if (response.data.message === 'success') {
        if (sinceTimestamp) {
          const incoming = response.data.data || [];
          if (incoming.length > 0) {
            setTripData(prev => {
              const byId = new Map(prev.map(t => [t.id, t]));
              const brandNew = [];
              incoming.forEach(t => {
                if (!byId.has(t.id)) brandNew.push(t);
                byId.set(t.id, t);
              });
              const merged = prev.map(t => byId.get(t.id));
              return brandNew.length > 0 ? [...brandNew, ...merged] : merged;
            });

            const maxTs = getMaxUpdatedAt(incoming);
            if (maxTs && (!latestTimestampRef.current || maxTs > latestTimestampRef.current)) {
              latestTimestampRef.current = maxTs;
            }

            const newIds = new Set(incoming.map(t => t.id));
            setNewTripIds(newIds);
            setTimeout(() => setNewTripIds(new Set()), 2500);
          }
          setLastUpdated(new Date());
          setLastUpdateDuration(duration);
        } else {
          const data = response.data.data || [];
          setTripData(data);

          const user = JSON.parse(localStorage.getItem('user') || '{}');
          const cacheKey = cacheManager.getCacheKey('trip', user.id, startDate, endDate);
          cacheManager.set(cacheKey, data);
          cacheManager.setDateRange('trip', user.id, startDate, endDate);

          latestTimestampRef.current = getMaxUpdatedAt(data);
          setIsPolling(true);
          setLastUpdated(new Date());
          setLastUpdateDuration(duration);
        }
        setError(null); setDateError('');
      } else {
        setError('Failed to fetch trip data');
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

  const pollForUpdates = async () => {
    if (isDateRangeEnded()) { setPollingPaused(true); setIsPolling(false); return; }
    try {
      await fetchTripData(appliedFilters.startDate, appliedFilters.endDate, latestTimestampRef.current || null);
    } catch (err) {
      console.error('Trip polling error:', err);
    }
  };

  // Dynamic dropdown options derived from loaded data
  const palmtecIds = [...new Set(tripData.map(t => t.palmtec_id).filter(Boolean))].sort();
  const routeCodes  = [...new Set(tripData.map(t => t.route_code).filter(Boolean))].sort();
  const depotCodes  = [...new Set(tripData.map(t => t.depot_code).filter(Boolean))].sort();

  // Client-side filtering
  const filteredData = tripData.filter(t => {
    if (filters.palmtecId !== 'ALL' && t.palmtec_id !== filters.palmtecId) return false;
    if (filters.routeCode  !== 'ALL' && t.route_code  !== filters.routeCode)  return false;
    if (filters.depotCode  !== 'ALL' && t.depot_code  !== filters.depotCode)  return false;
    if (filters.status     !== 'ALL' && t.status      !== filters.status)     return false;
    if (filters.tripNo && !String(t.trip_no).includes(filters.tripNo))        return false;
    return true;
  });

  // Summary KPIs
  const summary = {
    total:      filteredData.length,
    open:       filteredData.filter(t => t.status === 'open').length,
    closed:     filteredData.filter(t => t.status === 'closed').length,
    passengers: filteredData.reduce((s, t) => s + (t.total_passengers || 0), 0),
    collection: filteredData.reduce((s, t) => s + Number(t.total_collection || 0), 0),
    upi:        filteredData.reduce((s, t) => s + Number(t.upi_ticket_amount || 0), 0),
  };

  // Pagination
  const totalPages  = Math.ceil(filteredData.length / itemsPerPage);
  const currentData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Filter handlers
  const handleApplyFilters = () => {
    if (filters.endDate < filters.startDate) { setDateError('End date cannot be before start date'); return; }
    setDateError('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    cacheManager.invalidate(cacheManager.getCacheKey('trip', user.id, appliedFilters.startDate, appliedFilters.endDate));
    setIsPolling(false); clearInterval(pollingIntervalRef.current);
    setAppliedFilters({ startDate: filters.startDate, endDate: filters.endDate });
    latestTimestampRef.current = null;
    fetchTripData(filters.startDate, filters.endDate);
    setCurrentPage(1);
  };

  const handleClientFilter = (key, value) => {
    setFilters(p => ({ ...p, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    const today = getTodayDate();
    const user  = JSON.parse(localStorage.getItem('user') || '{}');
    cacheManager.invalidate(cacheManager.getCacheKey('trip', user.id, appliedFilters.startDate, appliedFilters.endDate));
    const reset = { startDate: today, endDate: today, palmtecId: 'ALL', routeCode: 'ALL', depotCode: 'ALL', status: 'ALL', tripNo: '' };
    setFilters(reset);
    setAppliedFilters({ startDate: today, endDate: today });
    setDateError('');
    setIsPolling(false); clearInterval(pollingIntervalRef.current);
    latestTimestampRef.current = null;
    fetchTripData(today, today);
    setCurrentPage(1);
  };

  // Excel export
  const exportToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Trip Data');
    ws.columns = [
      { header: 'Company',           key: 'company_name',         width: 20 },
      { header: 'Palmtec ID',        key: 'palmtec_id',           width: 14 },
      { header: 'Depot Code',        key: 'depot_code',           width: 14 },
      { header: 'Route',             key: 'route_code',           width: 14 },
      { header: 'Schedule No',       key: 'schedule_no',          width: 14 },
      { header: 'Trip No',           key: 'trip_no',              width: 10 },
      { header: 'Direction',         key: 'up_down_trip',         width: 12 },
      { header: 'Status',            key: 'status',               width: 12 },
      { header: 'Auto Opened',       key: 'auto_opened',          width: 12 },
      { header: 'Bus No',            key: 'bus_no',               width: 16 },
      { header: 'Driver',            key: 'driver',               width: 18 },
      { header: 'Conductor',         key: 'conductor',            width: 18 },
      { header: 'Battery %',         key: 'battery_percentage',   width: 12 },
      { header: 'Start DateTime',    key: 'start_datetime',       width: 20 },
      { header: 'End DateTime',      key: 'end_datetime',         width: 20 },
      { header: 'Start Ticket No',   key: 'start_ticket_no',      width: 16 },
      { header: 'End Ticket No',     key: 'end_ticket_no',        width: 14 },
      { header: 'Total KM',          key: 'total_km',             width: 12 },
      { header: 'Total Tickets',     key: 'total_tickets',        width: 14 },
      { header: 'Total Passengers',  key: 'total_passengers',     width: 16 },
      { header: 'UPI Tickets',       key: 'upi_ticket_count',     width: 14 },
      { header: 'Cash Tickets',      key: 'total_cash_tickets',   width: 14 },
      { header: 'UPI Amount',        key: 'upi_ticket_amount',    width: 14 },
      { header: 'Cash Amount',       key: 'total_cash_amount',    width: 14 },
      { header: 'Expense Amount',    key: 'expense_amount',       width: 14 },
      { header: 'Total Collection',  key: 'total_collection',     width: 16 },
      { header: 'Open Unique Code',  key: 'open_unique_code',     width: 32 },
      { header: 'Close Unique Code', key: 'close_unique_code',    width: 32 },
    ];
    filteredData.forEach(t => {
      ws.addRow({
        ...t,
        start_datetime: t.start_datetime ? new Date(t.start_datetime).toLocaleString() : '—',
        end_datetime:   t.end_datetime   ? new Date(t.end_datetime).toLocaleString()   : '—',
      });
    });
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = await wb.xlsx.writeBuffer();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    link.download = `trip_data_${getTodayDate()}.xlsx`;
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

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <div className="text-red-600 font-medium">{error}</div>
          <Button onClick={() => { setError(null); fetchTripData(getTodayDate(), getTodayDate()); }}
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
            <Route size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Trip Data</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-slate-500">Trip lifecycle — start to close</p>
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

      {/* Polling paused banner */}
      {pollingPaused && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle size={15} className="shrink-0" />
          Date range ended — live updates paused
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard title="Total Trips"   value={isRefreshing ? '...' : String(summary.total)}      icon={Route}        color="#475569" loading={isRefreshing} />
        <KpiCard title="In Progress"   value={isRefreshing ? '...' : String(summary.open)}       icon={PlayCircle}   color="#f59e0b" subtitle="running now" loading={isRefreshing} />
        <KpiCard title="Closed"        value={isRefreshing ? '...' : String(summary.closed)}     icon={CheckCircle2} color="#10b981" loading={isRefreshing} />
        <KpiCard title="Passengers"    value={isRefreshing ? '...' : String(summary.passengers)} icon={Users}        color="#8b5cf6" loading={isRefreshing} />
        <KpiCard title="Collection"    value={isRefreshing ? '...' : fmt.inrK(summary.collection)} icon={IndianRupee} color="#059669" loading={isRefreshing} />
        <KpiCard title="UPI Share"     value={isRefreshing ? '...' : fmt.inrK(summary.upi)}      icon={CreditCard}   color="#3b82f6"
          subtitle={summary.collection > 0 ? `${Math.round(summary.upi / summary.collection * 100)}% of total` : ''}
          loading={isRefreshing} />
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
          {/* Filters: Depot Code, Start Date, End Date, Route Code, Palmtec ID, Status, Trip No */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="flex flex-col gap-1">
              <label className={`text-xs font-medium ${depotCodes.length === 0 ? 'text-slate-300' : 'text-slate-500'}`}>Depot Code</label>
              <select
                disabled={depotCodes.length === 0}
                value={filters.depotCode}
                onChange={e => handleClientFilter('depotCode', e.target.value)}
                className={`h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                  depotCodes.length === 0
                    ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="ALL">ALL</option>
                {depotCodes.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Start Date</label>
              <Input type="date" max={getTodayDate()} value={filters.startDate}
                onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))}
                className="text-sm h-9" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">End Date</label>
              <Input type="date" max={getTodayDate()} value={filters.endDate}
                onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))}
                className="text-sm h-9" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={`text-xs font-medium ${routeCodes.length === 0 ? 'text-slate-300' : 'text-slate-500'}`}>Route Code</label>
              <select
                disabled={routeCodes.length === 0}
                value={filters.routeCode}
                onChange={e => handleClientFilter('routeCode', e.target.value)}
                className={`h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                  routeCodes.length === 0
                    ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="ALL">ALL</option>
                {routeCodes.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={`text-xs font-medium ${palmtecIds.length === 0 ? 'text-slate-300' : 'text-slate-500'}`}>Palmtec ID</label>
              <select
                disabled={palmtecIds.length === 0}
                value={filters.palmtecId}
                onChange={e => handleClientFilter('palmtecId', e.target.value)}
                className={`h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                  palmtecIds.length === 0
                    ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <option value="ALL">ALL</option>
                {palmtecIds.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select value={filters.status} onChange={e => handleClientFilter('status', e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400">
                <option value="ALL">ALL</option>
                <option value="open">In Progress</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Trip No</label>
              <Input type="text" placeholder="Search..." value={filters.tripNo}
                onChange={e => handleClientFilter('tripNo', e.target.value)}
                className="text-sm h-9" />
            </div>
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

      {/* Status legend + count */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs text-slate-400">Showing {currentData.length} of {filteredData.length} trips</p>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> In progress
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Closed
          </span>
        </div>
      </div>

      {/* Loading overlay wrapper */}
      <div className="relative">
        {isRefreshing && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
            <div className="flex items-center gap-2 text-slate-600 font-medium text-sm">
              <RefreshCw size={16} className="animate-spin" /> Loading data...
            </div>
          </div>
        )}

        {/* Trip rows */}
        <div className="space-y-3">
          {isRefreshing && !currentData.length
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-slate-200 rounded-2xl bg-white p-5 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              ))
            : currentData.length
              ? currentData.map(trip => (
                  <TripRow
                    key={trip.id}
                    trip={trip}
                    onView={() => setSelectedTrip(trip)}
                    isNew={newTripIds.has(trip.id)}
                  />
                ))
              : (
                <div className="border border-slate-200 shadow-sm rounded-2xl bg-white py-14 text-center">
                  <Route size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400 text-sm">No trips found for selected filters</p>
                </div>
              )
          }
        </div>
      </div>

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
      {selectedTrip && (
        <TripDetailModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
      )}
    </div>
  );
}
