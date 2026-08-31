import { useState, useEffect } from 'react';
import { IndianRupee, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useFilteredList } from '../../assets/js/useFilteredList';
import { usePagination } from '../../assets/js/usePagination';
import { useModalForm } from '../../assets/js/useModalForm';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const emptyForm = { expense_code: '', expense_name: '' };

export default function ExpenseMasterPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { filteredItems, searchTerm, setSearchTerm } = useFilteredList(
    items, ['expense_code', 'expense_name']
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
  } = useModalForm(emptyForm);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/expense-masters`);
      setItems(res.data?.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching expense masters:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setModalMode('create');
    setEditingItem(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (item) => {
    setModalMode('edit');
    setEditingItem(item);
    setFormData({
      expense_code: item.expense_code,
      expense_name: item.expense_name,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modalMode === 'edit') {
        await api.put(`${BASE_URL}/masterdata/expense-masters/update/${editingItem.id}`, formData);
      } else {
        await api.post(`${BASE_URL}/masterdata/expense-masters/create`, formData);
      }
      setIsModalOpen(false);
      fetchItems();
    } catch (err) {
      const msg = err.response?.data?.errors
        ? Object.values(err.response.data.errors).flat().join(', ')
        : err.response?.data?.message || 'Operation failed.';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`${BASE_URL}/masterdata/expense-masters/delete/${deleteId}`);
      setDeleteId(null);
      fetchItems();
    } catch {
      alert('Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-7 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900">
            <IndianRupee size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Expense Master</h1>
            <p className="text-slate-500 text-sm mt-0.5">Expense category codes sent to ETM devices</p>
          </div>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={16} /> Add Category
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search code, name…"
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-12 text-center text-slate-400 text-sm">
                    {searchTerm ? 'No results for your search.' : 'No expense categories yet. Add one above.'}
                  </td>
                </tr>
              ) : (
                currentItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono font-medium text-slate-800">{item.expense_code}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">{item.expense_name}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteId(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
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
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {indexOfFirstItem + 1}–{Math.min(indexOfLastItem, filteredItems.length)} of {filteredItems.length}</span>
            <div className="flex gap-1">
              {getPageNumbers().map((p, i) =>
                p === '...' ? (
                  <span key={i} className="px-2 py-1">…</span>
                ) : (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${p === currentPage ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-600'
                      }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modalMode === 'edit' ? 'Edit Expense Category' : 'Add Expense Category'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense_code">Expense Code <span className="text-red-500">*</span></Label>
              {/* <Input
                id="expense_code"
                name="expense_code"
                value={formData.expense_code}
                onChange={handleInputChange}
                placeholder="e.g. FUEL"
                required
              /> */}
              <Input
                id="expense_code"
                name="expense_code"
                value={formData.expense_code}
                onChange={handleInputChange}
                placeholder="e.g. FUEL"
                minLength={3}
                maxLength={20}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense_name">Expense Name <span className="text-red-500">*</span></Label>
              {/* <Input
                id="expense_name"
                name="expense_name"
                value={formData.expense_name}
                onChange={handleInputChange}
                placeholder="e.g. Fuel Expense"
                required
              /> */}
              <Input
                id="expense_name"
                name="expense_name"
                value={formData.expense_name}
                onChange={handleInputChange}
                placeholder="e.g. Fuel Expense"
                minLength={3}
                maxLength={20}
                required
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Saving…' : modalMode === 'edit' ? 'Save Changes' : 'Add Category'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Expense Category</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 mt-1">
            This will permanently delete the category. Existing expense records referencing this code will not be affected.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
