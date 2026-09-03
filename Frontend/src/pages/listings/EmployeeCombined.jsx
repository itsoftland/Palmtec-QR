import { useState, useEffect, useMemo } from 'react';
import { UserRound, Tag, Users, Plus, Eye, Pencil, Search, X, ChevronRight } from 'lucide-react';
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

const EMP_TYPES_CACHE_KEY = 'masterdata_emp_types';
const EMP_TYPES_TTL = 30 * 60 * 1000;
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

const emptyEmpForm = { employee_code: '', employee_name: '', emp_type: '', phone_no: '', password: '', is_deleted: false };
const emptyTypeForm = { emp_type_name: '' };

const getPageNums = (current, total) => {
  let s = Math.max(1, current - 1);
  let e = Math.min(total, s + 2);
  if (e - s < 2) s = Math.max(1, e - 2);
  return Array.from({ length: e - s + 1 }, (_, i) => s + i);
};

export default function EmployeeCombined() {

  // ── Navigation ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('employees');
  const [selectedType, setSelectedType] = useState(null);

  // ── Employee Types ───────────────────────────────────────────────────────────
  const [empTypes, setEmpTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeModalMode, setTypeModalMode] = useState('create');
  const [editingType, setEditingType] = useState(null);
  const [typeFormData, setTypeFormData] = useState(emptyTypeForm);
  const [typeSubmitting, setTypeSubmitting] = useState(false);

  // ── Employees ────────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [empPage, setEmpPage] = useState(1);

  const {
    isModalOpen, setIsModalOpen,
    modalMode, editingItem,
    formData, setFormData,
    submitting, setSubmitting,
    openCreateModal, openViewModal, openEditModal,
    handleInputChange, isReadOnly,
  } = useModalForm(emptyEmpForm);

  // ── Color map ─────────────────────────────────────────────────────────────────
  const colorMap = useMemo(() => {
    const map = {};
    empTypes.forEach((t, i) => { map[t.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [empTypes]);

  // ── Derived data ──────────────────────────────────────────────────────────────
  const displayEmployees = useMemo(() =>
    showDeleted ? employees : employees.filter(e => !e.is_deleted),
    [employees, showDeleted]
  );

  const typeFiltered = useMemo(() =>
    selectedType ? displayEmployees.filter(e => e.emp_type === selectedType) : displayEmployees,
    [displayEmployees, selectedType]
  );

  const empFiltered = useMemo(() => {
    if (!empSearch.trim()) return typeFiltered;
    const t = empSearch.toLowerCase();
    return typeFiltered.filter(e =>
      e.employee_code?.toLowerCase().includes(t) ||
      e.employee_name?.toLowerCase().includes(t) ||
      (e.phone_no || '').toLowerCase().includes(t)
    );
  }, [typeFiltered, empSearch]);

  const typesFiltered = useMemo(() => {
    if (!typeSearch.trim()) return empTypes;
    const t = typeSearch.toLowerCase();
    return empTypes.filter(e => e.emp_type_name?.toLowerCase().includes(t));
  }, [empTypes, typeSearch]);

  // ── Pagination ────────────────────────────────────────────────────────────────
  const empTotalPages = Math.ceil(empFiltered.length / PER_PAGE);
  const empPageItems = empFiltered.slice((empPage - 1) * PER_PAGE, empPage * PER_PAGE);

  useEffect(() => setEmpPage(1), [selectedType, empSearch, showDeleted]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const total = employees.length;
  const active = employees.filter(e => !e.is_deleted).length;
  const deleted = employees.filter(e => e.is_deleted).length;

  const getTypeCount = (typeId) => displayEmployees.filter(e => e.emp_type === typeId).length;

  // ── Data fetching ─────────────────────────────────────────────────────────────
  useEffect(() => { loadEmpTypes(); fetchEmployees(); }, []);

  const loadEmpTypes = async (force = false) => {
    if (!force) {
      const cached = cacheManager.get(EMP_TYPES_CACHE_KEY);
      if (cached) { setEmpTypes(cached); setTypesLoading(false); return; }
    }
    setTypesLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/employee-types`);
      const data = res.data?.data || [];
      cacheManager.set(EMP_TYPES_CACHE_KEY, data, EMP_TYPES_TTL);
      setEmpTypes(data);
    } catch (err) {
      console.error('Error fetching employee types:', err);
    } finally {
      setTypesLoading(false);
    }
  };

  const fetchEmployees = async () => {
    setEmpLoading(true);
    try {
      // Fetch active and deleted in parallel for complete stats
      const [activeRes, deletedRes] = await Promise.all([
        api.get(`${BASE_URL}/masterdata/employees`, { params: { show_deleted: false } }),
        api.get(`${BASE_URL}/masterdata/employees`, { params: { show_deleted: true } }),
      ]);
      const allMap = new Map();
      [...(activeRes.data?.data || []), ...(deletedRes.data?.data || [])].forEach(e => allMap.set(e.id, e));
      setEmployees([...allMap.values()]);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  };

  // ── Type CRUD ─────────────────────────────────────────────────────────────────
  const openTypeCreate = () => { setTypeFormData(emptyTypeForm); setEditingType(null); setTypeModalMode('create'); setTypeModalOpen(true); };
  const openTypeView = (t) => { setTypeFormData(t); setEditingType(t); setTypeModalMode('view'); setTypeModalOpen(true); };
  const openTypeEdit = (t) => { setTypeFormData(t); setEditingType(t); setTypeModalMode('edit'); setTypeModalOpen(true); };

  const handleTypeSubmit = async () => {
    setTypeSubmitting(true);
    try {
      const res = typeModalMode === 'edit'
        ? await api.put(`${BASE_URL}/masterdata/employee-types/update/${editingType.id}`, typeFormData)
        : await api.post(`${BASE_URL}/masterdata/employee-types/create`, typeFormData);
      if (res?.status === 200 || res?.status === 201) {
        window.alert(res.data.message || 'Success');
        setTypeModalOpen(false);
        setTypeFormData(emptyTypeForm);
        cacheManager.invalidate(EMP_TYPES_CACHE_KEY);
        loadEmpTypes(true);
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
  const getTypeModalTitle = () => ({ view: 'Employee Type Details', edit: 'Edit Employee Type', create: 'Create Employee Type' }[typeModalMode]);

  // ── Employee CRUD ─────────────────────────────────────────────────────────────
  const handleEmpSubmit = (e) => { e.preventDefault(); return submitForm({
    modalMode, editingItem, formData,
    createUrl: `${BASE_URL}/masterdata/employees/create`,
    updateUrl: `${BASE_URL}/masterdata/employees/update/${editingItem?.id}`,
    setSubmitting,
    onSuccess: () => { setIsModalOpen(false); setFormData(emptyEmpForm); fetchEmployees(); },
  }); };

  const getEmpModalTitle = () => ({ view: 'Employee Details', edit: 'Edit Employee', create: 'Create Employee' }[modalMode]);
  const selectedTypeName = empTypes.find(t => t.id === selectedType)?.emp_type_name || '';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-50 p-3 sm:p-4 lg:p-5 h-[calc(100vh-5rem)] lg:h-screen overflow-hidden">
      <div className="flex flex-col bg-white h-full rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* ── HEADER ──────────────────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
              <UserRound size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">Staff Management</h1>
              <p className="text-slate-400 text-xs mt-0.5">Manage employee types and staff records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 border border-slate-200 rounded-full px-3 py-1 text-xs">
              <span className="text-slate-400">Total</span>
              <span className="font-bold text-slate-800">{total}</span>
            </span>
            <span className="flex items-center gap-1 border border-emerald-200 bg-emerald-50 rounded-full px-3 py-1 text-xs text-emerald-700 font-semibold">
              Active {active}
            </span>
            {deleted > 0 && (
              <span className="flex items-center gap-1 border border-red-200 bg-red-50 rounded-full px-3 py-1 text-xs text-red-600 font-semibold">
                Deleted {deleted}
              </span>
            )}
          </div>
        </div>

        {/* ── TAB BAR ─────────────────────────────────────────────────────────── */}
        <div className="px-6 flex items-center border-b border-slate-200 flex-shrink-0">
          <div className="flex gap-1">
            {[
              { key: 'employees', icon: UserRound, label: 'Employees' },
              { key: 'types', icon: Tag, label: 'Employee Types' },
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
            {activeTab === 'employees' && (
              <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={() => setShowDeleted(p => !p)}
                  className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-900"
                />
                Show deleted
              </label>
            )}
            <Button
              onClick={activeTab === 'employees' ? openCreateModal : openTypeCreate}
              className="bg-slate-900 hover:bg-slate-700 text-white gap-1.5 h-8 px-3 text-sm"
            >
              <Plus size={14} />
              {activeTab === 'employees' ? 'Create Employee' : 'Create Type'}
            </Button>
          </div>
        </div>

        {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden">

          {/* ── EMPLOYEES TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'employees' && (
            <div className="flex h-full">

              {/* Left panel */}
              <div className="w-64 border-r border-slate-100 flex flex-col flex-shrink-0 overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between flex-shrink-0">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Employee Types
                  </span>
                  <button
                    onClick={openTypeCreate}
                    className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
                  {/* All Staff */}
                  <button
                    onClick={() => setSelectedType(null)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${!selectedType ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Users size={15} className="shrink-0" />
                    <span className="flex-1 text-left font-medium">All Staff</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${!selectedType ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                      {displayEmployees.length}
                    </span>
                  </button>

                  {/* Type rows */}
                  {typesLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="w-4 h-4 rounded shrink-0" />
                        <Skeleton className="h-3.5 rounded flex-1" />
                        <Skeleton className="w-5 h-4 rounded" />
                      </div>
                    ))
                    : empTypes.map((type) => {
                      const color = colorMap[type.id] || PALETTE[0];
                      const count = getTypeCount(type.id);
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
                          <Tag size={14} className={`shrink-0 ${isSelected ? color.text : 'text-slate-300'}`} />
                          <span className={`flex-1 text-left ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                            {type.emp_type_name}
                          </span>
                          <span className={`text-xs font-bold ${isSelected ? color.text : 'text-slate-400'}`}>
                            {count}
                          </span>
                          <span
                            onClick={(e) => { e.stopPropagation(); openTypeEdit(type); }}
                            className={`p-1 rounded-md transition-all opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/60 ${isSelected ? '!opacity-40' : ''}`}
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
                  <span className="text-xs text-slate-400 shrink-0">{empFiltered.length} employees</span>
                  {selectedType && (
                    <>
                      <span className="text-slate-200 text-xs">·</span>
                      <span className={`flex items-center gap-1.5 ${colorMap[selectedType]?.bg} ${colorMap[selectedType]?.text} rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0`}>
                        <Tag size={10} />
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
                      placeholder="Search by code, name, or phone..."
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none min-w-0 w-56"
                    />
                    {empSearch && (
                      <button onClick={() => setEmpSearch('')} className="text-slate-400 hover:text-slate-600">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Employee table */}
                <div className="overflow-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-slate-100">
                        {['ID', 'Code', 'Name', 'Phone', 'Status', ''].map(h => (
                          <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {empLoading
                        ? Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i}>
                            {[40, 90, 200, 110, 70, 60].map((w, j) => (
                              <td key={j} className="px-5 py-3.5">
                                <Skeleton className="h-4 rounded" style={{ width: w }} />
                              </td>
                            ))}
                          </tr>
                        ))
                        : empPageItems.length === 0
                          ? (
                            <tr>
                              <td colSpan={6} className="px-5 py-16 text-center text-slate-400 text-sm">
                                No employees found.
                              </td>
                            </tr>
                          )
                          : empPageItems.map(item => {
                            const color = colorMap[item.emp_type] || { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' };
                            return (
                              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3.5">
                                  <span className="font-mono text-slate-400 text-xs">#{item.id}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="font-semibold text-slate-800 text-sm">{item.employee_code}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${color.bg} ${color.text}`}>
                                      {item.employee_name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <div>
                                      <p className="text-slate-800 text-sm font-medium leading-tight">{item.employee_name}</p>
                                      {item.emp_type_name && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                                          <span className={`text-xs ${color.text}`}>{item.emp_type_name}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="text-slate-500 text-sm">{item.phone_no || '—'}</span>
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
                {!empLoading && empTotalPages > 1 && (
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
                    <p className="text-xs text-slate-400">
                      Showing {(empPage - 1) * PER_PAGE + 1}–{Math.min(empPage * PER_PAGE, empFiltered.length)} of {empFiltered.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEmpPage(p => p - 1)} disabled={empPage === 1}
                        className="h-7 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        Prev
                      </button>
                      {getPageNums(empPage, empTotalPages).map(n => (
                        <button key={n} onClick={() => setEmpPage(n)}
                          className={`h-7 w-7 text-xs rounded-md ${empPage === n ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          {n}
                        </button>
                      ))}
                      <button onClick={() => setEmpPage(p => p + 1)} disabled={empPage === empTotalPages}
                        className="h-7 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TYPES TAB ─────────────────────────────────────────────────────── */}
          {activeTab === 'types' && (
            <div className="flex flex-col h-full">

              {/* Search */}
              <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 max-w-sm">
                  <Search size={13} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search types..."
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

              {/* Types table */}
              <div className="overflow-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100">
                      {['ID', 'Type Name', 'Employees', ''].map(h => (
                        <th key={h} className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {typesLoading
                      ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          {[40, 220, 110, 60].map((w, j) => (
                            <td key={j} className="px-6 py-4"><Skeleton className="h-4 rounded" style={{ width: w }} /></td>
                          ))}
                        </tr>
                      ))
                      : typesFiltered.length === 0
                        ? <tr><td colSpan={4} className="px-6 py-16 text-center text-slate-400 text-sm">No types found.</td></tr>
                        : typesFiltered.map((type) => {
                          const color = colorMap[type.id] || PALETTE[0];
                          const count = getTypeCount(type.id);
                          return (
                            <tr key={type.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className="font-mono text-slate-400 text-xs">#{type.id}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color.bg}`}>
                                    <Tag size={15} className={color.text} />
                                  </div>
                                  <span className="text-slate-800 font-semibold text-sm">{type.emp_type_name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => { setActiveTab('employees'); setSelectedType(type.id); }}
                                  className={`flex items-center gap-1.5 ${color.bg} ${color.text} ${color.border} border rounded-full px-3 py-1 text-xs font-semibold hover:opacity-80 transition-opacity`}
                                >
                                  {count} staff <ChevronRight size={12} />
                                </button>
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

        {/* ── TYPE MODAL ──────────────────────────────────────────────────────────── */}
        <Dialog open={typeModalOpen} onOpenChange={setTypeModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-800">
                <span className="p-1.5 rounded-lg bg-slate-900"><Tag size={14} className="text-white" /></span>
                {getTypeModalTitle()}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-slate-700">Type Name *</Label>
                {/* <Input
                  name="emp_type_name"
                  value={typeFormData.emp_type_name}
                  onChange={e => setTypeFormData(p => ({ ...p, emp_type_name: e.target.value }))}
                  readOnly={typeIsReadOnly}
                  placeholder="e.g. Driver"
                  className={typeIsReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                /> */}
                <Input
                  name="emp_type_name"
                  value={typeFormData.emp_type_name}
                  onChange={e =>
                    setTypeFormData(p => ({
                      ...p,
                      emp_type_name: e.target.value
                    }))
                  }
                  readOnly={typeIsReadOnly}
                  placeholder="e.g. Driver"
                  minLength={3}
                  maxLength={20}
                  className={typeIsReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                />
              </div>
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

        {/* ── EMPLOYEE MODAL ───────────────────────────────────────────────────────── */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-800">
                <span className="p-1.5 rounded-lg bg-slate-900"><UserRound size={14} className="text-white" /></span>
                {getEmpModalTitle()}
              </DialogTitle>
            </DialogHeader>
            <form className="space-y-4 mt-2" onSubmit={handleEmpSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Employee Code *</Label>
                  <Input
                    name="employee_code"
                    value={formData.employee_code}
                    onChange={handleInputChange}
                    readOnly={isReadOnly}
                    placeholder="e.g., EMP001"
                    minLength={3}
                    maxLength={20}
                    required={!isReadOnly}
                    className={isReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                  />

                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Employee Name *</Label>
                  <Input
                    name="employee_name"
                    value={formData.employee_name}
                    onChange={handleInputChange}
                    readOnly={isReadOnly}
                    placeholder="e.g., John Doe"
                    minLength={3}
                    maxLength={20}
                    required={!isReadOnly}
                    className={isReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-700">Employee Type *</Label>
                {isReadOnly ? (
                  <Input value={formData.emp_type_name || '—'} readOnly className="bg-slate-50 text-slate-600" />
                ) : (
                  <select name="emp_type" value={formData.emp_type} onChange={handleInputChange} required
                    className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-900">
                    <option value="">-- Select Type --</option>
                    {empTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.emp_type_name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Phone Number *</Label>
                  <Input
                    name="phone_no"
                    value={formData.phone_no || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                      handleInputChange({
                        target: {
                          name: 'phone_no',
                          value
                        }
                      });
                    }}
                    readOnly={isReadOnly}
                    placeholder="1234567890"
                    minLength={10}
                    maxLength={10}
                    pattern="[0-9]{10}"
                    required={!isReadOnly}
                    className={isReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700">Device PIN *</Label>
                  <Input
                    name="password"
                    value={formData.password || ''}
                    onChange={handleInputChange}
                    readOnly={isReadOnly}
                    placeholder="e.g., 1234"
                    minLength={3}
                    maxLength={20}
                    required={!isReadOnly}
                    className={isReadOnly ? 'bg-slate-50 text-slate-600' : ''}
                  />
                </div>
              </div>
              {modalMode === 'edit' && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-red-50 rounded-lg border border-red-200">
                  <input type="checkbox" name="is_deleted" id="emp_is_deleted"
                    checked={formData.is_deleted || false} onChange={handleInputChange}
                    className="w-4 h-4 rounded border-slate-300 accent-red-600" />
                  <Label htmlFor="emp_is_deleted" className="text-red-700 cursor-pointer">Mark as deleted</Label>
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
