import { useState, useEffect } from 'react';
import { Coins, Plus, Eye, Pencil, Search, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import {
  PageHeader, Btn, DesignCard, DesignModal,
  FieldBlock, FieldGroup, FormField, DesignInput, Pagination, fmt,
} from '@/components/design';

export default function CurrencyListing() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [modalOpen, setModalOpen]   = useState(false);
  const [modalMode, setModalMode]   = useState('view');
  const [selected, setSelected]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const PER_PAGE = 10;

  const emptyForm = { currency: '', country: '' };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => { fetchCurrencies(); }, []);

  const fetchCurrencies = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/currencies`);
      setCurrencies(res.data?.data || []);
      setPage(1);
    } catch (err) {
      console.error('Error fetching currencies:', err);
      setCurrencies([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Filter + paginate ──────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filtered   = currencies.filter(c =>
    c.currency?.toLowerCase().includes(q) ||
    c.country?.toLowerCase().includes(q)
  );
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged      = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search]);

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openView   = (c) => { setSelected(c); setModalMode('view');   setModalOpen(true); };
  const openEdit   = (c) => { setSelected(c); setForm({ currency: c.currency, country: c.country }); setErrors({}); setModalMode('edit');   setModalOpen(true); };
  const openCreate = ()  => { setSelected(null); setForm(emptyForm);  setErrors({}); setModalMode('create'); setModalOpen(true); };
  const closeModal = ()  => { setModalOpen(false); setErrors({}); };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const nextErrors = {};
    if (form.currency.trim().length !== 3) {
      nextErrors.currency = 'Currency code must be 3 letters.';
    }
    if (form.country.trim().length < 3) {
      nextErrors.country = 'Country must be at least 3 characters.';
    }
    if (Object.keys(nextErrors).length) {
      return setErrors(nextErrors);
    }
    setErrors({});
    setSubmitting(true);
    try {
      let res;
      if (modalMode === 'edit') {
        res = await api.put(`${BASE_URL}/masterdata/currencies/update/${selected.id}`, form);
      } else {
        res = await api.post(`${BASE_URL}/masterdata/currencies/create`, form);
      }
      if (res?.status === 200 || res?.status === 201) {
        window.alert(res.data.message || 'Success');
        closeModal();
        setForm(emptyForm);
        fetchCurrencies();
      }
    } catch (err) {
      if (!err.response) return window.alert('Server unreachable. Try later.');
      const { data } = err.response;
      window.alert((data.errors ? Object.values(data.errors)[0][0] : data.message) || 'Validation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-5 lg:p-6 min-h-full bg-slate-50">

      <PageHeader
        icon={Coins}
        title="Currencies"
        subtitle="Manage currency master data"
        actions={<Btn icon={Plus} onClick={openCreate}>Create Currency</Btn>}
      />

      {/* Total chip */}
      <div className="flex gap-2 mb-5">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
          <span className="text-slate-500">Total</span>
          <span className="font-bold text-slate-800">{currencies.length}</span>
        </div>
      </div>

      {/* Table card */}
      <DesignCard>
        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Search size={15} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by currency code or country…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm text-slate-700 placeholder:text-slate-400 outline-none bg-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['ID', 'Currency Code', 'Country', 'Created', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[40, 80, 140, 100, 70].map((w, j) => (
                      <td key={j} className="px-5 py-3.5"><Skeleton className="h-4 rounded" style={{ width: w }} /></td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">No currencies found.</td></tr>
              ) : paged.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-slate-500 text-xs font-semibold">#{c.id}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">{c.currency}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700">{c.country}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-400">{c.created_at ? fmt.date(c.created_at) : '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openView(c)} title="View"
                        className="p-2 rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors cursor-pointer">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEdit(c)} title="Edit"
                        className="p-2 rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors cursor-pointer">
                        <Pencil size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
            </p>
            <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </DesignCard>

      {/* Modal */}
      <DesignModal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === 'view' ? 'Currency Details' : modalMode === 'edit' ? 'Edit Currency' : 'Create Currency'}
        icon={Coins}
        width="sm:max-w-md"
      >
        {modalMode === 'view' && selected ? (
          <div className="space-y-5">
            <FieldGroup columns={2}>
              <FieldBlock label="Currency Code" value={selected.currency} accent="blue" />
              <FieldBlock label="Country"       value={selected.country}  accent="emerald" />
            </FieldGroup>
            <FieldGroup columns={2}>
              <FieldBlock label="Record ID" value={`#${selected.id}`} />
              <FieldBlock label="Created"   value={selected.created_at ? fmt.date(selected.created_at) : '—'} />
            </FieldGroup>
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Btn variant="secondary" onClick={closeModal}>Close</Btn>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <FormField label="Currency Code" required hint="3-letter ISO code (e.g. INR, USD)" error={errors.currency}>
              <DesignInput
                value={form.currency}
                onChange={v => setForm(f => ({ ...f, currency: v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }))}
                placeholder="e.g. INR"
              />
            </FormField>
            <FormField label="Country" required error={errors.country}>
              <DesignInput value={form.country} onChange={v => setForm(f => ({ ...f, country: v.replace(/[^A-Za-z\s]/g, '').slice(0, 20) }))} placeholder="e.g. India" />
            </FormField>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
              <Btn onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Saving…' : modalMode === 'edit' ? 'Update' : 'Save'}
              </Btn>
            </div>
          </div>
        )}
      </DesignModal>
    </div>
  );
}
