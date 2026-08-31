import { useEffect, useState } from "react";
import api, { BASE_URL } from "../../assets/js/axiosConfig";
import {
  Wallet, TrendingUp, Users, Route as RouteIcon,
  Banknote, Bus, Receipt, RefreshCw, AlertCircle, Calendar,
} from "lucide-react";
import { KpiCard, PageHeader, Btn, DesignCard, fmt } from "@/components/design";

// ── Internal helpers ──────────────────────────────────────────────────────────
function CardHead({ icon: Ic, color, bg, title, meta }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Ic size={15} className={color} />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      {meta && <span className="text-[11px] text-slate-400">{meta}</span>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CompanyDashboard() {
  const storedUser = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
  const companyName = storedUser?.company_name || "Company";
  const companyCode = storedUser?.company_id || "-";

  const [metrics, setMetrics] = useState({
    license_expiry_date: null,
    collections: { daily_cash: 0, daily_upi: 0, monthly_total: 0, prev_month_total: 0 },
    operations:  { buses_active: 0, buses_idle: 0, buses_running: 0, buses_total: 0, trips_completed: 0, trips_scheduled: 0, routes_active: 0, routes_total: 0, total_passengers: 0 },
    settlements: { total_transactions: 0, verified: 0, pending_verification: 0, failed: 0 },
    recent_activity: [],
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchDashboardData(); }, [selectedDate]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`${BASE_URL}/get_company_dashboard_metrics?date=${selectedDate}`);
      if (res.data?.data) setMetrics(res.data.data);
      else setError("Unexpected response format");
    } catch (err) {
      if (err.response?.status === 401) setError("Authentication expired. Please log in again.");
      else if (!err.response) setError("Cannot connect to server.");
      else setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  const d = metrics;
  const totalDaily = (d.collections.daily_cash || 0) + (d.collections.daily_upi || 0);
  const cashPct    = totalDaily > 0 ? Math.round((d.collections.daily_cash / totalDaily) * 100) : 0;
  const upiPct     = 100 - cashPct;
  const monthChange = d.collections.prev_month_total > 0
    ? ((d.collections.monthly_total - d.collections.prev_month_total) / d.collections.prev_month_total * 100).toFixed(1)
    : '0';
  const avgPerTrip = d.operations.trips_completed > 0 ? Math.round(d.operations.total_passengers / d.operations.trips_completed) : 0;

  const selectedDateLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    : "";

  let licenseDaysLeft = null;
  if (d.license_expiry_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(`${d.license_expiry_date}T00:00:00`);
    licenseDaysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  }
  const showLicenseWarning = !loading && licenseDaysLeft !== null && licenseDaysLeft <= 30;

  return (
    <div className="p-5 lg:p-6 min-h-full bg-slate-50">

      {/* ═══ HEADER ══════════════════════════════════════════════════════ */}
      <PageHeader
        icon={RouteIcon}
        title="Company Dashboard"
        subtitle={`${companyCode} / ${companyName}`}
        livePill={{ live: !loading, text: loading ? 'Loading…' : 'Live' }}
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
              <Calendar size={14} className="text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent outline-none text-slate-700 cursor-pointer text-sm"
              />
            </label>
            <Btn variant="secondary" size="md" icon={RefreshCw} onClick={fetchDashboardData}>Refresh</Btn>
          </div>
        }
      />

      {/* ═══ License expiry warning ══════════════════════════════════════ */}
      {showLicenseWarning && (
        <div className={`mb-5 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm animate-fade-in-fast animate-blink-warn ${
          licenseDaysLeft <= 0
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          <AlertCircle size={15} className="shrink-0" />
          <span>
            {licenseDaysLeft <= 0
              ? `Company license expired on ${new Date(`${d.license_expiry_date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`
              : `Company license expires in ${licenseDaysLeft} day${licenseDaysLeft === 1 ? '' : 's'} (${new Date(`${d.license_expiry_date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}).`}
          </span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
          <button onClick={fetchDashboardData} className="ml-auto text-xs font-medium underline">Retry</button>
        </div>
      )}

      {/* Date label */}
      {!error && (
        <p className="text-xs text-slate-400 mb-5 -mt-2">{selectedDateLabel}</p>
      )}

      {/* ═══ HERO KPIs ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          title="Today's Revenue"
          value={loading ? '—' : fmt.inr(totalDaily)}
          subtitle={loading ? '' : `Cash ${cashPct}% · UPI ${upiPct}%`}
          icon={Wallet}
          color="#3b82f6"
          loading={loading}
        />
        <KpiCard
          title="Month to Date"
          value={loading ? '—' : fmt.inrK(d.collections.monthly_total)}
          subtitle={loading ? '' : `vs ${fmt.inrK(d.collections.prev_month_total)} last month`}
          icon={TrendingUp}
          color="#8b5cf6"
          loading={loading}
          trend={!loading && d.collections.prev_month_total > 0 ? {
            dir: parseFloat(monthChange) >= 0 ? 'up' : 'down',
            value: `${Math.abs(parseFloat(monthChange))}%`,
          } : undefined}
        />
        <KpiCard
          title="Passengers Today"
          value={loading ? '—' : d.operations.total_passengers.toLocaleString('en-IN')}
          subtitle={loading ? '' : `~${avgPerTrip} avg per trip`}
          icon={Users}
          color="#14b8a6"
          loading={loading}
        />
        <KpiCard
          title="Active Buses"
          value={loading ? '—' : `${d.operations.buses_active}/${d.operations.buses_total}`}
          subtitle={loading ? '' : `${d.operations.buses_idle} idle · ${d.operations.buses_running} running`}
          icon={Bus}
          color="#f59e0b"
          loading={loading}
        />
      </div>

      {/* ═══ ROW 1 — Revenue + Operations ═══════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Revenue Breakdown */}
        <DesignCard>
          <div className="p-5">
            <CardHead icon={Banknote} bg="bg-blue-50" color="text-blue-600" title="Revenue Breakdown" meta="Today's split" />

            {/* Stacked bar */}
            <div className="h-3.5 rounded-full overflow-hidden flex mb-5">
              {totalDaily > 0 ? (
                <>
                  <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${cashPct}%` }} />
                  <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${upiPct}%` }} />
                </>
              ) : (
                <div className="h-full bg-slate-100 w-full" />
              )}
            </div>

            {/* Cash */}
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-sm font-medium text-slate-700">Cash Collection</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-800">{fmt.inr(d.collections.daily_cash)}</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{cashPct}%</span>
              </div>
            </div>

            {/* UPI */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded bg-violet-500" />
                <span className="text-sm font-medium text-slate-700">UPI Collection</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-800">{fmt.inr(d.collections.daily_upi)}</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">{upiPct}%</span>
              </div>
            </div>

            {/* Monthly footer */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Monthly total ({new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{fmt.inrK(d.collections.monthly_total)}</span>
                {parseFloat(monthChange) !== 0 && (
                  <span className={`text-xs font-semibold flex items-center gap-0.5 ${parseFloat(monthChange) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <TrendingUp size={11} />
                    {parseFloat(monthChange) >= 0 ? '+' : ''}{monthChange}%
                  </span>
                )}
              </div>
            </div>
          </div>
        </DesignCard>

        {/* Settlements */}
        <DesignCard>
          <div className="p-5">
            <CardHead icon={Receipt} bg="bg-amber-50" color="text-amber-600" title="Settlements" meta={`${d.settlements.total_transactions} txns`} />
            <div className="space-y-4">
              {[
                { label: 'Verified', value: d.settlements.verified,              color: '#10b981', pill: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                { label: 'Pending',  value: d.settlements.pending_verification,  color: '#f59e0b', pill: 'bg-amber-50 text-amber-700 border-amber-100' },
                { label: 'Failed',   value: d.settlements.failed,                color: '#ef4444', pill: 'bg-rose-50 text-rose-700 border-rose-100' },
              ].map(({ label, value, color, pill }) => {
                const pct = d.settlements.total_transactions > 0 ? Math.round((value / d.settlements.total_transactions) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-sm text-slate-600">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{value}</span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${pill}`}>{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DesignCard>
      </div>

    </div>
  );
}
