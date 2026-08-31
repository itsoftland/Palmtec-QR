import { useState } from 'react';

/**
 * useModalForm
 *
 * Handles modal open/close state, modalMode (create/view/edit),
 * editingItem tracking, formData, and input change handling.
 *
 * Used by: BusTypeListing, StageListing, VehicleListing (identical pattern)
 * Also used by: CrewAssignmentListing and RouteListing with custom openModal logic
 * built on top of the returned setters.
 *
 * @param {Object} emptyForm - The blank form object for this entity
 *
 * Returns everything each listing component needs to manage its modal.
 */
export function useModalForm(emptyForm) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode,   setModalMode]   = useState('create');
  const [editingItem, setEditingItem] = useState(null);
  const [formData,    setFormData]    = useState(emptyForm);
  const [submitting,  setSubmitting]  = useState(false);

  // -- Standard modal openers (identical across BusType / Stage / Vehicle) --
  const openCreateModal = () => {
    setFormData(emptyForm);
    setEditingItem(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const openViewModal = (item) => {
    setFormData(item);
    setEditingItem(item);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setFormData(item);
    setEditingItem(item);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // Handles text, number, and checkbox inputs uniformly
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const isReadOnly = modalMode === 'view';

  return {
    isModalOpen, setIsModalOpen,
    modalMode,   setModalMode,
    editingItem, setEditingItem,
    formData,    setFormData,
    submitting,  setSubmitting,
    openCreateModal,
    openViewModal,
    openEditModal,
    closeModal,
    handleInputChange,
    isReadOnly,
  };
}
