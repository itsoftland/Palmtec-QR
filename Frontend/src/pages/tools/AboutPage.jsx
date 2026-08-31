import { useState, useEffect } from 'react';
import api, { BASE_URL } from '../../assets/js/axiosConfig';

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,12 2,6"/>
  </svg>
);

const PhoneIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.55 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

const BuildingIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h6"/><path d="M3 15h6"/><path d="M15 3v18"/>
  </svg>
);

function SkeletonLine({ width = '100%', height = 14 }) {
  return (
    <div style={{ width, height, background: '#e2e8f0', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
}

export default function AboutPage() {
  const [info,    setInfo]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`${BASE_URL}/about`);
        setInfo(res.data?.data ?? res.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load support information.');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div className="p-6 md:p-10 min-h-screen bg-slate-50">
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900">About</h1>
        <p className="text-sm text-slate-500 mt-0.5">Support &amp; contact information</p>
      </div>

      <div className="max-w-lg mx-auto">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

          {/* App identity block */}
          <div className="flex flex-col items-center py-8 px-6 border-b border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/><path d="M7 18h10"/>
                <rect x="4" y="3" width="16" height="16" rx="3"/>
                <circle cx="7.5" cy="17.5" r="1.5" fill="#fff" stroke="none"/>
                <circle cx="16.5" cy="17.5" r="1.5" fill="#fff" stroke="none"/>
                <path d="M4 19v2"/><path d="M20 19v2"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Palmtec Amphibia QR</h2>
            <p className="text-sm text-slate-500 mt-1">Integrated Fleet Operations Platform</p>
            <p className="text-xs text-slate-400 mt-0.5">© 2025 Softland India Ltd. All rights reserved.</p>
          </div>

          {/* Support section */}
          <div className="px-6 py-5">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-4">Support Contact</p>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9' }} />
                    <div className="flex-1 space-y-1.5">
                      <SkeletonLine width="40%" height={10} />
                      <SkeletonLine width="70%" height={14} />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-3 text-sm text-red-700">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Company', value: info?.support_company_name, Icon: BuildingIcon },
                  { label: 'Email',   value: info?.support_email,        Icon: MailIcon    },
                  { label: 'Phone',   value: info?.support_phone,        Icon: PhoneIcon   },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                      <Icon />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{label}</p>
                      <p className="text-sm text-slate-800 font-medium truncate">{value || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && !error && (
              <p className="text-xs text-slate-400 mt-5 leading-relaxed">
                For technical support, please use the above contacts.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
