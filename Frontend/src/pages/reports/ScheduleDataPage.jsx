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
  CalendarCog, Activity, CheckCircle2, Route, Ticket, IndianRupee,
  Download, RefreshCw, AlertCircle, Eye, Bus, IdCard, Battery,
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
    ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Closed',    pulse: false }
    : { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'Active',    pulse: true  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium px-2.5 py-1 text-xs ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

// ─── Battery bar ──────────────────────────────────────────────────────────────
function BatteryBar({ pct, label }) {
  const p = parseInt(pct, 10) || 0;
  const color = p > 60 ? 'bg-emerald-500' : p > 25 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative w-7 h-3.5 border border-slate-300 rounded-sm">
        <div
          className={`absolute inset-0.5 ${color} rounded-[1px]`}
          style={{ width: `${Math.max(8, p * 0.85)}%` }}
        />
        <div className="absolute -right-0.5 top-1 w-0.5 h-1.5 bg-slate-300 rounded-r" />
      </div>
      <span className="text-[10px] text-slate-500 tabular-nums">{label}: {pct ?? '—'}%</span>
    </div>
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

// ─── Field block ──────────────────────────────────────────────────────────────
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

// ─── Schedule lifecycle row ───────────────────────────────────────────────────
function ScheduleRow({ schedule: s, onView, isNew }) {
  const isOpen = s.status === 'open';

  return (
    <div className={`border border-slate-200 shadow-sm rounded-2xl bg-white overflow-hidden transition-shadow hover:shadow-md ${isNew ? 'ring-2 ring-slate-300' : ''}`}>
      <div className="grid grid-cols-12 gap-4 items-center px-5 py-4">
        {/* Identity */}
        <div className="col-span-3 flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${isOpen ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <CalendarCog size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-slate-900">Schedule {s.schedule_no}</span>
              <StatusPill status={s.status} />
            </div>
            {s.route_code && (
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Route size={11} />
                <span className="font-medium text-slate-700">{s.route_code}</span>
              </div>
            )}
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {s.palmtec_id}{s.depot_code ? ` · ${s.depot_code}` : ''}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="col-span-4">
          <div className="flex items-center gap-2">
            {/* Login */}
            <div className="text-right shrink-0 w-24">
              <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Logged In</p>
              <p className="text-sm font-bold text-slate-800">{fmt.time(s.start_datetime)}</p>
              <p className="text-[10px] text-slate-400">{fmt.date(s.start_datetime)}</p>
            </div>

            {/* Bar */}
            <div className="flex-1">
              <div className="relative h-1.5 rounded-full bg-slate-100 overflow-hidden">
                {isOpen ? (
                  <div className="absolute inset-y-0 left-0 w-3/4 bg-gradient-to-r from-amber-400 to-amber-300 animate-pulse" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400" />
                )}
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white" />
                {!isOpen && <div className="absolute top-1/2 -translate-y-1/2 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
              </div>
              <div className="flex items-center justify-center gap-3 mt-1.5">
                <span className="text-[10px] font-medium text-slate-500">
                  {isOpen ? (
                    <span className="text-amber-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Active — {fmt.duration(s.start_datetime, new Date().toISOString())}
                    </span>
                  ) : (
                    `${fmt.duration(s.start_datetime, s.end_datetime)} · ${s.trips_count ?? 0} trips`
                  )}
                </span>
                <BatteryBar pct={s.battery_end} label={isOpen ? 'Now' : 'End'} />
              </div>
            </div>

            {/* Logout */}
            <div className="text-left shrink-0 w-24">
              {isOpen ? (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Logout</p>
                  <p className="text-sm font-medium text-slate-400">Pending</p>
                  <p className="text-[10px] text-slate-300">—</p>
                </>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">Logged Out</p>
                  <p className="text-sm font-bold text-slate-800">{fmt.time(s.end_datetime)}</p>
                  <p className="text-[10px] text-slate-400">{fmt.date(s.end_datetime)}</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div className="col-span-3 flex justify-around items-center border-x border-slate-100">
          <MiniStat label="Trips"   value={s.trips_count} />
          <MiniStat label="Tickets" value={s.total_tickets} />
          <MiniStat label="UPI"     value={fmt.inrK(s.upi_total_collection)} color="text-blue-700" />
        </div>

        {/* Collection + action */}
        <div className="col-span-2 flex items-center justify-end gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Collection</p>
            <p className="text-base font-bold text-slate-900">{fmt.inr(s.total_collection)}</p>
            <p className="text-[10px] text-slate-500">
              avg {fmt.inr(Number(s.total_collection || 0) / Math.max(1, s.trips_count || 1))}/trip
            </p>
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
        {s.bus_no && (
          <span className="flex items-center gap-1.5">
            <Bus size={11} className="text-slate-400" />
            <span className="font-mono text-slate-700">{s.bus_no}</span>
          </span>
        )}
        {s.driver && (
          <span className="flex items-center gap-1.5">
            <IdCard size={11} className="text-slate-400" />
            Driver: <span className="text-slate-700 font-medium ml-1">{s.driver}</span>
          </span>
        )}
        {s.conductor && (
          <span className="flex items-center gap-1.5">
            <Ticket size={11} className="text-slate-400" />
            Conductor: <span className="text-slate-700 font-medium ml-1">{s.conductor}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5 ml-auto">
          <Battery size={11} className="text-slate-400" />
          Start <span className="font-medium text-slate-700 mx-1">{s.battery_start ?? '—'}%</span>
          → End <span className="font-medium text-slate-700 ml-1">{s.battery_end ?? '—'}%</span>
        </span>
      </div>
    </div>
  );
}

// ─── Schedule detail modal ────────────────────────────────────────────────────
function ScheduleDetailModal({ schedule: s, onClose }) {
  const isOpen = s.status === 'open';
  const cashCollection = Number(s.total_collection || 0) - Number(s.upi_total_collection || 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[85vh] overflow-y-auto">
        <span tabIndex={0} className="sr-only" />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <CalendarCog size={16} className="text-slate-600" />
            Schedule {s.schedule_no}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Lifecycle banner */}
          <div className={`rounded-xl border ${isOpen ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/40'} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <StatusPill status={s.status} />
              <span className="text-xs text-slate-500">
                {s.route_code}{s.depot_code ? ` · ${s.depot_code}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">Schedule Opened</p>
                <p className="text-lg font-bold text-slate-900">{fmt.time(s.start_datetime)}</p>
                <p className="text-xs text-slate-500">{fmt.fullDate(s.start_datetime)}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Battery <span className="font-medium">{s.battery_start ?? '—'}%</span>
                </p>
              </div>
              <div className="text-center">
                <div className="relative h-2 rounded-full bg-white overflow-hidden shadow-inner">
                  {isOpen ? (
                    <div className="absolute inset-y-0 left-0 w-3/4 bg-gradient-to-r from-amber-400 to-amber-300 animate-pulse" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400" />
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-700 mt-2">
                  {isOpen
                    ? `Active — ${fmt.duration(s.start_datetime, new Date().toISOString())}`
                    : fmt.duration(s.start_datetime, s.end_datetime)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {s.trips_count ?? 0} trips · {s.total_tickets ?? 0} tickets
                </p>
              </div>
              <div className="text-right">
                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${isOpen ? 'text-slate-400' : 'text-emerald-700'}`}>
                  {isOpen ? 'Schedule Closes' : 'Schedule Closed'}
                </p>
                {isOpen ? (
                  <p className="text-lg font-bold text-slate-300 italic">— pending —</p>
                ) : (
                  <>
                    <p className="text-lg font-bold text-slate-900">{fmt.time(s.end_datetime)}</p>
                    <p className="text-xs text-slate-500">{fmt.fullDate(s.end_datetime)}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Battery <span className="font-medium">{s.battery_end ?? '—'}%</span>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Identity */}
          <FieldGroup title="Identity" columns={3}>
            <FieldBlock label="Company"          value={s.company_name} />
            <FieldBlock label="Open Unique Code"  value={s.open_unique_code  || '—'} />
            <FieldBlock label="Close Unique Code" value={s.close_unique_code || '—'} />
          </FieldGroup>

          {/* Ghost / auto-opened warning */}
          {s.auto_opened && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 flex items-start gap-2">
              <span className="font-semibold shrink-0">⚠ Auto-opened:</span>
              <span>{s.ghost_note || 'Open signal was missed; record created from close signal.'}</span>
            </div>
          )}

          {/* Vehicle & Crew */}
          <FieldGroup title="Vehicle & Crew" columns={2}>
            <FieldBlock label="Palmtec Device" value={s.palmtec_id} />
            <FieldBlock label="Bus No"         value={s.bus_no} />
            <FieldBlock label="Driver"         value={s.driver} />
            <FieldBlock label="Conductor"      value={s.conductor} />
          </FieldGroup>

          {/* Passenger breakdown */}
          <FieldGroup title="Passenger Breakdown (Cash)" columns={4}>
            <FieldBlock label="Full"     value={s.full_count} />
            <FieldBlock label="Half"     value={s.half_count} />
            <FieldBlock label="Student"  value={s.st_count} />
            <FieldBlock label="Luggage"  value={s.luggage_count} />
            <FieldBlock label="Physical" value={s.physical_count} />
            <FieldBlock label="Ladies"   value={s.ladies_count} />
            <FieldBlock label="Senior"   value={s.senior_count} />
            <FieldBlock label="Adjust"   value={s.adjust_count} />
          </FieldGroup>

          {/* UPI Passenger breakdown */}
          {!!(s.upi_full_count || s.upi_half_count || s.upi_physical_count || s.upi_ladies_count || s.upi_senior_count || s.upi_luggage_count || s.upi_st_count) && (
            <FieldGroup title="Passenger Breakdown (UPI)" columns={4}>
              <FieldBlock label="Full"     value={s.upi_full_count} />
              <FieldBlock label="Half"     value={s.upi_half_count} />
              <FieldBlock label="Student"  value={s.upi_st_count} />
              <FieldBlock label="Luggage"  value={s.upi_luggage_count} />
              <FieldBlock label="Physical" value={s.upi_physical_count} />
              <FieldBlock label="Ladies"   value={s.upi_ladies_count} />
              <FieldBlock label="Senior"   value={s.upi_senior_count} />
            </FieldGroup>
          )}

          {/* Collection breakdown */}
          <FieldGroup title="Collection Breakdown" columns={3}>
            <FieldBlock label="Full"     value={fmt.inr(s.full_collection)} />
            <FieldBlock label="Half"     value={fmt.inr(s.half_collection)} />
            <FieldBlock label="Student"  value={fmt.inr(s.st_collection)} />
            <FieldBlock label="Luggage"  value={fmt.inr(s.luggage_collection)} />
            <FieldBlock label="Physical" value={fmt.inr(s.physical_collection)} />
            <FieldBlock label="Ladies"   value={fmt.inr(s.ladies_collection)} />
            <FieldBlock label="Senior"   value={fmt.inr(s.senior_collection)} />
            <FieldBlock label="Adjust"   value={fmt.inr(s.adjust_collection)} />
          </FieldGroup>

          {/* Financial summary */}
          <div className="grid grid-cols-3 gap-3">
            <FieldBlock label="UPI Collection"  value={fmt.inr(s.upi_total_collection)} accent="blue" />
            <FieldBlock label="Cash Collection" value={fmt.inr(cashCollection)}          accent="emerald" />
            <FieldBlock label="Total"           value={fmt.inr(s.total_collection)}      accent="slate" />
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
export default function ScheduleDataPage() {
  const [scheduleData,       setScheduleData]       = useState([]);
  const [isRefreshing,       setIsRefreshing]       = useState(false);
  const [error,              setError]              = useState(null);
  const [dateError,          setDateError]          = useState('');
  const [lastUpdated,        setLastUpdated]        = useState(null);
  const [lastUpdateDuration, setLastUpdateDuration] = useState(0);
  const [isPolling,          setIsPolling]          = useState(false);
  const [pollingPaused,      setPollingPaused]      = useState(false);
  const [newScheduleIds,     setNewScheduleIds]     = useState(new Set());
  const [isPageVisible,      setIsPageVisible]      = useState(true);

  const [filters, setFilters] = useState({
    startDate: '', endDate: '',
    palmtecId: 'ALL', depotCode: 'ALL', routeCode: 'ALL', status: 'ALL', scheduleNo: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: '', endDate: '' });
  const [currentPage,      setCurrentPage]      = useState(1);
  const [itemsPerPage]                          = useState(8);
  const [selectedSchedule, setSelectedSchedule] = useState(null);

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

  useEffect(() => {
    const handler = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user.id;
    const cached = cacheManager.getDateRange('schedule', userId);
    const startDate = cached?.fromDate || getTodayDate();
    const endDate   = cached?.toDate   || getTodayDate();

    setFilters(p => ({ ...p, startDate, endDate }));
    setAppliedFilters({ startDate, endDate });

    const cacheKey = cacheManager.getCacheKey('schedule', userId, startDate, endDate);
    const cachedData = cacheManager.get(cacheKey);
    if (cachedData) {
      setScheduleData(cachedData);
      latestTimestampRef.current = getMaxUpdatedAt(cachedData);
      setIsPolling(true);
      setLastUpdated(new Date());
    } else {
      fetchScheduleData(startDate, endDate);
    }
  }, []);

  useEffect(() => {
    if (isPolling && !pollingPaused && isPageVisible && appliedFilters.startDate && appliedFilters.endDate) {
      pollingIntervalRef.current = setInterval(pollForUpdates, 8000);
      return () => clearInterval(pollingIntervalRef.current);
    }
    clearInterval(pollingIntervalRef.current);
  }, [isPolling, pollingPaused, isPageVisible, appliedFilters.startDate, appliedFilters.endDate]);

  useEffect(() => {
    if (isDateRangeEnded()) { setPollingPaused(true); setIsPolling(false); }
    else setPollingPaused(false);
  }, [appliedFilters.endDate]);

  const getMaxUpdatedAt = (data) => {
    if (!data.length) return null;
    return data.reduce((max, s) => (s.updated_at > max ? s.updated_at : max), data[0].updated_at);
  };

  const fetchScheduleData = async (startDate, endDate, sinceTimestamp = null) => {
    try {
      if (!sinceTimestamp) setIsRefreshing(true);
      const t0 = Date.now();
      let url = `${BASE_URL}/get_all_schedule_data?from_date=${startDate}&to_date=${endDate}`;
      if (sinceTimestamp) url += `&since=${encodeURIComponent(sinceTimestamp)}`;

      const response = await api.get(url);
      const duration = Date.now() - t0;

      if (response.data.message === 'success') {
        if (sinceTimestamp) {
          const incoming = response.data.data || [];
          if (incoming.length > 0) {
            setScheduleData(prev => {
              const byId = new Map(prev.map(s => [s.id, s]));
              const brandNew = [];
              incoming.forEach(s => {
                if (!byId.has(s.id)) brandNew.push(s);
                byId.set(s.id, s);
              });
              const merged = prev.map(s => byId.get(s.id));
              return brandNew.length > 0 ? [...brandNew, ...merged] : merged;
            });

            const maxTs = getMaxUpdatedAt(incoming);
            if (maxTs && (!latestTimestampRef.current || maxTs > latestTimestampRef.current)) {
              latestTimestampRef.current = maxTs;
            }

            const newIds = new Set(incoming.map(s => s.id));
            setNewScheduleIds(newIds);
            setTimeout(() => setNewScheduleIds(new Set()), 2500);
          }
          setLastUpdated(new Date());
          setLastUpdateDuration(duration);
        } else {
          const data = response.data.data || [];
          setScheduleData(data);

          const user = JSON.parse(localStorage.getItem('user') || '{}');
          const cacheKey = cacheManager.getCacheKey('schedule', user.id, startDate, endDate);
          cacheManager.set(cacheKey, data);
          cacheManager.setDateRange('schedule', user.id, startDate, endDate);

          latestTimestampRef.current = getMaxUpdatedAt(data);
          setIsPolling(true);
          setLastUpdated(new Date());
          setLastUpdateDuration(duration);
        }
        setError(null); setDateError('');
      } else {
        setError('Failed to fetch schedule data');
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
      await fetchScheduleData(appliedFilters.startDate, appliedFilters.endDate, latestTimestampRef.current || null);
    } catch (err) {
      console.error('Schedule polling error:', err);
    }
  };

  // Dynamic dropdown options
  const palmtecIds = [...new Set(scheduleData.map(s => s.palmtec_id).filter(Boolean))].sort();
  const depotCodes = [...new Set(scheduleData.map(s => s.depot_code).filter(Boolean))].sort();
  const routeCodes = [...new Set(scheduleData.map(s => s.route_code).filter(Boolean))].sort();

  // Client-side filter
  const filteredData = scheduleData.filter(s => {
    if (filters.palmtecId  !== 'ALL' && s.palmtec_id  !== filters.palmtecId)  return false;
    if (filters.depotCode  !== 'ALL' && s.depot_code  !== filters.depotCode)  return false;
    if (filters.routeCode  !== 'ALL' && s.route_code  !== filters.routeCode)  return false;
    if (filters.status     !== 'ALL' && s.status      !== filters.status)     return false;
    if (filters.scheduleNo && !String(s.schedule_no).includes(filters.scheduleNo)) return false;
    return true;
  });

  // Summary KPIs
  const summary = {
    total:      filteredData.length,
    open:       filteredData.filter(s => s.status === 'open').length,
    closed:     filteredData.filter(s => s.status === 'closed').length,
    trips:      filteredData.reduce((a, s) => a + (s.trips_count || 0), 0),
    tickets:    filteredData.reduce((a, s) => a + (s.total_tickets || 0), 0),
    collection: filteredData.reduce((a, s) => a + Number(s.total_collection || 0), 0),
  };

  // Pagination
  const totalPages  = Math.ceil(filteredData.length / itemsPerPage);
  const currentData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Handlers
  const handleApplyFilters = () => {
    if (filters.endDate < filters.startDate) { setDateError('End date cannot be before start date'); return; }
    setDateError('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    cacheManager.invalidate(cacheManager.getCacheKey('schedule', user.id, appliedFilters.startDate, appliedFilters.endDate));
    setIsPolling(false); clearInterval(pollingIntervalRef.current);
    setAppliedFilters({ startDate: filters.startDate, endDate: filters.endDate });
    latestTimestampRef.current = null;
    fetchScheduleData(filters.startDate, filters.endDate);
    setCurrentPage(1);
  };

  const handleClientFilter = (key, value) => {
    setFilters(p => ({ ...p, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    const today = getTodayDate();
    const user  = JSON.parse(localStorage.getItem('user') || '{}');
    cacheManager.invalidate(cacheManager.getCacheKey('schedule', user.id, appliedFilters.startDate, appliedFilters.endDate));
    const reset = { startDate: today, endDate: today, palmtecId: 'ALL', depotCode: 'ALL', routeCode: 'ALL', status: 'ALL', scheduleNo: '' };
    setFilters(reset);
    setAppliedFilters({ startDate: today, endDate: today });
    setDateError('');
    setIsPolling(false); clearInterval(pollingIntervalRef.current);
    latestTimestampRef.current = null;
    fetchScheduleData(today, today);
    setCurrentPage(1);
  };

  // Excel export
  const exportToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Schedule Data');
    ws.columns = [
      { header: 'Company',            key: 'company_name',          width: 20 },
      { header: 'Palmtec ID',         key: 'palmtec_id',            width: 14 },
      { header: 'Schedule No',        key: 'schedule_no',           width: 14 },
      { header: 'Depot Code',         key: 'depot_code',            width: 14 },
      { header: 'Route Code',         key: 'route_code',            width: 14 },
      { header: 'Status',             key: 'status',                width: 12 },
      { header: 'Auto Opened',        key: 'auto_opened',           width: 12 },
      { header: 'Bus No',             key: 'bus_no',                width: 16 },
      { header: 'Driver',             key: 'driver',                width: 18 },
      { header: 'Conductor',          key: 'conductor',             width: 18 },
      { header: 'Start DateTime',     key: 'start_datetime',        width: 20 },
      { header: 'End DateTime',       key: 'end_datetime',          width: 20 },
      { header: 'Battery Start',      key: 'battery_start',         width: 14 },
      { header: 'Battery End',        key: 'battery_end',           width: 14 },
      { header: 'Trips Count',        key: 'trips_count',           width: 14 },
      { header: 'Total Tickets',      key: 'total_tickets',         width: 14 },
      { header: 'UPI Collection',     key: 'upi_total_collection',  width: 16 },
      { header: 'Total Collection',   key: 'total_collection',      width: 16 },
      { header: 'Full Count',         key: 'full_count',            width: 12 },
      { header: 'Half Count',         key: 'half_count',            width: 12 },
      { header: 'Student Count',      key: 'st_count',              width: 14 },
      { header: 'Physical Count',     key: 'physical_count',        width: 14 },
      { header: 'Ladies Count',       key: 'ladies_count',          width: 14 },
      { header: 'Senior Count',       key: 'senior_count',          width: 14 },
      { header: 'Luggage Count',      key: 'luggage_count',         width: 14 },
      { header: 'UPI Full',           key: 'upi_full_count',        width: 12 },
      { header: 'UPI Half',           key: 'upi_half_count',        width: 12 },
      { header: 'UPI Student',        key: 'upi_st_count',          width: 12 },
      { header: 'UPI Physical',       key: 'upi_physical_count',    width: 14 },
      { header: 'UPI Ladies',         key: 'upi_ladies_count',      width: 12 },
      { header: 'UPI Senior',         key: 'upi_senior_count',      width: 12 },
      { header: 'UPI Luggage',        key: 'upi_luggage_count',     width: 14 },
      { header: 'Open Unique Code',   key: 'open_unique_code',      width: 32 },
      { header: 'Close Unique Code',  key: 'close_unique_code',     width: 32 },
    ];
    filteredData.forEach(s => {
      ws.addRow({
        ...s,
        start_datetime: s.start_datetime ? new Date(s.start_datetime).toLocaleString() : '—',
        end_datetime:   s.end_datetime   ? new Date(s.end_datetime).toLocaleString()   : '—',
      });
    });
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = await wb.xlsx.writeBuffer();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    link.download = `schedule_data_${getTodayDate()}.xlsx`;
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
          <Button onClick={() => { setError(null); fetchScheduleData(getTodayDate(), getTodayDate()); }}
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
            <CalendarCog size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Schedule Data</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-slate-500">Device sessions — login to logout</p>
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

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard title="Total Schedules" value={isRefreshing ? '...' : String(summary.total)}      icon={CalendarCog}  color="#475569" loading={isRefreshing} />
        <KpiCard title="Active Now"      value={isRefreshing ? '...' : String(summary.open)}       icon={Activity}     color="#f59e0b" subtitle="devices online" loading={isRefreshing} />
        <KpiCard title="Closed Today"    value={isRefreshing ? '...' : String(summary.closed)}     icon={CheckCircle2} color="#10b981" loading={isRefreshing} />
        <KpiCard title="Trips Run"       value={isRefreshing ? '...' : String(summary.trips)}      icon={Route}        color="#8b5cf6" loading={isRefreshing} />
        <KpiCard title="Tickets Issued"  value={isRefreshing ? '...' : String(summary.tickets)}    icon={Ticket}       color="#6366f1" loading={isRefreshing} />
        <KpiCard title="Total Collection" value={isRefreshing ? '...' : fmt.inrK(summary.collection)} icon={IndianRupee} color="#059669" loading={isRefreshing} />
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
          {/* Row 1: dropdown + date + search filters */}
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
            {[
              { label: 'Route Code', key: 'routeCode', options: routeCodes },
              { label: 'Palmtec ID', key: 'palmtecId', options: palmtecIds },
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select value={filters.status} onChange={e => handleClientFilter('status', e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400">
                <option value="ALL">ALL</option>
                <option value="open">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Schedule No</label>
              <Input type="text" placeholder="Search..." value={filters.scheduleNo}
                onChange={e => handleClientFilter('scheduleNo', e.target.value)}
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
        <p className="text-xs text-slate-400">Showing {currentData.length} of {filteredData.length} schedules</p>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Closed
          </span>
        </div>
      </div>

      {/* Loading wrapper */}
      <div className="relative">
        {isRefreshing && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
            <div className="flex items-center gap-2 text-slate-600 font-medium text-sm">
              <RefreshCw size={16} className="animate-spin" /> Loading data...
            </div>
          </div>
        )}

        {/* Schedule rows */}
        <div className="space-y-3">
          {isRefreshing && !currentData.length
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-slate-200 rounded-2xl bg-white p-5 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              ))
            : currentData.length
              ? currentData.map(s => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    onView={() => setSelectedSchedule(s)}
                    isNew={newScheduleIds.has(s.id)}
                  />
                ))
              : (
                <div className="border border-slate-200 shadow-sm rounded-2xl bg-white py-14 text-center">
                  <CalendarCog size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400 text-sm">No schedules found for selected filters</p>
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
      {selectedSchedule && (
        <ScheduleDetailModal schedule={selectedSchedule} onClose={() => setSelectedSchedule(null)} />
      )}
    </div>
  );
}
