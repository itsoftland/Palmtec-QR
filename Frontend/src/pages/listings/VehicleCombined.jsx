import { useState, useEffect, useMemo } from 'react';
import { Truck, Bus, Tag, Plus, Eye, Pencil, Search, X, ChevronRight } from 'lucide-react';
import { useModalForm } from '../../assets/js/useModalForm';
import { submitForm } from '../../assets/js/submitForm';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import cacheManager from '../../assets/js/reportCache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const BUS_TYPES_CACHE_KEY = 'masterdata_bus_types';
const BUS_TYPES_TTL = 30 * 60 * 1000;
const PER_PAGE = 10;

const PALETTE = [
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500', subtle: 'bg-blue-50' },
  { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500', subtle: 'bg-green-50' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', subtle: 'bg-amber-50' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500', subtle: 'bg-purple-50' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500', subtle: 'bg-rose-50' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500', subtle: 'bg-cyan-50' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500', subtle: 'bg-indigo-50' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500', subtle: 'bg-pink-50' },
];

const emptyVehicleForm = { bus_reg_num: '', bus_type: '', is_deleted: false };
const emptyBusTypeForm = { bustype_code: '', name: '', is_active: true };

const getPageNums = (current, total) => {
  let s = Math.max(1, current - 1);
  let e = Math.min(total, s + 2);
  if (e - s < 2) s = Math.max(1, e - 2);
  return Array.from({ length: e - s + 1 }, (_, i) => s + i);
};

export default function VehicleCombined() {

  // ── Navigation ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('vehicles');
  const [selectedType, setSelectedType] = useState(null);

  // ── Bus Types ────────────────────────────────────────────────────────────────
  const [busTypes, setBusTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeModalMode, setTypeModalMode] = useState('create');
  const [editingType, setEditingType] = useState(null);
  const [typeFormData, setTypeFormData] = useState(emptyBusTypeForm);
  const [typeSubmitting, setTypeSubmitting] = useState(false);

  // ── Vehicles ─────────────────────────────────────────────────────────────────
  const [vehicles, setVehicles] = useState([]);
  const [vehLoading, setVehLoading] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [vehSearch, setVehSearch] = useState('');
  const [vehPage, setVehPage] = useState(1);

  const {
    isModalOpen, setIsModalOpen,
    modalMode, editingItem,
    formData, setFormData,
    submitting, setSubmitting,
    openCreateModal, openViewModal, openEditModal,
    handleInputChange, isReadOnly,
  } = useModalForm(emptyVehicleForm);

  // ── Color map ─────────────────────────────────────────────────────────────────
  const colorMap = useMemo(() => {
    const map = {};
    busTypes.filter(t => t.is_active).forEach((t, i) => { map[t.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [busTypes]);

  // ── Derived data ──────────────────────────────────────────────────────────────
  // Left panel: active bus types only
  const activeBusTypes = useMemo(() => busTypes.filter(t => t.is_active), [busTypes]);

  // Types tab: respects showInactive toggle + search
  const displayBusTypes = useMemo(() => {
    const base = showInactive ? busTypes : busTypes.filter(t => t.is_active);
    if (!typeSearch.trim()) return base;
    const t = typeSearch.toLowerCase();
    return base.filter(bt => bt.name?.toLowerCase().includes(t) || bt.bustype_code?.toLowerCase().includes(t));
  }, [busTypes, showInactive, typeSearch]);

  // Vehicles: respects showDeleted toggle
  const displayVehicles = useMemo(() =>
    showDeleted ? vehicles : vehicles.filter(v => !v.is_deleted),
    [vehicles, showDeleted]
  );

  const typeFiltered = useMemo(() =>
    selectedType ? displayVehicles.filter(v => v.bus_type === selectedType) : displayVehicles,
    [displayVehicles, selectedType]
  );

  const vehFiltered = useMemo(() => {
    if (!vehSearch.trim()) return typeFiltered;
    const t = vehSearch.toLowerCase();
    return typeFiltered.filter(v =>
      v.bus_reg_num?.toLowerCase().includes(t) ||
      v.bus_type_name?.toLowerCase().includes(t)
    );
  }, [typeFiltered, vehSearch]);

  // ── Pagination ────────────────────────────────────────────────────────────────
  const vehTotalPages = Math.ceil(vehFiltered.length / PER_PAGE);
  const vehPageItems = vehFiltered.slice((vehPage - 1) * PER_PAGE, vehPage * PER_PAGE);

  useEffect(() => setVehPage(1), [selectedType, vehSearch, showDeleted]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalVeh = vehicles.length;
  const activeVeh = vehicles.filter(v => !v.is_deleted).length;
  const deletedVeh = vehicles.filter(v => v.is_deleted).length;

  const getVehCount = (typeId) => displayVehicles.filter(v => v.bus_type === typeId).length;

  // ── Data fetching ─────────────────────────────────────────────────────────────
  useEffect(() => { loadBusTypes(); fetchVehicles(); }, []);

  const loadBusTypes = async (force = false) => {
    if (!force) {
      const cached = cacheManager.get(BUS_TYPES_CACHE_KEY);
      if (cached) { setBusTypes(cached); setTypesLoading(false); return; }
    }
    setTypesLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/bus-types`);
      const data = res.data?.data || [];
      cacheManager.set(BUS_TYPES_CACHE_KEY, data, BUS_TYPES_TTL);
      setBusTypes(data);
    } catch (err) {
      console.error('Error fetching bus types:', err);
    } finally {
      setTypesLoading(false);
    }
  };

  const fetchVehicles = async () => {
    setVehLoading(true);
    try {
      const [activeRes, deletedRes] = await Promise.all([
        api.get(`${BASE_URL}/masterdata/vehicles`, { params: { show_deleted: false } }),
        api.get(`${BASE_URL}/masterdata/vehicles`, { params: { show_deleted: true } }),
      ]);
      const allMap = new Map();
      [...(activeRes.data?.data || []), ...(deletedRes.data?.data || [])].forEach(v => allMap.set(v.id, v));
      setVehicles([...allMap.values()]);
    } catch (err) {
      console.error('Error fetching vehicles:', err);
      setVehicles([]);
    } finally {
      setVehLoading(false);
    }
  };

  // ── Bus Type CRUD ─────────────────────────────────────────────────────────────
  const openTypeCreate = () => { setTypeFormData(emptyBusTypeForm); setEditingType(null); setTypeModalMode('create'); setTypeModalOpen(true); };
  const openTypeView = (t) => { setTypeFormData(t); setEditingType(t); setTypeModalMode('view'); setTypeModalOpen(true); };
  const openTypeEdit = (t) => { setTypeFormData(t); setEditingType(t); setTypeModalMode('edit'); setTypeModalOpen(true); };

  const handleTypeSubmit = async () => {
    setTypeSubmitting(true);
    try {
      const res = typeModalMode === 'edit'
        ? await api.put(`${BASE_URL}/masterdata/bus-types/update/${editingType.id}`, typeFormData)
        : await api.post(`${BASE_URL}/masterdata/bus-types/create`, typeFormData);
      if (res?.status === 200 || res?.status === 201) {
        window.alert(res.data.message || 'Success');
        setTypeModalOpen(false);
        setTypeFormData(emptyBusTypeForm);
        cacheManager.invalidate(BUS_TYPES_CACHE_KEY);
        loadBusTypes(true);
      }
    } catch (err) {
      if (!err.response) return window.alert('Server unreachable. Try later.');
      const { data } = err.response;
      window.alert((data.errors ? Object.values(data.errors)[0][0] : data.message) || 'Validation failed');
    } finally {
      setTypeSubmitting(false);
    }
  };

  const typeIsReadOnly = typeModalMode === 'view';
  const getTypeModalTitle = () => ({ view: 'Bus Type Details', edit: 'Edit Bus Type', create: 'Create Bus Type' }[typeModalMode]);

  // ── Vehicle CRUD ──────────────────────────────────────────────────────────────
  const handleVehSubmit = (e) => { e.preventDefault(); return submitForm({
    modalMode, editingItem, formData,
    createUrl: `${BASE_URL}/masterdata/vehicles/create`,
    updateUrl: `${BASE_URL}/masterdata/vehicles/update/${editingItem?.id}`,
    setSubmitting,
    onSuccess: () => { setIsModalOpen(false); setFormData(emptyVehicleForm); fetchVehicles(); },
  }); };

  const getVehModalTitle = () => ({ view: 'Vehicle Details', edit: 'Edit Vehicle', create: 'Register Vehicle' }[modalMode]);
  const selectedTypeName = busTypes.find(t => t.id === selectedType)?.name || '';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-50 p-3 sm:p-4 lg:p-5 h-[calc(100vh-5rem)] lg:h-screen overflow-hidden">
      <div className="flex flex-col bg-white h-full rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* ── HEADER ──────────────────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
              <Truck size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">Fleet Management</h1>
              <p className="text-slate-400 text-xs mt-0.5">Manage bus types and vehicle registrations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 border border-slate-200 rounded-full px-3 py-1 text-xs">
              <span className="text-slate-400">Total</span>
              <span className="font-bold text-slate-800">{totalVeh}</span>
            </span>
            <span className="flex items-center gap-1 border border-emerald-200 bg-emerald-50 rounded-full px-3 py-1 text-xs text-emerald-700 font-semibold">
              Active {activeVeh}
            </span>
            {deletedVeh > 0 && (
              <span className="flex items-center gap-1 border border-red-200 bg-red-50 rounded-full px-3 py-1 text-xs text-red-600 font-semibold">
                Deleted {deletedVeh}
              </span>
            )}
          </div>
        </div>

        {/* ── TAB BAR ─────────────────────────────────────────────────────────── */}
        <div className="px-6 flex items-center border-b border-slate-200 flex-shrink-0">
          <div className="flex gap-1">
            {[
              { key: 'vehicles', icon: Truck, label: 'Vehicles' },
              { key: 'types', icon: Bus, label: 'Bus Types' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === key
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3 pb-1">
            {activeTab === 'vehicles' && (
              <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-700 select-none">
                <input
                  type="checkbox" checked={showDeleted}
                  onChange={() => setShowDeleted(p => !p)}
                  className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-900"
                />
                Show deleted
              </label>
            )}
            {activeTab === 'types' && (
              <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-700 select-none">
                <input
                  type="checkbox" checked={showInactive}
                  onChange={() => setShowInactive(p => !p)}
                  className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-900"
                />
                Show inactive
              </label>
            )}
            <Button
              onClick={activeTab === 'vehicles' ? openCreateModal : openTypeCreate}
              className="bg-slate-900 hover:bg-slate-700 text-white gap-1.5 h-8 px-3 text-sm"
            >
              <Plus size={14} />
              {activeTab === 'vehicles' ? 'Register Vehicle' : 'Create Bus Type'}
            </Button>
          </div>
        </div>

        {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden">

          {/* ── VEHICLES TAB ──────────────────────────────────────────────────── */}
          {activeTab === 'vehicles' && (
            <div className="flex h-full">

              {/* Left panel — active bus types only */}
              <div className="w-64 border-r border-slate-100 flex flex-col flex-shrink-0 overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between flex-shrink-0">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Bus Types
                  </span>
                  <button
                    onClick={openTypeCreate}
                    className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
                  {/* All Vehicles */}
                  <button
                    onClick={() => setSelectedType(null)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${!selectedType ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Truck size={15} className="shrink-0" />
                    <span className="flex-1 text-left font-medium">All Vehicles</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${!selectedType ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                      {displayVehicles.length}
                    </span>
                  </button>

                  {/* Active type rows */}
                  {typesLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="w-4 h-4 rounded shrink-0" />
                        <Skeleton className="h-3.5 rounded flex-1" />
                        <Skeleton className="w-5 h-4 rounded" />
                      </div>
                    ))
                    : activeBusTypes.map((type) => {
                      const color = colorMap[type.id] || PALETTE[0];
                      const count = getVehCount(type.id);
                      const isSelected = selectedType === type.id;
                      return (
                        <button
                          key={type.id}
                          onClick={() => setSelectedType(isSelected ? null : type.id)}
                          className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${isSelected
                            ? `${color.subtle} ${color.text}`
                            : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                          <Bus size={14} className={`shrink-0 ${isSelected ? color.text : 'text-slate-300'}`} />
                          <div className="flex-1 text-left min-w-0">
                            <p className={`truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                              {type.name}
                            </p>
                            <p className={`text-[10px] font-mono ${isSelected ? color.text : 'text-slate-400'}`}>
                              {type.bustype_code}
                            </p>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${isSelected ? color.text : 'text-slate-400'}`}>
                            {count}
                          </span>
                          <span
                            onClick={(e) => { e.stopPropagation(); openTypeEdit(type); }}
                            className="p-1 rounded-md transition-all opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/60"
                            title="Edit type"
                          >
                            <Pencil size={11} />
                          </span>
                        </button>
                      );
                    })
                  }
                </div>
              </div>

              {/* Right panel */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Filter bar + search */}
                <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-slate-400 shrink-0">{vehFiltered.length} vehicles</span>
                  {selectedType && (
                    <>
                      <span className="text-slate-200 text-xs">·</span>
                      <span className={`flex items-center gap-1.5 ${colorMap[selectedType]?.bg} ${colorMap[selectedType]?.text} rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0`}>
                        <Bus size={10} />
                        {selectedTypeName}
                        <button onClick={() => setSelectedType(null)} className="ml-0.5 hover:opacity-70 leading-none">
                          <X size={10} />
                        </button>
                      </span>
                    </>
                  )}
                  <div className="ml-auto flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 min-w-0">
                    <Search size={13} className="text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search by reg. number or bus type..."
                      value={vehSearch}
                      onChange={e => setVehSearch(e.target.value)}
                      className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none min-w-0 w-56"
                    />
                    {vehSearch && (
                      <button onClick={() => setVehSearch('')} className="text-slate-400 hover:text-slate-600">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Vehicle table */}
                <div className="overflow-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-slate-100">
                        {['ID', 'Reg. Number', 'Bus Type', 'Status', ''].map(h => (
                          <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {vehLoading
                        ? Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i}>
                            {[40, 140, 120, 70, 60].map((w, j) => (
                              <td key={j} className="px-5 py-3.5">
                                <Skeleton className="h-4 rounded" style={{ width: w }} />
                              </td>
                            ))}
                          </tr>
                        ))
                        : vehPageItems.length === 0
                          ? (
                            <tr>
                              <td colSpan={5} className="px-5 py-16 text-center text-slate-400 text-sm">
                                No vehicles found.
                              </td>
                            </tr>
                          )
                          : vehPageItems.map(item => {
                            const color = colorMap[item.bus_type] || { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400', border: 'border-slate-200' };
                            return (
                              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3.5">
                                  <span className="font-mono text-slate-400 text-xs">#{item.id}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="font-bold text-slate-800 tracking-wide uppercase">{item.bus_reg_num}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  {item.bus_type_name
                                    ? (
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${color.bg} ${color.text} ${color.border}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                                        {item.bus_type_name}
                                      </span>
                                    )
                                    : <span className="text-slate-400 text-sm">—</span>
                                  }
                                </td>
                                <td className="px-5 py-3.5">
                                  {item.is_deleted
                                    ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100">Deleted</span>
                                    : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">Active</span>
                                  }
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button onClick={() => openViewModal(item)} className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"><Eye size={14} /></button>
                                    <button onClick={() => openEditModal(item)} className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"><Pencil size={14} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                      }
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {!vehLoading && vehTotalPages > 1 && (
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
                    <p className="text-xs text-slate-400">
                      Showing {(vehPage - 1) * PER_PAGE + 1}–{Math.min(vehPage * PER_PAGE, vehFiltered.length)} of {vehFiltered.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setVehPage(p => p - 1)} disabled={vehPage === 1}
                        className="h-7 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40">Prev</button>
                      {getPageNums(vehPage, vehTotalPages).map(n => (
                        <button key={n} onClick={() => setVehPage(n)}
                          className={`h-7 w-7 text-xs rounded-md ${vehPage === n ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          {n}
                        </button>
                      ))}
                      <button onClick={() => setVehPage(p => p + 1)} disabled={vehPage === vehTotalPages}
                        className="h-7 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── BUS TYPES TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'types' && (
            <div className="flex flex-col h-full">

              {/* Search */}
              <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 max-w-sm">
                  <Search size={13} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search by name or code..."
                    value={typeSearch}
                    onChange={e => setTypeSearch(e.target.value)}
                    className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none flex-1"
                  />
                  {typeSearch && (
                    <button onClick={() => setTypeSearch('')} className="text-slate-400 hover:text-slate-600">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Bus Types table */}
              <div className="overflow-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100">
                      {['ID', 'Code', 'Name', 'Vehicles', 'Status', ''].map(h => (
                        <th key={h} className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {typesLoading
                      ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          {[40, 90, 180, 110, 80, 60].map((w, j) => (
                            <td key={j} className="px-6 py-4"><Skeleton className="h-4 rounded" style={{ width: w }} /></td>
                          ))}
                        </tr>
                      ))
                      : displayBusTypes.length === 0
                        ? <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-400 text-sm">No bus types found.</td></tr>
                        : displayBusTypes.map((type) => {
                          const color = colorMap[type.id] || PALETTE[0];
                          const count = getVehCount(type.id);
                          return (
                            <tr key={type.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className="font-mono text-slate-400 text-xs">#{type.id}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                  {type.bustype_code}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${type.is_active ? color.bg : 'bg-slate-100'}`}>
                                    <Bus size={15} className={type.is_active ? color.text : 'text-slate-400'} />
                                  </div>
                                  <span className={`font-semibold text-sm ${type.is_active ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {type.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {type.is_active
                                  ? (
                                    <button
                                      onClick={() => { setActiveTab('vehicles'); setSelectedType(type.id); }}
                                      className={`flex items-center gap-1.5 ${color.bg} ${color.text} ${color.border} border rounded-full px-3 py-1 text-xs font-semibold hover:opacity-80 transition-opacity`}
                                    >
                                      {count} vehicles <ChevronRight size={12} />
                                    </button>
                                  )
                                  : <span className="text-slate-400 text-xs">—</span>
                                }
                              </td>
                              <td className="px-6 py-4">
                                {type.is_active
                                  ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">Active</span>
                                  : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">Inactive</span>
                                }
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button onClick={() => openTypeView(type)} className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"><Eye size={14} /></button>
                                  <button onClick={() => openTypeEdit(type)} className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"><Pencil size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── BUS TYPE MODAL ───────────────────────────────────────────────────────── */}
        <Dialog open={typeModalOpen} onOpenChange={setTypeModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-800">
                <span className="p-1.5 rounded-lg bg-slate-900"><Bus size={14} className="text-white" /></span>
                {getTypeModalTitle()}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Type Code *</Label>
                  {/* <Input name="bustype_code" value={typeFormData.bustype_code}
                    onChange={e => setTypeFormData(p => ({ ...p, bustype_code: e.target.value }))}
                    readOnly={typeIsReadOnly} placeholder="e.g. BT001"
                    className={typeIsReadOnly ? 'bg-slate-50 text-slate-600' : ''} /> */}
                  <Input
                    name="bustype_code"
                    value={typeFormData.bustype_code}
                    onChange={e =>
                      setTypeFormData(p => ({
                        ...p,
                        bustype_code: e.target.value
                      }))
                    }
                    readOnly={typeIsReadOnly}
                    placeholder="e.g. BT001"
                    minLength={3}
                    maxLength={15}
                    className={typeIsReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Name *</Label>
                  {/* <Input name="name" value={typeFormData.name}
                    onChange={e => setTypeFormData(p => ({ ...p, name: e.target.value }))}
                    readOnly={typeIsReadOnly} placeholder="e.g. Luxury Coach"
                    className={typeIsReadOnly ? 'bg-slate-50 text-slate-600' : ''} /> */}
                  <Input
                    name="name"
                    value={typeFormData.name}
                    onChange={e =>
                      setTypeFormData(p => ({
                        ...p,
                        name: e.target.value
                      }))
                    }
                    readOnly={typeIsReadOnly}
                    placeholder="e.g. Luxury Coach"
                    minLength={3}
                    maxLength={20}
                    className={typeIsReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                  />
                </div>
              </div>
              {typeModalMode !== 'create' && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <input type="checkbox" name="is_active" id="bt_is_active"
                    checked={typeFormData.is_active}
                    onChange={e => setTypeFormData(p => ({ ...p, is_active: e.target.checked }))}
                    disabled={typeIsReadOnly}
                    className="w-4 h-4 rounded border-slate-300 accent-slate-900" />
                  <Label htmlFor="bt_is_active" className="text-slate-700 cursor-pointer">Active</Label>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button variant="outline" onClick={() => setTypeModalOpen(false)} className="text-slate-600">
                  {typeIsReadOnly ? 'Close' : 'Cancel'}
                </Button>
                {!typeIsReadOnly && (
                  <Button onClick={handleTypeSubmit} disabled={typeSubmitting} className="bg-slate-900 hover:bg-slate-700 text-white">
                    {typeSubmitting ? 'Saving...' : typeModalMode === 'edit' ? 'Update' : 'Save'}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── VEHICLE MODAL ────────────────────────────────────────────────────────── */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-800">
                <span className="p-1.5 rounded-lg bg-slate-900"><Truck size={14} className="text-white" /></span>
                {getVehModalTitle()}
              </DialogTitle>
            </DialogHeader>
            <form className="space-y-4 mt-2" onSubmit={handleVehSubmit}>
              <div className="space-y-1.5">
                <Label className="text-slate-700">Registration Number *</Label>
                <Input
                  name="bus_reg_num"
                  value={formData.bus_reg_num}
                  onChange={handleInputChange}
                  readOnly={isReadOnly}
                  placeholder="e.g. KA-01-AB-1234"
                  minLength={5}
                  maxLength={18}
                  required={!isReadOnly}
                  className={`uppercase ${isReadOnly ? 'bg-slate-50 text-slate-600' : ''}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-700">Bus Type *</Label>
                {isReadOnly ? (
                  <Input value={formData.bus_type_name || '—'} readOnly className="bg-slate-50 text-slate-600" />
                ) : (
                  <select name="bus_type" value={formData.bus_type} onChange={handleInputChange} required
                    className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-900">
                    <option value="">-- Select Bus Type --</option>
                    {activeBusTypes.map(bt => (
                      <option key={bt.id} value={bt.id}>{bt.name} ({bt.bustype_code})</option>
                    ))}
                  </select>
                )}
              </div>
              {modalMode === 'edit' && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-red-50 rounded-lg border border-red-200">
                  <input type="checkbox" name="is_deleted" id="veh_is_deleted"
                    checked={formData.is_deleted || false} onChange={handleInputChange}
                    className="w-4 h-4 rounded border-slate-300 accent-red-600" />
                  <Label htmlFor="veh_is_deleted" className="text-red-700 cursor-pointer">Mark as deleted</Label>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="text-slate-600">
                  {isReadOnly ? 'Close' : 'Cancel'}
                </Button>
                {!isReadOnly && (
                  <Button type="submit" disabled={submitting} className="bg-slate-900 hover:bg-slate-700 text-white">
                    {submitting ? 'Saving...' : modalMode === 'edit' ? 'Update' : 'Save'}
                  </Button>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
