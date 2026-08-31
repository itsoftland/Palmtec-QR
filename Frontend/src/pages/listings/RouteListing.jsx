import { useState, useEffect, useRef } from 'react';
import {
  Route, Plus, Eye, Pencil, Search, X, Upload,
  AlertCircle, AlertTriangle, CheckCircle2, Download, FileSpreadsheet, MapPinned,
  Info, IndianRupee, Warehouse
} from 'lucide-react';
import { useFilteredList } from '../../assets/js/useFilteredList';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, Btn, FieldBlock, FieldGroup } from '@/components/design';

const FARE_TYPES = [
  { value: '1', label: 'TABLE' },
  { value: '2', label: 'GRAPH' },
];

const ROUTE_FLAGS = [
  { name: 'half', label: 'Half Fare' },
  { name: 'luggage', label: 'Luggage' },
  { name: 'adjust', label: 'Fare Adjustment' },
  { name: 'conc', label: 'Concession' },
  { name: 'ph', label: 'PH Concession' },
  { name: 'pass_allow', label: 'Pass Holders' },
];

export default function RouteListing() {

  // ── Section 1: Listing state ─────────────────────────────────────────────
  const [routes, setRoutes] = useState([]);
  const [busTypes, setBusTypes] = useState([]);
  const [stages, setStages] = useState([]);
  const [depots, setDepots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('view');
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const emptyForm = {
    route_code: '', route_name: '', min_fare: '', fare_type: '',
    bus_type: '', bus_type_name: '', start_from: 0, is_deleted: false,
    half: false, luggage: false, adjust: false,
    conc: false, ph: false, pass_allow: false,
    route_stages: [],
    depot_ids: [],
  };
  const [formData, setFormData] = useState(emptyForm);

  // ── Section 2: Inline fare state (edit/view modal) ───────────────────────
  const [fareList, setFareList] = useState([]);
  const [fareMatrix, setFareMatrix] = useState([]);
  const [fareStages, setFareStages] = useState([]);
  const [fareLoading, setFareLoading] = useState(false);
  const [fareHasChanges, setFareHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'stops' | 'fare'

  // ── Section 3: Wizard state ──────────────────────────────────────────────
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const stageNameRef = useRef(null);
  const importFileInputRef = useRef(null);

  // ── Section 3b: Import modal state ──────────────────────────────────────
  // step: 0=closed 1=instructions 2=validating/results 3=summary 4=done
  const [importStep, setImportStep] = useState(0);
  const [importFile, setImportFile] = useState(null);
  const [importValidating, setImportValidating] = useState(false);
  const [importValidation, setImportValidation] = useState(null);
  const [importSkipDups, setImportSkipDups] = useState(true);
  const [importConfirming, setImportConfirming] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const emptyWizard = {
    route_code: '', route_name: '', no_of_stages: '3', min_fare: '', fare_type: '1',
    bus_type: '',
    half: false, luggage: false, adjust: false,
    conc: false, ph: false, pass_allow: false,
    depot_ids: [],
    fare_list: [],
    fare_matrix: [],
    stages: [],
  };
  const [wizardData, setWizardData] = useState(emptyWizard);
  const [stageInput, setStageInput] = useState({ stage_name: '', distance: '', stage_code: '' });

  // ── Section 3c: Wizard "similar stage" confirm modal ─────────────────────
  // null | { stage_name, stage_code, distance, similar, confirmedSimilar }
  const [stageModal, setStageModal] = useState(null);
  const [stageModalError, setStageModalError] = useState('');

  // ── beforeunload guard during wizard ────────────────────────────────────
  useEffect(() => {
    if (wizardStep === 0) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = 'Route creation is in progress. Leaving now will discard your changes.';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [wizardStep]);

  // ── Section 4: Search & filter ───────────────────────────────────────────
  const { filteredItems, searchTerm, setSearchTerm } = useFilteredList(
    routes,
    ['route_code', 'route_name']
  );

  // ── Section 5: Fetch on mount ────────────────────────────────────────────
  useEffect(() => { fetchBusTypes(); fetchStages(); fetchDepots(); }, []);
  useEffect(() => { fetchRoutes(); }, [showDeleted]);

  // ── Section 6: API calls ─────────────────────────────────────────────────
  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/routes`, {
        params: { show_deleted: showDeleted }
      });
      setRoutes(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching routes:', err);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusTypes = async () => {
    try {
      const res = await api.get(`${BASE_URL}/masterdata/dropdowns/bus-types`);
      setBusTypes(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching bus types:', err);
    }
  };

  const fetchStages = async () => {
    try {
      const res = await api.get(`${BASE_URL}/masterdata/dropdowns/stages`);
      setStages(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching stages:', err);
    }
  };

  // Existing company stages whose name is a substring match (either direction,
  // case-insensitive) of `name` but not an exact match — exact matches reuse
  // silently elsewhere and are never flagged as "similar".
  const findSimilarStages = (name) => {
    const q = (name || '').trim().toLowerCase();
    if (!q) return [];
    return stages.filter(s => {
      const sname = s.stage_name.toLowerCase();
      if (sname === q) return false;
      // Skip trivial substring hits against very short existing names (e.g. "A").
      if (sname.length < 3 && sname.length < q.length) return false;
      return sname.includes(q) || q.includes(sname);
    });
  };

  // Only used by the route-creation wizard, to confirm creating a genuinely
  // new stage when a similarly-named one already exists.
  const openCreateStageModal = (name, distance) => {
    const pending = wizardData.stages.map(s => s.stage_code);
    setStageModalError('');
    setStageModal({
      stage_name: name, stage_code: suggestStageCode(pending),
      distance, similar: findSimilarStages(name), confirmedSimilar: false,
    });
  };

  const closeStageModal = () => {
    setStageModal(null);
    setStageModalError('');
  };

  const saveStageModal = () => {
    if (!stageModal) return;
    const stage_name = stageModal.stage_name.trim();
    const stage_code = stageModal.stage_code.trim();
    if (!stage_name || !stage_code) {
      setStageModalError('Stage name and code are required.');
      return;
    }
    if (stageModal.similar.length > 0 && !stageModal.confirmedSimilar) {
      setStageModalError('Similar stage(s) exist above — confirm to create a new one anyway.');
      return;
    }
    const pending = wizardData.stages.map(s => s.stage_code);
    if (isStageCodeTaken(stage_code, pending)) {
      setStageModalError('Code already in use.');
      return;
    }

    setWizardData(prev => ({
      ...prev,
      stages: [...prev.stages, {
        stage_name, stage_code, distance: stageModal.distance || '0',
        confirmed_similar: stageModal.confirmedSimilar,
      }],
    }));
    setStageInput({ stage_name: '', distance: '', stage_code: suggestStageCode([...pending, stage_code]) });
    setTimeout(() => stageNameRef.current?.focus(), 50);
    closeStageModal();
  };

  const fetchDepots = async () => {
    try {
      const res = await api.get(`${BASE_URL}/masterdata/dropdowns/depots`);
      setDepots(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching depots:', err);
    }
  };

  const fetchFareData = async (routeId) => {
    setFareLoading(true);
    setFareList([]);
    setFareMatrix([]);
    setFareStages([]);
    setFareHasChanges(false);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/fares/editor/${routeId}`);
      const { fare_list, fare_matrix, stages: stageList } = res.data.data;
      setFareStages(stageList || []);
      setFareList(fare_list || []);
      setFareMatrix(fare_matrix || []);
    } catch (err) {
      console.error('Error fetching fare data:', err);
    } finally {
      setFareLoading(false);
    }
  };

  // ── Section 7: Edit modal submit ─────────────────────────────────────────
  const handleSubmit = async () => {
    if (formData.route_code.trim().length !== 4) {
      window.alert('Route Code must be exactly 4 alphanumeric characters.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.put(
        `${BASE_URL}/masterdata/routes/update/${editingItem.id}`,
        formData
      );
      if (response?.status === 200) {
        // Save fares if changed
        if (fareHasChanges) {
          const ft = parseInt(formData.fare_type);
          const farePayload = ft === 1
            ? { fare_list: fareList }
            : { fare_matrix: fareMatrix };
          await api.post(`${BASE_URL}/masterdata/fares/update/${editingItem.id}`, farePayload);
        }
        window.alert(response.data.message || 'Success');
        setIsModalOpen(false);
        setFormData(emptyForm);
        fetchRoutes();
      }
    } catch (err) {
      if (!err.response) return window.alert('Server unreachable. Try later.');
      const { data } = err.response;
      const firstError = data.errors ? Object.values(data.errors)[0][0] : data.message;
      window.alert(firstError || 'Validation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Section 8: Modal helpers ──────────────────────────────────────────────
  const fetchRouteDetail = async (id) => {
    try {
      const res = await api.get(`${BASE_URL}/masterdata/routes/${id}`);
      return res.data?.data || null;
    } catch (err) {
      console.error('Error fetching route detail:', err);
      return null;
    }
  };

  const openViewModal = async (item) => {
    setEditingItem(item);
    setModalMode('view');
    setActiveTab('info');
    setFormData({ ...emptyForm, ...item, route_stages: [], depot_ids: [] });
    setIsModalOpen(true);
    const [detail] = await Promise.all([fetchRouteDetail(item.id), fetchFareData(item.id)]);
    if (detail) {
      const depotIds = (detail.depots || []).map(d => d.depot__id);
      setFormData({ ...emptyForm, ...detail, bus_type: detail.bus_type, route_stages: detail.route_stages || [], depot_ids: depotIds });
    }
  };

  const openEditModal = async (item) => {
    setEditingItem(item);
    setModalMode('edit');
    setActiveTab('info');
    setFormData({ ...emptyForm, ...item, route_stages: [], depot_ids: [] });
    setIsModalOpen(true);
    const [detail] = await Promise.all([fetchRouteDetail(item.id), fetchFareData(item.id)]);
    if (detail) {
      const depotIds = (detail.depots || []).map(d => d.depot__id);
      setFormData({ ...emptyForm, ...detail, bus_type: detail.bus_type, route_stages: detail.route_stages || [], depot_ids: depotIds });
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    let processedValue = type === 'checkbox' ? checked : value;
    if (name === 'route_code') {
      processedValue = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4);
    } else if (name === 'route_name') {
      processedValue = value.replace(/[^a-zA-Z0-9\-\/\(\) ]/g, '').slice(0, 14);
    } else if (name === 'min_fare') {
      processedValue = value.replace(/[^0-9]/g, '').slice(0, 4);
    }
    setFormData(prev => ({ ...prev, [name]: processedValue }));
  };

  const toggleFormDepot = (depotId) => {
    setFormData(prev => {
      const ids = prev.depot_ids.includes(depotId)
        ? prev.depot_ids.filter(id => id !== depotId)
        : [...prev.depot_ids, depotId];
      return { ...prev, depot_ids: ids };
    });
  };

  // ── Section 9: RouteStage helpers (edit modal) — rename + distance only ──
  const updateStage = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.route_stages];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, route_stages: updated };
    });
  };

  // Existing stages matching what's typed so far (wizard quick-pick to reuse).
  const stageSuggestions = (query) => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    return stages.filter(s => s.stage_name.toLowerCase().includes(q)).slice(0, 8);
  };

  // ── Stage code suggestion / clash check (wizard new-stage creation only) ──
  const suggestStageCode = (pendingCodes = []) => {
    const used = new Set(stages.map(s => String(s.stage_code)));
    pendingCodes.forEach(c => { if (c) used.add(String(c)); });
    const nums = [...used].map(c => parseInt(c, 10)).filter(n => !Number.isNaN(n));
    let next = (nums.length ? Math.max(...nums) : 1000) + 1;
    while (used.has(String(next))) next++;
    return String(next);
  };

  const isStageCodeTaken = (code, pendingCodes = []) => {
    if (!code) return false;
    const used = new Set(stages.map(s => String(s.stage_code)));
    pendingCodes.forEach(c => { if (c) used.add(String(c)); });
    return used.has(String(code));
  };

  // ── Section 10: Inline fare helpers (modal) ───────────────────────────────
  const updateModalFareList = (idx, value) => {
    const updated = [...fareList];
    updated[idx] = Number(value) || 0;
    setFareList(updated);
    setFareHasChanges(true);
  };

  const updateModalFareMatrix = (row, col, value) => {
    const updated = fareMatrix.map((r, i) =>
      i === row ? r.map((c, j) => (j === col ? Number(value) || 0 : c)) : r
    );
    setFareMatrix(updated);
    setFareHasChanges(true);
  };

  const isReadOnly = modalMode === 'view';

  const closeEditViewModal = () => {
    if (!isReadOnly && !window.confirm('Close without saving? All unsaved changes will be lost.')) return;
    setIsModalOpen(false);
  };

  // ── Section 11: Wizard functions ─────────────────────────────────────────
  const openWizard = () => {
    setWizardData(emptyWizard);
    setStageInput({ stage_name: '', distance: '' });
    setWizardStep(1);
  };

  const closeWizard = (force = false) => {
    if (!force && wizardStep > 0) {
      if (!window.confirm('Cancel route creation? All unsaved data will be lost.')) return;
    }
    setWizardStep(0);
  };

  const handleWizardChange = (e) => {
    const { name, value, type, checked } = e.target;
    let processedValue = type === 'checkbox' ? checked : value;
    if (name === 'route_code') {
      processedValue = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4);
    } else if (name === 'route_name') {
      processedValue = value.replace(/[^a-zA-Z0-9\-\/\(\) ]/g, '').slice(0, 14);
    } else if (name === 'no_of_stages') {
      processedValue = value.replace(/[^0-9]/g, '').slice(0, 2);
    } else if (name === 'min_fare') {
      processedValue = value.replace(/[^0-9]/g, '').slice(0, 4);
    }
    setWizardData(prev => ({ ...prev, [name]: processedValue }));
  };

  const toggleWizardDepot = (depotId) => {
    setWizardData(prev => {
      const ids = prev.depot_ids.includes(depotId)
        ? prev.depot_ids.filter(id => id !== depotId)
        : [...prev.depot_ids, depotId];
      return { ...prev, depot_ids: ids };
    });
  };

  const goToStep2 = () => {
    const { route_code, route_name, no_of_stages, min_fare, fare_type, bus_type } = wizardData;
    if (!route_code.trim() || !route_name.trim() || !no_of_stages || !min_fare || !fare_type || !bus_type) {
      window.alert('Please fill all required fields.');
      return;
    }
    if (route_code.trim().length !== 4) {
      window.alert('Route Code must be exactly 4 alphanumeric characters.');
      return;
    }
    const n = parseInt(no_of_stages);
    if (isNaN(n) || n < 2) {
      window.alert('Number of stages must be at least 2.');
      return;
    }
    if (parseInt(fare_type) === 2 && n <= 2) {
      window.alert('No of stages should be greater than 2 in Graph fare.');
      return;
    }
    const minFare = parseFloat(min_fare) || 0;
    const ft = parseInt(fare_type);
    if (ft === 1) {
      setWizardData(prev => ({ ...prev, fare_list: Array(n).fill(0), fare_matrix: [] }));
    } else {
      const fareMatrix = Array.from({ length: n - 1 }, (_, i) => Array(i + 1).fill(minFare));
      setWizardData(prev => ({ ...prev, fare_list: [], fare_matrix: fareMatrix }));
    }
    setWizardStep(2);
  };

  const goToStep3 = () => {
    setWizardData(prev => ({ ...prev, stages: [] }));
    setStageInput({ stage_name: '', distance: '', stage_code: suggestStageCode() });
    setWizardStep(3);
    setTimeout(() => stageNameRef.current?.focus(), 100);
  };

  const updateWizardFareList = (idx, value) => {
    setWizardData(prev => {
      const updated = [...prev.fare_list];
      updated[idx] = Number(value) || 0;
      return { ...prev, fare_list: updated };
    });
  };

  const updateWizardFareMatrix = (row, col, value) => {
    setWizardData(prev => {
      const updated = prev.fare_matrix.map((r, i) =>
        i === row ? r.map((c, j) => (j === col ? Number(value) || 0 : c)) : r
      );
      return { ...prev, fare_matrix: updated };
    });
  };

  const saveStageEntry = () => {
    const name = stageInput.stage_name.trim();
    if (!name) {
      window.alert('Stage name is required.');
      return;
    }
    const pendingCodes = wizardData.stages.map(s => s.stage_code);

    // Exact match on an existing company stage — reuse it silently, no code needed.
    const exact = stages.find(s => s.stage_name.toLowerCase() === name.toLowerCase());
    if (exact) {
      setWizardData(prev => ({
        ...prev,
        stages: [...prev.stages, { stage: exact.id, stage_name: exact.stage_name, stage_code: exact.stage_code, distance: stageInput.distance || '0' }],
      }));
      setStageInput({ stage_name: '', distance: '', stage_code: suggestStageCode(pendingCodes) });
      setTimeout(() => stageNameRef.current?.focus(), 50);
      return;
    }

    // No exact match, but something similarly-named exists — confirm before creating new.
    const similar = findSimilarStages(name);
    if (similar.length > 0) {
      openCreateStageModal(name, stageInput.distance || '0');
      return;
    }

    if (!stageInput.stage_code.trim()) {
      window.alert('Stage code is required.');
      return;
    }
    if (isStageCodeTaken(stageInput.stage_code, pendingCodes)) {
      window.alert(`Stage code ${stageInput.stage_code} is already in use.`);
      return;
    }
    setWizardData(prev => ({
      ...prev,
      stages: [...prev.stages, {
        stage_name: name,
        distance: stageInput.distance || '0',
        stage_code: stageInput.stage_code.trim(),
      }]
    }));
    setStageInput({ stage_name: '', distance: '', stage_code: suggestStageCode([...pendingCodes, stageInput.stage_code]) });
    setTimeout(() => stageNameRef.current?.focus(), 50);
  };

  const submitWizard = async () => {
    setWizardSubmitting(true);
    try {
      const { fare_list, fare_matrix, stages, no_of_stages, ...routeInfo } = wizardData;
      const ft = parseInt(routeInfo.fare_type);
      const payload = {
        ...routeInfo,
        stages,
        ...(ft === 1 ? { fare_list } : { fare_matrix }),
      };
      const res = await api.post(`${BASE_URL}/masterdata/routes/create-wizard`, payload);
      if (res.status === 201) {
        window.alert(res.data.message || 'Route created successfully');
        closeWizard(true);
        fetchRoutes();
      }
    } catch (err) {
      if (!err.response) { window.alert('Server unreachable. Try later.'); return; }
      window.alert(err.response.data?.message || 'Failed to create route');
    } finally {
      setWizardSubmitting(false);
    }
  };

  // ── Section 11b: Import modal functions ─────────────────────────────────
  const openImportModal = () => {
    setImportStep(1);
    setImportFile(null);
    setImportValidation(null);
    setImportResult(null);
    setImportSkipDups(true);
  };

  const closeImportModal = () => {
    setImportStep(0);
    setImportFile(null);
    setImportValidation(null);
    setImportResult(null);
    if (importFileInputRef.current) importFileInputRef.current.value = '';
  };

  const handleImportFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) setImportFile(file);
  };

  const runValidation = async () => {
    if (!importFile) return;
    setImportValidating(true);
    setImportStep(2);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await api.post(`${BASE_URL}/masterdata/routes/import/validate`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportValidation(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Validation request failed.';
      setImportValidation({ errors: [{ route_code: null, row: null, message: msg }], warnings: [], duplicate_codes: [], routes_preview: [] });
    } finally {
      setImportValidating(false);
    }
  };

  const runImport = async () => {
    if (!importFile) return;
    setImportConfirming(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('skip_duplicates', importSkipDups ? 'true' : 'false');
      const res = await api.post(`${BASE_URL}/masterdata/routes/import/confirm`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      setImportStep(4);
      fetchRoutes();
    } catch (err) {
      const msg = err.response?.data?.message || 'Import failed.';
      setImportResult({ error: msg });
      setImportStep(4);
    } finally {
      setImportConfirming(false);
    }
  };

  const downloadTemplate = (fareType) => {
    window.open(`${BASE_URL}/masterdata/routes/import/template/${fareType}`, '_blank');
  };

  const importHasErrors = (importValidation?.errors?.length ?? 0) > 0;
  const importHasWarnings = (importValidation?.warnings?.length ?? 0) > 0;

  const n = parseInt(wizardData.no_of_stages) || 0;
  const stagesEntered = wizardData.stages.length;
  const allStagesDone = stagesEntered === n && n > 0;
  const fareTypeLabel = wizardData.fare_type === '1' ? 'TABLE' : 'GRAPH';

  // ── Section 12: Render ────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-5 lg:p-7 min-h-screen bg-slate-50">

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* IMPORT MODAL                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {importStep > 0 && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">

            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-wide">Import Routes from Excel</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {importStep === 1 && 'Step 1 — Upload file'}
                  {importStep === 2 && 'Step 2 — Validation'}
                  {importStep === 3 && 'Step 3 — Confirm import'}
                  {importStep === 4 && 'Done'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${importStep > s ? 'bg-emerald-500 border-emerald-400 text-white' :
                    importStep === s ? 'bg-white text-slate-900 border-white' :
                      'bg-transparent text-slate-500 border-slate-600'
                    }`}>{importStep > s ? '✓' : s}</div>
                ))}
                <button onClick={closeImportModal} className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-2">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ─── STEP 1: Instructions + file select ─────────────────────── */}
            {importStep === 1 && (
              <div className="p-6 space-y-5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-800">How to import routes:</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    <li>Download the template below and fill in your route data.</li>
                    <li>The sheet must be named <code className="bg-slate-200 px-1 rounded text-xs">SRE_Import</code>.</li>
                    <li><strong>TABLE fare</strong>: one fare per stage (cumulative from origin).</li>
                    <li><strong>GRAPH fare</strong>: lower-triangular matrix — each stage row carries fares from all prior stages.</li>
                    <li>BusType must match an active bus type code in your company.</li>
                    <li>Stage 1 fare must always be 0.</li>
                  </ul>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => downloadTemplate('table')}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium transition-colors">
                      <Download size={14} /> TABLE Template (.xlsx)
                    </button>
                    <button onClick={() => downloadTemplate('graph')}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium transition-colors">
                      <Download size={14} /> GRAPH Template (.xlsx)
                    </button>
                  </div>
                </div>

                {/* File select */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Select .xlsx file to import:</p>
                  <div
                    onClick={() => importFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${importFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                  >
                    <FileSpreadsheet size={32} className={`mx-auto mb-2 ${importFile ? 'text-emerald-600' : 'text-slate-400'}`} />
                    {importFile ? (
                      <p className="text-sm font-medium text-emerald-700">{importFile.name}</p>
                    ) : (
                      <p className="text-sm text-slate-500">Click to select an <strong>.xlsx</strong> file</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={closeImportModal} className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
                  <button onClick={runValidation} disabled={!importFile}
                    className="px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Next: Validate →
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 2: Validation results ─────────────────────────────── */}
            {importStep === 2 && (
              <div className="p-6 space-y-4">
                {importValidating ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
                    <p className="text-sm text-slate-500">Validating file...</p>
                  </div>
                ) : importValidation && (
                  <>
                    {/* Hard errors */}
                    {importHasErrors && (
                      <div className="border border-red-200 rounded-xl overflow-hidden">
                        <div className="bg-red-50 px-4 py-2.5 flex items-center gap-2 border-b border-red-200">
                          <AlertCircle size={15} className="text-red-600 shrink-0" />
                          <span className="text-sm font-semibold text-red-700">
                            {importValidation.errors.length} Validation Error{importValidation.errors.length > 1 ? 's' : ''} — Fix before importing
                          </span>
                        </div>
                        <div className="divide-y divide-red-100 max-h-56 overflow-y-auto">
                          {importValidation.errors.map((e, i) => (
                            <div key={i} className="px-4 py-2 text-xs text-red-700">
                              {e.route_code && <span className="font-semibold mr-1">{e.route_code}</span>}
                              {e.row && <span className="text-red-400 mr-1">Row {e.row}:</span>}
                              {e.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Warnings */}
                    {importHasWarnings && (
                      <div className="border border-amber-200 rounded-xl overflow-hidden">
                        <div className="bg-amber-50 px-4 py-2.5 flex items-center gap-2 border-b border-amber-200">
                          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                          <span className="text-sm font-semibold text-amber-700">
                            {importValidation.warnings.length} Warning{importValidation.warnings.length > 1 ? 's' : ''} — Import can still proceed
                          </span>
                        </div>
                        <div className="divide-y divide-amber-100 max-h-40 overflow-y-auto">
                          {importValidation.warnings.map((w, i) => (
                            <div key={i} className="px-4 py-2 text-xs text-amber-700">{w.message}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Duplicate routes conflict */}
                    {importValidation.duplicate_codes?.length > 0 && (
                      <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                        <p className="text-sm font-semibold text-slate-700">
                          {importValidation.duplicate_codes.length} duplicate route(s) already exist:
                        </p>
                        <p className="text-xs text-slate-500 font-mono">{importValidation.duplicate_codes.join(', ')}</p>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input type="checkbox" checked={importSkipDups} onChange={e => setImportSkipDups(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 accent-slate-900" />
                          <span className="text-sm text-slate-700">Skip duplicate routes and continue</span>
                        </label>
                        {!importSkipDups && (
                          <p className="text-xs text-red-600">Import will be cancelled if duplicates are encountered.</p>
                        )}
                      </div>
                    )}

                    {/* Clean state */}
                    {!importHasErrors && !importHasWarnings && importValidation.duplicate_codes?.length === 0 && (
                      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <p className="text-sm font-medium text-emerald-700">All {importValidation.routes_preview?.length} route(s) validated — ready to import.</p>
                      </div>
                    )}

                    <div className="flex justify-between gap-3 pt-2">
                      <button onClick={() => { setImportStep(1); setImportValidation(null); }}
                        className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">
                        ← Back
                      </button>
                      <button onClick={() => setImportStep(3)} disabled={importHasErrors}
                        className="px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        Review & Confirm →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── STEP 3: Verification summary ────────────────────────────── */}
            {importStep === 3 && importValidation && (
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">
                    Routes to be imported: {(importValidation.routes_preview?.length ?? 0) - (importSkipDups ? importValidation.duplicate_codes?.length ?? 0 : 0)}
                    {importValidation.duplicate_codes?.length > 0 && importSkipDups &&
                      <span className="ml-2 text-xs text-slate-400">({importValidation.duplicate_codes.length} skipped)</span>
                    }
                  </p>

                  {/* Warnings repeated */}
                  {importHasWarnings && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      <AlertTriangle size={13} className="shrink-0" />
                      {importValidation.warnings[0].message}
                      {importValidation.warnings.length > 1 && ` (+${importValidation.warnings.length - 1} more)`}
                    </div>
                  )}
                </div>

                {/* Preview table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        {['Code', 'Name', 'Bus Type', 'Stages', 'Fare Type', 'Concessions'].map(h => (
                          <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importValidation.routes_preview?.map(r => {
                        const isDup = importValidation.duplicate_codes?.includes(r.route_code);
                        return (
                          <tr key={r.route_code} className={`${isDup && importSkipDups ? 'opacity-40 bg-slate-50' : 'hover:bg-slate-50'}`}>
                            <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-700">
                              {r.route_code}
                              {isDup && <span className="ml-1 text-xs text-slate-400">(dup)</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-700">{r.route_name}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{r.bus_type}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{r.no_of_stages}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${r.fare_type === 'TABLE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                                {r.fare_type}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">{r.concessions?.join(', ') || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <button onClick={() => setImportStep(2)}
                    className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">
                    ← Back
                  </button>
                  <button onClick={runImport} disabled={importConfirming}
                    className="px-8 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition-colors">
                    {importConfirming
                      ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Importing...</span>
                      : 'Confirm Import'
                    }
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 4: Done ────────────────────────────────────────────── */}
            {importStep === 4 && (
              <div className="p-6 text-center space-y-4">
                {importResult?.error ? (
                  <>
                    <AlertCircle size={40} className="mx-auto text-red-500" />
                    <p className="text-base font-semibold text-red-700">Import Failed</p>
                    <p className="text-sm text-slate-600">{importResult.error}</p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
                    <p className="text-base font-semibold text-emerald-700">{importResult?.message}</p>
                    <div className="flex justify-center gap-6 text-sm text-slate-600">
                      <span><strong className="text-slate-800">{importResult?.imported_count}</strong> imported</span>
                      <span><strong className="text-slate-800">{importResult?.skipped_count}</strong> skipped</span>
                      <span><strong className="text-slate-800">{importResult?.stages_created}</strong> new stages</span>
                    </div>
                  </>
                )}
                <button onClick={closeImportModal}
                  className="mt-2 px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-lg transition-colors">
                  Close
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ROUTE CREATION WIZARD OVERLAY                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {wizardStep > 0 && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">

            {/* Wizard header */}
            <div className="bg-slate-900 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-wide">
                  {wizardStep === 1 && 'New Route — Step 1 of 3: Route Info'}
                  {wizardStep === 2 && 'Fare Entry — Step 2 of 3'}
                  {wizardStep === 3 && 'Stage Names — Step 3 of 3'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${wizardStep === s ? 'bg-white text-slate-900 border-white' :
                    wizardStep > s ? 'bg-slate-600 text-white border-slate-500' :
                      'bg-transparent text-slate-400 border-slate-500'
                    }`}>{s}</div>
                ))}
                <button onClick={() => closeWizard()} className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-2">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Route info bar (steps 2 and 3) */}
            {wizardStep > 1 && (
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-700">
                <span><strong>RouteCode:</strong> {wizardData.route_code}</span>
                <span><strong>Route Name:</strong> {wizardData.route_name}</span>
                <span><strong>MinFare:</strong> ₹{wizardData.min_fare}</span>
                <span className="font-semibold text-slate-700"><strong>FARE TYPE</strong> {fareTypeLabel}</span>
              </div>
            )}

            {/* ─── STEP 1: Route Info ─────────────────────────────────────── */}
            {wizardStep === 1 && (
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Route Code *</label>
                    <input type="text" name="route_code" value={wizardData.route_code} onChange={handleWizardChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Route Name *</label>
                    <input type="text" name="route_name" value={wizardData.route_name} onChange={handleWizardChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">No of Stages * <span className="text-slate-400 font-normal">(max 99)</span></label>
                    <input type="text" inputMode="numeric" name="no_of_stages" value={wizardData.no_of_stages} onChange={handleWizardChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Min Fare (₹) * <span className="text-slate-400 font-normal">(max 9999)</span></label>
                    <input type="text" inputMode="numeric" name="min_fare" value={wizardData.min_fare} onChange={handleWizardChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Fare Type *</label>
                    <select name="fare_type" value={wizardData.fare_type} onChange={handleWizardChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white">
                      <option value="">-- Select --</option>
                      {FARE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Bus Type *</label>
                    <select name="bus_type" value={wizardData.bus_type} onChange={handleWizardChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white">
                      <option value="">-- Select --</option>
                      {busTypes.map(bt => <option key={bt.id} value={bt.id}>{bt.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Allowables */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">Select Allowables</p>
                    <button type="button" onClick={() => {
                      const allOn = ROUTE_FLAGS.every(f => wizardData[f.name]);
                      setWizardData(prev => {
                        const upd = {};
                        ROUTE_FLAGS.forEach(f => upd[f.name] = !allOn);
                        return { ...prev, ...upd };
                      });
                    }} className="text-xs px-3 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50">
                      {ROUTE_FLAGS.every(f => wizardData[f.name]) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {ROUTE_FLAGS.map(flag => (
                      <label key={flag.name} className={`flex items-center gap-2 text-sm p-2 rounded-lg border cursor-pointer transition-colors ${wizardData[flag.name] ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                        <input type="checkbox" name={flag.name} checked={wizardData[flag.name] || false} onChange={handleWizardChange} className="sr-only" />
                        {flag.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Depot Mapping */}
                {depots.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Depot Mapping</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {depots.map(depot => {
                        const selected = wizardData.depot_ids.includes(depot.id);
                        return (
                          <label key={depot.id} className={`flex items-center gap-2 text-sm p-2 rounded-lg border cursor-pointer transition-colors ${selected ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                            <input type="checkbox" checked={selected} onChange={() => toggleWizardDepot(depot.id)} className="sr-only" />
                            <span className="truncate">{depot.depot_name}</span>
                            <span className={`text-xs ml-auto ${selected ? 'text-indigo-200' : 'text-slate-400'}`}>{depot.depot_code}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── STEP 2: Fare Entry ─────────────────────────────────────── */}
            {wizardStep === 2 && (
              <div className="p-6">
                {/* TABLE FARE */}
                {wizardData.fare_type === '1' && (
                  <div>
                    <p className="text-sm text-slate-600 mb-3">
                      Enter the fare amount for each number of stages traveled.
                    </p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Stages Traveled</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Fare Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {wizardData.fare_list.map((fare, idx) => (
                            <tr key={idx} className={idx === 0 ? 'bg-slate-50' : 'hover:bg-slate-50'}>
                              <td className="px-4 py-3 text-sm font-medium text-slate-700">
                                {idx + 1} {idx === 0 ? 'Stage' : 'Stages'}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={fare}
                                  min="0"
                                  max="999"
                                  onChange={e => {
                                    let val = parseInt(e.target.value, 10);

                                    if (isNaN(val)) {
                                      updateWizardFareList(idx, "");
                                      return;
                                    }

                                    updateWizardFareList(idx, String(val));
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === "ArrowUp" && Number(fare) >= 999) {
                                      e.preventDefault();
                                      updateWizardFareList(idx, "0");
                                    }

                                    if (e.key === "ArrowDown" && Number(fare) <= 0) {
                                      e.preventDefault();
                                      updateWizardFareList(idx, "999");
                                    }
                                  }}
                                  onBlur={e => {
                                    const minF = parseFloat(wizardData.min_fare) || 0;
                                    const val = parseFloat(e.target.value) || 0;

                                    if (val > 0 && val < minF) {
                                      window.alert(`Minimum Fare is ${minF}`);
                                    }
                                  }}
                                  className="w-40 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:outline-none text-sm"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* GRAPH FARE */}
                {wizardData.fare_type === '2' && (
                  <div>
                    <p className="text-sm text-slate-600 mb-3">
                      Enter the fare between each pair of stages.
                    </p>
                    <div className="border border-slate-200 rounded-xl overflow-auto">
                      <table className="border-collapse">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="px-3 py-2 text-xs font-semibold sticky left-0 bg-slate-800 z-10 border-r border-slate-700">Stage</th>
                            {Array.from({ length: n - 1 }, (_, i) => (
                              <th key={i} className="px-3 py-2 text-xs font-semibold text-center min-w-[80px] border-r border-slate-700">Stg {i + 1}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {wizardData.fare_matrix.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-sm font-semibold text-slate-700 sticky left-0 bg-slate-100 border-r border-slate-300 z-10">Stg {rIdx + 2}</td>
                              {Array.from({ length: n - 1 }, (_, cIdx) => {
                                const isActive = cIdx <= rIdx;
                                return (
                                  <td key={cIdx} className={`px-2 py-2 text-center border-r border-slate-100 ${!isActive ? 'bg-slate-100' : ''}`}>
                                    {isActive ? (
                                      // <input type="number" value={row[cIdx]} min="0"
                                      //   onChange={e => updateWizardFareMatrix(rIdx, cIdx, e.target.value)}
                                      //   onBlur={e => {
                                      //     const minF = parseFloat(wizardData.min_fare) || 0;
                                      //     const val = parseFloat(e.target.value) || 0;
                                      //     if (val > 0 && val < minF) window.alert(`Minimum Fare is ${minF}`);
                                      //   }}
                                      //   className="w-16 px-2 py-1 text-center border border-slate-300 bg-slate-50 rounded text-sm focus:ring-1 focus:ring-slate-500 focus:outline-none"
                                      // />
                                      <input
                                        type="number"
                                        value={row[cIdx]}
                                        min="0"
                                        max="999"
                                        onChange={e => {
                                          const value = e.target.value;

                                          if (parseFloat(value) > 999) {
                                            updateWizardFareMatrix(rIdx, cIdx, '999');
                                            return;
                                          }

                                          updateWizardFareMatrix(rIdx, cIdx, value);
                                        }}
                                        onKeyDown={e => {
                                          const currentValue = parseInt(row[cIdx], 10) || 0;

                                          if (e.key === 'ArrowUp') {
                                            e.preventDefault();

                                            const nextValue = currentValue >= 999
                                              ? 0
                                              : currentValue + 1;

                                            updateWizardFareMatrix(rIdx, cIdx, String(nextValue));
                                          }

                                          if (e.key === 'ArrowDown') {
                                            e.preventDefault();

                                            const nextValue = currentValue <= 0
                                              ? 999
                                              : currentValue - 1;

                                            updateWizardFareMatrix(rIdx, cIdx, String(nextValue));
                                          }
                                        }}
                                        onBlur={e => {
                                          const minF = parseFloat(wizardData.min_fare) || 0;
                                          const val = parseFloat(e.target.value) || 0;

                                          if (val > 0 && val < minF) {
                                            window.alert(`Minimum Fare is ${minF}`);
                                          }
                                        }}
                                        className="w-16 px-2 py-1 text-center border border-slate-300 bg-slate-50 rounded text-sm focus:ring-1 focus:ring-slate-500 focus:outline-none"
                                      />
                                    ) : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── STEP 3: Stage Name Entries ─────────────────────────────── */}
            {wizardStep === 3 && (
              <div className="p-6">
                <div className="flex gap-6">
                  <div className="w-72 flex-shrink-0 space-y-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Stage Name</label>
                        {/* <input ref={stageNameRef} type="text" value={stageInput.stage_name}
                          onChange={e => {
                            const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11);
                            setStageInput(prev => ({ ...prev, stage_name: val }));
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') saveStageEntry(); }}
                          placeholder="Enter stage name"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                        /> */}
                        <input
                          ref={stageNameRef}
                          type="text"
                          value={stageInput.stage_name}
                          minLength={3}
                          maxLength={11}
                          onChange={e => {
                            const val = e.target.value
                              .replace(/[^a-zA-Z0-9]/g, '')
                              .slice(0, 11);

                            setStageInput(prev => ({ ...prev, stage_name: val }));
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (stageInput.stage_name.length < 3) {
                                window.alert('Stage name must be at least 3 characters.');
                                return;
                              }
                              saveStageEntry();
                            }
                          }}
                          placeholder="Enter stage name"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                        />
                        {stageInput.stage_name && stageSuggestions(stageInput.stage_name).length > 0 && (
                          <div className="border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 max-h-32 overflow-y-auto">
                            {stageSuggestions(stageInput.stage_name).map(s => (
                              <button
                                type="button"
                                key={s.id}
                                onClick={() => setStageInput(prev => ({ ...prev, stage_name: s.stage_name }))}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors"
                              >
                                <span className="text-slate-700">{s.stage_name}</span>
                                <span className="text-slate-400 font-mono">{s.stage_code}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Distance (km)</label>
                        <input type="text" inputMode="decimal" value={stageInput.distance}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '').slice(0, 11);
                            setStageInput(prev => ({ ...prev, distance: val }));
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') saveStageEntry(); }}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Stage Code</label>
                        <input type="text" inputMode="numeric" value={stageInput.stage_code}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 15);
                            setStageInput(prev => ({ ...prev, stage_code: val }));
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') saveStageEntry(); }}
                          placeholder="e.g. 1180"
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white ${isStageCodeTaken(stageInput.stage_code, wizardData.stages.map(s => s.stage_code))
                            ? 'border-red-400 focus:ring-red-300'
                            : 'border-slate-300 focus:ring-slate-500'
                            }`}
                        />
                        {isStageCodeTaken(stageInput.stage_code, wizardData.stages.map(s => s.stage_code)) && (
                          <p className="text-xs text-red-600">Code already in use.</p>
                        )}
                      </div>
                      <button type="button" onClick={saveStageEntry} disabled={stagesEntered >= n}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-700 text-white font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        Save
                      </button>
                      <div className={`text-center text-sm font-semibold py-2 rounded-lg border-2 ${allStagesDone ? 'border-emerald-400 text-emerald-700 bg-emerald-50' : 'border-slate-300 text-slate-600 bg-white'}`}>
                        Entries: {stagesEntered}/{n}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider w-12">S.No</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Stage Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider w-20">Code</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider w-20">KM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {wizardData.stages.length === 0 ? (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">No stages entered yet.</td></tr>
                          ) : wizardData.stages.map((s, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-sm font-mono text-slate-600">{idx + 1}</td>
                              <td className="px-3 py-2 text-sm font-medium text-slate-800">
                                {s.stage_name}
                                {s.stage && <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">EXISTING</span>}
                              </td>
                              <td className="px-3 py-2 text-sm font-mono text-slate-500">{s.stage_code}</td>
                              <td className="px-3 py-2 text-sm text-slate-600">{s.distance}</td>
                            </tr>
                          ))}
                          {Array.from({ length: Math.max(0, n - stagesEntered) }, (_, i) => (
                            <tr key={`empty-${i}`} className="bg-slate-50/50">
                              <td className="px-3 py-2 text-sm text-slate-300">{stagesEntered + i + 1}</td>
                              <td className="px-3 py-2 text-sm text-slate-300 italic">— not entered —</td>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2"></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Wizard footer navigation */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <button type="button"
                onClick={() => { if (wizardStep === 1) closeWizard(); else setWizardStep(s => s - 1); }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                {wizardStep === 1 ? 'Cancel' : '← Back'}
              </button>
              <div className="flex items-center gap-3">
                {wizardStep === 1 && (
                  <button type="button" onClick={goToStep2}
                    className="px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-lg shadow transition-colors">
                    Next: Fare Entry →
                  </button>
                )}
                {wizardStep === 2 && (
                  <button type="button" onClick={goToStep3}
                    className="px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-lg shadow transition-colors">
                    Next: Stage Names →
                  </button>
                )}
                {wizardStep === 3 && (
                  <button type="button" onClick={submitWizard} disabled={!allStagesDone || wizardSubmitting}
                    className="px-8 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {wizardSubmitting ? 'Creating Route...' : 'Finish'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MAIN LISTING                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* Header */}
      <input ref={importFileInputRef} type="file" accept=".xlsx" onChange={handleImportFileSelect} className="hidden" />
      <PageHeader
        icon={Route}
        title="Route Management"
        subtitle="Configure routes, stages, and fare structures"
        actions={
          <div className="flex items-center gap-2">
            <Btn variant="secondary" icon={Upload} onClick={openImportModal}>Import Excel</Btn>
            <Btn icon={Plus} onClick={openWizard}>Create Route</Btn>
          </div>
        }
      />

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm shadow-xs">
          <span className="text-slate-500">Total</span>
          <span className="font-bold text-slate-800">{routes.length}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-sm">
          <span className="text-emerald-600">Active</span>
          <span className="font-bold text-emerald-700">{routes.filter(r => !r.is_deleted).length}</span>
        </div>
        <label className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
          <input type="checkbox" checked={showDeleted} onChange={() => setShowDeleted(p => !p)} className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-900" />
          <span className="text-slate-600">Deleted only</span>
        </label>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Search size={15} className="text-slate-400 shrink-0" />
          <Input
            placeholder="Search by code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 text-sm h-8 px-0"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['ID', 'Code', 'Name', 'Bus Type', 'Stops', 'Min Fare', 'Fare Type', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[50, 80, 140, 100, 60, 80, 70, 70, 60].map((w, j) => (
                      <td key={j} className="px-5 py-3"><Skeleton className="h-4 rounded" style={{ width: w }} /></td>
                    ))}
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan="9" className="px-5 py-10 text-center text-slate-400 text-sm">No routes found.</td></tr>
              ) : filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5"><span className="font-mono text-slate-500 text-xs font-semibold">#{item.id}</span></td>
                  <td className="px-5 py-3.5"><span className="font-semibold text-slate-800 text-base">{item.route_code}</span></td>
                  <td className="px-5 py-3.5"><span className="text-slate-700 text-base">{item.route_name}</span></td>
                  <td className="px-5 py-3.5"><span className="text-slate-600 text-base">{item.bus_type_name || '—'}</span></td>
                  <td className="px-5 py-3.5"><span className="text-slate-600 text-base">{item.stage_count ?? 0}</span></td>
                  <td className="px-5 py-3.5"><span className="text-slate-600 text-base">₹{item.min_fare}</span></td>
                  <td className="px-5 py-3.5">
                    {item.fare_type === 1
                      ? <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs">TABLE</Badge>
                      : <Badge className="bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-100 text-xs">GRAPH</Badge>
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    {item.is_deleted
                      ? <Badge className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100">Deleted</Badge>
                      : <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">Active</Badge>
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openViewModal(item)} className="p-2 rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors" title="View"><Eye size={16} /></button>
                      <button onClick={() => openEditModal(item)} className="p-2 rounded-md bg-slate-900 text-white hover:bg-slate-700 transition-colors" title="Edit"><Pencil size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VIEW / EDIT OVERLAY  — tabbed panel layout                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">

            {/* ── Dark header ── */}
            <div className="bg-slate-900 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-wide">
                  {isReadOnly ? 'Route Details' : 'Edit Route'}
                </h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {formData.route_code} — {formData.route_name}
                </p>
              </div>
              <button onClick={closeEditViewModal}
                className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* ── Tab bar ── */}
            <div className="flex border-b border-slate-200 bg-slate-50 rounded-none px-6 gap-1 pt-3">
              {[
                { key: 'info', label: 'Route Info', icon: Info },
                { key: 'stops', label: `Stops (${formData.route_stages.length})`, icon: MapPinned },
                { key: 'fare', label: 'Fare Table', icon: IndianRupee },
              ].map(tab => {
                const Ic = tab.icon;
                return (
                  <button key={tab.key} type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px
                      ${activeTab === tab.key
                        ? 'border-slate-900 text-slate-900 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                    <Ic size={13} />{tab.label}
                  </button>
                );
              })}
            </div>

            {/* ── Tab panels ── */}
            <div className="p-6">

              {/* ════ TAB: Route Info ════ */}
              {activeTab === 'info' && (
                isReadOnly ? (
                  /* ─ View mode: FieldBlocks ─────────────────────────────── */
                  <div className="space-y-5">
                    <FieldGroup columns={3}>
                      <FieldBlock label="Route Code" value={formData.route_code} accent="blue" />
                      <FieldBlock label="Route Name" value={formData.route_name} accent="slate" />
                      <FieldBlock label="Min Fare" value={`₹${formData.min_fare}`} accent="emerald" />
                    </FieldGroup>
                    <FieldGroup title="Configuration" columns={3}>
                      <FieldBlock label="Bus Type" value={formData.bus_type_name || '—'} />
                      <FieldBlock label="Fare Type" value={FARE_TYPES.find(f => f.value === String(formData.fare_type))?.label || `Type ${formData.fare_type}`} />
                      <FieldBlock label="Stages" value={formData.route_stages.length} />
                    </FieldGroup>

                    {/* Allowables */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Allowables</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ROUTE_FLAGS.map(flag => (
                          <span key={flag.name} className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${formData[flag.name]
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                            }`}>{flag.label}</span>
                        ))}
                      </div>
                    </div>

                    {/* Depot Mapping */}
                    {formData.depot_ids && formData.depot_ids.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                          Depot Mapping ({formData.depot_ids.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {depots.filter(d => formData.depot_ids.includes(d.id)).map(d => (
                            <span key={d.id} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                              <Warehouse size={11} />{d.depot_name}
                              <span className="text-blue-400 text-[10px]">{d.depot_code}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ─ Edit mode: form inputs ──────────────────────────────── */
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Route Code</label>
                        <input type="text" name="route_code" value={formData.route_code}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Route Name</label>
                        <input type="text" name="route_name" value={formData.route_name}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Min Fare (₹)</label>
                        <input type="text" inputMode="numeric" name="min_fare" value={formData.min_fare}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Fare Type</label>
                        <select name="fare_type" value={formData.fare_type} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm">
                          <option value="">-- Select --</option>
                          {FARE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Start From</label>
                        <input type="number" name="start_from" value={formData.start_from}
                          onChange={handleInputChange} min="0"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Bus Type</label>
                        <select name="bus_type" value={formData.bus_type} onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white text-sm">
                          <option value="">-- Select --</option>
                          {busTypes.map(bt => <option key={bt.id} value={bt.id}>{bt.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Allowables */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">Select Allowables</p>
                        <button type="button" onClick={() => {
                          const allSelected = ROUTE_FLAGS.every(f => formData[f.name]);
                          setFormData(prev => {
                            const updates = {};
                            ROUTE_FLAGS.forEach(f => updates[f.name] = !allSelected);
                            return { ...prev, ...updates };
                          });
                        }} className="text-xs px-3 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50">
                          {ROUTE_FLAGS.every(f => formData[f.name]) ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {ROUTE_FLAGS.map(flag => (
                          <label key={flag.name} className={`flex items-center gap-2 text-sm p-2 rounded-lg border cursor-pointer transition-colors
                            ${formData[flag.name] ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                            <input type="checkbox" name={flag.name} checked={formData[flag.name] || false}
                              onChange={handleInputChange} className="sr-only" />
                            {flag.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Depot Mapping */}
                    {depots.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Depot Mapping</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {depots.map(depot => {
                            const sel = formData.depot_ids.includes(depot.id);
                            return (
                              <label key={depot.id} className={`flex items-center gap-2 text-sm p-2 rounded-lg border cursor-pointer transition-colors
                                ${sel ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                                <input type="checkbox" checked={sel}
                                  onChange={() => toggleFormDepot(depot.id)} className="sr-only" />
                                <span className="truncate">{depot.depot_name}</span>
                                <span className={`text-xs ml-auto ${sel ? 'text-indigo-200' : 'text-slate-400'}`}>{depot.depot_code}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Soft delete */}
                    <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                      <input type="checkbox" name="is_deleted" id="route_is_deleted"
                        checked={formData.is_deleted || false} onChange={handleInputChange}
                        className="w-4 h-4 rounded border-slate-300" />
                      <label htmlFor="route_is_deleted" className="text-sm font-medium text-red-700">Mark as deleted</label>
                    </div>
                  </div>
                )
              )}

              {/* ════ TAB: Stops ════ */}
              {activeTab === 'stops' && (
                <div>
                  <div className="mb-4">
                    <p className="text-sm font-medium text-slate-700">Route Stops</p>
                    <p className="text-xs text-slate-500">Rename a stop or adjust its distance — stops are fixed once the route is created.</p>
                  </div>

                  {formData.route_stages.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">No stops on this route</p>
                  ) : isReadOnly ? (
                    /* ── Visual timeline (view mode) ── */
                    <div className="py-1">
                      {formData.route_stages.map((stop, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === formData.route_stages.length - 1;
                        return (
                          <div key={idx} className="flex gap-3.5">
                            <div className="flex flex-col items-center w-4 shrink-0">
                              <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${isFirst ? 'bg-blue-500 border-blue-500'
                                : isLast ? 'bg-emerald-500 border-emerald-500'
                                  : 'bg-white border-slate-300'
                                }`} />
                              {!isLast && <div className="w-0.5 flex-1 bg-slate-200 min-h-[24px]" />}
                            </div>
                            <div className={`flex items-center justify-between flex-1 ${isLast ? 'pb-0' : 'pb-3'}`}>
                              <span className="text-sm font-medium text-slate-800">{stop.stage_name || '—'}</span>
                              <span className="text-xs font-medium text-slate-500 tabular-nums">
                                {stop.distance ? `${stop.distance} km` : '—'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ── Editable rows: rename + distance only, code shown for reference ── */
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Code</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">KM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {formData.route_stages.map((stop, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 font-mono text-slate-500">{stop.sequence_no}</td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={stop.stage_name || ''}
                                  onChange={e => updateStage(idx, 'stage_name', e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50))}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                                />
                              </td>
                              <td className="px-3 py-2 text-slate-400 font-mono">{stop.stage_code}</td>
                              <td className="px-3 py-1.5">
                                {/* <input
                                  type="number" placeholder="0" step="0.1"
                                  value={stop.distance}
                                  onChange={e => updateStage(idx, 'distance', e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                                /> */}
                                <input
                                  type="number"
                                  placeholder="0"
                                  step="0.1"
                                  min="0"
                                  max="999.9"
                                  value={stop.distance}
                                  onChange={e => {
                                    const value = e.target.value;

                                    if (parseFloat(value) > 999.9) {
                                      updateStage(idx, 'distance', '999.9');
                                      return;
                                    }

                                    updateStage(idx, 'distance', value);
                                  }}
                                  onKeyDown={e => {
                                    const currentValue = parseFloat(stop.distance) || 0;

                                    if (e.key === 'ArrowUp') {
                                      e.preventDefault();

                                      const nextValue =
                                        currentValue >= 999.9
                                          ? 0
                                          : Math.round((currentValue + 0.1) * 10) / 10;

                                      updateStage(idx, 'distance', String(nextValue));
                                    }

                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();

                                      const nextValue =
                                        currentValue <= 0
                                          ? 999.9
                                          : Math.round((currentValue - 0.1) * 10) / 10;

                                      updateStage(idx, 'distance', String(nextValue));
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ════ TAB: Fare Table ════ */}
              {activeTab === 'fare' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Fare Table</p>
                      <p className="text-xs text-slate-500">
                        {parseInt(formData.fare_type) === 1
                          ? 'Table Fare — fare per number of stages traveled'
                          : parseInt(formData.fare_type) === 2
                            ? 'Graph Fare — fare per origin→destination pair'
                            : 'Fare data for this route'}
                      </p>
                    </div>
                    {fareHasChanges && !isReadOnly && (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                        Unsaved changes
                      </span>
                    )}
                  </div>

                  {fareLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-9 w-full rounded" />)}
                    </div>
                  ) : fareStages.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                      <p className="text-sm">No stages defined for this route.</p>
                      <button type="button" onClick={() => setActiveTab('stops')}
                        className="mt-2 text-xs text-blue-600 hover:underline">Go to Stops tab to add stops first →</button>
                    </div>
                  ) : parseInt(formData.fare_type) === 1 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider w-1/2">Stages Traveled</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Fare Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {fareList.map((fare, idx) => (
                            <tr key={idx} className={idx === 0 ? 'bg-slate-50' : 'hover:bg-slate-50'}>
                              <td className="px-4 py-2 text-sm font-medium text-slate-700">
                                {idx + 1} {idx === 0 ? 'Stage' : 'Stages'}
                                {idx === 0 && <span className="ml-2 text-xs text-slate-400">(locked)</span>}
                              </td>
                              <td className="px-4 py-2">
                                {idx === 0 ? (
                                  <input type="number" value={0} disabled
                                    className="w-36 px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed text-sm" />
                                ) : (
                                  // <input type="number" value={fare} min="0"
                                  //   readOnly={isReadOnly}
                                  //   onChange={e => updateModalFareList(idx, e.target.value)}
                                  //   onBlur={e => {
                                  //     const minF = parseFloat(formData.min_fare) || 0;
                                  //     const val = parseFloat(e.target.value) || 0;
                                  //     if (val > 0 && val < minF) window.alert(`Minimum Fare is ${minF}`);
                                  //   }}
                                  //   className="w-36 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none read-only:bg-slate-50" />
                                  <input
                                    type="number"
                                    value={fare}
                                    min="0"
                                    max="999"
                                    readOnly={isReadOnly}
                                    onChange={e => {
                                      const value = e.target.value;

                                      if (parseFloat(value) > 999) {
                                        updateModalFareList(idx, '999');
                                        return;
                                      }

                                      updateModalFareList(idx, value);
                                    }}
                                    onKeyDown={e => {
                                      if (isReadOnly) return;

                                      const currentValue = parseInt(fare, 10) || 0;

                                      if (e.key === 'ArrowUp') {
                                        e.preventDefault();

                                        const nextValue =
                                          currentValue >= 999
                                            ? 0
                                            : currentValue + 1;

                                        updateModalFareList(idx, String(nextValue));
                                      }

                                      if (e.key === 'ArrowDown') {
                                        e.preventDefault();

                                        const nextValue =
                                          currentValue <= 0
                                            ? 999
                                            : currentValue - 1;

                                        updateModalFareList(idx, String(nextValue));
                                      }
                                    }}
                                    onBlur={e => {
                                      const minF = parseFloat(formData.min_fare) || 0;
                                      const val = parseFloat(e.target.value) || 0;

                                      if (val > 0 && val < minF) {
                                        window.alert(`Minimum Fare is ${minF}`);
                                      }
                                    }}
                                    className="w-36 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none read-only:bg-slate-50"
                                  />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-auto">
                      <table className="border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-slate-800 z-10 border-r border-slate-700 min-w-[100px]">↓ To / From →</th>
                            {fareStages.slice(0, fareStages.length - 1).map((s, i) => (
                              <th key={i} className="px-2 py-2 font-semibold text-center min-w-[72px] border-r border-slate-700">
                                {s.stage_name || `Stg ${i + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {fareMatrix.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-semibold text-slate-700 sticky left-0 bg-slate-100 border-r border-slate-300 z-10">
                                {fareStages[rIdx + 1]?.stage_name || `Stg ${rIdx + 2}`}
                              </td>
                              {Array.from({ length: fareStages.length - 1 }, (_, cIdx) => {
                                const isActive = cIdx <= rIdx;
                                return (
                                  <td key={cIdx} className={`px-2 py-1.5 text-center border-r border-slate-100 ${!isActive ? 'bg-slate-100' : ''}`}>
                                    {isActive ? (
                                      // <input type="number" value={row[cIdx] ?? 0} min="0"
                                      //   readOnly={isReadOnly}
                                      //   onChange={e => updateModalFareMatrix(rIdx, cIdx, e.target.value)}
                                      //   onBlur={e => {
                                      //     const minF = parseFloat(formData.min_fare) || 0;
                                      //     const val = parseFloat(e.target.value) || 0;
                                      //     if (val > 0 && val < minF) window.alert(`Minimum Fare is ${minF}`);
                                      //   }}
                                      //   className="w-14 px-1.5 py-1 text-center border border-slate-300 bg-slate-50 rounded text-xs focus:ring-1 focus:ring-slate-500 focus:outline-none read-only:bg-slate-50 read-only:border-slate-200" />
                                      <input
                                        type="number"
                                        value={row[cIdx] ?? 0}
                                        min="0"
                                        max="999"
                                        readOnly={isReadOnly}
                                        onChange={e => {
                                          const value = e.target.value;

                                          if (parseFloat(value) > 999) {
                                            updateModalFareMatrix(rIdx, cIdx, '999');
                                            return;
                                          }

                                          updateModalFareMatrix(rIdx, cIdx, value);
                                        }}
                                        onKeyDown={e => {
                                          if (isReadOnly) return;

                                          const currentValue = parseInt(row[cIdx], 10) || 0;

                                          if (e.key === 'ArrowUp') {
                                            e.preventDefault();

                                            const nextValue =
                                              currentValue >= 999
                                                ? 0
                                                : currentValue + 1;

                                            updateModalFareMatrix(
                                              rIdx,
                                              cIdx,
                                              String(nextValue)
                                            );
                                          }

                                          if (e.key === 'ArrowDown') {
                                            e.preventDefault();

                                            const nextValue =
                                              currentValue <= 0
                                                ? 999
                                                : currentValue - 1;

                                            updateModalFareMatrix(
                                              rIdx,
                                              cIdx,
                                              String(nextValue)
                                            );
                                          }
                                        }}
                                        onBlur={e => {
                                          const minF = parseFloat(formData.min_fare) || 0;
                                          const val = parseFloat(e.target.value) || 0;

                                          if (val > 0 && val < minF) {
                                            window.alert(`Minimum Fare is ${minF}`);
                                          }
                                        }}
                                        className="w-14 px-1.5 py-1 text-center border border-slate-300 bg-slate-50 rounded text-xs focus:ring-1 focus:ring-slate-500 focus:outline-none read-only:bg-slate-50 read-only:border-slate-200"
                                      />
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* ── Footer ── */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button type="button" onClick={closeEditViewModal}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                {isReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!isReadOnly && (
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-700 rounded-lg shadow transition-colors disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Update Route'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Wizard "similar stage" confirm modal ── */}
      {stageModal && (
        <div className="fixed inset-0 bg-slate-900/70 z-[60] flex items-center justify-center px-4" onClick={closeStageModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Create New Stage</h3>
              <button type="button" onClick={closeStageModal} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Stage Name</label>
                <input
                  type="text"
                  value={stageModal.stage_name}
                  onChange={e => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
                    setStageModal(m => ({ ...m, stage_name: val, similar: findSimilarStages(val), confirmedSimilar: false }));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Stage Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={stageModal.stage_code}
                  onChange={e => setStageModal(m => ({ ...m, stage_code: e.target.value.replace(/[^0-9]/g, '').slice(0, 50) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              {stageModal.similar.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs text-amber-800 font-medium">Similar stage{stageModal.similar.length > 1 ? 's' : ''} already exist:</p>
                  <ul className="space-y-1">
                    {stageModal.similar.slice(0, 5).map(s => (
                      <li key={s.id} className="text-xs text-amber-700 flex items-center justify-between">
                        <span>{s.stage_name}</span>
                        <span className="font-mono text-amber-500">{s.stage_code}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stageModal.confirmedSimilar}
                      onChange={e => setStageModal(m => ({ ...m, confirmedSimilar: e.target.checked }))}
                      className="cursor-pointer"
                    />
                    <span className="text-xs text-amber-800">Create a new stage anyway</span>
                  </label>
                </div>
              )}

              {stageModalError && <p className="text-xs text-red-600">{stageModalError}</p>}
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button type="button" onClick={closeStageModal}
                className="flex-1 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveStageModal}
                disabled={
                  !stageModal.stage_name.trim() || !stageModal.stage_code.trim() ||
                  (stageModal.similar.length > 0 && !stageModal.confirmedSimilar)
                }
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Add Stage
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}