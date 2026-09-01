import { useState, useEffect, useCallback, useMemo } from 'react';
import TableSkeleton from '../../components/TableSkeleton';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import statesDistricts from '../../assets/json/indiaStatesDistricts.json';
import {
  Handshake, CheckCircle2, CircleDot, Search,
  Phone, MapPin, IdCard, ArrowLeft, AlertCircle,
  Plus, Mail, KeyRound, User, Hash, Eye, EyeOff, Edit, X, RefreshCw, Info,
} from 'lucide-react';

// ── ModalWrapper ───────────────────────────────────────────────────────────────

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

function Field({ label, required, hint, warnHint, span, children }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className={`ml-1 text-xs font-normal ${warnHint ? 'text-red-500' : 'text-slate-400'}`}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition-all bg-white placeholder:text-slate-400';

function DealerPreview({ form }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Listing Preview</p>
        <p className="text-sm text-slate-600 mt-0.5">How this dealer will appear</p>
      </div>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            {form.dealer_code
              ? <span className="text-xs font-bold text-white">{form.dealer_code.split('-').slice(0, 2).join('-')}</span>
              : <Handshake size={18} color="#fff" />}
          </div>
          <div className="min-w-0">
            <p className={`font-semibold truncate ${form.dealer_name ? 'text-slate-900' : 'text-slate-300 italic'}`}>
              {form.dealer_name || 'Dealer name…'}
            </p>
            <p className="text-xs text-slate-500 truncate font-mono">{form.dealer_code || 'DEALER-CODE'}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${form.is_active
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${form.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {form.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <IdCard size={11} /><span>{form.contact_person || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Mail size={11} /><span>{form.email || '—'}</span>
          </div>
          <div className="flex items-start gap-2 text-slate-500">
            <MapPin size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{[form.district, form.state].filter(Boolean).join(', ') || '—'}</span>
          </div>
          {form.contact_number && (
            <div className="flex items-center gap-2 text-slate-500">
              <Phone size={11} /><span>+91 {form.contact_number}</span>
            </div>
          )}
        </div>
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

function PoolSummaryCard() {
  return (
    <div className="rounded-2xl bg-slate-900 text-white p-5 relative overflow-hidden">
      <div className="absolute -right-6 -bottom-6 opacity-10">
        <KeyRound size={88} color="#fff" />
      </div>
      <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">License Pool</p>
      <p className="text-xs text-white/40 mt-0.5">Allocated by license server on registration</p>
      <div className="mt-4 pt-4 border-t border-white/10 space-y-1.5 text-xs text-white/60">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Hash size={11} /> ETM Devices</span>
          <span className="text-white/30 italic text-[10px]">pending</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><User size={11} /> Android</span>
          <span className="text-white/30 italic text-[10px]">pending</span>
        </div>
      </div>
    </div>
  );
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
        {inUse !== undefined && <span className="text-slate-500 text-xs ml-auto">Allocated: {inUse}</span>}
      </div>
    </div>
  );
}

// ── EMPTY form ─────────────────────────────────────────────────────────────────
const EMPTY = {
  dealer_code: '', dealer_name: '', contact_person: '', contact_number: '',
  email: '', gst_number: '', is_active: false,
  address: '', state: '', district: '',
  user_username: '', user_email: '', user_password: '',
};

// ══════════════════════════════════════════════════════════════════════════════
export default function DealerListing() {
  // ── List state ───────────────────────────────────────────────────────────
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [togglingActive, setTogglingActive] = useState({});
  const [registeringLicense, setRegisteringLicense] = useState({});

  // ── Page view: 'list' | 'create' ────────────────────────────────────────
  const [pageView, setPageView] = useState('list');

  // ── Create form state ────────────────────────────────────────────────────
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Modal state (view / edit / sync) ─────────────────────────────────────
  const [modal, setModal] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [modalForm, setModalForm] = useState(EMPTY);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // ── License action state ─────────────────────────────────────────────────
  const [licenseAction, setLicenseAction] = useState({ busy: false, msg: '', err: '' });

  // ── Sync state ───────────────────────────────────────────────────────────
  const [syncDiff, setSyncDiff] = useState(null);
  const [syncConfirming, setSyncConfirming] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchDealers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/dealers`);
      setDealers(res.data?.data || []);
    } catch { setDealers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDealers(); }, [fetchDealers]);

  // Auto-refresh while any dealer is in Validating state
  useEffect(() => {
    const hasValidating = dealers.some(d => d.authentication_status === 'Validating');
    if (!hasValidating) return;
    const id = setInterval(fetchDealers, 5000);
    return () => clearInterval(id);
  }, [dealers, fetchDealers]);

  // ── Form helpers ─────────────────────────────────────────────────────────
  const set = (k, v) => setForm(f => k === 'state' ? { ...f, state: v, district: '' } : { ...f, [k]: v });

  const resetCreate = () => setForm(EMPTY);

  // ── Create form completeness ──────────────────────────────────────────────
  const sec1 = !!(form.dealer_code && form.dealer_name && form.contact_person && form.contact_number && form.email);
  const sec2 = !!(form.address && form.state && form.district);
  const sec3 = !!(form.user_username && form.user_email && form.user_password);
  const canSubmit = sec1 && sec2 && sec3;

  // ── Create submit ────────────────────────────────────────────────────────
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api.post(`${BASE_URL}/create-dealer`, {
        dealer_name: form.dealer_name, email: form.email, dealer_code: form.dealer_code,
        contact_person: form.contact_person, contact_number: form.contact_number,
        gst_number: form.gst_number || '000000000000000', address: form.address,
        state: form.state, district: form.district,
        user_username: form.user_username, user_email: form.user_email, user_password: form.user_password,
      });
      if (res?.status === 200 || res?.status === 201) {
        window.alert(res.data.message || 'Dealer created successfully!');
        setPageView('list');
        resetCreate();
        fetchDealers();
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

  const handleToggleActive = async (dealer) => {
    const nextActive = !dealer.is_active;
    const confirmMsg = nextActive
      ? `Activate "${dealer.dealer_name}"? The dealer will be able to log in again.`
      : `Deactivate "${dealer.dealer_name}"? The dealer's own users will be signed out immediately and blocked from logging in. Companies under this dealer are not affected.`;
    if (!window.confirm(confirmMsg)) return;
    setTogglingActive(p => ({ ...p, [dealer.id]: true }));
    setDealers(list => list.map(d => d.id === dealer.id ? { ...d, is_active: nextActive } : d));
    try {
      await api.put(`${BASE_URL}/update-dealer-details/${dealer.id}`, { is_active: nextActive });
    } catch (err) {
      setDealers(list => list.map(d => d.id === dealer.id ? { ...d, is_active: dealer.is_active } : d));
      window.alert(err.response?.data?.message || err.response?.data?.error || 'Failed to update status.');
    } finally { setTogglingActive(p => ({ ...p, [dealer.id]: false })); }
  };

  const handleRegisterLicenseRow = async (dealer) => {
    setRegisteringLicense(p => ({ ...p, [dealer.id]: true }));
    try {
      const res = await api.post(`${BASE_URL}/register-dealer-license/${dealer.id}`);
      window.alert(res.data.message || 'Registered.');
      fetchDealers();
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Registration failed.');
    } finally {
      setRegisteringLicense(p => ({ ...p, [dealer.id]: false }));
    }
  };

  // ── Edit / View modal ────────────────────────────────────────────────────
  const populateModal = (dealer) => ({
    dealer_code: dealer.dealer_code || '', dealer_name: dealer.dealer_name || '',
    contact_person: dealer.contact_person || '', contact_number: dealer.contact_number || '',
    email: dealer.email || '', gst_number: dealer.gst_number || '',
    is_active: dealer.is_active ?? true, address: dealer.address || '',
    state: dealer.state || '', district: dealer.district || '',
    user_username: '', user_email: '', user_password: '',
  });

  const openView = (dealer) => { setModalForm(populateModal(dealer)); setEditingItem(dealer); setModal('view'); setLicenseAction({ busy: false, msg: '', err: '' }); };
  const openEdit = (dealer) => { setModalForm(populateModal(dealer)); setEditingItem(dealer); setModal('edit'); };

  const handleModalInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setModalForm(f =>
      name === 'state' ? { ...f, state: value, district: '' } :
        type === 'checkbox' ? { ...f, [name]: checked } :
          name === 'contact_number' ? { ...f, [name]: value.replace(/\D/g, '').slice(0, 10) } :
            { ...f, [name]: value }
    );
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setModalSubmitting(true);
    try {
      const res = await api.put(`${BASE_URL}/update-dealer-details/${editingItem.id}`, {
        dealer_name: modalForm.dealer_name, email: modalForm.email,
        dealer_code: modalForm.dealer_code, contact_person: modalForm.contact_person,
        contact_number: modalForm.contact_number, gst_number: modalForm.gst_number,
        address: modalForm.address, state: modalForm.state, district: modalForm.district,
      });
      if (res?.status === 200 || res?.status === 201) {
        window.alert(res.data.message || 'Dealer updated!');
        setModal(null);
        fetchDealers();
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

  // ── License handlers ─────────────────────────────────────────────────────
  const handleRegisterLicense = async () => {
    setLicenseAction({ busy: true, msg: '', err: '' });
    try {
      const res = await api.post(`${BASE_URL}/register-dealer-license/${editingItem.id}`);
      setLicenseAction({ busy: false, msg: res.data.message || 'Registered.', err: '' });
      fetchDealers();
      // Refresh editingItem with latest dealer data
      const updated = (await api.get(`${BASE_URL}/dealers`)).data?.data?.find(d => d.id === editingItem.id);
      if (updated) setEditingItem(updated);
    } catch (err) {
      setLicenseAction({ busy: false, msg: '', err: err?.response?.data?.error || 'Registration failed.' });
    }
  };

  const handleValidateLicense = async () => {
    setLicenseAction({ busy: true, msg: '', err: '' });
    try {
      const res = await api.post(`${BASE_URL}/validate-dealer-license/${editingItem.id}`);
      setLicenseAction({ busy: false, msg: res.data.message || 'Validation started.', err: '' });
      fetchDealers();
      const updated = (await api.get(`${BASE_URL}/dealers`)).data?.data?.find(d => d.id === editingItem.id);
      if (updated) setEditingItem(updated);
    } catch (err) {
      setLicenseAction({ busy: false, msg: '', err: err?.response?.data?.error || 'Validation failed.' });
    }
  };

  const handleSyncDryRun = async () => {
    setLicenseAction({ busy: true, msg: '', err: '' });
    try {
      const res = await api.post(`${BASE_URL}/sync-dealer-license/${editingItem.id}`);
      setSyncDiff(res.data.data);
      setModal('sync');
      setLicenseAction({ busy: false, msg: '', err: '' });
    } catch (err) {
      setLicenseAction({ busy: false, msg: '', err: err?.response?.data?.error || 'Sync fetch failed.' });
    }
  };

  const handleSyncConfirm = async () => {
    setSyncConfirming(true);
    try {
      const res = await api.post(`${BASE_URL}/sync-dealer-license/${editingItem.id}/confirm`);
      window.alert(res.data.message || 'License synced successfully.');
      setModal(null);
      setSyncDiff(null);
      fetchDealers();
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Sync confirmation failed.');
    } finally { setSyncConfirming(false); }
  };

  const filteredDealers = useMemo(() => {
    if (!search.trim()) return dealers;
    const q = search.toLowerCase();
    return dealers.filter(d =>
      d.dealer_name?.toLowerCase().includes(q) ||
      d.dealer_code?.toLowerCase().includes(q) ||
      d.email?.toLowerCase().includes(q) ||
      d.contact_person?.toLowerCase().includes(q)
    );
  }, [dealers, search]);

  // ── License status style helper ───────────────────────────────────────────
  const licenseStatusStyle = (s) => {
    switch (s) {
      case 'Approve': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Validating': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Expired': return 'bg-red-50 text-red-700 border-red-200';
      case 'Block': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── LIST VIEW ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (pageView === 'list') {
    return (
      <div className="p-6 md:p-8 min-h-screen bg-slate-50">

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-3">Administration <span className="mx-1">›</span> <span className="text-slate-600 font-medium">Dealers</span></p>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-md">
                <Handshake size={18} color="#fff" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dealers</h1>
                <p className="text-sm text-slate-500 mt-0.5">{dealers.length} partner dealers</p>
              </div>
            </div>
            <button
              onClick={() => { resetCreate(); setPageView('create'); }}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-slate-900 hover:bg-slate-700 text-white cursor-pointer transition-colors shadow-sm"
            >
              <Plus size={14} /> Create Dealer
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm max-w-sm w-full">
            <Search size={13} className="text-slate-400 shrink-0" />
            {/* <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, code or contact…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
            /> */}
            <input
              value={search}
              onChange={e => {
                const value = e.target.value;

                if (value.length <= 25) {
                  setSearch(value);
                }
              }}
              minLength={3}
              maxLength={25}
              placeholder="Search by name, code or contact…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
          <span className="text-xs text-slate-400 tabular-nums shrink-0">
            {filteredDealers.length} result{filteredDealers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dealer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">License</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Register</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Access</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <TableSkeleton columns={['w-40', 'w-28', 'w-32', 'w-16', 'w-16', 'w-16', 'w-16']} />
                ) : filteredDealers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Handshake size={20} className="text-slate-300" />
                        <p className="text-sm text-slate-400">{search ? 'No dealers match your search' : 'No dealers found'}</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredDealers.map(dealer => (
                  <tr key={dealer.id} className="group hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-white leading-none">
                            {(dealer.dealer_code || 'D').split('-').slice(0, 2).join('-').slice(0, 6)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{dealer.dealer_name}</p>
                          <p className="text-xs text-slate-500 font-mono truncate leading-tight">{dealer.dealer_code || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700 leading-tight">{dealer.contact_person}</p>
                      <p className="text-xs text-slate-500 leading-tight">{dealer.contact_number}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={11} className="text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-600 truncate">
                          {[dealer.district, dealer.state].filter(Boolean).join(', ') || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {dealer.authentication_status ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border w-fit ${licenseStatusStyle(dealer.authentication_status)}`}>
                          {dealer.authentication_status === 'Approve' ? 'Licensed' : dealer.authentication_status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleRegisterLicenseRow(dealer)}
                        disabled={registeringLicense[dealer.id] || dealer.authentication_status === 'Approve'}
                        title={dealer.authentication_status === 'Approve' ? 'Already licensed' : 'Register with License Server'}
                        className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        {registeringLicense[dealer.id] ? 'Registering…' : 'Register'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(dealer)}
                        disabled={togglingActive[dealer.id]}
                        title={dealer.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                        className="inline-flex items-center gap-1.5 w-fit cursor-pointer disabled:opacity-50"
                      >
                        <span className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${dealer.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${dealer.is_active ? 'translate-x-[14px]' : ''}`} />
                        </span>
                        <span className={`text-[11px] font-medium ${dealer.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {dealer.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openView(dealer)} title="View"
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => openEdit(dealer)} title="Edit"
                          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors">
                          <Edit size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── View Modal ─────────────────────────────────────────────── */}
        <ModalWrapper open={modal === 'view'} onClose={() => setModal(null)} title="Dealer Details" icon={Handshake}>
          {editingItem && (
            <div className="space-y-5">
              {/* Identity card */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-white">
                    {(editingItem.dealer_code || 'D').split('-').slice(0, 2).join('-').slice(0, 6)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-base leading-tight truncate">{editingItem.dealer_name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{editingItem.dealer_code}</p>
                  <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${editingItem.is_active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${editingItem.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {editingItem.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Info tiles */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Contact Person', value: editingItem.contact_person, icon: IdCard },
                  { label: 'Contact Number', value: editingItem.contact_number ? `+91 ${editingItem.contact_number}` : '—', icon: Phone },
                  { label: 'Email', value: editingItem.email, icon: Mail },
                  { label: 'GST Number', value: editingItem.gst_number || '—', icon: Hash },
                ].map(({ label, value, icon: TileIcon }) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">{label}</p>
                    <div className="flex items-center gap-1.5">
                      <TileIcon size={12} className="text-slate-400 shrink-0" />
                      <p className="text-sm text-slate-800 truncate">{value || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Address */}
              {(editingItem.address || editingItem.state) && (
                <div className="rounded-xl border border-slate-100 bg-white p-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">Registered Address</p>
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">
                      {[editingItem.address, editingItem.district, editingItem.state]
                        .filter(Boolean).join(', ')}
                    </span>
                  </div>
                </div>
              )}

              {/* License section */}
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-3">License</p>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-slate-500">Status:</span>
                  {editingItem.authentication_status ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${licenseStatusStyle(editingItem.authentication_status)}`}>
                      {editingItem.authentication_status === 'Approve' ? 'Licensed' : editingItem.authentication_status}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Not registered</span>
                  )}
                  {editingItem.product_to_date && (
                    <span className="ml-auto text-xs text-slate-400">
                      Expires: {new Date(editingItem.product_to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>

                {/* Pool counts — shown when approved */}
                {editingItem.authentication_status === 'Approve' && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: 'ETM Devices', total: editingItem.palmtec_count, remaining: editingItem.remaining_palmtec_count },
                      { label: 'Total Users', total: editingItem.total_user_count, remaining: editingItem.remaining_total_user_count },
                      { label: 'Premium', total: editingItem.premium_user_count, remaining: editingItem.remaining_premium_user_count },
                      { label: 'Intermediate', total: editingItem.intermediate_user_count, remaining: editingItem.remaining_intermediate_user_count },
                    ].map(({ label, total, remaining }) => (
                      <div key={label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                        <p className="text-sm font-semibold text-slate-800 tabular-nums">
                          {remaining ?? 0} <span className="text-xs font-normal text-slate-400">/ {total ?? 0}</span>
                        </p>
                        <p className="text-[10px] text-slate-400">remaining</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error message */}
                {editingItem.error_message && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={13} className="shrink-0 mt-0.5 text-red-500" />
                    {editingItem.error_message}
                  </div>
                )}

                {licenseAction.msg && (
                  <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
                    <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                    {licenseAction.msg}
                  </div>
                )}
                {licenseAction.err && (
                  <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={13} className="shrink-0 mt-0.5 text-red-500" />
                    {licenseAction.err}
                  </div>
                )}

                {/* Button state machine per spec §4 */}
                <div className="flex gap-2 flex-wrap">
                  {/* Register — only before unique_identifier is set */}
                  {!editingItem.unique_identifier && (
                    <button
                      type="button"
                      onClick={handleRegisterLicense}
                      disabled={licenseAction.busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {licenseAction.busy ? 'Processing…' : 'Register with License Server'}
                    </button>
                  )}
                  {/* Authenticate — registered but not yet approved */}
                  {editingItem.unique_identifier && editingItem.authentication_status !== 'Approve' && (
                    <button
                      type="button"
                      onClick={handleValidateLicense}
                      disabled={licenseAction.busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {licenseAction.busy ? 'Processing…' : 'Authenticate License'}
                    </button>
                  )}
                  {/* Sync — only when approved */}
                  {editingItem.authentication_status === 'Approve' && (
                    <button
                      type="button"
                      onClick={handleSyncDryRun}
                      disabled={licenseAction.busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <RefreshCw size={11} />
                      {licenseAction.busy ? 'Fetching…' : 'Sync License'}
                    </button>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => { openEdit(editingItem); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                  <Edit size={13} /> Edit
                </button>
                <button type="button" onClick={() => setModal(null)}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-700 transition-colors">
                  Close
                </button>
              </div>
            </div>
          )}
        </ModalWrapper>

        {/* ── Sync Preview Modal ──────────────────────────────────────── */}
        <ModalWrapper
          open={modal === 'sync'}
          onClose={() => { setModal('view'); setSyncDiff(null); }}
          title="Sync License Preview"
          icon={RefreshCw}
          width="max-w-xl"
        >
          {syncDiff && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Review the incoming values from the license server. Click <strong>Apply Sync</strong> to update.
              </p>

              {syncDiff.error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
                  <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
                  {syncDiff.error}
                </div>
              )}

              <DiffRow label="Total Licensed Units" current={syncDiff.current.number_of_licences} incoming={syncDiff.incoming.number_of_licences} />
              <DiffRow label="ETM Devices" current={syncDiff.current.palmtec_count} incoming={syncDiff.incoming.palmtec_count} inUse={syncDiff.in_use.palmtec_allocated_to_companies} />
              <DiffRow label="Total Users" current={syncDiff.current.total_user_count} incoming={syncDiff.incoming.total_user_count} inUse={syncDiff.in_use.total_users_allocated} />
              <DiffRow label="Premium Users" current={syncDiff.current.premium_user_count} incoming={syncDiff.incoming.premium_user_count} inUse={syncDiff.in_use.premium_users_allocated} />
              <DiffRow label="Intermediate Users" current={syncDiff.current.intermediate_user_count} incoming={syncDiff.incoming.intermediate_user_count} inUse={syncDiff.in_use.intermediate_users_allocated} />
              <DiffRow label="License From" current={syncDiff.current.product_from_date} incoming={syncDiff.incoming.product_from_date} />
              <DiffRow label="License To" current={syncDiff.current.product_to_date} incoming={syncDiff.incoming.product_to_date} />

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setModal('view'); setSyncDiff(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSyncConfirm}
                  disabled={syncConfirming || !!syncDiff.error}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {syncConfirming
                    ? <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Applying…</>
                    : <><RefreshCw size={13} /> Apply Sync</>}
                </button>
              </div>
            </div>
          )}
        </ModalWrapper>

        {/* ── Edit Modal ─────────────────────────────────────────────── */}
        <ModalWrapper open={modal === 'edit'} onClose={() => setModal(null)} title="Edit Dealer" icon={Edit}>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Dealer Code', name: 'dealer_code', required: true },
                { label: 'Dealer Name', name: 'dealer_name', required: true },
                { label: 'Contact Person', name: 'contact_person', required: true },
                { label: 'Contact Number', name: 'contact_number', type: 'tel', required: true },
                { label: 'Email', name: 'email', type: 'email', required: true },
                { label: 'GST Number', name: 'gst_number', required: true },
              ].map(f => (
                <div key={f.name} className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                  {/* <input type={f.type || 'text'} name={f.name} value={modalForm[f.name] || ''} onChange={handleModalInputChange}
                    required={f.required}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                  <input
                    type={f.type || 'text'}
                    name={f.name}
                    value={modalForm[f.name] || ''}
                    onChange={handleModalInputChange}
                    required={f.required}
                    inputMode={f.name === 'contact_number' ? 'numeric' : undefined}
                    pattern={f.name === 'contact_number' ? '[0-9]*' : undefined}
                    minLength={f.name === 'contact_number' ? 10 : 3}
                    maxLength={f.name === 'contact_number' ? 10 : 20}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Address <span className="text-red-500">*</span></label>
              {/* <textarea name="address" value={modalForm.address || ''} onChange={handleModalInputChange}
                rows={2} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
              <textarea
                name="address"
                value={modalForm.address || ''}
                onChange={handleModalInputChange}
                rows={2}
                required
                minLength={3}
                maxLength={400}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">State <span className="text-red-500">*</span></label>
                <select name="state" value={modalForm.state} onChange={handleModalInputChange} required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white">
                  <option value="">Select State</option>
                  {Object.keys(statesDistricts).sort().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">District <span className="text-red-500">*</span></label>
                <select name="district" value={modalForm.district} onChange={handleModalInputChange} required
                  disabled={!modalForm.state}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white disabled:bg-slate-50">
                  <option value="">Select District</option>
                  {(statesDistricts[modalForm.state] || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={modalSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-all">
                {modalSubmitting
                  ? <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Saving…</>
                  : 'Update Dealer'}
              </button>
            </div>
          </form>
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
        <p className="text-xs text-slate-400 mb-3">Administration <span className="mx-1">›</span> Dealers <span className="mx-1">›</span> <span className="text-slate-600 font-medium">Create Dealer</span></p>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-md">
              <Handshake size={18} color="#fff" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Dealer</h1>
              <p className="text-sm text-slate-500 mt-0.5">Onboard a partner who can register and manage companies in their territory</p>
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
                : <>Save Dealer</>}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Form ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <form onSubmit={handleCreateSubmit}>

            {/* Step 1: Dealer Identity */}
            <SectionCard step={1} active complete={sec1} title="Dealer Identity" subtitle="Business details and primary point of contact.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Dealer Code" required hint="Short unique reference">
                  <div className="flex gap-0">
                    <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg"><Hash size={13} /></span>
                    {/* <input value={form.dealer_code} onChange={e => set('dealer_code', e.target.value.toUpperCase())} placeholder="AP-NTC-01"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white uppercase" /> */}
                    <input
                      type="text"
                      value={form.dealer_code}
                      onChange={e => set('dealer_code', e.target.value.toUpperCase())}
                      placeholder="AP-NTC-01"
                      minLength={3}
                      maxLength={20}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white uppercase"
                    />
                  </div>
                </Field>
                <Field label="Dealer Name" required>
                  {/* <input value={form.dealer_name} onChange={e => set('dealer_name', e.target.value)} placeholder="Andhra Bus Tech LLP" className={inputCls} /> */}
                  <input
                    type="text"
                    value={form.dealer_name}
                    onChange={e => {
                      const value = e.target.value;
                      if (value.length <= 20) {
                        set('dealer_name', value);
                      }
                    }}
                    placeholder="Andhra Bus Tech LLP"
                    minLength={3}
                    maxLength={20}
                    className={inputCls}
                  />
                </Field>
                <Field label="Contact Person" required>
                  {/* <input value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="Owner / manager" className={inputCls} /> */}
                  <input
                    type="text"
                    value={form.contact_person}
                    onChange={e => {
                      const value = e.target.value;
                      if (value.length <= 20) {
                        set('contact_person', value);
                      }
                    }}
                    placeholder="Owner / manager"
                    minLength={3}
                    maxLength={20}
                    className={inputCls}
                  />
                </Field>
                <Field label="Contact Number" required>
                  <div className="flex gap-0">
                    <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg">+91</span>
                    {/* <input value={form.contact_number} onChange={e => set('contact_number', e.target.value)} placeholder="98XXXXXX21"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                    <input
                      type="text"
                      value={form.contact_number}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, ''); // Allow only digits
                        if (value.length <= 10) {
                          set('contact_number', value);
                        }
                      }}
                      placeholder="98XXXXXX21"
                      minLength={10}
                      maxLength={10}
                      pattern="\d{10}"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                    />
                  </div>
                </Field>
                <Field label="Email" required>
                  {/* <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="dealer@company.in" className={inputCls} /> */}
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => {
                      const value = e.target.value;
                      if (value.length <= 300) {
                        set('email', value);
                      }
                    }}
                    placeholder="dealer@company.in"
                    minLength={3}
                    maxLength={300}
                    className={inputCls}
                  />
                </Field>
                <Field label="GST Number">
                  {/* <input value={form.gst_number} onChange={e => set('gst_number', e.target.value)} placeholder="29ABCDE1234F1Z5" className={inputCls} /> */}
                  <input
                    type="text"
                    value={form.gst_number}
                    onChange={e => {
                      const value = e.target.value.toUpperCase();
                      if (value.length <= 15) {
                        set('gst_number', value);
                      }
                    }}
                    placeholder="29ABCDE1234F1Z5"
                    minLength={15}
                    maxLength={15}
                    pattern="^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
                    title="Enter a valid 15-character GSTIN (e.g., 29ABCDE1234F1Z5)"
                    className={inputCls}
                  />
                </Field>

                <div className="md:col-span-2 mt-1 flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs text-slate-500">
                  <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>New dealers start <strong>inactive</strong> and can't sign in until their license is authenticated.</span>
                </div>
              </div>
            </SectionCard>

            {/* Step 2: Registered Address */}
            <SectionCard step={2} active={sec1} complete={sec2} title="Registered Address" subtitle="Used on invoices, contracts, and the dealer's certificate.">
              <div className="space-y-4">
                <Field label="Address" required>
                  {/* <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} placeholder="Street, area, landmark…"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                  <textarea
                    value={form.address}
                    onChange={e => {
                      const value = e.target.value;
                      if (value.length <= 400) {
                        set('address', value);
                      }
                    }}
                    rows={2}
                    placeholder="Street, area, landmark…"
                    minLength={10}
                    maxLength={400}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="State" required>
                    <select value={form.state} onChange={e => set('state', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white">
                      <option value="">Select state…</option>
                      {Object.keys(statesDistricts).sort().map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
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
            <SectionCard step={3} active={sec2} complete={sec3} title="Dealer User Account" subtitle="Login credentials for the dealer admin.">
              <div className="grid grid-cols-1 gap-4 md:gap-5 md:[grid-template-columns:160px_1fr_1fr]">
                <Field label="Username" required>
                  <div className="flex gap-0">
                    <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg"><User size={13} /></span>
                    {/* <input value={form.user_username} onChange={e => set('user_username', e.target.value.toLowerCase())} placeholder="ap-ntc-01"
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                    <input
                      type="text"
                      value={form.user_username}
                      onChange={(e) => {
                        const value = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "") // Allow only letters, numbers, underscore
                          .slice(0, 20); // Max length 20

                        set("user_username", value);
                      }}
                      placeholder="ap-ntc-01"
                      minLength={3}
                      maxLength={20}
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                    />
                  </div>
                </Field>
                <Field label="Login Email" required>
                  <div className="flex gap-0">
                    <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg"><Mail size={13} /></span>
                    {/* <input type="email" value={form.user_email} onChange={e => set('user_email', e.target.value)} placeholder="login@dealer.in"
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                    <input
                      type="email"
                      value={form.user_email}
                      onChange={e => {
                        if (e.target.value.length <= 300) {
                          set('user_email', e.target.value);
                        }
                      }}
                      placeholder="login@dealer.in"
                      minLength={5}
                      maxLength={300}
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                    />
                  </div>
                </Field><br />
                <Field label="Temporary Password" required hint="Min 8 chars" warnHint={form.user_password.length > 0 && form.user_password.length < 8}>
                  <div className="flex gap-0">
                    <span className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-r-0 border-slate-300 rounded-l-lg"><KeyRound size={13} /></span>
                    {/* <input type="text" value={form.user_password} onChange={e => set('user_password', e.target.value)} placeholder="—"
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" /> */}
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.user_password}
                      onChange={e => {
                        const value = e.target.value;

                        if (value.length <= 20) {
                          set('user_password', value);
                        }
                      }}
                      placeholder="—"
                      minLength={8}
                      maxLength={20}
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      tabIndex={-1}
                      className="inline-flex items-center px-3 text-sm text-slate-500 bg-slate-50 border border-l-0 border-slate-300 rounded-r-lg hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700">
                <AlertCircle size={13} className="mt-0.5 shrink-0 text-blue-500" />
                <span>An invite email with these credentials will be sent to <strong>{form.user_email || 'the dealer'}</strong> on save.</span>
              </div>
            </SectionCard>

            {/* Bottom actions */}
            <div className="flex items-center justify-between mt-2">
              <button type="button" onClick={() => { setPageView('list'); resetCreate(); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
                <ArrowLeft size={14} /> Cancel
              </button>
              <button type="submit" disabled={!canSubmit || submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-all shadow-sm">
                {submitting ? 'Saving…' : 'Save Dealer'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Right: Preview + Checklist ───────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            <DealerPreview form={form} />
            <ChecklistCard items={[
              { label: 'Dealer identity', done: sec1 },
              { label: 'Registered address', done: sec2 },
              { label: 'User account', done: sec3 },
            ]} />
            <PoolSummaryCard />
          </div>
        </div>
      </div>
    </div>
  );
}
