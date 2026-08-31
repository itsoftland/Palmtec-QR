import { useState, useEffect } from 'react';
import { CalendarCog, Plus, Eye, Pencil, Trash2, Search } from 'lucide-react';
import { useFilteredList } from '../../assets/js/useFilteredList';
import { usePagination }   from '../../assets/js/usePagination';
import { useModalForm }    from '../../assets/js/useModalForm';
import { submitForm }      from '../../assets/js/submitForm';
import api, { BASE_URL }   from '../../assets/js/axiosConfig';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const emptyForm = { driver: '', conductor: '', cleaner: '', vehicle: '' };

export default function CrewAssignmentListing() {

  // ── State ────────────────────────────────────────────────────────────────────
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading]         = useState(true);

  const [drivers, setDrivers]       = useState([]);
  const [conductors, setConductors] = useState([]);
  const [cleaners, setCleaners]     = useState([]);
  const [vehicles, setVehicles]     = useState([]);

  // ── Hooks ────────────────────────────────────────────────────────────────────
  const { filteredItems, searchTerm, setSearchTerm } = useFilteredList(
    assignments, ['driver_name', 'conductor_name', 'cleaner_name', 'vehicle_reg']
  );

  const {
    currentItems, currentPage, totalPages,
    setCurrentPage, indexOfFirstItem, indexOfLastItem, getPageNumbers,
  } = usePagination(filteredItems);

  const {
    isModalOpen, setIsModalOpen,
    modalMode, setModalMode,
    editingItem, setEditingItem,
    formData, setFormData,
    submitting, setSubmitting,
    handleInputChange,
    isReadOnly,
  } = useModalForm(emptyForm);

  // ── Data ─────────────────────────────────────────────────────────────────────
  useEffect(() => { fetchAssignments(); }, []);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/crew-assignments`);
      setAssignments(res.data?.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching crew assignments:', err);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async (assignmentId = null) => {
    try {
      const sharedParams = {
        exclude_assigned: 'true',
        ...(assignmentId ? { assignment_id: assignmentId } : {}),
      };
      const [driversRes, conductorsRes, cleanersRes, vehiclesRes] = await Promise.all([
        api.get(`${BASE_URL}/masterdata/dropdowns/employees`, { params: { type: 'DRIVER',    ...sharedParams } }),
        api.get(`${BASE_URL}/masterdata/dropdowns/employees`, { params: { type: 'CONDUCTOR', ...sharedParams } }),
        api.get(`${BASE_URL}/masterdata/dropdowns/employees`, { params: { type: 'CLEANER',   ...sharedParams } }),
        api.get(`${BASE_URL}/masterdata/dropdowns/vehicles`,  { params: sharedParams }),
      ]);
      setDrivers(driversRes.data?.data     || []);
      setConductors(conductorsRes.data?.data || []);
      setCleaners(cleanersRes.data?.data   || []);
      setVehicles(vehiclesRes.data?.data   || []);
    } catch (err) {
      console.error('Error fetching dropdowns:', err);
    }
  };

  // ── Custom Modal Openers ─────────────────────────────────────────────────────
  const openCreateModal = () => {
    setFormData(emptyForm);
    setEditingItem(null);
    setModalMode('create');
    setIsModalOpen(true);
    fetchDropdowns();
  };

  const openViewModal = (item) => {
    setFormData({ driver: item.driver || '', conductor: item.conductor || '', cleaner: item.cleaner || '', vehicle: item.vehicle || '' });
    setEditingItem(item);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setFormData({ driver: item.driver || '', conductor: item.conductor || '', cleaner: item.cleaner || '', vehicle: item.vehicle || '' });
    setEditingItem(item);
    setModalMode('edit');
    setIsModalOpen(true);
    fetchDropdowns(item.id);
  };

  // ── Submit & Delete ──────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!formData.driver)    return window.alert('Driver is required');
    if (!formData.conductor) return window.alert('Conductor is required');
    if (!formData.vehicle)   return window.alert('Vehicle is required');
    if (String(formData.driver) === String(formData.conductor)) {
      return window.alert('Conductor must be different from driver');
    }

    const payload = {
      driver:    formData.driver,
      conductor: formData.conductor,
      vehicle:   formData.vehicle,
      ...(formData.cleaner && { cleaner: formData.cleaner }),
    };

    submitForm({
      modalMode, editingItem, formData,
      createUrl: `${BASE_URL}/masterdata/crew-assignments/create`,
      updateUrl: `${BASE_URL}/masterdata/crew-assignments/update/${editingItem?.id}`,
      setSubmitting,
      payload,
      onSuccess: () => { setIsModalOpen(false); setFormData(emptyForm); fetchAssignments(); },
    });
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete assignment #${item.id}? This will free the selected crew and vehicle.`)) return;
    try {
      const response = await api.delete(`${BASE_URL}/masterdata/crew-assignments/delete/${item.id}`);
      window.alert(response.data?.message || 'Deleted successfully');
      fetchAssignments();
    } catch (err) {
      if (!err.response) return window.alert('Server unreachable. Try later.');
      const { data } = err.response;
      window.alert(data.errors ? Object.values(data.errors)[0][0] : (data.error || data.message) || 'Delete failed');
    }
  };

  const getModalTitle = () => ({
    view: 'Assignment Details', edit: 'Edit Assignment', create: 'Create Assignment',
  }[modalMode]);

  const renderDropdown = (name, label, options, required = false) => (
    <div className="space-y-1.5">
      <Label className="text-slate-700">{label}{required ? ' *' : ' (optional)'}</Label>
      {isReadOnly ? (
        <Input
          value={(
            name === 'driver'    ? editingItem?.driver_name :
            name === 'conductor' ? editingItem?.conductor_name :
            name === 'cleaner'   ? editingItem?.cleaner_name :
            name === 'vehicle'   ? editingItem?.vehicle_reg : ''
          ) || '—'}
          readOnly className="bg-slate-50 text-slate-600"
        />
      ) : (
        <select
          name={name} value={formData[name]} onChange={handleInputChange}
          className="w-full h-10 px-3 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          <option value="">-- {required ? 'Select' : 'None'} --</option>
          {options.map(o => (
            <option key={o.id} value={o.id}>
              {o.employee_name ? `${o.employee_name} (${o.employee_code})` : o.bus_reg_num}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-5 lg:p-7 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900">
            <CalendarCog size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Crew Assignments</h1>
            <p className="text-slate-500 text-sm mt-0.5">Assign drivers, conductors and cleaners to vehicles</p>
          </div>
        </div>
        <Button onClick={openCreateModal} className="bg-slate-900 hover:bg-slate-700 text-white gap-2 shadow-sm">
          <Plus size={16} /> Create Assignment
        </Button>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm shadow-xs">
          <span className="text-slate-500">Total</span>
          <span className="font-bold text-slate-800">{assignments.length}</span>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Search size={15} className="text-slate-400 shrink-0" />
          <Input
            placeholder="Search by driver, conductor, cleaner, or vehicle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 text-sm h-8 px-0"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['ID', 'Vehicle', 'Driver', 'Conductor', 'Cleaner', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[50, 100, 120, 120, 100, 80].map((w, j) => (
                      <td key={j} className="px-5 py-3">
                        <Skeleton className="h-4 rounded" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">
                    No crew assignments found.
                  </td>
                </tr>
              ) : (
                currentItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-slate-500 text-xs font-semibold">#{item.id}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-slate-800 text-sm">{item.vehicle_reg || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-700 text-sm">{item.driver_name || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-600 text-sm">{item.conductor_name || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-500 text-sm">{item.cleaner_name || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openViewModal(item)}
                          className="p-2 rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                          title="View"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-2 rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-2 rounded-md bg-red-600 text-white hover:bg-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filteredItems.length > 0 && totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing {indexOfFirstItem + 1}–{Math.min(indexOfLastItem, assignments.length)} of {assignments.length}
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1} className="h-7 px-2.5 text-xs">Prev</Button>
              {getPageNumbers().map(n => (
                <Button key={n} size="sm" onClick={() => setCurrentPage(n)}
                  className={`h-7 w-7 p-0 text-xs ${currentPage === n
                    ? 'bg-slate-900 hover:bg-slate-700 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  {n}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage === totalPages} className="h-7 px-2.5 text-xs">Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <span className="p-1.5 rounded-lg bg-slate-900">
                <CalendarCog size={14} className="text-white" />
              </span>
              {getModalTitle()}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {renderDropdown('driver',    'Driver',    drivers,    true)}
            {renderDropdown('conductor', 'Conductor', conductors, true)}
            {renderDropdown('cleaner',   'Cleaner',   cleaners,   false)}
            {renderDropdown('vehicle',   'Vehicle',   vehicles,   true)}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setIsModalOpen(false)} className="text-slate-600">
                {isReadOnly ? 'Close' : 'Cancel'}
              </Button>
              {!isReadOnly && (
                <Button onClick={handleSubmit} disabled={submitting}
                  className="bg-slate-900 hover:bg-slate-700 text-white">
                  {submitting ? 'Saving...' : modalMode === 'edit' ? 'Update' : 'Save'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
