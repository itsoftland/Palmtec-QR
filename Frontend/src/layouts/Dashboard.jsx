import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api, { cancelAllPendingRequests } from '../assets/js/axiosConfig';
import { useIdleTimer } from '../hooks/useIdleTimer';

export default function Dashboard() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const alertsShownRef = useRef(false);

  const [loginAlerts, setLoginAlerts] = useState(() => {
    if (!alertsShownRef.current && location.state?.loginAlerts?.length) {
      alertsShownRef.current = true;
      return location.state.loginAlerts;
    }
    return [];
  });

  // ── Idle timer ──────────────────────────────────────────────────────────────
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  // session_timeout_seconds is stored to localStorage on login and verify-auth.
  const sessionTimeoutSeconds = parseInt(
    localStorage.getItem('session_timeout_seconds') || '1200', 10
  );

  const handleLogout = useCallback(async () => {
    setShowIdleWarning(false);
    cancelAllPendingRequests();
    try { await api.post('/logout'); } catch (_) {}
    localStorage.removeItem('user');
    localStorage.removeItem('session_timeout_seconds');
    navigate('/login');
  }, [navigate]);

  const { extendSession } = useIdleTimer({
    sessionTimeoutSeconds,
    warningBeforeSeconds: 180,       // warn at 17 min
    keepaliveIntervalMs:  300_000,   // ping at most once per 5 min while active
    enabled: true,
    onWarn:           () => setShowIdleWarning(true),
    onTimeout:        () => handleLogout(),
    onSessionInvalid: () => {
      localStorage.removeItem('user');
      localStorage.removeItem('session_timeout_seconds');
      navigate('/login?error=Session%20expired.');
    },
  });

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto pt-20 lg:pt-0">
        <Outlet />
      </main>

      {/* ── Idle warning modal ── */}
      {showIdleWarning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%', maxWidth: 400, padding: '28px 28px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Still there?</p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>You'll be logged out in 3 minutes due to inactivity.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => { extendSession(); setShowIdleWarning(false); }}
                style={{ flex: 1, padding: '11px 0', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Keep Using
              </button>
              <button
                onClick={handleLogout}
                style={{ flex: 1, padding: '11px 0', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {loginAlerts.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%', maxWidth: 460, padding: '28px 28px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Login Alerts</p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{loginAlerts.length} notification{loginAlerts.length > 1 ? 's' : ''} require your attention</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {loginAlerts.map((n, i) => {
                const isError = n.type === 'license_expired' || n.type === 'dealer_license_expired';
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px', borderRadius: 10,
                    background: isError ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${isError ? '#fecaca' : '#fde68a'}`,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isError ? '#dc2626' : '#d97706'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      {isError
                        ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                        : <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}
                    </svg>
                    <p style={{ fontSize: 13, color: isError ? '#b91c1c' : '#92400e', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setLoginAlerts([])}
              style={{ width: '100%', padding: '12px 0', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
