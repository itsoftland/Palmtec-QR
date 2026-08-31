import { useState, useEffect, useRef } from 'react';
import api, { BASE_URL } from '../../assets/js/axiosConfig';

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition-all bg-white';

export default function GlobalSettingsPage() {
  const [form,       setForm]       = useState({ support_company_name: '', support_email: '', support_phone: '' });
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [banner,     setBanner]     = useState(null); // { type: 'success'|'error', msg: string }
  const timerRef = useRef(null);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await api.get(`${BASE_URL}/global-settings`);
        const d = res.data?.data ?? res.data;
        setForm({
          support_company_name: d?.support_company_name || '',
          support_email:        d?.support_email        || '',
          support_phone:        d?.support_phone        || '',
        });
      } catch (err) {
        setFetchError(err.response?.data?.error || 'Failed to load settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const showBanner = (type, msg) => {
    setBanner({ type, msg });
    if (timerRef.current) clearTimeout(timerRef.current);
    if (type === 'success') {
      timerRef.current = setTimeout(() => setBanner(null), 3000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBanner(null);
    setSubmitting(true);
    try {
      await api.put(`${BASE_URL}/global-settings`, {
        support_company_name: form.support_company_name,
        support_email:        form.support_email,
        support_phone:        form.support_phone,
      });
      showBanner('success', 'Settings saved.');
    } catch (err) {
      showBanner('error', err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-10 min-h-screen bg-slate-50">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900">Global Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure support contact shown on About page</p>
      </div>

      <div className="max-w-lg">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Support Contact</p>
          </div>

          <div className="px-6 py-5">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
                    <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                  </div>
                ))}
              </div>
            ) : fetchError ? (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-3 text-sm text-red-700">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{fetchError}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Support Company Name</label>
                  <input
                    type="text"
                    value={form.support_company_name}
                    onChange={e => setForm(f => ({ ...f, support_company_name: e.target.value }))}
                    placeholder="e.g. Softland India Ltd"
                    className={inputCls}
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Support Email</label>
                  <input
                    type="email"
                    value={form.support_email}
                    onChange={e => setForm(f => ({ ...f, support_email: e.target.value }))}
                    placeholder="support@example.com"
                    className={inputCls}
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Support Phone</label>
                  <input
                    type="text"
                    value={form.support_phone}
                    onChange={e => setForm(f => ({ ...f, support_phone: e.target.value }))}
                    placeholder="+91 XXXXX XXXXX"
                    className={inputCls}
                    disabled={submitting}
                  />
                </div>

                {/* Banner */}
                {banner && (
                  <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm border ${
                    banner.type === 'success'
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    {banner.type === 'success' ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    )}
                    <span>{banner.msg}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Saving…
                      </>
                    ) : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
