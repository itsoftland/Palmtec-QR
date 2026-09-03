import { useState, useEffect } from 'react';
import { Warehouse, Plus, Eye, Pencil, Search, X, Route as RouteIcon, ArrowRight, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import {
  PageHeader, Btn, DesignCard, StatusPill, DesignModal,
  FieldBlock, FieldGroup, FormField, DesignInput, DesignTextarea,
} from '@/components/design';

export default function DepotListing() {
  const [depots, setDepots]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [modalMode, setModalMode]   = useState('view'); // 'view' | 'edit' | 'create'
  const [selected, setSelected]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');

  const emptyForm = { depot_code: '', depot_name: '', address: '' };
  const [form, setForm] = useState(emptyForm);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => { fetchDepots(); }, []);

  const fetchDepots = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/depots`);
      setDepots(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching depots:', err);
      setDepots([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Filtered list ──────────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filtered = depots.filter(d =>
    d.depot_code?.toLowerCase().includes(q) ||
    d.depot_name?.toLowerCase().includes(q)
  );

  const totalCount  = depots.length;
  const activeCount = depots.filter(d => d.is_active).length;

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openView = (d) => {
    setSelected(d);
    setModalMode('view');
    setModalOpen(true);
  };

  const openEdit = (d) => {
    setSelected(d);
    setForm({ depot_code: d.depot_code, depot_name: d.depot_name, address: d.address });
    setFormError('');
    setModalMode('edit');
    setModalOpen(true);
  };

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setFormError('');
    setModalMode('create');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setSelected(null); setFormError(''); };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (modalMode !== 'edit' && form.depot_code.trim().length < 3) {
      return setFormError('Depot Code must be at least 3 characters.');
    }
    if (form.depot_name.trim().length < 3) {
      return setFormError('Depot Name must be at least 3 characters.');
    }
    if (form.address.trim().length < 3) {
      return setFormError('Address must be at least 3 characters.');
    }
    setSubmitting(true);
    try {
      let res;
      if (modalMode === 'edit') {
        res = await api.put(`${BASE_URL}/update-depot-details/${selected.id}`, form);
      } else {
        res = await api.post(`${BASE_URL}/create-depot`, form);
      }
      if (res?.status === 200 || res?.status === 201) {
        closeModal();
        fetchDepots();
      }
    } catch (err) {
      if (!err.response) return setFormError('Server unreachable. Try later.');
      const { data } = err.response;
      setFormError((data.errors ? Object.values(data.errors)[0][0] : data.message) || 'Validation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-5 lg:p-6 min-h-full bg-slate-50">

      {/* Header */}
      <PageHeader
        icon={Warehouse}
        title="Depot Management"
        subtitle="Manage and monitor company depots"
        actions={<Btn icon={Plus} onClick={openCreate}>Create Depot</Btn>}
      />

      {/* Stats */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { label: 'Total',    value: totalCount,              cls: 'bg-white border-slate-200' },
          { label: 'Active',   value: activeCount,             cls: 'bg-emerald-50 border-emerald-200' },
          { label: 'Inactive', value: totalCount - activeCount, cls: 'bg-rose-50 border-rose-200' },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm border ${s.cls}`}>
            <span className="text-slate-500">{s.label}</span>
            <span className="font-bold text-slate-800">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Table card */}
      <DesignCard>
        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Search size={15} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by code or name…"
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
                {['ID', 'Code', 'Name', 'Address', 'Routes', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[40, 80, 140, 120, 60, 70, 70].map((w, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <Skeleton className="h-4 rounded" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">No depots found.</td>
                </tr>
              ) : filtered.map(d => (
                <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-slate-500 text-xs font-semibold">#{d.id}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-semibold text-slate-800">{d.depot_code}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700">{d.depot_name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700 line-clamp-1 max-w-xs block">{d.address}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {d.routes && d.routes.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                        <RouteIcon size={11} />{d.routes.length}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={d.is_active ? 'active' : 'inactive'} size="sm" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openView(d)} title="View"
                        className="p-2 rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors cursor-pointer">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEdit(d)} title="Edit"
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

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <p className="text-xs text-slate-400">Showing {filtered.length} of {totalCount} depots</p>
        </div>
      </DesignCard>

      {/* ═══ MODAL ════════════════════════════════════════════════════════ */}
      <DesignModal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === 'view' ? 'Depot Details' : modalMode === 'edit' ? 'Edit Depot' : 'Create Depot'}
        icon={Warehouse}
        width={modalMode === 'view' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}
      >
        {modalMode === 'view' && selected ? (
          /* View mode */
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <FieldBlock label="Depot Code" value={selected.depot_code} accent="blue" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Depot Name</p>
                <p className="text-base font-bold text-slate-800 mt-0.5">{selected.depot_name}</p>
              </div>
              <StatusPill status={selected.is_active ? 'active' : 'inactive'} />
            </div>

            <FieldGroup title="Location" columns={1}>
              <FieldBlock label="Address" value={selected.address} />
            </FieldGroup>

            {/* Mapped Routes */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                Mapped Routes ({selected.routes?.length || 0})
              </p>
              {!selected.routes || selected.routes.length === 0 ? (
                <div className="text-center py-5 rounded-lg bg-slate-50 border border-slate-100">
                  <RouteIcon size={20} className="text-slate-300 mx-auto mb-1.5" />
                  <p className="text-sm text-slate-400">No routes mapped to this depot</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {selected.routes.map(r => (
                    <div key={r.route_code} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <RouteIcon size={14} className="text-blue-500 shrink-0" />
                      <span className="text-sm font-semibold text-slate-700">{r.route_code}</span>
                      <ArrowRight size={12} className="text-slate-300" />
                      <span className="text-sm text-slate-500">{r.route_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Btn variant="secondary" onClick={closeModal}>Close</Btn>
            </div>
          </div>
        ) : (
          /* Create / Edit form */
          <form className="space-y-4" onSubmit={handleSubmit}>
            {formError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Depot Code" required>
                <DesignInput value={form.depot_code} onChange={v => v.length <= 20 && setF('depot_code', v)} placeholder="e.g. NTC-ANP" required />
              </FormField>
              <FormField label="Depot Name" required>
                <DesignInput value={form.depot_name} onChange={v => v.length <= 20 && setF('depot_name', v)} placeholder="e.g. Anantapur Central Depot" required />
              </FormField>
            </div>

            <FormField label="Address" required>
              <DesignTextarea value={form.address} onChange={v => v.length <= 400 && setF('address', v)} placeholder="Full depot address" rows={2} required />
            </FormField>

            {modalMode === 'create' && (
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>To connect a route to this depot, open the route from <strong>Route Management</strong> and set the depot mapping there.</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <Btn variant="secondary" type="button" onClick={closeModal}>Cancel</Btn>
              <Btn type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : modalMode === 'edit' ? 'Update Depot' : 'Save Depot'}
              </Btn>
            </div>
          </form>
        )}
      </DesignModal>
    </div>
  );
}
