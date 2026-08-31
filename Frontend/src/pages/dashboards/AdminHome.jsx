import { useEffect, useState } from "react";
import api, { BASE_URL } from "../../assets/js/axiosConfig";
import { KpiCard } from "@/components/ui/kpi-card";
import { StateBreakdownCard } from "@/components/ui/state-breakdown-card";
import { Building2, Smartphone, Truck, Activity, Users, LayoutDashboard, UserRound } from "lucide-react";

const STATUS_COLORS = {
  validated: "#059669",
  unvalidated: "#dc2626",
  validating: "#2563eb",
  expired: "#d97706",
  blocked: "#64748b",
};

export default function AdminHome() {
  const storedUser = localStorage.getItem("user")
    ? JSON.parse(localStorage.getItem("user"))
    : null;
  const username = storedUser?.username || "User";

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    company_summary: null,
    user_summary: null,
    device_summary: null,
    dealer_summary: null,
    session_summary: null,
  });

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`${BASE_URL}/get_admin_data`);
      if (response.data.message === "Success") {
        setSummary(response.data.data);
      }
    } catch (err) {
      console.error("Admin dashboard error:", err);
    } finally {
      setLoading(false);
    }
  };

  const company = summary.company_summary;
  const users = summary.user_summary;
  const devices = summary.device_summary;
  const dealers = summary.dealer_summary;
  const sessions = summary.session_summary;

  return (
    <div className="p-6 md:p-10 min-h-screen bg-slate-50 animate-fade-in">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-2.5 rounded-xl bg-slate-900 text-white shadow">
          <LayoutDashboard size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back, {username}</p>
        </div>
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">Companies, devices, dealers &amp; active sessions</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StateBreakdownCard
            title="Companies"
            icon={Building2}
            total={company?.total_companies}
            loading={loading}
            states={[
              { label: "Validated", value: company?.validated_companies, color: STATUS_COLORS.validated },
              { label: "Unvalidated", value: company?.unvalidated_companies, color: STATUS_COLORS.unvalidated },
              { label: "Expired", value: company?.expired_companies, color: STATUS_COLORS.expired },
            ]}
          />
          <StateBreakdownCard
            title="Dealers"
            icon={Truck}
            total={dealers?.total_dealers}
            loading={loading}
            states={[
              { label: "Validated", value: dealers?.validated_dealers, color: STATUS_COLORS.validated },
              { label: "Unvalidated", value: dealers?.unvalidated_dealers, color: STATUS_COLORS.unvalidated },
              { label: "Expired", value: dealers?.expired_dealers, color: STATUS_COLORS.expired },
            ]}
          />
          <StateBreakdownCard
            title="Devices"
            icon={Smartphone}
            total={devices?.total_devices}
            loading={loading}
            states={[
              { label: "In Stock", value: devices?.in_stock, color: STATUS_COLORS.blocked },
              { label: "Dealer Pool", value: devices?.dealer_pool, color: STATUS_COLORS.validating },
              { label: "Mapped", value: devices?.mapped, color: STATUS_COLORS.validated },
            ]}
          />
          <KpiCard
            title="Active Admin Sessions"
            value={sessions?.active_admin_sessions ?? 0}
            subtitle="Currently logged in"
            icon={Activity}
            color="#0f172a"
            loading={loading}
          />
        </div>
      </section>

      {/* ── User Overview ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">

        {/* Section header + total */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-900 text-white">
              <Users size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">User Overview</h2>
              <p className="text-xs text-slate-400">Registered users by company</p>
            </div>
          </div>
          {/* Total badge */}
          {!loading && (
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Total</p>
              <p className="text-2xl font-bold text-slate-900 leading-tight">{users?.total_users ?? 0}</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 animate-pulse" />
                  <div className="h-4 w-28 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-slate-100 rounded animate-pulse" />
                <div className="h-2 w-full bg-slate-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : users?.users_by_company?.length > 0 ? (() => {
          const total    = users.total_users || 1;
          const assigned = users.users_by_company.filter(c => c.company_name);
          const orphan   = users.users_by_company.find(c => !c.company_name);
          const sorted   = assigned.slice().sort((a, b) => b.count - a.count);

          return (
            <div className="space-y-4">
              {/* Company cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sorted.map((item, index) => {
                  const pct = Math.round((item.count / total) * 100);
                  return (
                    <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
                      {/* Company icon + name */}
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-900 text-white flex-shrink-0">
                          <Building2 size={14} />
                        </div>
                        <span className="text-sm font-semibold text-slate-800 truncate leading-tight" title={item.company_name}>
                          {item.company_name}
                        </span>
                      </div>

                      {/* User count */}
                      <div className="flex items-end justify-between">
                        <div className="flex items-center gap-1.5">
                          <UserRound size={13} className="text-slate-400" />
                          <span className="text-2xl font-bold text-slate-900 leading-none">{item.count}</span>
                          <span className="text-xs text-slate-400 mb-0.5">{item.count === 1 ? 'user' : 'users'}</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-400">{pct}%</span>
                      </div>

                      {/* Share bar */}
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-slate-800 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unassigned — separated at bottom */}
              {orphan && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-slate-300 bg-white">
                  <div className="p-1.5 rounded-lg bg-slate-100 text-slate-400 flex-shrink-0">
                    <UserRound size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-400 italic">Unassigned</p>
                    <p className="text-xs text-slate-400">Not linked to any company</p>
                  </div>
                  <span className="text-lg font-bold text-slate-400">{orphan.count}</span>
                  <span className="text-xs text-slate-300">{Math.round((orphan.count / total) * 100)}%</span>
                </div>
              )}
            </div>
          );
        })() : (
          <p className="text-sm text-slate-400 py-4 text-center">No user data available</p>
        )}
      </section>
    </div>
  );
}
