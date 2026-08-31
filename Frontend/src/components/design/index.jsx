// ─── Shared Design System Components ────────────────────────────────────────
// Matches the Palmtec redesign reference (slate-900 primary, rounded-2xl cards)
// Used across: CompanyDashboard, DepotListing, CurrencyListing, RouteListing, SettingsPage

import {
  ChevronRight, TrendingUp, TrendingDown, AlertCircle, X,
  CheckCircle2,
} from 'lucide-react';

// ── KPI Card ────────────────────────────────────────────────────────────────
export function KpiCard({ title, value, subtitle, icon: Icon, color = '#6366f1', loading, trend }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 truncate">{title}</p>
          {loading ? (
            <div className="mt-2 h-7 w-28 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="mt-1.5 text-xl font-bold text-slate-900 truncate">{value}</p>
          )}
          {subtitle && !loading && (
            <p className="mt-1 text-xs text-slate-500 truncate">{subtitle}</p>
          )}
          {trend && !loading && (
            <div className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${trend.dir === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {trend.dir === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              <span>{trend.value}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-4 ring-white"
            style={{ backgroundColor: color }}
          >
            <Icon size={18} color="#fff" />
          </div>
        )}
      </div>
      <div className="absolute bottom-0 left-0 h-0.5 w-full opacity-60" style={{ backgroundColor: color }} />
    </div>
  );
}

// ── Page Header ─────────────────────────────────────────────────────────────
export function PageHeader({ icon: Icon, title, subtitle, livePill, breadcrumb, actions }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
      <div>
        {breadcrumb && (
          <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={11} className="text-slate-300" />}
                <span className={i === breadcrumb.length - 1 ? 'text-slate-700 font-medium' : ''}>{b}</span>
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md">
              <Icon size={18} color="#fff" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
              {livePill && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${livePill.live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                  {livePill.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, variant = 'primary', size = 'md', icon: Icon, onClick, disabled, className = '', type = 'button' }) {
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4 text-sm', lg: 'h-10 px-5 text-sm' };
  const variants = {
    primary:   'bg-slate-900 hover:bg-slate-700 text-white shadow-sm',
    secondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
    ghost:     'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
    danger:    'bg-rose-600 hover:bg-rose-700 text-white shadow-sm',
    accent:    'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function DesignCard({ children, className = '' }) {
  return (
    <div className={`border border-slate-200 shadow-sm rounded-2xl bg-white overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

// ── Status Pill ──────────────────────────────────────────────────────────────
export function StatusPill({ status, size = 'md' }) {
  const map = {
    active:   { label: 'Active',      bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    inactive: { label: 'Inactive',    bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    closed:   { label: 'Closed',      bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    open:     { label: 'In Progress', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
    deleted:  { label: 'Deleted',     bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  };
  const s = map[status] || map.inactive;
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizing} ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === 'open' ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ currentPage, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const getRange = (current, total, windowSize = 5) => {
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, current - half);
    let end = Math.min(total, start + windowSize - 1);
    if (end - start < windowSize - 1) start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  return (
    <div className="flex items-center justify-center gap-1.5">
      <Btn variant="secondary" size="sm" onClick={() => onChange(currentPage - 1)} disabled={currentPage === 1}>Prev</Btn>
      {getRange(currentPage, totalPages).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`h-8 w-8 text-xs font-medium rounded-lg transition-colors ${
            currentPage === p ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {p}
        </button>
      ))}
      <Btn variant="secondary" size="sm" onClick={() => onChange(currentPage + 1)} disabled={currentPage === totalPages}>Next</Btn>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function DesignModal({ open, onClose, title, icon: Icon, children, width = 'sm:max-w-3xl' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[85vh] overflow-y-auto overflow-x-hidden`}>
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

// ── Field Block (read-only detail) ───────────────────────────────────────────
export function FieldBlock({ label, value, accent }) {
  const accents = {
    blue:    'bg-blue-50 border-blue-100 text-blue-800',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    slate:   'bg-slate-100 border-slate-200 text-slate-800',
  };
  if (accent) {
    return (
      <div className={`rounded-lg border px-3 py-3 text-center ${accents[accent]}`}>
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{label}</p>
        <p className="text-base font-bold mt-1">{value}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800 mt-0.5 break-all">{value ?? '—'}</p>
    </div>
  );
}

export function FieldGroup({ title, children, columns = 2 }) {
  const cols = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };
  return (
    <div>
      {title && <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">{title}</p>}
      <div className={`grid ${cols[columns] || 'grid-cols-2'} gap-2`}>{children}</div>
    </div>
  );
}

// ── Form Field ───────────────────────────────────────────────────────────────
export function FormField({ label, required, hint, error, children, span = 1 }) {
  const spanClass = { 1: '', 2: 'md:col-span-2', 3: 'md:col-span-3' }[span] || '';
  return (
    <div className={`space-y-1 ${spanClass}`}>
      <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      {error && <p className="text-xs text-rose-600 mt-0.5 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
    </div>
  );
}

export function DesignInput({ value, onChange, type = 'text', placeholder, disabled, prefix, suffix, readOnly, name }) {
  return (
    <div className={`flex items-center rounded-lg border border-slate-300 bg-white transition-all focus-within:ring-2 focus-within:ring-slate-400 focus-within:border-slate-400 ${disabled || readOnly ? 'bg-slate-50' : ''}`}>
      {prefix && <span className="pl-3 text-slate-400 text-sm">{prefix}</span>}
      <input
        type={type}
        name={name}
        value={value ?? ''}
        onChange={e => onChange ? onChange(e.target.value) : undefined}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
      />
      {suffix && <span className="pr-3 text-slate-400 text-xs">{suffix}</span>}
    </div>
  );
}



export function DesignTextarea({ value, onChange, placeholder, rows = 3, readOnly, name }) {
  return (
    <textarea
      name={name}
      value={value ?? ''}
      onChange={e => onChange ? onChange(e.target.value) : undefined}
      placeholder={placeholder}
      rows={rows}
      readOnly={readOnly}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 read-only:bg-slate-50 resize-none"
    />
  );
}

// ── Section Card (settings sections) ─────────────────────────────────────────
export function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <DesignCard>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5">
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <Icon size={15} className="text-slate-600" />
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </DesignCard>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function SettToggle({ label, checked, onChange }) {
  return (
    <label className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer select-none ${
      checked ? 'border-slate-300 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
    }`}>
      <span className="text-sm text-slate-700 font-medium">{label}</span>
      <div
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-slate-800' : 'bg-slate-300'}`}
        onClick={e => { e.preventDefault(); onChange && onChange(); }}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </label>
  );
}

// ── Format helpers ────────────────────────────────────────────────────────────
export const fmt = {
  inr:  (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  inrK: (n) => {
    const v = Number(n) || 0;
    if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
    if (v >= 1000)   return `₹${(v / 1000).toFixed(1)}K`;
    return `₹${v.toFixed(0)}`;
  },
  date: (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },
};
