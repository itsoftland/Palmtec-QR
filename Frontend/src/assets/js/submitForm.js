/**
 * submitForm
 *
 * Shared async helper that handles the create/update API call pattern.
 * The structure is identical across BusTypeListing, StageListing,
 * VehicleListing, RouteListing, and CrewAssignmentListing.
 *
 * @param {Object} options
 *   modalMode     - 'create' or 'edit'
 *   editingItem   - The item being edited (needed for its .id)
 *   formData      - Current form values to send as payload
 *   createUrl     - Full URL for POST (create)
 *   updateUrl     - Full URL for PUT (update), receives editingItem.id appended by caller
 *   setSubmitting - State setter to show/hide loading state
 *   onSuccess     - Callback: closes modal, resets form, refetches data
 *   payload       - Optional: override formData with a custom payload object
 *                   (used by CrewAssignment which strips/renames fields before sending)
 *
 * Usage example:
 *   await submitForm({
 *     modalMode, editingItem, formData,
 *     createUrl: `${BASE_URL}/masterdata/bus-types/create`,
 *     updateUrl: `${BASE_URL}/masterdata/bus-types/update/${editingItem?.id}`,
 *     setSubmitting,
 *     onSuccess: () => { closeModal(); setFormData(emptyForm); fetchBusTypes(); },
 *   });
 */
import api from './axiosConfig';

/**
 * getErrorMessage
 *
 * Builds a validation alert message that includes the offending field name,
 * e.g. "employee code: This field is required." instead of just the bare message.
 */
export function getErrorMessage(data) {
  if (data?.errors) {
    const [field, messages] = Object.entries(data.errors)[0];
    const label = field.replace(/_/g, ' ');
    return `${label}: ${messages[0]}`;
  }
  return data?.error || data?.message;
}

export async function submitForm({
  modalMode,
  editingItem,
  formData,
  createUrl,
  updateUrl,
  setSubmitting,
  onSuccess,
  payload = null,
}) {
  setSubmitting(true);
  try {
    const body = payload ?? formData;
    let response;
    if (modalMode === 'edit') {
      response = await api.put(updateUrl, body);
    } else {
      response = await api.post(createUrl, body);
    }
    if (response?.status === 200 || response?.status === 201) {
      window.alert(response.data.message || 'Success');
      onSuccess();
    }
  } catch (err) {
    if (!err.response) return window.alert('Server unreachable. Try later.');
    const { data } = err.response;
    window.alert(getErrorMessage(data) || 'Validation failed');
  } finally {
    setSubmitting(false);
  }
}
