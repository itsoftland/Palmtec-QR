import { useState, useEffect } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import api from '../../assets/js/axiosConfig';
import login_img from '../../assets/images/login_2.png';

/* ─── Icons ─── */
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const BusIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6v6" /><path d="M16 6v6" /><path d="M2 12h20" /><path d="M7 18h10" />
    <rect x="4" y="3" width="16" height="16" rx="3" />
    <circle cx="7.5" cy="17.5" r="1.5" fill="#fff" stroke="none" />
    <circle cx="16.5" cy="17.5" r="1.5" fill="#fff" stroke="none" />
    <path d="M4 19v2" /><path d="M20 19v2" />
  </svg>
);
const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);
const SpinnerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
  </svg>
);
const FeatureIcon = ({ type }) => {
  const s = { width: 20, height: 20, stroke: '#fff', strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (type === 'bus') return (
    <svg viewBox="0 0 24 24" {...s}>
      <rect x="4" y="3" width="16" height="14" rx="3" /><path d="M2 12h20" /><path d="M8 6v5" /><path d="M16 6v5" />
      <circle cx="7.5" cy="17" r="1" fill="#fff" stroke="none" /><circle cx="16.5" cy="17" r="1" fill="#fff" stroke="none" />
      <path d="M7 17h10" /><path d="M5 19v1.5" /><path d="M19 19v1.5" />
    </svg>
  );
  if (type === 'route') return (
    <svg viewBox="0 0 24 24" {...s}>
      <circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" />
      <path d="M9 6h4c3 0 5 2 5 5v1" /><path d="M15 18h-4c-3 0-5-2-5-5v-1" />
    </svg>
  );
  if (type === 'chart') return (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M3 3v18h18" /><path d="M7 16l4-6 4 4 5-8" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" {...s}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
};

const FEATURES = [
  { title: 'Fleet Management', subtitle: 'Track and manage your entire bus fleet', icon: 'bus' },
  { title: 'Route Management', subtitle: 'Manage routes and trips efficiently', icon: 'route' },
  { title: 'Transaction Insights', subtitle: 'Detailed reports and analytics', icon: 'chart' },
  { title: 'Trip Analysis', subtitle: 'Finalize trips with summaries and logs', icon: 'trip' },
];

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (localStorage.getItem('user')) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(searchParams.get('error') || '');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /* focus ring state */
  const [userFocus, setUserFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);

  /* session conflict state */
  const [conflictData, setConflictData] = useState(null);         // { device_type, active_since }
  const [pendingCreds, setPendingCreds] = useState(null);         // { username, password } — React state only, never persisted
  const [forceLoading, setForceLoading] = useState(false);

  /* clear sensitive state on unmount */
  useEffect(() => {
    return () => {
      setPendingCreds(null);
      setConflictData(null);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername && !trimmedPassword) {
      setError("Please fill out all the fields"); return;
    } else if (!trimmedUsername) {
      setError("Please enter a valid username"); return;
    } else if (!trimmedPassword) {
      setError("Please enter a valid password");
      setPassword(''); return;
    }

    setLoading(true);
    try {
      const login_data = {
        username: trimmedUsername,
        password: trimmedPassword,
      };
      const response = await api.post('/login', login_data);
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      if (response.data.session_timeout_seconds) {
        localStorage.setItem('session_timeout_seconds', String(response.data.session_timeout_seconds));
      }
      const notifications = response.data.notifications || [];
      navigate('/dashboard', { state: { loginAlerts: notifications } });
    } catch (err) {
      console.error('Login error:', err);
      const backendCode = err.response?.data?.error_code;
      const backendMessage = err.response?.data?.message || err.response?.data?.error;

      if (backendCode === 'SESSION_CONFLICT') {
        setConflictData(err.response.data.conflict);
        setPendingCreds({ username: trimmedUsername, password: trimmedPassword });
        setPassword('');
        return;
      }

      if (err.response) {
        switch (err.response.status) {
          case 401: setError(backendMessage || 'Invalid username or password'); break;
          case 403: setError(backendMessage || 'Account is inactive. Contact administrator.'); break;
          case 400: setError(backendMessage || 'Invalid input. Please check your credentials.'); break;
          case 429: setError('Too many login attempts. Please try again later.'); break;
          case 500: setError('Server error. Please try again later.'); break;
          default: setError(backendMessage || 'Login failed. Please try again.');
        }
      } else if (err.request) {
        setError('Network error. Please check your connection.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  /* Re-submits login with force_login:true after user confirms they want
     to terminate the existing session on the other device. */
  const handleForceLogin = async () => {
    if (!pendingCreds) return;
    setForceLoading(true);
    try {
      const response = await api.post('/login', { ...pendingCreds, force_login: true });
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      if (response.data.session_timeout_seconds) {
        localStorage.setItem('session_timeout_seconds', String(response.data.session_timeout_seconds));
      }
      const notifications = response.data.notifications || [];
      navigate('/dashboard', { state: { loginAlerts: notifications } });
    } catch (err) {
      const backendMessage = err.response?.data?.message || err.response?.data?.error;
      setError(backendMessage || 'Login failed. Please try again.');
      setConflictData(null);
      setPendingCreds(null);
    } finally {
      setForceLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: "'Geist Variable', 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Left Panel ── */}
      <div className="hidden lg:block" style={{ width: '48%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <img src={login_img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 70%' }} />

        {/* gradient */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'linear-gradient(180deg, rgba(15,23,42,0.4) 0%, rgba(15,23,42,0.55) 35%, rgba(15,23,42,0.9) 100%)',
        }} />

        {/* content */}
        <div style={{ position: 'relative', zIndex: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '36px' }}>

          {/* branding top-left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11,
              background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.18)',
            }}>
              <BusIcon />
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
              Palmtec Amphibia QR
            </span>
          </div>

          {/* feature grid bottom */}
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.25, margin: '0 0 18px', letterSpacing: '-0.02em' }}>
              One platform for every operation
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, padding: '18px 16px', backdropFilter: 'blur(6px)',
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: 'rgba(255,255,255,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 10,
                  }}>
                    <FeatureIcon type={f.icon} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 3, letterSpacing: '0.01em' }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
                    {f.subtitle}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div style={{ flex: 1, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column' }}>

          {/* mobile branding */}
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BusIcon />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.2 }}>Palmtec Amphibia QR</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Integrated Fleet Operations</div>
            </div>
          </div>

          {/* heading */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>Sign in</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: '8px 0 0', lineHeight: 1.5 }}>
              Access your dashboard and manage operations
            </p>
          </div>

          {/* ── Session conflict panel ── */}
          {conflictData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Already logged in</p>
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Your account is active on another device</p>
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Device</span>
                  <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 600, textTransform: 'capitalize' }}>
                    {conflictData.device_type?.replace(/_/g, ' ') || 'Unknown'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Active since</span>
                  <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
                    {conflictData.active_since
                      ? new Date(conflictData.active_since).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </span>
                </div>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#b91c1c', lineHeight: 1.4, marginBottom: 16 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleForceLogin}
                  disabled={forceLoading}
                  style={{ width: '100%', padding: '13px 0', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: forceLoading ? 'not-allowed' : 'pointer', opacity: forceLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
                >
                  {forceLoading
                    ? <><SpinnerIcon /><span>Logging out…</span></>
                    : 'Log Out Other Device & Continue'}
                </button>
                <button
                  type="button"
                  onClick={() => { setConflictData(null); setPendingCreds(null); setError(''); }}
                  style={{ width: '100%', padding: '13px 0', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Stay on This Page
                </button>
              </div>
            </div>

          ) : (
            /* ── Login form ── */
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', letterSpacing: '0.01em' }}>
                  Username
                </label>
                <div style={{
                  position: 'relative', display: 'flex', alignItems: 'center',
                  border: `1px solid ${userFocus ? '#334155' : '#e2e8f0'}`,
                  borderRadius: 10, background: '#f8fafc',
                  boxShadow: userFocus ? '0 0 0 3px rgba(51,65,85,0.08)' : 'none',
                  transition: 'all 0.2s',
                }}>
                  <span style={{ position: 'absolute', left: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <UserIcon />
                  </span>
                  {/* <input
                  type="text"
                  placeholder="e.g. admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  onFocus={() => setUserFocus(true)}
                  onBlur={() => setUserFocus(false)}
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent',
                    padding: '13px 14px 13px 44px', fontSize: 14, color: '#0f172a',
                    fontFamily: 'inherit', borderRadius: 10,
                    opacity: loading ? 0.6 : 1,
                  }}
                /> */}
                  <input
                    type="text"
                    placeholder="e.g. admin"
                    value={username}
                    minLength={3}
                    maxLength={30}
                    onChange={e => {
                      const value = e.target.value;

                      if (value.length <= 30) {
                        setUsername(value);
                      }
                    }}
                    disabled={loading}
                    autoComplete="username"
                    onFocus={() => setUserFocus(true)}
                    onBlur={() => setUserFocus(false)}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      padding: '13px 14px 13px 44px',
                      fontSize: 14,
                      color: '#0f172a',
                      fontFamily: 'inherit',
                      borderRadius: 10,
                      opacity: loading ? 0.6 : 1,
                    }}
                  />
                </div>
              </div>

              {/* password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', letterSpacing: '0.01em' }}>
                    Password
                  </label>
                  <NavLink to="/forgot-password" style={{ fontSize: 12, color: '#64748b', fontWeight: 500, textDecoration: 'none' }}>Forgot password?</NavLink>
                </div>
                <div style={{
                  position: 'relative', display: 'flex', alignItems: 'center',
                  border: `1px solid ${passFocus ? '#334155' : '#e2e8f0'}`,
                  borderRadius: 10, background: '#f8fafc',
                  boxShadow: passFocus ? '0 0 0 3px rgba(51,65,85,0.08)' : 'none',
                  transition: 'all 0.2s',
                }}>
                  <span style={{ position: 'absolute', left: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <LockIcon />
                  </span>
                  {/* <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    onFocus={() => setPassFocus(true)}
                    onBlur={() => setPassFocus(false)}
                    style={{
                      flex: 1, border: 'none', outline: 'none', background: 'transparent',
                      padding: '13px 46px 13px 44px', fontSize: 14, color: '#0f172a',
                      fontFamily: 'inherit', borderRadius: 10,
                      opacity: loading ? 0.6 : 1,
                    }}
                  /> */}
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    minLength={3}
                    maxLength={30}
                    onChange={e => {
                      const value = e.target.value;

                      if (value.length <= 30) {
                        setPassword(value);
                      }
                    }}
                    disabled={loading}
                    autoComplete="current-password"
                    onFocus={() => setPassFocus(true)}
                    onBlur={() => setPassFocus(false)}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      padding: '13px 46px 13px 44px',
                      fontSize: 14,
                      color: '#0f172a',
                      fontFamily: 'inherit',
                      borderRadius: 10,
                      opacity: loading ? 0.6 : 1,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    style={{
                      position: 'absolute', right: 12, background: 'none', border: 'none',
                      color: '#94a3b8', cursor: 'pointer', padding: 4,
                      display: 'flex', alignItems: 'center', transition: 'color 0.15s',
                    }}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* error */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 10, padding: '11px 14px',
                  fontSize: 13, color: '#b91c1c', lineHeight: 1.4,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px 0',
                  background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 2px 8px rgba(30,41,59,0.2)',
                  transition: 'all 0.2s', fontFamily: 'inherit', letterSpacing: '0.01em',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? <SpinnerIcon /> : <><span>Sign in</span><ArrowRightIcon /></>}
              </button>
            </form>
          )} {/* end SESSION_CONFLICT ternary */}



          {/* copyright */}
          <div style={{ marginTop: 48 }}>
            <div style={{ height: 1, background: '#f1f5f9', marginBottom: 16 }} />
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
              © 2025 <span style={{ fontWeight: 600, color: '#475569' }}>Softland India Ltd.</span> All rights reserved.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
