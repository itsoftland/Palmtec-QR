import { useState, useEffect, useCallback } from 'react';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import {
  Monitor, Smartphone, Clock, AlertCircle,
  CheckCircle2, XCircle, LogOut, RefreshCw, Shield,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function TierBadge({ tier }) {
  const map = {
    premium:      'bg-amber-100 text-amber-700 border-amber-200',
    intermediate: 'bg-blue-100 text-blue-700 border-blue-200',
    basic:        'bg-slate-100 text-slate-600 border-slate-200',
    none:         'bg-slate-50 text-slate-400 border-slate-100',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${map[tier] || map.none}`}>
      {tier || 'none'}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SessionsPage() {
  const [tab, setTab] = useState('sessions');   // 'sessions' | 'approvals'

  // Sessions state
  const [sessions, setSessions]         = useState([]);
  const [sessionsLoading, setSessLoading] = useState(true);
  const [forcingOut, setForcingOut]     = useState({});

  // Approvals state
  const [approvals, setApprovals]       = useState([]);
  const [approvalsLoading, setAppLoading] = useState(true);
  const [actioning, setActioning]       = useState({});

  const fetchSessions = useCallback(async () => {
    setSessLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/sessions`);
      setSessions(res.data?.data || []);
    } catch { setSessions([]); }
    finally { setSessLoading(false); }
  }, []);

  const fetchApprovals = useCallback(async () => {
    setAppLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/device-approvals`);
      setApprovals(res.data?.data || []);
    } catch { setApprovals([]); }
    finally { setAppLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); fetchApprovals(); }, [fetchSessions, fetchApprovals]);

  const handleForceLogout = async (sessionUid, username) => {
    if (!window.confirm(`Log out ${username}'s session?`)) return;
    setForcingOut(p => ({ ...p, [sessionUid]: true }));
    try {
      await api.post(`${BASE_URL}/sessions/${sessionUid}/force-logout`);
      setSessions(prev => prev.filter(s => s.session_uid !== sessionUid));
    } catch (err) {
      window.alert(err.response?.data?.error || 'Force logout failed.');
    } finally { setForcingOut(p => ({ ...p, [sessionUid]: false })); }
  };

  const handleApprove = async (approvalId, username) => {
    setActioning(p => ({ ...p, [`a-${approvalId}`]: true }));
    try {
      const res = await api.post(`${BASE_URL}/device-approvals/${approvalId}/approve`);
      window.alert(res.data?.message || `Device approved for ${username}. They can now log in.`);
      fetchApprovals();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Approval failed.');
    } finally { setActioning(p => ({ ...p, [`a-${approvalId}`]: false })); }
  };

  const handleReject = async (approvalId, username) => {
    if (!window.confirm(`Reject device request for ${username}?`)) return;
    setActioning(p => ({ ...p, [`r-${approvalId}`]: true }));
    try {
      await api.post(`${BASE_URL}/device-approvals/${approvalId}/reject`);
      setApprovals(prev => prev.filter(a => a.id !== approvalId));
    } catch (err) {
      window.alert(err.response?.data?.error || 'Rejection failed.');
    } finally { setActioning(p => ({ ...p, [`r-${approvalId}`]: false })); }
  };

  const pendingCount = approvals.length;
  const staleCount   = sessions.filter(s => s.is_stale).length;

  return (
    <div className="p-6 md:p-8 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-slate-400 mb-3">
          Administration <span className="mx-1">›</span> <span className="text-slate-600 font-medium">Sessions & Devices</span>
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
              <Shield size={18} color="#fff" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sessions & Devices</h1>
              <p className="text-sm text-slate-500 mt-0.5">Manage active logins and device approval requests</p>
            </div>
          </div>
          <button onClick={() => { fetchSessions(); fetchApprovals(); }}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        <button onClick={() => setTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
            tab === 'sessions' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}>
          <Monitor size={13} /> Active Sessions
          {staleCount > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{staleCount}</span>}
        </button>
        <button onClick={() => setTab('approvals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
            tab === 'approvals' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}>
          <Smartphone size={13} /> Device Approvals
          {pendingCount > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{pendingCount}</span>}
        </button>
      </div>

      {/* ── Active Sessions tab ───────────────────────────────────────────── */}
      {tab === 'sessions' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {sessionsLoading ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm">Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="px-6 py-12 flex flex-col items-center gap-2 text-slate-400">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <p className="text-sm">No active sessions right now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Login Time</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Active</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map(s => (
                    <tr key={s.session_uid} className={`transition-colors ${s.is_stale ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{s.username}</p>
                        <TierBadge tier={s.tier} />
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
                        {s.is_stale ? (
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
        </div>
      )}

      {/* ── Device Approvals tab ──────────────────────────────────────────── */}
      {tab === 'approvals' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {approvalsLoading ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm">Loading requests…</div>
          ) : approvals.length === 0 ? (
            <div className="px-6 py-12 flex flex-col items-center gap-2 text-slate-400">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <p className="text-sm">No pending device approval requests.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvals.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{a.username}</p>
                        <TierBadge tier={a.tier} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <DeviceIcon type={a.device_type} />
                          <span className="text-xs text-slate-600 capitalize">{a.device_type || 'Unknown'}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{a.device_uuid.slice(0, 20)}…</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock size={11} className="text-slate-400" />
                          {fmt(a.requested_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleReject(a.id, a.username)}
                            disabled={actioning[`r-${a.id}`]}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50">
                            <XCircle size={11} /> Reject
                          </button>
                          <button
                            onClick={() => handleApprove(a.id, a.username)}
                            disabled={actioning[`a-${a.id}`]}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50">
                            {actioning[`a-${a.id}`]
                              ? <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> …</>
                              : <><CheckCircle2 size={11} /> Approve</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {approvals.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                Approving a device login checks tier slot availability. If all slots are in use, the approval will be blocked until a user logs out.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
