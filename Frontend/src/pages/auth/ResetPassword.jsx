import { useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import api, { BASE_URL } from '../../assets/js/axiosConfig';

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

const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
  </svg>
);

function getStrength(pw) {
  if (!pw) return null;
  if (pw.length < 8) return { label: 'Weak', color: '#ef4444', width: '33%' };
  if (pw.length < 12) return { label: 'Medium', color: '#f59e0b', width: '66%' };
  return { label: 'Strong', color: '#22c55e', width: '100%' };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newFocus, setNewFocus] = useState(false);
  const [confirmFocus, setConfirmFocus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const strength = getStrength(newPassword);

  const invalidLink = !uid || !token;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!newPassword) { setError('Please enter a new password.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await api.post(`${BASE_URL}/auth/reset-password`, { uid, token, new_password: newPassword });
      setSuccess(true);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail;
      if (err.response?.status === 400) {
        setError(msg || 'Invalid or expired reset link. Please request a new one.');
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.');
      } else if (err.request) {
        setError('Network error. Please check your connection.');
      } else {
        setError(msg || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputWrapper = (focused) => ({
    position: 'relative', display: 'flex', alignItems: 'center',
    border: `1px solid ${focused ? '#334155' : '#e2e8f0'}`,
    borderRadius: 10, background: '#f8fafc',
    boxShadow: focused ? '0 0 0 3px rgba(51,65,85,0.08)' : 'none',
    transition: 'all 0.2s',
  });

  return (
    <div style={{
      minHeight: '100vh', width: '100vw',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', padding: '40px 24px',
      fontFamily: "'Geist Variable', 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6v6" /><path d="M16 6v6" /><path d="M2 12h20" /><path d="M7 18h10" />
              <rect x="4" y="3" width="16" height="16" rx="3" />
              <circle cx="7.5" cy="17.5" r="1.5" fill="#fff" stroke="none" />
              <circle cx="16.5" cy="17.5" r="1.5" fill="#fff" stroke="none" />
              <path d="M4 19v2" /><path d="M20 19v2" />
            </svg>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '32px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

          {/* Back link */}
          {!success && (
            <div style={{ marginBottom: 20 }}>
              <NavLink to="/forgot-password" style={{ fontSize: 13, color: '#64748b', fontWeight: 500, textDecoration: 'none' }}>
                ← Back
              </NavLink>
            </div>
          )}

          {invalidLink ? (
            /* ── Invalid link ── */
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Invalid reset link</h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
                This link is missing required parameters. Please request a new one.
              </p>
              <NavLink
                to="/forgot-password"
                style={{ display: 'inline-block', fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', padding: '10px 24px', borderRadius: 10, background: '#1e293b' }}
              >
                Request new link
              </NavLink>
            </div>
          ) : success ? (
            /* ── Success ── */
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Password updated</h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
                Password updated successfully. You can now sign in with your new password.
              </p>
              <NavLink
                to="/login"
                style={{ display: 'inline-block', fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', padding: '10px 24px', borderRadius: 10, background: '#1e293b' }}
              >
                Go to login
              </NavLink>
            </div>
          ) : (
            /* ── Form ── */
            <>
              <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Set new password</h1>
                <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                  Choose a strong password for your account
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* New password */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', letterSpacing: '0.01em' }}>New password</label>
                  <div style={inputWrapper(newFocus)}>
                    <span style={{ position: 'absolute', left: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                      <LockIcon />
                    </span>
                    {/* <input
                      type={showNew ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="new-password"
                      onFocus={() => setNewFocus(true)}
                      onBlur={() => setNewFocus(false)}
                      style={{
                        flex: 1, border: 'none', outline: 'none', background: 'transparent',
                        padding: '13px 46px 13px 44px', fontSize: 14, color: '#0f172a',
                        fontFamily: 'inherit', borderRadius: 10, opacity: loading ? 0.6 : 1,
                      }}
                    /> */}
                    <input
                      type={showNew ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      value={newPassword}
                      minLength={8}
                      maxLength={25}
                      onChange={e => {
                        const value = e.target.value;

                        if (value.length <= 25) {
                          setNewPassword(value);
                        }
                      }}
                      disabled={loading}
                      autoComplete="new-password"
                      onFocus={() => setNewFocus(true)}
                      onBlur={() => setNewFocus(false)}
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
                    <button type="button" onClick={() => setShowNew(v => !v)} disabled={loading}
                      style={{ position: 'absolute', right: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                      {showNew ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>

                  {/* Strength bar */}
                  {newPassword && strength && (
                    <div>
                      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: strength.width, background: strength.color, borderRadius: 4, transition: 'all 0.3s' }} />
                      </div>
                      <p style={{ fontSize: 11, color: strength.color, marginTop: 4, fontWeight: 600 }}>{strength.label}</p>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', letterSpacing: '0.01em' }}>Confirm password</label>
                  <div style={inputWrapper(confirmFocus)}>
                    <span style={{ position: 'absolute', left: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                      <LockIcon />
                    </span>
                    {/* <input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="new-password"
                      onFocus={() => setConfirmFocus(true)}
                      onBlur={() => setConfirmFocus(false)}
                      style={{
                        flex: 1, border: 'none', outline: 'none', background: 'transparent',
                        padding: '13px 46px 13px 44px', fontSize: 14, color: '#0f172a',
                        fontFamily: 'inherit', borderRadius: 10, opacity: loading ? 0.6 : 1,
                      }}
                    /> */}
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      minLength={8}
                      maxLength={25}
                      onChange={e => {
                        const value = e.target.value;

                        if (value.length <= 25) {
                          setConfirmPassword(value);
                        }
                      }}
                      disabled={loading}
                      autoComplete="new-password"
                      onFocus={() => setConfirmFocus(true)}
                      onBlur={() => setConfirmFocus(false)}
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
                    <button type="button" onClick={() => setShowConfirm(v => !v)} disabled={loading}
                      style={{ position: 'absolute', right: 12, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
                      {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

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

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '13px 0',
                    background: '#1e293b', color: '#fff', border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit', opacity: loading ? 0.7 : 1, transition: 'all 0.2s',
                  }}
                >
                  {loading ? <SpinnerIcon /> : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
