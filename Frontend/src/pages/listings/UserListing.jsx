import { useState, useEffect, useMemo } from 'react';
import {
  Users, CheckCircle2, KeyRound, Activity, Plus, Search,
  ArrowUp, ArrowDown, ArrowUpDown, Building2, Eye, Edit, X,
  Info, Save, AlertCircle, ShieldAlert,
} from 'lucide-react';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { useNavigate } from 'react-router-dom';
import statesDistricts from '../../assets/json/indiaStatesDistricts.json';

const STATE_NAMES = Object.keys(statesDistricts).sort();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#0f172a', '#4f46e5', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#be185d'];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name) {
  const parts = (name || '').replace(/[._-]/g, ' ').split(' ').filter(Boolean);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : (name || '??').slice(0, 2).toUpperCase();
}

function timeAgo(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ─── Role config ───────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  superadmin: { label: 'Super Admin', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  dealer_admin: { label: 'Dealer Admin', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  company_admin: { label: 'Customer Admin', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  executive: { label: 'Executive', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  production: { label: 'Production', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  company_user: { label: 'User', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  user: { label: 'User', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
};

const TIER_CONFIG = {
  basic: { label: 'Basic', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  intermediate: { label: 'Intermediate', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  premium: { label: 'Premium', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  none: { label: '—', bg: 'bg-slate-50', text: 'text-slate-400', border: 'border-slate-200' },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const c = ROLE_CONFIG[role] || ROLE_CONFIG.user;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function TierBadge({ tier }) {
  if (!tier || tier === 'none') return null;
  const c = TIER_CONFIG[tier] || TIER_CONFIG.basic;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {c.label}
    </span>
  );
}

function StatusPill({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border font-medium px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border font-medium px-2 py-0.5 text-[11px] bg-slate-50 text-slate-600 border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Inactive
    </span>
  );
}

function InlineStat({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
        <Icon size={13} color={color} />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-none">{label}</p>
        <p className="text-sm font-bold text-slate-800 leading-tight tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function Th({ children, onClick, right }) {
  return (
    <th
      className={`px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap ${onClick ? 'cursor-pointer select-none hover:text-slate-700' : ''} ${right ? 'text-right' : ''}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}

function ModalWrapper({ open, onClose, title, icon: Icon, width = 'max-w-lg', children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[85vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 text-slate-800">
            {Icon && <Icon size={16} className="text-slate-600" />}
            <h3 className="font-semibold">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function UserListing() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentRole = currentUser?.role;
  const isSuperadmin = currentRole === 'superadmin';
  const isExecutive = currentRole === 'executive';
  const isDealerAdmin = currentRole === 'dealer_admin';
  const isCompanyAdmin = currentRole === 'company_admin';

  const allowedRoles = isSuperadmin
    ? [
      { value: 'company_admin', label: 'Customer Admin' },
      { value: 'dealer_admin', label: 'Dealer Admin' },
      { value: 'executive', label: 'Executive' },
      { value: 'production', label: 'Production' },
    ]
    : isExecutive
      ? [{ value: 'company_admin', label: 'Customer Admin' }]
      : isDealerAdmin
        ? [{ value: 'company_admin', label: 'Customer Admin' }]
        : isCompanyAdmin
          ? [{ value: 'company_user', label: 'User' }]
          : [];

  const defaultRole = allowedRoles[0]?.value || 'company_user';

  // ── Data state ───────────────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Tier capacity — only relevant when isCompanyAdmin
  const [capacity, setCapacity] = useState(null);

  // ── Filter / sort / paginate state ───────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState('date_joined');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const perPage = 10;

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedUser, setSelectedUser] = useState(null);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({ username: '', email: '', role: defaultRole, company_id: '', dealer_id: '', password: '', state: '', tier: 'basic' });
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  const navigate = useNavigate();

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchUsers();
    if (!isCompanyAdmin) fetchCompanies();
    if (isSuperadmin) fetchDealers();
    if (isCompanyAdmin) fetchCapacity();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/get_users`);
      setUsers(res.data.data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await api.get(`${BASE_URL}/customer-data`);
      setCompanies(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching companies:', err);
    }
  };

  const fetchDealers = async () => {
    try {
      const res = await api.get(`${BASE_URL}/dealers`);
      setDealers(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching dealers:', err);
    }
  };

  const fetchCapacity = async () => {
    try {
      const res = await api.get(`${BASE_URL}/users/capacity`);
      setCapacity(res.data?.data || null);
    } catch (err) {
      console.error('Error fetching capacity:', err);
    }
  };

  const handleLogout = async () => {
    try { await api.post(`${BASE_URL}/logout`); } catch { }
    finally {
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  // ── Tier availability helpers ─────────────────────────────────────────────────
  const noLicenses = isCompanyAdmin && capacity && !capacity.total?.limit;

  const availableTiers = useMemo(() => {
    if (!isCompanyAdmin || !capacity) return [{ value: 'basic', label: 'Basic' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'premium', label: 'Premium' }];
    const tiers = [];
    if (capacity.total?.limit > 0) tiers.push({ value: 'basic', label: 'Basic' });
    if (capacity.tiers?.intermediate?.limit) tiers.push({ value: 'intermediate', label: 'Intermediate' });
    if (capacity.tiers?.premium?.limit) tiers.push({ value: 'premium', label: 'Premium' });
    return tiers;
  }, [isCompanyAdmin, capacity]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getCompany = (id) => companies.find(c => c.id === id)?.company_name || null;

  // ── Filter + sort + paginate ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...users];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    if (!isCompanyAdmin && roleFilter !== 'ALL') list = list.filter(u => u.role === roleFilter);
    if (isCompanyAdmin && tierFilter !== 'ALL') list = list.filter(u => u.tier === tierFilter);
    if (statusFilter !== 'ALL') list = list.filter(u => statusFilter === 'active' ? u.is_active : !u.is_active);
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'date_joined' || sortField === 'last_login') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [users, search, roleFilter, tierFilter, statusFilter, sortField, sortDir]);

  useEffect(() => setPage(1), [search, roleFilter, tierFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = users.filter(u => u.is_active).length;
    const admins = users.filter(u => ['superadmin', 'company_admin', 'dealer_admin'].includes(u.role)).length;
    const recentLogins = users.filter(u => u.last_login && Date.now() - new Date(u.last_login).getTime() < 86400000).length;
    return { total: users.length, active, admins, recentLogins };
  }, [users]);

  // ── Sort ─────────────────────────────────────────────────────────────────────
  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown size={10} className="ml-0.5 opacity-30 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp size={10} className="ml-0.5 inline" />
      : <ArrowDown size={10} className="ml-0.5 inline" />;
  };

  // ── Modal handlers ───────────────────────────────────────────────────────────
  const openCreate = () => {
    if (noLicenses) return;
    setModalMode('create');
    setSelectedUser(null);
    const defaultTier = availableTiers[0]?.value || 'basic';
    setFormData({ username: '', email: '', role: defaultRole, company_id: '', dealer_id: '', password: '', state: '', tier: defaultTier });
    setModalOpen(true);
  };

  const openView = (u) => { setModalMode('view'); setSelectedUser(u); setModalOpen(true); };

  const openEdit = (u) => {
    setModalMode('edit');
    setSelectedUser(u);
    setFormData({ username: u.username, email: u.email, role: u.role, company_id: u.company || '', dealer_id: u.dealer || '', password: '', state: u.state || '', tier: u.tier || 'basic' });
    setModalOpen(true);
  };

  const openPw = (u) => {
    setSelectedUser(u);
    setPw(''); setConfirmPw(''); setShowPw(false);
    setPwModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setSelectedUser(null); };

  // ── Form handlers ────────────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'role') {
        if (value === 'executive' || value === 'dealer_admin' || value === 'production') next.company_id = '';
        if (value !== 'executive') next.state = '';
        if (value !== 'dealer_admin') next.dealer_id = '';
        if (value !== 'company_user') next.tier = 'none';
        else next.tier = availableTiers[0]?.value || 'basic';
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modalMode === 'create' && formData.password.length < 6) {
      window.alert('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      let response;
      if (modalMode === 'edit') {
        response = await api.put(`${BASE_URL}/update_user/${selectedUser.id}`, {
          username: formData.username,
          email: formData.email,
          role: formData.role,
          company_id: formData.company_id,
          ...(formData.role === 'executive' ? { state: formData.state } : {}),
          ...(formData.role === 'company_user' ? { tier: formData.tier } : {}),
        });
      } else {
        const payload = {
          username: formData.username,
          email: formData.email,
          role: formData.role,
          password: formData.password,
          ...(formData.role === 'company_admin' ? { company_id: formData.company_id } : {}),
          ...(formData.role === 'dealer_admin' ? { dealer_id: formData.dealer_id } : {}),
          ...(formData.role === 'executive' ? { state: formData.state } : {}),
          ...(formData.role === 'company_user' ? { tier: formData.tier } : {}),
        };
        response = await api.post(`${BASE_URL}/create_user`, payload);
      }
      if (response?.status === 200 || response?.status === 201) {
        window.alert(response.data.message || 'Operation successful!');
        closeModal();
        fetchUsers();
        if (isCompanyAdmin) fetchCapacity();
      }
    } catch (err) {
      window.alert(err.response?.data?.message || err.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { window.alert('Password must be at least 6 characters'); return; }
    if (pw !== confirmPw) return;
    setSubmitting(true);
    try {
      const res = await api.post(`${BASE_URL}/change_user_password/${selectedUser.id}`, { new_password: pw });
      if (res?.status === 200) {
        window.alert(res.data.message || 'Password changed successfully!');
        setPwModalOpen(false);
        const cur = JSON.parse(localStorage.getItem('user'));
        if (cur && cur.id === selectedUser.id) handleLogout();
      }
    } catch (err) {
      window.alert(err.response?.data?.message || err.response?.data?.error || 'Password change failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user) => {
    setTogglingId(user.id);
    try {
      const res = await api.post(`${BASE_URL}/users/${user.id}/toggle-active`);
      window.alert(res.data.message || (user.is_active ? 'User deactivated.' : 'User activated.'));
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      window.alert(err.response?.data?.error || err.response?.data?.message || 'Action failed.');
    } finally {
      setTogglingId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 min-h-screen bg-slate-50">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        {/* Left: icon + title */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md shrink-0">
            <Users size={18} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
            <p className="text-sm text-slate-500 mt-0.5">{stats.total} users{!isCompanyAdmin && ` across ${companies.length} companies`}</p>
          </div>
        </div>

        {/* Center: inline stats */}
        <div className="hidden lg:flex items-center gap-5">
          <InlineStat icon={Users} label="Total" value={stats.total} color="#0f172a" />
          <div className="w-px h-6 bg-slate-200" />
          <InlineStat icon={CheckCircle2} label="Active" value={stats.active} color="#059669" />
          <div className="w-px h-6 bg-slate-200" />
          <InlineStat icon={KeyRound} label="Admins" value={stats.admins} color="#7c3aed" />
          <div className="w-px h-6 bg-slate-200" />
          <InlineStat icon={Activity} label="24h Logins" value={stats.recentLogins} color="#2563eb" />
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          {noLicenses ? (
            <div className="flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-red-50 border border-red-200 text-red-600 cursor-not-allowed">
              <ShieldAlert size={14} />
              No User Licenses
            </div>
          ) : (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-slate-900 hover:bg-slate-700 text-white cursor-pointer transition-colors shadow-sm"
            >
              <Plus size={14} />
              Add User
            </button>
          )}
        </div>
      </div>

      {/* ── License capacity banner (company_admin) ─────────────────────────── */}
      {isCompanyAdmin && capacity && (
        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs mb-4 ${noLicenses
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
          {noLicenses
            ? <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
            : <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />}
          {noLicenses
            ? <span>No user licenses allocated for this company. Contact the system administrator.</span>
            : (
              <span>
                License capacity: <strong>{capacity.total?.used ?? 0}</strong> of <strong>{capacity.total?.limit ?? '—'}</strong> slots in use.
                {capacity.tiers?.intermediate?.limit > 0 && <> Intermediate: <strong>{capacity.tiers.intermediate.used ?? 0}</strong> of <strong>{capacity.tiers.intermediate.limit}</strong> used.</>}
                {capacity.tiers?.premium?.limit > 0 && <> Premium: <strong>{capacity.tiers.premium.used ?? 0}</strong> of <strong>{capacity.tiers.premium.limit}</strong> used.</>}
              </span>
            )
          }
        </div>
      )}

      {/* ── Search + filter bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3.5 shadow-sm mb-4">
        {/* Search input */}
        <div className="relative min-w-[180px] flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full h-7 pl-8 pr-2 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        {/* Filter pills — tier for company_admin, role for everyone else */}
        {isCompanyAdmin ? (
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { value: 'ALL', label: 'All' },
              { value: 'basic', label: 'Basic' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'premium', label: 'Premium' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setTierFilter(value)}
                className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${tierFilter === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-wrap">
            {(isSuperadmin
              ? ['ALL', 'company_admin', 'dealer_admin', 'executive', 'production']
              : ['ALL', 'company_admin']
            ).map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${roleFilter === r ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {r === 'ALL' ? 'All' : ROLE_CONFIG[r]?.label || r}
              </button>
            ))}
          </div>
        )}

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-[13px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
        >
          <option value="ALL">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <Th onClick={() => toggleSort('username')}>User <SortIcon field="username" /></Th>
                <Th onClick={() => toggleSort('role')}>Role</Th>
                <Th>Company</Th>
                <Th>Status</Th>
                <Th onClick={() => toggleSort('last_login')}>Last Login <SortIcon field="last_login" /></Th>
                <Th onClick={() => toggleSort('date_joined')}>Joined <SortIcon field="date_joined" /></Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: j === 0 ? '160px' : '80px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={20} className="text-slate-300" />
                      <p className="text-sm text-slate-400">No users match your filters</p>
                    </div>
                  </td>
                </tr>
              ) : paged.map(user => (
                <tr key={user.id} className="group hover:bg-slate-50/60 transition-colors">
                  {/* User */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: avatarColor(user.username || '') }}
                      >
                        {initials(user.username || '')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{user.username}</p>
                        <p className="text-[11px] text-slate-500 truncate leading-tight">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  {/* Role + Tier */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <RoleBadge role={user.role} />
                      <TierBadge tier={user.tier} />
                    </div>
                  </td>
                  {/* Company */}
                  <td className="px-4 py-3">
                    {(user.company_name || getCompany(user.company)) ? (
                      <div className="flex items-center gap-1.5">
                        <Building2 size={11} className="text-slate-400 shrink-0" />
                        <span className="text-[12px] text-slate-600 truncate max-w-[160px]">{user.company_name || getCompany(user.company)}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3"><StatusPill active={user.is_active} /></td>
                  {/* Last Login */}
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium ${user.last_login ? 'text-slate-600' : 'text-slate-400'}`}>
                      {timeAgo(user.last_login)}
                    </span>
                  </td>
                  {/* Joined */}
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-slate-500">
                      {user.date_joined
                        ? new Date(user.date_joined).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openView(user)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" title="View details">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEdit(user)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer" title="Edit user">
                        <Edit size={14} />
                      </button>
                      {isSuperadmin && (
                        <button onClick={() => openPw(user)} className="p-1.5 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 cursor-pointer" title="Change password">
                          <KeyRound size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-white">
          <p className="text-[11px] text-slate-500">
            {filtered.length === 0 ? '0 results' : (
              <>
                <span className="font-semibold text-slate-700">
                  {Math.min((page - 1) * perPage + 1, filtered.length)}–{Math.min(page * perPage, filtered.length)}
                </span>{' '}of {filtered.length}
              </>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-7 px-2.5 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-7 w-7 text-[11px] font-medium rounded-md cursor-pointer ${page === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >{p}</button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-7 px-2.5 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >Next</button>
            </div>
          )}
        </div>
      </div>

      {/* ── View Modal ──────────────────────────────────────────────────────── */}
      <ModalWrapper open={modalOpen && modalMode === 'view'} onClose={closeModal} title="User Details" icon={Eye}>
        {selectedUser && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div
                className="h-14 w-14 rounded-xl flex items-center justify-center text-lg font-bold text-white shadow-md shrink-0"
                style={{ backgroundColor: avatarColor(selectedUser.username || '') }}
              >
                {initials(selectedUser.username || '')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-lg font-bold text-slate-900">{selectedUser.username}</p>
                  <RoleBadge role={selectedUser.role} />
                  <TierBadge tier={selectedUser.tier} />
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{selectedUser.email}</p>
              </div>
              <div
                className={`h-3 w-3 rounded-full shrink-0 ${selectedUser.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                title={selectedUser.is_active ? 'Active' : 'Inactive'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'User ID', value: `#${selectedUser.id}` },
                { label: 'Status', value: selectedUser.is_active ? 'Active' : 'Inactive' },
                ...(!isCompanyAdmin ? [{ label: 'Company', value: selectedUser.company_name || getCompany(selectedUser.company) || 'Not assigned' }] : []),
                { label: 'Role', value: ROLE_CONFIG[selectedUser.role]?.label || selectedUser.role },
                ...(selectedUser.role === 'company_user' && selectedUser.tier && selectedUser.tier !== 'none' ? [{ label: 'Tier', value: TIER_CONFIG[selectedUser.tier]?.label || selectedUser.tier }] : []),
                ...(selectedUser.role === 'executive' ? [{ label: 'State', value: selectedUser.state || '—' }] : []),
                { label: 'Joined', value: selectedUser.date_joined ? new Date(selectedUser.date_joined).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                { label: 'Last Login', value: timeAgo(selectedUser.last_login) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="text-sm font-medium mt-0.5 text-slate-800 break-all">{value ?? '—'}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => { closeModal(); setTimeout(() => openEdit(selectedUser), 100); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <Edit size={14} />Edit
              </button>
              {isSuperadmin && (
                <button
                  onClick={() => { closeModal(); setTimeout(() => openPw(selectedUser), 100); }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <KeyRound size={14} />Password
                </button>
              )}
              <button
                onClick={() => handleToggleActive(selectedUser)}
                disabled={togglingId === selectedUser?.id}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 text-sm rounded-lg font-medium border cursor-pointer transition-colors disabled:opacity-50 ${selectedUser?.is_active
                  ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  }`}
              >
                {togglingId === selectedUser?.id ? '…' : selectedUser?.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        )}
      </ModalWrapper>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      <ModalWrapper
        open={modalOpen && (modalMode === 'create' || modalMode === 'edit')}
        onClose={closeModal}
        title={modalMode === 'edit' ? 'Edit User' : 'Create User'}
        icon={modalMode === 'edit' ? Edit : Plus}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                Username <span className="text-rose-500">*</span>
              </label>
              {/* <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
                readOnly={modalMode === 'edit'}
                placeholder="e.g. ravi.kumar"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 read-only:bg-slate-50"
              /> */}
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
                minLength={3}
                maxLength={20}
                placeholder="e.g. ravi.kumar"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                Email <span className="text-rose-500">*</span>
              </label>
              {/* <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="user@company.in"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              /> */}
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                minLength={3}
                maxLength={200}
                placeholder="user@company.in"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Role selector — hidden for company_admin (always company_user) */}
            {!isCompanyAdmin && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  Role <span className="text-rose-500">*</span>
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {allowedRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}

            {/* Tier selector — company_user only */}
            {(formData.role === 'company_user' || isCompanyAdmin) && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  Tier <span className="text-rose-500">*</span>
                </label>
                <select
                  name="tier"
                  value={formData.tier}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {availableTiers.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}

            {/* State — executive only */}
            {formData.role === 'executive' && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  State <span className="text-rose-500">*</span>
                </label>
                <select
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">Select state…</option>
                  {STATE_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Dealer — dealer_admin role only, superadmin only */}
            {formData.role === 'dealer_admin' && isSuperadmin && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  Dealer <span className="text-rose-500">*</span>
                </label>
                <select
                  name="dealer_id"
                  value={formData.dealer_id}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">Select dealer…</option>
                  {dealers.map(d => <option key={d.id} value={d.id}>{d.dealer_name}</option>)}
                </select>
              </div>
            )}

            {/* Company — company_admin role only */}
            {formData.role === 'company_admin' && !isCompanyAdmin && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  Company <span className="text-rose-500">*</span>
                </label>
                <select
                  name="company_id"
                  value={formData.company_id}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
            )}
          </div>

          {modalMode === 'create' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                Password <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs text-slate-400">Minimum 8 characters</p>
              {formData.password.length > 0 && formData.password.length < 8 && (
                <p className="text-xs text-rose-600">Must be at least 8 characters</p>
              )}
              {/* <input
                type="text"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                minLength={8}
                placeholder="Temporary password"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              /> */}
              <input
                type="text"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                minLength={8}
                maxLength={20}
                placeholder="Temporary password"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          )}

          {modalMode === 'edit' && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>To change password, use the <strong>Change Password</strong> action from the user table.</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={closeModal}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-slate-900 hover:bg-slate-700 text-white cursor-pointer transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                : modalMode === 'edit' ? <Save size={14} /> : <Plus size={14} />}
              {submitting ? 'Saving…' : modalMode === 'edit' ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </ModalWrapper>

      {/* ── Change Password Modal ───────────────────────────────────────────── */}
      <ModalWrapper open={pwModalOpen} onClose={() => setPwModalOpen(false)} title="Change Password" icon={KeyRound} width="max-w-md">
        {selectedUser && (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ backgroundColor: avatarColor(selectedUser.username || '') }}
              >
                {initials(selectedUser.username || '')}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{selectedUser.username}</p>
                <p className="text-xs text-slate-500">{selectedUser.email}</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                New Password <span className="text-rose-500">*</span>
              </label>
              {pw.length > 0 && pw.length < 8 && (
                <p className="text-xs text-rose-600">Must be at least 8 characters</p>
              )}
              <div className="relative">
                {/* <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="Enter new password"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
                /> */}
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={8}
                  maxLength={20}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <Eye size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              {confirmPw && pw !== confirmPw && (
                <p className="text-xs text-rose-600">Passwords do not match</p>
              )}
              {/* <input
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Re-enter password"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              /> */}
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Re-enter password"
                required
                minLength={8}
                maxLength={20}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            {pw && confirmPw && pw === confirmPw && pw.length >= 6 && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 size={13} /> Passwords match
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!pw || !confirmPw || pw !== confirmPw || pw.length < 6 || submitting}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <KeyRound size={14} />
                Change Password
              </button>
            </div>
          </form>
        )}
      </ModalWrapper>
    </div>
  );
}
