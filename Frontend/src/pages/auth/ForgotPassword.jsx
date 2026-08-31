import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import api, { BASE_URL } from '../../assets/js/axiosConfig';

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,12 2,6" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
  </svg>
);

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [emailFocus, setEmailFocus] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email address.'); return; }

    setLoading(true);
    try {
      await api.post(`${BASE_URL}/auth/forgot-password`, { email: trimmed });
      setSuccess(true);
    } catch (err) {
      // Backend always returns 200 to prevent enumeration; surface real network/server errors only
      const status = err.response?.status;
      if (status === 400) {
        setError(err.response?.data?.error || 'Invalid email address.');
      } else if (status >= 500) {
        setError('Server error. Please try again later.');
      } else if (err.request) {
        setError('Network error. Please check your connection.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

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

        {success ? (
          /* ── Success state ── */
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '32px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
              If an account exists for <strong style={{ color: '#334155' }}>{email}</strong>, a password reset link has been sent.
            </p>
            <NavLink
              to="/login"
              style={{ display: 'inline-block', fontSize: 14, fontWeight: 600, color: '#1e293b', textDecoration: 'none', padding: '10px 24px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}
            >
              Back to login
            </NavLink>
          </div>
        ) : (
          /* ── Form state ── */
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '32px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Forgot password</h1>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Enter your account email and we'll send a reset link
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', letterSpacing: '0.01em' }}>
                  Email address
                </label>
                <div style={{
                  position: 'relative', display: 'flex', alignItems: 'center',
                  border: `1px solid ${emailFocus ? '#334155' : '#e2e8f0'}`,
                  borderRadius: 10, background: '#f8fafc',
                  boxShadow: emailFocus ? '0 0 0 3px rgba(51,65,85,0.08)' : 'none',
                  transition: 'all 0.2s',
                }}>
                  <span style={{ position: 'absolute', left: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <MailIcon />
                  </span>
                  {/* <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                    style={{
                      flex: 1, border: 'none', outline: 'none', background: 'transparent',
                      padding: '13px 14px 13px 44px', fontSize: 14, color: '#0f172a',
                      fontFamily: 'inherit', borderRadius: 10,
                      opacity: loading ? 0.6 : 1,
                    }}
                  /> */}
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    minLength={3}
                    maxLength={40}
                    onChange={e => {
                      const value = e.target.value;

                      if (value.length <= 40) {
                        setEmail(value);
                      }
                    }}
                    disabled={loading}
                    autoComplete="email"
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
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
                {loading ? <SpinnerIcon /> : 'Send reset link'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <NavLink
                to="/login"
                style={{ fontSize: 13, color: '#64748b', fontWeight: 500, textDecoration: 'none' }}
              >
                ← Back to login
              </NavLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
