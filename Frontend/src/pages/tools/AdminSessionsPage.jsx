import { useState, useEffect, useCallback } from 'react';
import api from '../../assets/js/axiosConfig';
import {
  Monitor, Smartphone, Clock, AlertCircle,
  CheckCircle2, LogOut, RefreshCw, Shield, Building2,
} from 'lucide-react';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function DeviceIcon({ type }) {
  if (type === 'android' || type === 'ios')
    return <Smartphone size={14} className="text-slate-400" />;
  return <Monitor size={14} className="text-slate-400" />;
}

function RoleBadge({ role }) {
  const map = {
    superadmin:    'bg-slate-900 text-white border-slate-900',
    company_admin: 'bg-purple-100 text-purple-700 border-purple-200',
    dealer_admin:  'bg-blue-100 text-blue-700 border-blue-200',
    executive:     'bg-teal-100 text-teal-700 border-teal-200',
    production:    'bg-orange-100 text-orange-700 border-orange-200',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${map[role] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {(role === 'company_admin' ? 'customer admin' : role?.replace(/_/g, ' ')) || 'unknown'}
    </span>
  );
}

// A session is considered "likely disconnected" if last_active is older than
// the session idle timeout + a small buffer (25 min). The backend sweeps
// these every 10 min, but they may still appear briefly in the listing.
const STALE_THRESHOLD_MS = 25 * 60 * 1000;
const isStale = (s) => {
  if (!s.last_active) return false;
  return (Date.now() - new Date(s.last_active).getTime()) > STALE_THRESHOLD_MS;
};

export default function AdminSessionsPage() {
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [forcingOut, setForcingOut] = useState({});

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/sessions');
      setSessions(res.data?.data || []);
    } catch { setSessions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleForceLogout = async (sessionUid, username) => {
    if (!window.confirm(`Force logout ${username}'s session?`)) return;
    setForcingOut(p => ({ ...p, [sessionUid]: true }));
    try {
      await api.post(`/admin/sessions/${sessionUid}/force-logout`);
      setSessions(prev => prev.filter(s => s.session_uid !== sessionUid));
    } catch (err) {
      window.alert(err.response?.data?.error || 'Force logout failed.');
    } finally { setForcingOut(p => ({ ...p, [sessionUid]: false })); }
  };

  const staleCount = sessions.filter(isStale).length;

  return (
    <div className="p-6 md:p-8 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-slate-400 mb-3">
          Administration <span className="mx-1">›</span>
          <span className="text-slate-600 font-medium">Admin Sessions</span>
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
              <Shield size={18} color="#fff" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Sessions</h1>
              <p className="text-sm text-slate-500 mt-0.5">Active logins for all admin-level accounts</p>
            </div>
          </div>
          <button onClick={fetchSessions}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-slate-400 text-sm">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="px-6 py-12 flex flex-col items-center gap-2 text-slate-400">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <p className="text-sm">No active admin sessions right now.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Login Time</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Active</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map(s => (
                  <tr key={s.session_uid} className={`transition-colors ${isStale(s) ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{s.username}</p>
                      <RoleBadge role={s.role} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Building2 size={12} className="text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-600">{s.company_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <DeviceIcon type={s.device_type} />
                        <span className="text-xs text-slate-600 capitalize">{s.device_type || 'Unknown'}</span>
                      </div>
                      {s.device_uuid && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{s.device_uuid.slice(0, 16)}…</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Clock size={11} className="text-slate-400" />
                        {fmt(s.login_time)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{fmt(s.last_active)}</td>
                    <td className="px-4 py-3">
                      {isStale(s) ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                          <AlertCircle size={11} /> Likely disconnected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <CheckCircle2 size={11} /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.is_current_session ? (
                        <span className="text-[11px] text-slate-400 italic">Current session</span>
                      ) : (
                        <button
                          onClick={() => handleForceLogout(s.session_uid, s.username)}
                          disabled={forcingOut[s.session_uid]}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50">
                          {forcingOut[s.session_uid]
                            ? <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> …</>
                            : <><LogOut size={11} /> Force Logout</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {staleCount > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-500">
              {staleCount} session{staleCount !== 1 ? 's' : ''} marked as likely disconnected. Force logout to clear the stuck session.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
