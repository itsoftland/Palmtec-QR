import { useState, useEffect, useCallback, useMemo } from 'react';
import TableSkeleton from '../../components/TableSkeleton';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import statesDistricts from '../../assets/json/indiaStatesDistricts.json';
import {
  Building2, CheckCircle2, CircleDot, Search,
  Phone, MapPin, IdCard, ArrowLeft, AlertCircle,
  Download, Plus, Mail, KeyRound, User, Sparkles,
  Eye, EyeOff, Edit, X, RefreshCw, Info,
} from 'lucide-react';

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ step, active = true, complete, title, subtitle, children }) {
  return (
    <div className={`rounded-2xl border mb-4 transition-all duration-200 ${complete ? 'border-emerald-200 bg-white' :
      active ? 'border-slate-200 bg-white shadow-sm' :
        'border-slate-200 bg-slate-50/60'
      }`}>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${complete ? 'bg-emerald-500 text-white' :
          active ? 'bg-slate-900 text-white' :
            'bg-slate-200 text-slate-400'
          }`}>
          {complete ? <CheckCircle2 size={14} color="#fff" /> : step}
        </div>
        <div>
          <p className={`font-semibold text-sm ${active || complete ? 'text-slate-900' : 'text-slate-400'}`}>{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className={`px-6 py-5 ${!active && !complete ? 'opacity-40 pointer-events-none select-none' : ''}`}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, hint, span, children }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="ml-1 text-xs text-slate-400 font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition-all bg-white placeholder:text-slate-400';

function CompanyPreview({ form, isImport }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Listing Preview</p>
        <p className="text-sm text-slate-600 mt-0.5">How this will appear in the directory</p>
      </div>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            {form.company_name
              ? <span className="text-base font-bold text-slate-700">{form.company_name.slice(0, 2).toUpperCase()}</span>
              : <Building2 size={18} className="text-slate-300" />}
          </div>
          <div className="min-w-0">
            <p className={`font-semibold truncate ${form.company_name ? 'text-slate-900' : 'text-slate-300 italic'}`}>
              {form.company_name || 'Company name…'}
            </p>
            <p className="text-xs text-slate-500 truncate">{form.company_email || 'email@example.com'}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Phone size={11} /><span>{form.contact_number ? `+91 ${form.contact_number}` : '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <IdCard size={11} /><span>{form.contact_person || '—'}</span>
          </div>
          <div className="flex items-start gap-2 text-slate-500">
            <MapPin size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">
              {[form.address, form.district, form.state].filter(Boolean).join(', ') || '—'}
            </span>
          </div>
        </div>
        {isImport && (
          <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-100 p-3 flex items-start gap-2">
            <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-700">License pre-validated by remote server.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistCard({ items }) {
  const done = items.filter(i => i.done).length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Progress</p>
          <p className="text-sm text-slate-700 font-semibold mt-0.5">{done} of {items.length} complete</p>
        </div>
        <div className="relative h-10 w-10">
          <svg className="absolute inset-0" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#0f172a" strokeWidth="3"
              strokeDasharray={`${(done / items.length) * 94.2} 94.2`}
              strokeDashoffset="0" transform="rotate(-90 18 18)" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
            {Math.round((done / items.length) * 100)}%
          </div>
        </div>
      </div>
      <ul className="px-5 py-4 space-y-2">
        {items.map(item => (
          <li key={item.label} className={`flex items-center gap-2 text-sm ${item.done ? 'text-slate-700' : 'text-slate-400'}`}>
            {item.done
              ? <CheckCircle2 size={14} className="text-emerald-500" />
              : <CircleDot size={14} className="text-slate-300" />}
            <span className={item.done ? 'line-through decoration-slate-300' : ''}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TipCard() {
  return (
    <div className="rounded-2xl bg-slate-900 text-white p-5 relative overflow-hidden">
      <div className="absolute -right-4 -top-4 opacity-10">
        <Sparkles size={80} color="#fff" />
      </div>
      <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">Tip</p>
      <p className="text-sm mt-1.5 leading-relaxed text-white/90">
        After saving, use <span className="text-white font-semibold">License Action</span> in the directory to register with the license server.
      </p>
    </div>
  );
}

function ModalWrapper({ open, onClose, title, icon: Icon, width = 'max-w-2xl', children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[88vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 text-slate-800">
            {Icon && <Icon size={16} className="text-slate-600" />}
            <h3 className="font-semibold text-slate-900">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── EMPTY form ─────────────────────────────────────────────────────────────────
const EMPTY = {
  company_name: '', company_email: '', gst_number: '', aggregator_merchant_id: '',
  contact_person: '', contact_number: '',
  address: '', state: '', district: '',
  is_active: true,
  user_username: '', user_email: '', user_password: '',
  // dealer path — pool allocation (only sent when role === dealer_admin)
  palmtec_count: '', total_user_count: '', premium_user_count: '', intermediate_user_count: '',
};

// ── Helper ─────────────────────────────────────────────────────────────────────
function getStatusStyle(s) {
  switch (s) {
    case 'Approve': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Pending': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Validating': return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'Expired': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function DiffRow({ label, current, incoming, inUse }) {
  const changed = current !== incoming;
  return (
    <div className={`rounded-lg px-3 py-2.5 border text-sm ${changed ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-slate-600">Was: <strong>{current ?? '—'}</strong></span>
        {changed && <span className="text-blue-700">→ New: <strong>{incoming}</strong></span>}
        {!changed && <span className="text-slate-400 text-xs">(no change)</span>}
        {inUse !== undefined && <span className="text-slate-500 text-xs ml-auto">In use: {inUse}</span>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function CompanyListing() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isDealerAdmin = currentUser?.role === 'dealer_admin';
  const isExecutive = currentUser?.role === 'executive';
  const executiveState = currentUser?.state || '';

  // ── List state ───────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registeringLicense, setRegisteringLicense] = useState({});
  const [validatingLicense, setValidatingLicense] = useState({});
  const [syncingLicense, setSyncingLicense] = useState({});
  const [togglingActive, setTogglingActive] = useState({});
  const [search, setSearch] = useState('');

  // ── Sync modal state ─────────────────────────────────────────────────────
  const [syncModal, setSyncModal] = useState(null);   // null | { companyId, data }
  const [syncConfirming, setSyncConfirming] = useState(false);

  // ── Dealer pool balance (fetched when dealer_admin opens create view) ────
  const [dealerPool, setDealerPool] = useState(null);
  const [poolLoading, setPoolLoading] = useState(false);

  // ── Page view: 'list' | 'create' ────────────────────────────────────────
  const [pageView, setPageView] = useState('list');

  // ── Create form state ────────────────────────────────────────────────────
  const [createMode, setCreateMode] = useState('new');
  const [importStep, setImportStep] = useState('search');
  const [importId, setImportId] = useState('');
  const [importFetching, setImportFetching] = useState(false);
  const [importError, setImportError] = useState('');
  const [importLicense, setImportLicense] = useState(null);
  const [form, setForm] = useState(() =>
    currentUser?.role === 'executive' && currentUser?.state
      ? { ...EMPTY, state: currentUser.state }
      : EMPTY
  );
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Modal state (view / edit) ────────────────────────────────────────────
  const [modal, setModal] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [modalForm, setModalForm] = useState(EMPTY);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/customer-data`);
      setCompanies(res.data?.data || []);
    } catch { setCompanies([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  useEffect(() => {
    const hasValidating = companies.some(c => c.authentication_status === 'Validating');
    if (!hasValidating) return;
    const id = setInterval(fetchCompanies, 5000);
    return () => clearInterval(id);
  }, [companies, fetchCompanies]);

  // Fetch dealer pool balance when dealer_admin enters create view
  useEffect(() => {
    if (!isDealerAdmin || pageView !== 'create') return;
    setPoolLoading(true);
    api.get(`${BASE_URL}/dealer-dashboard`)
      .then(res => setDealerPool(res.data?.data?.pool || null))
      .catch(() => setDealerPool(null))
      .finally(() => setPoolLoading(false));
  }, [isDealerAdmin, pageView]);

  // ── Form helpers ─────────────────────────────────────────────────────────
  const set = (k, v) => setForm(f => k === 'state' ? { ...f, state: v, district: '' } : { ...f, [k]: v });

  const resetCreate = () => {
    setForm(isExecutive ? { ...EMPTY, state: executiveState } : EMPTY);
    setCreateMode('new');
    setImportStep('search');
    setImportId('');
    setImportError('');
    setImportLicense(null);
  };

  // ── Create form completeness ──────────────────────────────────────────────
  const sec1 = !!(form.company_name && form.company_email && form.contact_person && form.contact_number);
  const sec2 = !!(form.address && form.state && form.district);
  const sec3 = !!(form.user_username && form.user_email && form.user_password);
  // Pool validation errors (dealer_admin create only)
  const poolErrors = useMemo(() => {
    if (!isDealerAdmin || !dealerPool) return {};
    const palmtec = parseInt(form.palmtec_count) || 0;
    const total = parseInt(form.total_user_count) || 0;
    const premium = parseInt(form.premium_user_count) || 0;
    const inter = parseInt(form.intermediate_user_count) || 0;
    const basic = total - premium - inter;
    const errs = {};
    if (palmtec > dealerPool.palmtec.remaining)
      errs.palmtec = `Max ${dealerPool.palmtec.remaining} available`;
    if (total > dealerPool.total_users.remaining)
      errs.total = `Max ${dealerPool.total_users.remaining} available`;
    if (premium > dealerPool.premium.remaining)
      errs.premium = `Max ${dealerPool.premium.remaining} available`;
    if (inter > dealerPool.inter.remaining)
      errs.inter = `Max ${dealerPool.inter.remaining} available`;
    if (basic < 0)
      errs.basic = 'Total users must be ≥ premium + intermediate';
    else if (basic > dealerPool.basic.remaining)
      errs.basic = `Max ${dealerPool.basic.remaining} basic slots available`;
    return errs;
  }, [isDealerAdmin, dealerPool, form.palmtec_count, form.total_user_count, form.premium_user_count, form.intermediate_user_count]);

  const sec4 = !isDealerAdmin || (!!(parseInt(form.total_user_count) > 0) && Object.keys(poolErrors).length === 0);
  const canSubmit = sec1 && sec2 && sec3 && sec4;

  // ── Import fetch ─────────────────────────────────────────────────────────
  const handleFetchImport = async () => {
    const id = importId.trim();
    if (!id) { setImportError('Please enter a Company ID.'); return; }
    const dup = companies.find(c => String(c.company_id).toLowerCase() === id.toLowerCase());
    if (dup) { setImportError(`"${dup.company_name}" is already registered with that ID.`); return; }
    setImportFetching(true);
    setImportError('');
    try {
      const res = await api.get(`${BASE_URL}/get-company-by-company-id/${id}`);
      const data = res.data?.data;
      if (!data) { setImportError('No company found with that ID.'); return; }
      setImportLicense({
        product_to_date: data.product_to_date || null,
        authentication_status: data.authentication_status || null,
        is_expired: data.is_expired || false,
      });
      setImportStep('confirm');
    } catch (err) {
      setImportError(err.response?.data?.message || err.response?.data?.error || 'Failed to fetch company data.');
    } finally { setImportFetching(false); }
  };

  // ── Create submit ────────────────────────────────────────────────────────
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const payload = {
      company_name: form.company_name,
      company_email: form.company_email,
      contact_person: form.contact_person,
      contact_number: form.contact_number,
      gst_number: form.gst_number,
      aggregator_merchant_id: form.aggregator_merchant_id || null,
      address: form.address,
      state: form.state,
      district: form.district,
      user_username: form.user_username,
      user_email: form.user_email,
      user_password: form.user_password,
      ...(isDealerAdmin && {
        palmtec_count: parseInt(form.palmtec_count) || 0,
        total_user_count: parseInt(form.total_user_count) || 0,
        premium_user_count: parseInt(form.premium_user_count) || 0,
        intermediate_user_count: parseInt(form.intermediate_user_count) || 0,
      }),
    };
    try {
      let res;
      if (createMode === 'import') {
        res = await api.post(`${BASE_URL}/import-company`, { company_id: importId, ...payload });
      } else {
        res = await api.post(`${BASE_URL}/create-company`, payload);
      }
      if (res?.status === 200 || res?.status === 201) {
        window.alert(res.data.message || 'Company registered successfully!');
        setPageView('list');
        resetCreate();
        fetchCompanies();
      }
    } catch (err) {
      const { status, data } = err.response || {};
      if (status === 400 && data?.errors) {
        window.alert(Object.values(data.errors)[0]?.[0] || data.message);
      } else {
        window.alert(data?.message || 'Something went wrong.');
      }
    } finally { setSubmitting(false); }
  };

  // ── License actions ──────────────────────────────────────────────────────
  const handleRegisterLicense = async (companyId) => {
    setRegisteringLicense(p => ({ ...p, [companyId]: true }));
    try {
      const res = await api.post(`${BASE_URL}/register-company-license/${companyId}`);
      if (res.status === 200) { window.alert(res.data.message || 'Registered!'); fetchCompanies(); }
    } catch (err) {
      window.alert(err.response?.data?.message || err.response?.data?.error || 'Registration failed.');
    } finally { setRegisteringLicense(p => ({ ...p, [companyId]: false })); }
  };

  const handleValidateLicense = async (companyId) => {
    setValidatingLicense(p => ({ ...p, [companyId]: true }));
    try {
      const res = await api.post(`${BASE_URL}/validate-company-license/${companyId}`);
      if (res.status === 200) { window.alert(res.data.message || 'Validation started!'); fetchCompanies(); }
    } catch (err) {
      window.alert(err.response?.data?.message || err.response?.data?.error || 'Validation failed.');
    } finally { setValidatingLicense(p => ({ ...p, [companyId]: false })); }
  };

  const handleSyncLicense = async (company) => {
    setSyncingLicense(p => ({ ...p, [company.id]: true }));
    try {
      const res = await api.post(`${BASE_URL}/sync-company-license/${company.id}`);
      if (res.status === 200) {
        setSyncModal({ companyId: company.id, companyName: company.company_name, data: res.data.data });
      }
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to fetch sync data from license server.');
    } finally { setSyncingLicense(p => ({ ...p, [company.id]: false })); }
  };

  const handleSyncConfirm = async () => {
    if (!syncModal) return;
    setSyncConfirming(true);
    try {
      const res = await api.post(`${BASE_URL}/sync-company-license/${syncModal.companyId}/confirm`);
      if (res.status === 200) {
        window.alert('License data updated successfully.');
        setSyncModal(null);
        fetchCompanies();
      }
    } catch (err) {
      window.alert(err.response?.data?.error || 'Sync failed. Please try again.');
    } finally { setSyncConfirming(false); }
  };

  const handleToggleActive = async (company) => {
    const nextActive = !company.is_active;
    const confirmMsg = nextActive
      ? `Activate "${company.company_name}"? Users will be able to log in again.`
      : `Deactivate "${company.company_name}"? All logged-in users of this company will be signed out immediately and blocked from logging in.`;
    if (!window.confirm(confirmMsg)) return;
    setTogglingActive(p => ({ ...p, [company.id]: true }));
    setCompanies(list => list.map(c => c.id === company.id ? { ...c, is_active: nextActive } : c));
    try {
      await api.put(`${BASE_URL}/update-company-details/${company.id}`, { is_active: nextActive });
    } catch (err) {
      setCompanies(list => list.map(c => c.id === company.id ? { ...c, is_active: company.is_active } : c));
      window.alert(err.response?.data?.message || err.response?.data?.error || 'Failed to update status.');
    } finally { setTogglingActive(p => ({ ...p, [company.id]: false })); }
  };

  // ── Edit / View modal ────────────────────────────────────────────────────
  const openView = (company) => {
    setModalForm({
      company_name: company.company_name || '',
      company_email: company.company_email || '',
      gst_number: company.gst_number || '',
      aggregator_merchant_id: company.aggregator_merchant_id || '',
      contact_person: company.contact_person || '',
      contact_number: company.contact_number || '',
      address: company.address || '',
      state: company.state || '',
      district: company.district || '',
      is_active: company.is_active ?? true,
    });
    setEditingItem(company);
    setModal('view');
  };

  const openEdit = (company) => {
    openView(company);
    setModal('edit');
  };

  const handleModalInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 10);
      setModalForm(f => ({ ...f, contact_number: digits }));
      return;
    }
    setModalForm(f => name === 'state' ? { ...f, state: value, district: '' } : { ...f, [name]: value });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setModalSubmitting(true);
    try {
      const res = await api.put(`${BASE_URL}/update-company-details/${editingItem.id}`, {
        company_name: modalForm.company_name,
        company_email: modalForm.company_email,
        contact_person: modalForm.contact_person,
        contact_number: modalForm.contact_number,
        gst_number: modalForm.gst_number,
        aggregator_merchant_id: modalForm.aggregator_merchant_id || null,
        address: modalForm.address,
        state: modalForm.state,
        district: modalForm.district,
      });
      if (res?.status === 200 || res?.status === 201) {
        window.alert(res.data.message || 'Company updated!');
        setModal(null);
        fetchCompanies();
      }
    } catch (err) {
      const { status, data } = err.response || {};
      if (status === 400 && data?.errors) {
        window.alert(Object.values(data.errors)[0]?.[0] || data.message);
      } else {
        window.alert(data?.message || 'Something went wrong.');
      }
    } finally { setModalSubmitting(false); }
  };

  const isExpired = (c) => c.product_to_date && new Date() > new Date(c.product_to_date);

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(c =>
      c.company_name?.toLowerCase().includes(q) ||
      c.company_email?.toLowerCase().includes(q) ||
      c.contact_person?.toLowerCase().includes(q)
    );
  }, [companies, search]);

  // ══════════════════════════════════════════════════════════════════════════
  // ── LIST VIEW ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (pageView === 'list') {
    return (
      <div className="p-6 md:p-8 min-h-screen bg-slate-50">

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-3">Administration <span className="mx-1">›</span> <span className="text-slate-600 font-medium">Companies</span></p>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-md">
                <Building2 size={18} color="#fff" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Companies</h1>
                <p className="text-sm text-slate-500 mt-0.5">{companies.length} companies registered</p>
              </div>
            </div>
            <button
              onClick={() => { resetCreate(); setPageView('create'); }}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-slate-900 hover:bg-slate-700 text-white cursor-pointer transition-colors shadow-sm"
            >
              <Plus size={14} /> Register Company
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm max-w-sm w-full">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
          <span className="text-xs text-slate-400 tabular-nums shrink-0">
            {filteredCompanies.length} result{filteredCompanies.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Company ID</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Company</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">License Units</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">License</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Validity</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">Access</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">License Action</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <TableSkeleton columns={['w-40', 'w-20', 'w-16', 'w-16', 'w-24', 'w-16', 'w-24', 'w-16']} />
                ) : filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 size={20} className="text-slate-300" />
                        <p className="text-sm text-slate-400">{search ? 'No companies match your search' : 'No companies found'}</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredCompanies.map(company => {
                  const authStatus = company.authentication_status;
                  const isApproved = authStatus === 'Approve';
                  const isValidating = authStatus === 'Validating';
                  const hasConfigErr = !!company.error_message;
                  const hasCompanyId = company.company_id != null;
                  const registering = registeringLicense[company.id];
                  const validating = validatingLicense[company.id];
                  const syncing = syncingLicense[company.id];
                  const expired = isExpired(company);
                  const initials = (company.company_name || '??').slice(0, 2).toUpperCase();

                  // Button state machine
                  const showRegister = !hasCompanyId;
                  const showAuthenticate = hasCompanyId && !isApproved && !isValidating;
                  const showSync = hasCompanyId && isApproved && !expired && !hasConfigErr && company.client_type === 'direct';
                  const showValidating = isValidating;

                  return (
                    <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <span className="text-base font-mono font-semibold text-slate-800 pl-2">
                          {company.company_id ?? <span className="text-slate-400 font-sans font-normal text-sm">—</span>}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-[11px] font-bold text-slate-600">{initials}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{company.company_name}</p>
                            <p className="text-xs text-slate-500 truncate leading-tight">{company.company_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-slate-700">
                          {company.number_of_licences || 0}
                          <span className="text-xs text-slate-400 font-normal ml-1">units</span>
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border w-fit ${getStatusStyle(authStatus)}`}>
                            {authStatus || 'Pending'}
                          </span>
                          {hasConfigErr && (
                            <p className="text-xs text-amber-700 font-medium">⚠ Config error</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {company.product_from_date && company.product_to_date ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-slate-500">
                              {new Date(company.product_from_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className={`text-sm font-medium ${expired ? 'text-red-600' : 'text-slate-700'}`}>
                              {new Date(company.product_to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(company)}
                          disabled={togglingActive[company.id]}
                          title={company.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                          className="inline-flex items-center gap-1.5 w-fit cursor-pointer disabled:opacity-50"
                        >
                          <span className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${company.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${company.is_active ? 'translate-x-[14px]' : ''}`} />
                          </span>
                          <span className={`text-xs font-medium ${company.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {company.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          {showRegister && (
                            <button onClick={() => handleRegisterLicense(company.id)} disabled={registering}
                              className="text-xs font-medium bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer">
                              {registering ? 'Registering…' : 'Register'}
                            </button>
                          )}
                          {showAuthenticate && (
                            <button onClick={() => handleValidateLicense(company.id)} disabled={validating}
                              className={`text-xs font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 cursor-pointer ${expired ? 'bg-red-600 hover:bg-red-700 text-white' :
                                hasConfigErr ? 'bg-amber-600 hover:bg-amber-700 text-white' :
                                  'bg-slate-900 hover:bg-slate-700 text-white'
                                }`}>
                              {validating ? 'Starting…' : expired ? 'Re-authenticate' : hasConfigErr ? 'Retry Auth' : 'Authenticate'}
                            </button>
                          )}
                          {showSync && (
                            <button onClick={() => handleSyncLicense(company)} disabled={syncing}
                              className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50 cursor-pointer">
                              {syncing ? <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Fetching…</> : <><RefreshCw size={13} /> Sync License</>}
                            </button>
                          )}
                          {showValidating && (
                            <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold animate-pulse">
                              <svg className="h-3 w-3 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Validating…
                            </span>
                          )}
                          {isApproved && !showSync && !isValidating && !expired && company.client_type !== 'direct' && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                              <CheckCircle2 size={12} /> Active
                            </span>
                          )}
                          {isApproved && !expired && company.client_type === 'direct' && !showSync && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                              <CheckCircle2 size={12} /> Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => openView(company)} title="View"
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => openEdit(company)} disabled={isValidating} title="Edit"
                            className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors disabled:opacity-30">
                            <Edit size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* View Modal */}
        <ModalWrapper open={modal === 'view'} onClose={() => setModal(null)} title="Company Details" icon={Building2}>
          {editingItem && (() => {
            const c = editingItem;
            const initials = (c.company_name || '??').slice(0, 2).toUpperCase();
            const expired = isExpired(c);
            return (
              <div className="space-y-5">
                {/* Identity card */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="h-14 w-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-xl font-bold text-slate-700">{initials}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-lg font-bold text-slate-900">{c.company_name}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${c.is_active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${getStatusStyle(c.authentication_status)}`}>
                        {c.authentication_status || 'Pending'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{c.company_email}</p>
                  </div>
                </div>

                {/* Config error banner */}
                {c.error_message && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
                    <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-600" />
                    {c.error_message}
                  </div>
                )}

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Contact Person', value: c.contact_person },
                    { label: 'Contact Number', value: c.contact_number ? `+91 ${c.contact_number}` : '—' },
                    { label: 'GST Number', value: c.gst_number || '—' },
                    { label: 'Payment Aggregator Merchant ID', value: c.aggregator_merchant_id || '—' },
                    { label: 'Company ID', value: c.company_id ? `#${c.company_id}` : 'Not registered' },
                    { label: 'Valid From', value: c.product_from_date ? new Date(c.product_from_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                    { label: 'Valid Till', value: c.product_to_date ? new Date(c.product_to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
                      <p className="text-sm font-medium mt-0.5 text-slate-800 break-all">{value ?? '—'}</p>
                    </div>
                  ))}
                </div>

                {/* License capacity breakdown */}
                {(c.number_of_licences > 0 || c.palmtec_count > 0 || c.total_user_count > 0) && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">License Allocation</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Total Licensed Units', value: c.number_of_licences || 0 },
                        { label: 'Palmtec Devices', value: c.palmtec_count || 0 },
                        { label: 'Total User Slots', value: c.total_user_count || 0 },
                        { label: 'Premium Slots', value: c.premium_user_count || 0 },
                        { label: 'Intermediate Slots', value: c.intermediate_user_count || 0 },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">{label}</p>
                          <p className="text-lg font-bold text-blue-800">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Address */}
                {(c.address || c.state) && (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Address</p>
                    <div className="flex items-start gap-1.5 text-sm text-slate-700">
                      <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                      <span>{[c.address, c.district, c.state].filter(Boolean).join(', ')}</span>
                    </div>
                  </div>
                )}

                {expired && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-700">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    License expired on {new Date(c.product_to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button onClick={() => { setModal(null); setTimeout(() => openEdit(c), 100); }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                    <Edit size={14} /> Edit
                  </button>
                  <button onClick={() => setModal(null)}
                    className="flex-1 inline-flex items-center justify-center h-9 px-4 text-sm rounded-lg font-medium bg-slate-900 text-white hover:bg-slate-700 cursor-pointer transition-colors">
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </ModalWrapper>

        {/* Edit Modal */}
        <ModalWrapper open={modal === 'edit'} onClose={() => setModal(null)} title="Edit Company" icon={Edit}>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Company Name', name: 'company_name', required: true },
                { label: 'Email', name: 'company_email', type: 'email', required: true },
                { label: 'Contact Person', name: 'contact_person', required: true },
                { label: 'Contact Number', name: 'contact_number', required: true },
                { label: 'GST Number', name: 'gst_number' },
                { label: 'Payment Aggregator Merchant ID', name: 'aggregator_merchant_id' },
              ].map(f => (
                <div key={f.name} className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {/* <input type={f.type || 'text'} name={f.name} value={modalForm[f.name] || ''} onChange={handleModalInputChange}
                    required={f.required}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                  <input
                    type={f.name === 'contact_number' ? 'tel' : (f.type || 'text')}
                    name={f.name}
                    value={modalForm[f.name] || ''}
                    onChange={handleModalInputChange}
                    required={f.required}
                    minLength={f.name === 'contact_number' ? 10 : 3}
                    maxLength={f.name === 'contact_number' ? 10 : 20}
                    pattern={f.name === 'contact_number' ? '[0-9]{10}' : undefined}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Address <span className="text-red-500">*</span></label>
              {/* <textarea name="address" value={modalForm.address || ''} onChange={handleModalInputChange}
                rows={2} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
              <textarea
                name="address"
                value={modalForm.address || ''}
                onChange={handleModalInputChange}
                rows={3}
                required
                minLength={3}
                maxLength={400}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">State <span className="text-red-500">*</span></label>
                <select name="state" value={modalForm.state} onChange={handleModalInputChange} required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white">
                  <option value="">Select state…</option>
                  {Object.keys(statesDistricts).sort().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">District <span className="text-red-500">*</span></label>
                <select name="district" value={modalForm.district} onChange={handleModalInputChange} required
                  disabled={!modalForm.state}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white disabled:bg-slate-50">
                  <option value="">Select district…</option>
                  {(statesDistricts[modalForm.state] || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setModal(null)}
                className="flex-1 inline-flex items-center justify-center h-9 px-4 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={modalSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-slate-900 hover:bg-slate-700 text-white cursor-pointer transition-colors shadow-sm disabled:opacity-50">
                {modalSubmitting
                  ? <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Saving…</>
                  : 'Update Company'}
              </button>
            </div>
          </form>
        </ModalWrapper>

        {/* Sync License Modal */}
        <ModalWrapper open={!!syncModal} onClose={() => !syncConfirming && setSyncModal(null)} title="Sync License Data" icon={RefreshCw} width="max-w-xl">
          {syncModal && (() => {
            const d = syncModal.data;
            const hasError = !!d?.error;
            return (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Showing latest data from the license server for <strong>{syncModal.companyName}</strong>.
                  Review the changes before applying.
                </p>

                {hasError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                    <span>{d.error}</span>
                  </div>
                )}

                {!hasError && d && (
                  <div className="space-y-2">
                    <DiffRow label="Total Licensed Units" current={d.current?.number_of_licences} incoming={d.incoming?.number_of_licences} />
                    <DiffRow label="Palmtec Devices" current={d.current?.palmtec_count} incoming={d.incoming?.palmtec_count} inUse={d.in_use?.palmtec_devices_allocated} />
                    <DiffRow label="Total User Slots" current={d.current?.total_user_count} incoming={d.incoming?.total_user_count} inUse={d.in_use?.active_sessions_total} />
                    <DiffRow label="Premium User Slots" current={d.current?.premium_user_count} incoming={d.incoming?.premium_user_count} inUse={d.in_use?.active_sessions_premium} />
                    <DiffRow label="Intermediate User Slots" current={d.current?.intermediate_user_count} incoming={d.incoming?.intermediate_user_count} inUse={d.in_use?.active_sessions_intermediate} />
                    <DiffRow label="Valid Till" current={d.current?.product_to_date} incoming={d.incoming?.product_to_date} />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button onClick={() => setSyncModal(null)} disabled={syncConfirming}
                    className="flex-1 inline-flex items-center justify-center h-9 px-4 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={handleSyncConfirm} disabled={syncConfirming || hasError}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors disabled:opacity-50">
                    {syncConfirming
                      ? <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Applying…</>
                      : <><RefreshCw size={13} /> Apply Sync</>}
                  </button>
                </div>
              </div>
            );
          })()}
        </ModalWrapper>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── CREATE VIEW ────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 md:p-8 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-slate-400 mb-3">Administration <span className="mx-1">›</span> Companies <span className="mx-1">›</span> <span className="text-slate-600 font-medium">Register Company</span></p>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-md">
              <Building2 size={18} color="#fff" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Register Company</h1>
              <p className="text-sm text-slate-500 mt-0.5">Create a new client company or import one from the license server</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => { setPageView('list'); resetCreate(); }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
              <ArrowLeft size={14} /> Cancel
            </button>
            <button onClick={handleCreateSubmit} disabled={!canSubmit || submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-all shadow-sm">
              {submitting
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Saving…</>
                : <>Save Company</>}
            </button>
          </div>
        </div>
      </div>

      {/* Mode switch */}
      <div className="mb-6 inline-flex rounded-xl border border-slate-200 p-1 bg-white shadow-sm">
        <button onClick={() => { setCreateMode('new'); setImportStep('search'); setImportId(''); setImportError(''); setImportLicense(null); }}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer flex items-center gap-2 ${createMode === 'new' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <Plus size={13} /> Register New
        </button>
        <button onClick={() => setCreateMode('import')}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer flex items-center gap-2 ${createMode === 'import' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <Download size={13} /> Import Existing
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Form ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2">

          {/* Import search step */}
          {createMode === 'import' && importStep === 'search' && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-4">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center">
                  <Search size={14} color="#fff" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-900">Find on License Server</p>
                  <p className="text-xs text-slate-500 mt-0.5">Enter the Company ID to fetch license details before saving</p>
                </div>
              </div>
              <div className="px-6 py-5 space-y-3">
                <Field label="Company ID" required>
                  <div className="flex gap-2">
                    <input value={importId} onChange={e => { setImportId(e.target.value); setImportError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleFetchImport()}
                      placeholder="e.g. COMP-001" className={inputCls} autoFocus />
                    <button type="button" onClick={handleFetchImport} disabled={importFetching}
                      className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap">
                      {importFetching
                        ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Fetching…</>
                        : <><Search size={13} /> Fetch</>}
                    </button>
                  </div>
                </Field>
                {importError && (
                  <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    <AlertCircle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-rose-700">{importError}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Import confirm banner */}
          {createMode === 'import' && importStep === 'confirm' && importLicense && (
            <div className="rounded-2xl border border-emerald-200 bg-white mb-4 overflow-hidden">
              <div className="p-4 bg-emerald-50 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 size={16} color="#fff" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-emerald-800">License found for <span className="font-mono">{importId}</span></p>
                  {importLicense.product_to_date && (
                    <p className="text-xs text-emerald-700 mt-0.5">
                      {importLicense.is_expired ? 'Expired on ' : 'Valid until '}
                      <strong>{new Date(importLicense.product_to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                    </p>
                  )}
                </div>
                <button onClick={() => { setImportStep('search'); setImportLicense(null); }}
                  className="text-xs text-emerald-700 hover:text-emerald-900 underline underline-offset-2 cursor-pointer whitespace-nowrap">
                  ← Different ID
                </button>
              </div>
            </div>
          )}

          {/* Form steps */}
          {(createMode === 'new' || (createMode === 'import' && importStep === 'confirm')) && (
            <form onSubmit={handleCreateSubmit}>
              {/* Step 1: Company Identity */}
              <SectionCard step={1} active complete={sec1} title="Company Identity" subtitle="Core details used to identify and contact this client.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Company Name" required>
                    {/* <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Acme Transport Pvt Ltd" className={inputCls} /> */}
                    <input type="text" value={form.company_name} onChange={(e) => {
                      if (e.target.value.length <= 20) {
                        set('company_name', e.target.value);
                      }
                    }}
                      placeholder="Acme Transport Pvt Ltd"
                      className={inputCls}
                      minLength={3}
                      maxLength={20}
                      required
                    />
                  </Field>
                  <Field label="Company Email" required>
                    {/* <input type="email" value={form.company_email} onChange={e => set('company_email', e.target.value)} placeholder="ops@acme.in" className={inputCls} /> */}
                    <input
                      type="email"
                      value={form.company_email}
                      onChange={(e) => {
                        if (e.target.value.length <= 300) {
                          set("company_email", e.target.value);
                        }
                      }}
                      placeholder="ops@acme.in"
                      className={inputCls}
                      minLength={3}
                      maxLength={300}
                      required
                    />
                  </Field>
                  <Field label="Contact Person" required>
                    {/* <input value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="Jane Doe" className={inputCls} /> */}
                    <input
                      type="text"
                      value={form.contact_person}
                      onChange={(e) => {
                        if (e.target.value.length <= 20) {
                          set("contact_person", e.target.value);
                        }
                      }}
                      placeholder="Jane Doe"
                      className={inputCls}
                      minLength={3}
                      maxLength={20}
                      required
                    />
                  </Field>
                  <Field label="Contact Number" required hint="10-digit mobile">
                    <div className="flex gap-0">
                      <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg">+91</span>
                      {/* <input value={form.contact_number} onChange={e => set('contact_number', e.target.value)} placeholder="98XXXXXX21"
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                      <input
                        type="tel"
                        value={form.contact_number}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, ""); // Allow only digits
                          if (value.length <= 10) {
                            set("contact_number", value);
                          }
                        }}
                        placeholder="98XXXXXX21"
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                        pattern="[0-9]{10}"
                        minLength={10}
                        maxLength={10}
                        required
                      />
                    </div>
                  </Field>
                  <Field label="GST Number" hint="Optional" span={1}>
                    {/* <input value={form.gst_number} onChange={e => set('gst_number', e.target.value)} placeholder="29ABCDE1234F1Z5" className={inputCls} /> */}
                    <input
                      type="text"
                      value={form.gst_number}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        if (value.length <= 15) {
                          set("gst_number", value);
                        }
                      }}
                      placeholder="29ABCDE1234F1Z5"
                      className={inputCls}
                      maxLength={15}
                      pattern="^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$"
                      title="Enter a valid 15-character GSTIN"
                    />
                  </Field>
                  <Field label="Payment Aggregator Merchant ID" hint="Optional" span={1}>
                    {/* <input value={form.aggregator_merchant_id} onChange={e => set('aggregator_merchant_id', e.target.value)} placeholder="HDFC000024839241" className={inputCls} /> */}
                    <input
                      value={form.aggregator_merchant_id}
                      minLength={3}
                      maxLength={20}
                      onChange={e => set('aggregator_merchant_id', e.target.value)}
                      placeholder="HDFC000024839241"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </SectionCard>

              {/* Step 2: Address */}
              <SectionCard step={2} active={sec1} complete={sec2} title="Registered Address" subtitle="Primary location details.">
                <div className="space-y-4">
                  <Field label="Address" required>
                    {/* <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} placeholder="Street, area, landmark…"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                    <textarea
                      value={form.address}
                      onChange={(e) => {
                        if (e.target.value.length <= 400) {
                          set("address", e.target.value);
                        }
                      }}
                      rows={2}
                      placeholder="Street, area, landmark…"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                      minLength={10}
                      maxLength={400}
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="State" required>
                      {isExecutive ? (
                        <input value={executiveState} readOnly
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
                      ) : (
                        <select value={form.state} onChange={e => set('state', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white">
                          <option value="">Select state…</option>
                          {Object.keys(statesDistricts).sort().map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                    </Field>
                    <Field label="District" required>
                      <select value={form.district} onChange={e => set('district', e.target.value)} disabled={!form.state}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white disabled:bg-slate-50">
                        <option value="">Select district…</option>
                        {(statesDistricts[form.state] || []).map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              </SectionCard>

              {/* Step 3: User Account */}
              <SectionCard step={3} active={sec2} complete={sec3} title="Admin User Account" subtitle="Login credentials for the company admin.">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:items-end">
                  <Field label="Username" required>
                    <div className="flex gap-0">
                      <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg"><User size={13} /></span>
                      {/* <input value={form.user_username} onChange={e => set('user_username', e.target.value.toLowerCase())} placeholder="acme-admin"
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                      <input
                        type="text"
                        value={form.user_username}
                        onChange={(e) => {
                          const value = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, ""); // Allow only letters, numbers, underscore

                          if (value.length <= 20) {
                            set("user_username", value);
                          }
                        }}
                        placeholder="acme_admin"
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                        minLength={3}
                        maxLength={20}
                        pattern="^[a-z0-9_]{3,20}$"
                        title="Username must be 3-20 characters and contain only lowercase letters, numbers, and underscores."
                        required
                      />
                    </div>
                  </Field>
                  <Field label="Login Email" required>
                    <div className="flex gap-0">
                      <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg"><Mail size={13} /></span>
                      {/* <input type="email" value={form.user_email} onChange={e => set('user_email', e.target.value)} placeholder="admin@acme.in"
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                      <input
                        type="email"
                        value={form.user_email}
                        onChange={(e) => {
                          if (e.target.value.length <= 300) {
                            set("user_email", e.target.value);
                          }
                        }}
                        placeholder="admin@acme.in"
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                        minLength={3}
                        maxLength={300}
                        required
                      />
                    </div>
                  </Field>
                  <Field label="Temporary Password" required hint="Min 8 chars">
                    <div className="flex gap-0">
                      <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg"><KeyRound size={13} /></span>
                      {/* <input type="text" value={form.user_password} onChange={e => set('user_password', e.target.value)} placeholder="—"
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                      <div className="relative flex-1 min-w-0">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={form.user_password}
                          onChange={(e) => {
                            if (e.target.value.length <= 20) {
                              set("user_password", e.target.value);
                            }
                          }}
                          placeholder="Password"
                          className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                          minLength={8}
                          maxLength={20}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          tabIndex={-1}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </Field>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-700">
                  <Info size={13} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>This admin account is <strong>not counted against the allocated licensed user slots</strong>. It provides management access to the company dashboard and is excluded from all login slot caps.</span>
                </div>
              </SectionCard>

              {/* Step 4: Pool Allocation — dealer_admin only */}
              {isDealerAdmin && createMode === 'new' && (
                <SectionCard step={4} active={sec3} complete={sec4} title="Pool Allocation" subtitle="Deduct from your license pool — cannot exceed your remaining balance.">

                  {/* Pool balance summary */}
                  {poolLoading ? (
                    <div className="mb-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-400 animate-pulse">
                      Loading pool balance…
                    </div>
                  ) : dealerPool ? (
                    <div className="mb-4 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                      <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 border-b border-slate-100">
                        Your Remaining Pool Balance
                      </p>
                      <div className="grid grid-cols-5 divide-x divide-slate-100">
                        {[
                          { label: 'ETM Devices', val: dealerPool.palmtec.remaining, total: dealerPool.palmtec.total },
                          { label: 'Total Users', val: dealerPool.total_users.remaining, total: dealerPool.total_users.total },
                          { label: 'Premium', val: dealerPool.premium.remaining, total: dealerPool.premium.total },
                          { label: 'Intermediate', val: dealerPool.inter.remaining, total: dealerPool.inter.total },
                          { label: 'Basic', val: dealerPool.basic.remaining, total: dealerPool.basic.total },
                        ].map(({ label, val, total }) => (
                          <div key={label} className="px-3 py-2.5 text-center">
                            <p className="text-[10px] text-slate-400 leading-tight">{label}</p>
                            <p className={`text-base font-bold tabular-nums leading-tight mt-0.5 ${val === 0 ? 'text-red-500' : 'text-slate-800'}`}>{val}</p>
                            <p className="text-[10px] text-slate-400">/ {total}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-700">
                      <AlertCircle size={13} className="shrink-0 text-amber-500" />
                      Could not load pool balance. Backend validation will still apply.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {/* ETM Devices */}
                    <Field label="ETM Devices" required hint={dealerPool ? `${dealerPool.palmtec.remaining} remaining` : 'palmtec_count'}>
                      {/* <input
                        type="number" min="0" max={999}
                        value={form.palmtec_count}
                        onChange={e => set('palmtec_count', e.target.value)}
                        placeholder="0"
                        className={`${inputCls} ${poolErrors.palmtec ? 'border-red-400 focus:ring-red-300' : ''}`}
                      /> */}

                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={form.palmtec_count}
                        placeholder="0"
                        onChange={e => {
                          const value = e.target.value;

                          // Allow empty input while typing
                          if (value === '') {
                            set('palmtec_count', '');
                            return;
                          }

                          // Allow only numbers
                          if (!/^\d+$/.test(value)) {
                            return;
                          }

                          const numValue = parseInt(value, 10);

                          // Limit to 999
                          if (numValue > 999) {
                            set('palmtec_count', '999');
                            return;
                          }

                          set('palmtec_count', value);
                        }}
                        onKeyDown={e => {
                          // Prevent non-numeric characters
                          if (
                            !/^\d$/.test(e.key) &&
                            !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
                            !(e.ctrlKey || e.metaKey)
                          ) {
                            e.preventDefault();
                            return;
                          }

                          const currentValue = parseInt(form.palmtec_count, 10) || 0;

                          if (e.key === 'ArrowUp') {
                            e.preventDefault();

                            const nextValue = currentValue >= 999
                              ? 0
                              : currentValue + 1;

                            set('palmtec_count', String(nextValue));
                          }

                          if (e.key === 'ArrowDown') {
                            e.preventDefault();

                            const nextValue = currentValue <= 0
                              ? 999
                              : currentValue - 1;

                            set('palmtec_count', String(nextValue));
                          }
                        }}
                        className={`${inputCls} ${poolErrors.palmtec
                          ? 'border-red-400 focus:ring-red-300'
                          : ''
                          }`}
                      />
                      {poolErrors.palmtec && <p className="mt-1 text-xs text-red-600">{poolErrors.palmtec}</p>}
                    </Field>

                    {/* Total Users */}
                    <Field label="Total Users" required hint={dealerPool ? `${dealerPool.total_users.remaining} remaining` : 'max concurrent logins'}>
                      {/* <input
                        type="number" min="1"
                        value={form.total_user_count}
                        onChange={e => set('total_user_count', e.target.value)}
                        placeholder="0"
                        className={`${inputCls} ${poolErrors.total ? 'border-red-400 focus:ring-red-300' : ''}`}
                      /> */}

                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={form.total_user_count}
                        placeholder="0"
                        onChange={e => {
                          const value = e.target.value;

                          // Allow empty input while typing
                          if (value === '') {
                            set('total_user_count', '');
                            return;
                          }

                          // Allow only numbers
                          if (!/^\d+$/.test(value)) {
                            return;
                          }

                          const numValue = parseInt(value, 10);

                          // Limit to 999
                          if (numValue > 999) {
                            set('total_user_count', '999');
                            return;
                          }

                          // Prevent 0
                          if (numValue < 1) {
                            set('total_user_count', '1');
                            return;
                          }

                          set('total_user_count', value);
                        }}
                        onKeyDown={e => {
                          // Prevent non-numeric characters
                          if (
                            !/^\d$/.test(e.key) &&
                            ![
                              'Backspace',
                              'Delete',
                              'Tab',
                              'ArrowLeft',
                              'ArrowRight',
                              'Home',
                              'End',
                              'ArrowUp',
                              'ArrowDown'
                            ].includes(e.key) &&
                            !(e.ctrlKey || e.metaKey)
                          ) {
                            e.preventDefault();
                            return;
                          }

                          const currentValue =
                            parseInt(form.total_user_count, 10) || 1;

                          // Arrow Up: 999 → 1
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();

                            const nextValue =
                              currentValue >= 999
                                ? 1
                                : currentValue + 1;

                            set('total_user_count', String(nextValue));
                          }

                          // Arrow Down: 1 → 999
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();

                            const nextValue =
                              currentValue <= 1
                                ? 999
                                : currentValue - 1;

                            set('total_user_count', String(nextValue));
                          }
                        }}
                        className={`${inputCls} ${poolErrors.total
                          ? 'border-red-400 focus:ring-red-300'
                          : ''
                          }`}
                      />
                      {poolErrors.total && <p className="mt-1 text-xs text-red-600">{poolErrors.total}</p>}
                    </Field>

                    {/* Premium */}
                    <Field label="Premium User Slots" hint={dealerPool ? `${dealerPool.premium.remaining} remaining` : 'optional'}>
                      {/* <input
                        type="number" min="0"
                        value={form.premium_user_count}
                        onChange={e => set('premium_user_count', e.target.value)}
                        placeholder="0"
                        className={`${inputCls} ${poolErrors.premium ? 'border-red-400 focus:ring-red-300' : ''}`}
                      /> */}

                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={form.premium_user_count}
                        placeholder="0"
                        onChange={e => {
                          const value = e.target.value;

                          // Allow empty input while typing
                          if (value === '') {
                            set('premium_user_count', '');
                            return;
                          }

                          // Allow only numbers
                          if (!/^\d+$/.test(value)) {
                            return;
                          }

                          const numValue = parseInt(value, 10);

                          // Limit to 999
                          if (numValue > 999) {
                            set('premium_user_count', '999');
                            return;
                          }

                          // Prevent negative values
                          if (numValue < 0) {
                            set('premium_user_count', '0');
                            return;
                          }

                          set('premium_user_count', value);
                        }}
                        onKeyDown={e => {
                          // Prevent non-numeric characters
                          if (
                            !/^\d$/.test(e.key) &&
                            ![
                              'Backspace',
                              'Delete',
                              'Tab',
                              'ArrowLeft',
                              'ArrowRight',
                              'Home',
                              'End',
                              'ArrowUp',
                              'ArrowDown'
                            ].includes(e.key) &&
                            !(e.ctrlKey || e.metaKey)
                          ) {
                            e.preventDefault();
                            return;
                          }

                          const currentValue =
                            parseInt(form.premium_user_count, 10) || 0;

                          // Arrow Up: 999 → 0
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();

                            const nextValue =
                              currentValue >= 999
                                ? 0
                                : currentValue + 1;

                            set('premium_user_count', String(nextValue));
                          }

                          // Arrow Down: 0 → 999
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();

                            const nextValue =
                              currentValue <= 0
                                ? 999
                                : currentValue - 1;

                            set('premium_user_count', String(nextValue));
                          }
                        }}
                        className={`${inputCls} ${poolErrors.premium
                          ? 'border-red-400 focus:ring-red-300'
                          : ''
                          }`}
                      />
                      {poolErrors.premium && <p className="mt-1 text-xs text-red-600">{poolErrors.premium}</p>}
                    </Field>

                    {/* Intermediate */}
                    <Field label="Intermediate User Slots" hint={dealerPool ? `${dealerPool.inter.remaining} remaining` : 'optional'}>
                      {/* <input
                        type="number" min="0"
                        value={form.intermediate_user_count}
                        onChange={e => set('intermediate_user_count', e.target.value)}
                        placeholder="0"
                        className={`${inputCls} ${poolErrors.inter ? 'border-red-400 focus:ring-red-300' : ''}`}
                      /> */}

                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={form.intermediate_user_count}
                        placeholder="0"
                        onChange={e => {
                          const value = e.target.value;

                          // Allow empty input while typing
                          if (value === '') {
                            set('intermediate_user_count', '');
                            return;
                          }

                          // Allow only numbers
                          if (!/^\d+$/.test(value)) {
                            return;
                          }

                          const numValue = parseInt(value, 10);

                          // Limit to 999
                          if (numValue > 999) {
                            set('intermediate_user_count', '999');
                            return;
                          }

                          set('intermediate_user_count', value);
                        }}
                        onKeyDown={e => {
                          // Prevent non-numeric characters
                          if (
                            !/^\d$/.test(e.key) &&
                            ![
                              'Backspace',
                              'Delete',
                              'Tab',
                              'ArrowLeft',
                              'ArrowRight',
                              'Home',
                              'End',
                              'ArrowUp',
                              'ArrowDown'
                            ].includes(e.key) &&
                            !(e.ctrlKey || e.metaKey)
                          ) {
                            e.preventDefault();
                            return;
                          }

                          const currentValue =
                            parseInt(form.intermediate_user_count, 10) || 0;

                          // Arrow Up: 999 → 0
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();

                            const nextValue =
                              currentValue >= 999
                                ? 0
                                : currentValue + 1;

                            set('intermediate_user_count', String(nextValue));
                          }

                          // Arrow Down: 0 → 999
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();

                            const nextValue =
                              currentValue <= 0
                                ? 999
                                : currentValue - 1;

                            set('intermediate_user_count', String(nextValue));
                          }
                        }}
                        className={`${inputCls} ${poolErrors.inter
                            ? 'border-red-400 focus:ring-red-300'
                            : ''
                          }`}
                      />
                      {poolErrors.inter && <p className="mt-1 text-xs text-red-600">{poolErrors.inter}</p>}
                    </Field>
                  </div>

                  {/* Derived basic count display */}
                  {(() => {
                    const total = parseInt(form.total_user_count) || 0;
                    const premium = parseInt(form.premium_user_count) || 0;
                    const inter = parseInt(form.intermediate_user_count) || 0;
                    const basic = total - premium - inter;
                    return total > 0 ? (
                      <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${poolErrors.basic
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-slate-50 border-slate-100 text-slate-600'
                        }`}>
                        <span className="font-medium">Basic user slots (derived):</span>
                        <span className="tabular-nums font-bold">{Math.max(0, basic)}</span>
                        {dealerPool && <span className="ml-auto text-slate-400">pool remaining: {dealerPool.basic.remaining}</span>}
                        {poolErrors.basic && <span className="ml-auto text-red-600">{poolErrors.basic}</span>}
                      </div>
                    ) : null;
                  })()}

                  <p className="mt-3 text-xs text-slate-500">
                    Counts deducted from your pool on save and restored if the company is deleted.
                    {dealerPool?.license_valid_to && (
                      <> License valid to: <strong>{new Date(dealerPool.license_valid_to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.</>
                    )}
                  </p>
                </SectionCard>
              )}

              {/* Bottom actions */}
              <div className="flex items-center justify-between mt-2">
                <button type="button" onClick={() => { setPageView('list'); resetCreate(); }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
                  <ArrowLeft size={14} /> Cancel
                </button>
                <button type="submit" disabled={!canSubmit || submitting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-all shadow-sm">
                  {submitting ? 'Saving…' : 'Save Company'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ── Right: Preview + Checklist ───────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            <CompanyPreview form={form} isImport={createMode === 'import'} />
            <ChecklistCard items={[
              { label: 'Company identity', done: sec1 },
              { label: 'Registered address', done: sec2 },
              { label: 'Admin user account', done: sec3 },
              ...(isDealerAdmin && createMode === 'new' ? [{ label: 'Pool allocation', done: sec4 }] : []),
            ]} />
            <TipCard />
          </div>
        </div>
      </div>
    </div>
  );
}
