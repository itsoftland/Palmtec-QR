import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import api from '../../assets/js/axiosConfig';
import { Download, Upload, MonitorDown, X, Check, ChevronDown, AlertTriangle, FolderOpen } from 'lucide-react';

const FILE_OPTIONS = [
  { key: 'settings',  label: 'Settings',        desc: 'BUS.DAT'                                            },
  { key: 'schedule',  label: 'Routes',           desc: 'ROUTELST.LST · STAGE.LST · RTE.DAT · LANGUAGE.DAT' },
  { key: 'crew',      label: 'Crew Details',     desc: 'CREW.DAT'                                           },
  { key: 'vehicles',  label: 'Vehicle Details',  desc: 'VEHICLE.DAT'                                        },
  { key: 'expenses',  label: 'Expense Details',  desc: 'EXPENSEDET.DAT'                                     },
];

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchBinary(endpoint, timeout) {
  const res = await api.get(endpoint, { responseType: 'blob', ...(timeout ? { timeout } : {}) });
  return res.data;
}

// Windows shell metadata files — the browser's File System Access API refuses
// to create files with these names on any platform.
const FS_BLOCKED_NAMES = new Set(['desktop.ini', 'thumbs.db']);

// Chromium also silently refuses some other filenames (old Windows system/VB6
// redistributable DLLs seen in this tool's legacy vbcode/ source tree, e.g.
// asycfilt.dll, COMCAT.DLL) via an internal, version-dependent blocklist that
// isn't practical to fully enumerate up front. None of these live under dist/
// — they're unused legacy source files — so a write failure here is skipped
// and reported, not treated as fatal for the whole tool.
async function writeZipToDirectory(blob, dirHandle) {
  const zip = await JSZip.loadAsync(blob);
  const entries = Object.values(zip.files);
  const skipped = [];
  for (const entry of entries) {
    if (entry.dir) continue;
    const parts = entry.name.split('/').filter(Boolean);
    if (FS_BLOCKED_NAMES.has(parts[parts.length - 1].toLowerCase())) continue;
    try {
      let target = dirHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        target = await target.getDirectoryHandle(parts[i], { create: true });
      }
      const fileHandle = await target.getFileHandle(parts[parts.length - 1], { create: true });
      const writable  = await fileHandle.createWritable();
      await writable.write(await entry.async('arraybuffer'));
      await writable.close();
    } catch (err) {
      skipped.push(`${entry.name} (${err.name}: ${err.message})`);
    }
  }
  if (skipped.length > 0) {
    console.warn(`Palmtech tool: ${skipped.length} file(s) the browser refused to write, skipped:`, skipped);
  }
  return skipped;
}

async function getNestedDirectory(rootHandle, pathParts) {
  let target = rootHandle;
  for (const part of pathParts) {
    target = await target.getDirectoryHandle(part, { create: true });
  }
  return target;
}

async function getExistingNestedDirectory(rootHandle, pathParts) {
  let target = rootHandle;
  for (const part of pathParts) {
    target = await target.getDirectoryHandle(part);
  }
  return target;
}

// The transfer tool reads mode.txt to decide its action — make sure an
// existing install is set to "download" before new files are written.
async function ensureDownloadMode(dirHandle) {
  const fileHandle = await dirHandle.getFileHandle('mode.txt', { create: true });
  const content    = (await (await fileHandle.getFile()).text()).trim().toLowerCase();
  if (content === 'download') return;
  const writable = await fileHandle.createWritable();
  await writable.write('download');
  await writable.close();
}

// Upload needs mode.txt to say "upload". If it doesn't, erase the file's
// content and write "upload" (createWritable without keepExistingData truncates).
async function ensureUploadMode(dirHandle) {
  const fileHandle = await dirHandle.getFileHandle('mode.txt', { create: true });
  const content    = (await (await fileHandle.getFile()).text()).trim().toLowerCase();
  if (content.includes('upload')) return;
  const writable = await fileHandle.createWritable();
  await writable.write('upload');
  await writable.close();
}

async function writeFileToDirectory(blob, dirHandle, filename) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable   = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// ── Route Selection Modal ──────────────────────────────────────────────────────
function RouteSelectModal({ routes, selected, onToggle, onConfirm, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = routes.filter(
    r => r.route_code.toLowerCase().includes(search.toLowerCase()) ||
         r.route_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Select Routes</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {selected.length === 0 ? 'No routes selected' : `${selected.length} route${selected.length !== 1 ? 's' : ''} selected`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100">
          <input
            type="text"
            placeholder="Search by code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400"
          />
        </div>

        {/* Select all row */}
        <div className="px-5 py-2 border-b border-slate-100">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => {
                if (selected.length === routes.length) {
                  routes.forEach(r => selected.includes(r.route_code) && onToggle(r.route_code));
                } else {
                  routes.forEach(r => !selected.includes(r.route_code) && onToggle(r.route_code));
                }
              }}
              className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors
                ${selected.length === routes.length
                  ? 'bg-slate-800 border-slate-800'
                  : selected.length > 0
                    ? 'bg-slate-400 border-slate-400'
                    : 'border-slate-300 bg-white'}`}
            >
              {selected.length > 0 && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>
            <span className="text-xs font-semibold text-slate-600">Select All</span>
          </label>
        </div>

        {/* Route list */}
        <div className="overflow-y-auto flex-1 px-5 py-2 space-y-1">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No routes found</p>
          )}
          {filtered.map(r => (
            <label key={r.route_code} className="flex items-center gap-3 py-2 cursor-pointer select-none hover:bg-slate-50 rounded-lg px-2 -mx-2">
              <div
                onClick={() => onToggle(r.route_code)}
                className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer shrink-0 transition-colors
                  ${selected.includes(r.route_code) ? 'bg-slate-800 border-slate-800' : 'border-slate-300 bg-white'}`}
              >
                {selected.includes(r.route_code) && <Check size={10} className="text-white" strokeWidth={3} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{r.route_code}</p>
                <p className="text-xs text-slate-400 truncate">{r.route_name}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={selected.length === 0}
            className="px-4 py-2 text-sm font-semibold bg-slate-800 text-white rounded-lg
              hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Folder Selection Info Modal ─────────────────────────────────────────────
function FolderInfoModal({ onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <FolderOpen size={18} />
          </div>
          <h2 className="text-base font-bold text-slate-800">Choose a folder</h2>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-lg border border-slate-200 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-700">Already have the Palmtech Data Transfer tool?</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Select the folder that <strong>contains</strong> the <code className="text-slate-700">PalmtechDataTransfer</code> folder.
              The tool won't be downloaded again — only the data files will be updated.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-700">First time on this computer?</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any folder (e.g. Desktop or Documents). The tool will be downloaded there along with the data files.
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Your browser will ask for permission to edit files in the selected folder — choose <strong>Allow</strong>.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Choose Folder
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload: "do you have the tool?" Modal ──────────────────────────────────
function HasToolModal({ onHave, onDontHave, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Palmtech Data Transfer tool</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-600">Do you already have the Palmtech Data Transfer tool on this computer?</p>
          <div className="rounded-lg border border-slate-200 px-3 py-2.5">
            <p className="text-xs text-slate-500">
              <strong>Yes</strong> — select the folder that <strong>contains</strong> the{' '}
              <code className="text-slate-700">PalmtechDataTransfer</code> folder. The tool is set to upload mode and launched.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2.5">
            <p className="text-xs text-slate-500">
              <strong>No</strong> — select any folder (e.g. Desktop). The tool is downloaded there and set to upload mode;
              then run it manually.
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Your browser will ask for permission to edit files in the selected folder — choose <strong>Allow</strong>.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onDontHave}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
            No, download it
          </button>
          <button onClick={onHave}
            className="px-4 py-2 text-sm font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors">
            Yes, select folder
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skip Files Warning Modal ────────────────────────────────────────────────
function SkipWarningModal({ skipped, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <h2 className="text-base font-bold text-slate-800">Some files won't be sent</h2>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 mb-3">
            The following files are unchecked and will <strong>not</strong> be downloaded to the device:
          </p>
          <ul className="space-y-1 mb-3">
            {skipped.map(opt => (
              <li key={opt.key} className="text-sm font-medium text-slate-700">• {opt.label} <span className="text-xs text-slate-400 font-normal">({opt.desc})</span></li>
            ))}
          </ul>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Make sure these are already present on the device. If they aren't, device functionality may break.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            OK, Download Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Transfer Modal ──────────────────────────────────────────────────────────
// The browser launches the locally registered protocol handler. An HTTP
// request cannot start an executable on the operator's PC.
function TransferModal({ onClose }) {
  const [launching, setLaunching] = useState(false);
  const [result,    setResult]    = useState(null); // { ok: bool, message: string }

  const handleTransfer = async () => {
    setLaunching(true);
    setResult(null);
    try {
      window.location.assign('palmtec://launch');
      setResult({ ok: true, message: 'Palmtech Transfer Tool launch requested on this PC.' });
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Failed to launch the local transfer tool.' });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Transfer to Device</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 mb-3">
            The transfer files are ready. Click Transfer to open Palmtech Data Transfer on this PC.
          </p>
          <p className="text-xs text-slate-500">
            If the tool does not open, run
            <span className="font-mono">PalmtechDataTransfer\protocol-handler\register-palmtec-protocol-windows.bat</span>
            from the folder you selected for download.
          </p>

          {result && (
            <p className={`text-xs mt-2 ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {result.message}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleTransfer}
            disabled={launching}
            className="px-4 py-2 text-sm font-semibold bg-slate-800 text-white rounded-lg
              hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {launching ? 'Launching…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Download Section ──────────────────────────────────────────────────────────
function DownloadSection() {
  const [selected,       setSelected]       = useState({ settings: true, schedule: true, crew: true, vehicles: true, expenses: true });
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showSkipModal,  setShowSkipModal]  = useState(false);
  const [showFolderInfoModal, setShowFolderInfoModal] = useState(false);
  const [routes,         setRoutes]         = useState([]);
  const [routesLoading,  setRoutesLoading]  = useState(false);
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [devices,        setDevices]        = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [palmtecInput,   setPalmtecInput]   = useState('');
  const [palmtecSaving,  setPalmtecSaving]  = useState(false);
  const [palmtecError,   setPalmtecError]   = useState('');
  const [downloading,    setDownloading]    = useState(false);
  const [progress,       setProgress]       = useState([]);
  const [done,           setDone]           = useState(false);
  const [error,          setError]          = useState('');
  const [skippedFiles,   setSkippedFiles]   = useState(0);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const anySelected = Object.values(selected).some(Boolean);
  const scheduleSelected = selected.schedule;

  // Fetch route list when schedule is ticked
  useEffect(() => {
    if (!scheduleSelected) { setSelectedRoutes([]); return; }
    setRoutesLoading(true);
    api.get('/device/routes')
      .then(res => setRoutes(res.data.routes || []))
      .catch(() => setError('Failed to load routes.'))
      .finally(() => setRoutesLoading(false));
  }, [scheduleSelected]);

  // Fetch device list when settings is ticked
  const settingsSelected = selected.settings;
  useEffect(() => {
    if (!settingsSelected) { setSelectedDevice(''); return; }
    setDevicesLoading(true);
    api.get('/get_company_devices')
      .then(res => setDevices(res.data.data || []))
      .catch(() => setError('Failed to load devices.'))
      .finally(() => setDevicesLoading(false));
  }, [settingsSelected]);

  const toggleOption = key => {
    setSelected(prev => ({ ...prev, [key]: !prev[key] }));
    if (key === 'schedule' && selected.schedule) setSelectedRoutes([]);
    if (key === 'settings' && selected.settings) setSelectedDevice('');
    setDone(false);
    setShowTransferModal(false);
    setSkippedFiles(0);
    setProgress([]);
    setError('');
  };

  const toggleAll = () => {
    const allOn = Object.values(selected).every(Boolean);
    setSelected({ settings: !allOn, schedule: !allOn, crew: !allOn, vehicles: !allOn, expenses: !allOn });
    if (allOn) { setSelectedRoutes([]); setSelectedDevice(''); }
    setDone(false);
    setShowTransferModal(false);
    setSkippedFiles(0);
    setProgress([]);
    setError('');
  };

  const selectedDeviceObj = devices.find(d => d.serial_number === selectedDevice) || null;
  const needsPalmtecId    = selectedDeviceObj && !selectedDeviceObj.palmtec_id;

  const handleSetPalmtecId = async () => {
    if (!selectedDeviceObj) return;
    setPalmtecSaving(true);
    setPalmtecError('');
    try {
      await api.post(`/etm-devices/${selectedDeviceObj.id}/set-palmtec-id`, {
        palmtec_id: parseInt(palmtecInput, 10),
      });
      setDevices(prev =>
        prev.map(d =>
          d.id === selectedDeviceObj.id
            ? { ...d, palmtec_id: parseInt(palmtecInput, 10) }
            : d
        )
      );
      setPalmtecInput('');
    } catch (err) {
      setPalmtecError(err.response?.data?.error || 'Failed to set Palmtec ID.');
    } finally {
      setPalmtecSaving(false);
    }
  };

  const toggleRoute = code => {
    setSelectedRoutes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const skippedOptions = FILE_OPTIONS.filter(opt => !selected[opt.key]);

  const handleDownloadClick = () => {
    if (skippedOptions.length > 0) {
      setShowSkipModal(true);
      return;
    }
    proceedToDownload();
  };

  const proceedToDownload = () => {
    if (scheduleSelected && selectedRoutes.length === 0) {
      setShowRouteModal(true);
      return;
    }
    startDownload();
  };

  const startDownload = async () => {
    if (selected.settings && !selectedDevice) {
      setError('Select a device before downloading Settings (BUS.DAT).');
      return;
    }
    if (selected.settings && needsPalmtecId) {
      setError('Set a Palmtec ID for the selected device before downloading.');
      return;
    }
    // Explain what folder to pick first; the modal's button opens the picker
    // itself so the picker still gets a fresh user click.
    if (window.showDirectoryPicker) {
      setShowFolderInfoModal(true);
      return;
    }
    runDownload();
  };

  const runDownload = async () => {
    setShowFolderInfoModal(false);
    setDownloading(true);
    setDone(false);
    setSkippedFiles(0);
    setError('');

    // Ask where to unzip the Palmtech transfer tool before touching the network
    let unzipDirHandle = null;
    let distFilesHandle = null;
    let toolAlreadyExists = false;
    if (window.showDirectoryPicker) {
      try {
        // readwrite must be requested here, while the click's user activation
        // is still fresh — asking for it later (after the zip fetch/unzip,
        // which can take a while) throws SecurityError instead of prompting.
        unzipDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        try {
          distFilesHandle = await getExistingNestedDirectory(
            unzipDirHandle,
            ['PalmtechDataTransfer', 'dist', 'files']
          );
          toolAlreadyExists = true;
        } catch (err) {
          if (err.name !== 'NotFoundError') throw err;
        }
        if (toolAlreadyExists) {
          try {
            await ensureDownloadMode(distFilesHandle);
          } catch (err) {
            setDownloading(false);
            setError(`Failed to update mode.txt: ${err.message}`);
            return;
          }
        }
      } catch (err) {
        setDownloading(false);
        if (err.name === 'AbortError') { setError('Download cancelled — no folder selected.'); return; }
        setError('Failed to open folder picker.');
        return;
      }
    }

    const routeParam = selectedRoutes.length > 0 ? `?route_codes=${selectedRoutes.join(',')}` : '';

    // Build ordered task list — download the tool only when it is not already
    // present in the folder selected by the operator.
    const tasks = [];
    if (!toolAlreadyExists) {
      tasks.push({ label: 'Palmtech Transfer Tool', endpoint: '/device/palmtech-tool', filename: 'PalmtechDataTransfer.zip', unzip: true, timeout: 300000 });
    }
    if (selected.settings)  tasks.push({ label: 'Settings (BUS.DAT)',         endpoint: `/device/settings?serialnumber=${encodeURIComponent(selectedDevice)}`, filename: 'BUS.DAT'          });
    if (selected.crew)      tasks.push({ label: 'Driver Schedule (CREW.DAT)', endpoint: '/device/crew',                   filename: 'CREW.DAT'         });
    if (selected.vehicles)  tasks.push({ label: 'Vehicle Details (VEHICLE.DAT)', endpoint: '/device/vehicles',            filename: 'VEHICLE.DAT'      });
    if (selected.expenses)  tasks.push({ label: 'Expense Details (EXPENSEDET.DAT)', endpoint: '/device/expenses',         filename: 'EXPENSEDET.DAT'   });
    if (selected.schedule) {
      tasks.push({ label: 'Route List (ROUTELST.LST)',  endpoint: `/device/routelst${routeParam}`,      filename: 'ROUTELST.LST'   });
      tasks.push({ label: 'Stage List (STAGE.LST)',     endpoint: `/device/stagelst${routeParam}`,      filename: 'STAGE.LST'      });
      tasks.push({ label: 'Route Data (RTE.DAT)',       endpoint: `/device/rtedat${routeParam}`,        filename: 'RTE.DAT'        });
      tasks.push({ label: 'Language (LANGUAGE.DAT)',    endpoint: `/device/languagedat${routeParam}`,   filename: 'LANGUAGE.DAT'   });
    }

    setProgress(tasks.map(t => ({ label: t.label, status: 'pending' })));

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      setProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'downloading' } : p));
      try {
        const blob = await fetchBinary(task.endpoint, task.timeout);
        if (task.unzip && unzipDirHandle) {
          const skipped = await writeZipToDirectory(blob, unzipDirHandle);
          setSkippedFiles(skipped.length);
          distFilesHandle = await getNestedDirectory(unzipDirHandle, ['PalmtechDataTransfer', 'dist', 'files']);
        } else if (distFilesHandle) {
          await writeFileToDirectory(blob, distFilesHandle, task.filename);
        } else {
          triggerDownload(blob, task.filename);
        }
        setProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
      } catch (err) {
        setProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error' } : p));
        let msg = `Failed to download ${task.filename}.`;
        try {
          if (err.response?.data instanceof Blob) {
            const text = await err.response.data.text();
            if (text) {
              const match = text.match(/<pre class="exception_value">([\s\S]*?)<\/pre>/);
              const clean = match ? match[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim() : null;
              msg = `${task.filename}: ${clean || err.response?.status || 'Server error'}`;
            }
          } else if (err.code === 'ECONNABORTED') {
            msg = `${task.filename}: request timed out.`;
          } else if (err.message) {
            msg = `${task.filename}: ${err.message}`;
          }
        } catch {}
        setError(msg);
        setDownloading(false);
        return;
      }
    }

    setDownloading(false);
    setProgress([]);
    setDone(true);
    // Fresh tool download: show the modal so the operator sees the protocol
    // registration hint. Tool already present: launch the transfer directly.
    if (toolAlreadyExists) {
      window.location.assign('palmtec://launch');
    } else {
      setShowTransferModal(true);
    }
  };

  const allOn = Object.values(selected).every(Boolean);
  const currentIdx = progress.findIndex(p => p.status === 'downloading');

  return (
    <div>

      {/* File checklist card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-4">

        {/* Select all */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
          <label className="flex items-center gap-3 cursor-pointer select-none" onClick={toggleAll}>
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
              ${allOn ? 'bg-slate-800 border-slate-800' : anySelected ? 'bg-slate-400 border-slate-400' : 'border-slate-300 bg-white'}`}>
              {anySelected && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select All</span>
          </label>
        </div>

        {/* Options */}
        <div className="divide-y divide-slate-100">
          {FILE_OPTIONS.map(opt => (
            <div key={opt.key}>
              <label className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors select-none">
                <div
                  onClick={() => toggleOption(opt.key)}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                    ${selected[opt.key] ? 'bg-slate-800 border-slate-800' : 'border-slate-300 bg-white'}`}
                >
                  {selected[opt.key] && <Check size={10} className="text-white" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0" onClick={() => toggleOption(opt.key)}>
                  <p className="text-sm font-semibold text-slate-700">{opt.label}</p>
                  <p className="text-xs text-slate-400">{opt.desc}</p>
                </div>
              </label>

              {/* Device selection row — shown inline when Settings is checked */}
              {opt.key === 'settings' && selected.settings && (
                <div className="px-5 pb-4 ml-8">
                  {devicesLoading ? (
                    <p className="text-xs text-slate-400">Loading devices…</p>
                  ) : devices.length === 0 ? (
                    <p className="text-xs text-red-500">No allocated devices found for this company.</p>
                  ) : (
                    <>
                      <select
                        value={selectedDevice}
                        onChange={e => { setSelectedDevice(e.target.value); setPalmtecInput(''); setPalmtecError(''); }}
                        className="text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-600
                          hover:border-slate-400 focus:outline-none focus:border-slate-500 bg-white"
                      >
                        <option value="">Choose device…</option>
                        {devices.map(d => (
                          <option key={d.id} value={d.serial_number}>
                            {d.serial_number}{d.palmtec_id ? ` (${d.palmtec_id})` : ' — No Palmtec ID'}
                          </option>
                        ))}
                      </select>

                      {needsPalmtecId && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs text-amber-700 font-medium mb-2">
                            This device has no Palmtec ID. Set it now or choose another device.
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              placeholder="Palmtec ID"
                              value={palmtecInput}
                              onChange={e => { setPalmtecInput(e.target.value); setPalmtecError(''); }}
                              className="w-28 text-xs border border-amber-300 rounded-lg px-2 py-1.5
                                focus:outline-none focus:border-amber-500 bg-white"
                            />
                            <button
                              onClick={handleSetPalmtecId}
                              disabled={palmtecSaving || !palmtecInput}
                              className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg
                                hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {palmtecSaving ? 'Saving…' : 'Set'}
                            </button>
                          </div>
                          {palmtecError && (
                            <p className="text-xs text-red-600 mt-1">{palmtecError}</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Route selection row — shown inline when Schedule is checked */}
              {opt.key === 'schedule' && selected.schedule && (
                <div className="px-5 pb-4 ml-8">
                  {routesLoading ? (
                    <p className="text-xs text-slate-400">Loading routes…</p>
                  ) : (
                    <button
                      onClick={() => setShowRouteModal(true)}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg
                        text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors bg-white"
                    >
                      {selectedRoutes.length === 0
                        ? 'Choose routes…'
                        : `${selectedRoutes.length} route${selectedRoutes.length !== 1 ? 's' : ''} selected`}
                      <ChevronDown size={12} />
                    </button>
                  )}
                  {selectedRoutes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedRoutes.map(code => (
                        <span key={code} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-md font-medium">
                          {code}
                          <button onClick={() => toggleRoute(code)} className="text-slate-400 hover:text-slate-700">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Progress list */}
      {progress.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transfer Progress</p>
          </div>
          <div className="divide-y divide-slate-100">
            {progress.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
                  ${p.status === 'done'        ? 'bg-emerald-100'
                  : p.status === 'error'       ? 'bg-red-100'
                  : p.status === 'downloading' ? 'bg-blue-100'
                  : 'bg-slate-100'}`}>
                  {p.status === 'done'        && <Check size={11} className="text-emerald-600" strokeWidth={3} />}
                  {p.status === 'error'       && <X     size={11} className="text-red-500"     strokeWidth={3} />}
                  {p.status === 'downloading' && (
                    <div className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {p.status === 'pending'     && <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                </div>
                <span className={`text-sm ${
                  p.status === 'done'        ? 'text-slate-700 font-medium'
                  : p.status === 'error'     ? 'text-red-600'
                  : p.status === 'downloading' ? 'text-blue-600 font-medium'
                  : 'text-slate-400'
                }`}>
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success */}
      {done && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
          <div className="flex items-center gap-2">
            <Check size={15} strokeWidth={3} />
            All files downloaded successfully.
          </div>
          {skippedFiles > 0 && (
            <p className="text-xs text-emerald-600 font-normal mt-1 ml-[23px]">
              {skippedFiles} legacy tool file{skippedFiles !== 1 ? 's' : ''} the browser wouldn't write were skipped
              (unused source files — the app itself is unaffected).
            </p>
          )}
        </div>
      )}

      {/* Download button */}
      <button
        onClick={handleDownloadClick}
        disabled={
          !anySelected ||
          downloading ||
          (scheduleSelected && selectedRoutes.length === 0) ||
          (settingsSelected && !selectedDevice) ||
          (settingsSelected && !!needsPalmtecId)
        }
        className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 text-white
          text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {downloading
          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Download size={16} />}
        {downloading
          ? (currentIdx >= 0
              ? `Downloading ${progress[currentIdx].label} (${currentIdx + 1}/${progress.length})…`
              : 'Downloading…')
          : 'Download'}
      </button>

      {settingsSelected && !selectedDevice && !downloading && (
        <p className="text-xs text-slate-400 text-center mt-2">Select a device to download Settings (BUS.DAT).</p>
      )}
      {scheduleSelected && selectedRoutes.length === 0 && !downloading && (
        <p className="text-xs text-slate-400 text-center mt-2">Select at least one route to download schedule files.</p>
      )}

      {/* Route selection modal */}
      {showRouteModal && (
        <RouteSelectModal
          routes={routes}
          selected={selectedRoutes}
          onToggle={toggleRoute}
          onConfirm={() => setShowRouteModal(false)}
          onClose={() => setShowRouteModal(false)}
        />
      )}

      {/* Folder selection info modal */}
      {showFolderInfoModal && (
        <FolderInfoModal
          onConfirm={runDownload}
          onClose={() => setShowFolderInfoModal(false)}
        />
      )}

      {/* Skip files warning modal */}
      {showSkipModal && (
        <SkipWarningModal
          skipped={skippedOptions}
          onConfirm={() => { setShowSkipModal(false); proceedToDownload(); }}
          onClose={() => setShowSkipModal(false)}
        />
      )}

      {/* Transfer to device modal */}
      {showTransferModal && (
        <TransferModal onClose={() => setShowTransferModal(false)} />
      )}
    </div>
  );
}

// ── Upload Section ────────────────────────────────────────────────────────────
// Mirrors backend _is_allowed_device_file — only these raw device files are accepted.
const UPLOAD_CORE_NAMES = new Set([
  'VERSION.DAT', 'STATUS.DAT', 'BUS.DAT', 'RPT01.DAT',
  'ODOMETER.DAT', 'EXPENSE.DAT', 'INSPECTOR.DAT',
]);
const UPLOAD_DYNAMIC_NAMES = new Set(['PASS.PAS', 'T.CON', 'FAREWISE.DAT', 'PRM']);

function isAllowedDeviceFile(name) {
  const n = name.toUpperCase();
  return UPLOAD_CORE_NAMES.has(n) || UPLOAD_DYNAMIC_NAMES.has(n) || (n.startsWith('TKTS') && n.endsWith('.DAT'));
}

function UploadSection() {
  const [devices,        setDevices]        = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [files,          setFiles]          = useState([]);
  const [ignored,        setIgnored]        = useState([]);
  const [uploading,      setUploading]      = useState(false);
  const [done,           setDone]           = useState(null); // { saved: [], rejected: [] }
  const [error,          setError]          = useState('');
  const [showToolModal,  setShowToolModal]  = useState(true); // asked on entering the Upload section
  const [toolBusy,       setToolBusy]       = useState(false);
  const [toolMsg,        setToolMsg]        = useState('');
  const [filesDir,       setFilesDir]       = useState(null); // dist/files handle of the tool

  useEffect(() => {
    setDevicesLoading(true);
    api.get('/get_company_devices')
      .then(res => setDevices(res.data.data || []))
      .catch(() => setError('Failed to load devices.'))
      .finally(() => setDevicesLoading(false));
  }, []);

  // hasTool=true: operator points at the folder holding PalmtechDataTransfer.
  // hasTool=false: operator picks a folder to download it into. Either way an
  // already-installed tool is never downloaded again. Picker is called first so
  // it still has the click's user activation.
  const runToolFlow = async hasTool => {
    setShowToolModal(false);
    setError('');
    setToolMsg('');
    setDone(null);
    let root;
    try {
      root = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (err.name !== 'AbortError') setError('Failed to open folder picker.');
      return;
    }
    setToolBusy(true);
    try {
      let dist = null;
      try {
        dist = await getExistingNestedDirectory(root, ['PalmtechDataTransfer', 'dist', 'files']);
      } catch (err) {
        if (err.name !== 'NotFoundError') throw err;
      }

      if (!dist) {
        if (hasTool) {
          setError('PalmtechDataTransfer tool not found in that folder. Select the folder that contains it, or choose "No, download it".');
          return;
        }
        const blob = await fetchBinary('/device/palmtech-tool', 300000);
        await writeZipToDirectory(blob, root);
        dist = await getNestedDirectory(root, ['PalmtechDataTransfer', 'dist', 'files']);
        await ensureUploadMode(dist);
        // Fresh install: stop here, operator runs the tool manually.
        setToolMsg('Tool downloaded and set to upload mode. Run Palmtech Data Transfer manually (register the palmtec protocol with PalmtechDataTransfer\\protocol-handler\\register-palmtec-protocol-windows.bat if needed), read the device, then come back and click "Upload files from tool folder".');
        setFilesDir(dist);
        return;
      }

      await ensureUploadMode(dist);
      setFilesDir(dist);
      window.location.assign('palmtec://launch');
      setToolMsg('Tool set to upload mode and launched. Once it reports "Files Upload successfully", click "Upload files from tool folder".');
    } catch (err) {
      setError(`Tool setup failed: ${err.message || err.name}`);
    } finally {
      setToolBusy(false);
    }
  };

  const uploadFromToolFolder = async () => {
    if (!filesDir) return;
    const picked = [];
    try {
      for await (const entry of filesDir.values()) {
        if (entry.kind === 'file' && isAllowedDeviceFile(entry.name)) picked.push(await entry.getFile());
      }
    } catch (err) {
      setError(`Failed to read tool folder: ${err.message || err.name}`);
      return;
    }
    if (picked.length === 0) {
      setError('No device files found in the tool folder. Run the transfer tool first.');
      return;
    }
    await handleUpload(picked);
  };

  const resetResult = () => { setDone(null); setError(''); };

  const addFiles = list => {
    const picked = Array.from(list);
    setFiles(picked.filter(f => isAllowedDeviceFile(f.name)));
    setIgnored(picked.filter(f => !isAllowedDeviceFile(f.name)).map(f => f.name));
    resetResult();
  };

  const pickFolder = async () => {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' });
      const picked = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') picked.push(await entry.getFile());
      }
      addFiles(picked);
    } catch (err) {
      if (err.name !== 'AbortError') setError('Failed to read folder.');
    }
  };

  const removeFile = name => setFiles(prev => prev.filter(f => f.name !== name));

  const handleUpload = async (override) => {
    const list = Array.isArray(override) ? override : files;
    setUploading(true);
    resetResult();
    try {
      const form = new FormData();
      form.append('serialnumber', selectedDevice);
      list.forEach((f, i) => form.append(`file${i}`, f, f.name));
      const res = await api.post('/device/upload-data', form, {
        timeout: 300000,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDone({ saved: res.data.saved || list.map(f => f.name), rejected: res.data.rejected || [] });
      setFiles([]);
      setIgnored([]);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-4">
        {/* Device */}
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700 mb-2">Device</p>
          {devicesLoading ? (
            <p className="text-xs text-slate-400">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="text-xs text-red-500">No allocated devices found for this company.</p>
          ) : (
            <select
              value={selectedDevice}
              onChange={e => { setSelectedDevice(e.target.value); resetResult(); }}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-600
                hover:border-slate-400 focus:outline-none focus:border-slate-500 bg-white"
            >
              <option value="">Choose device…</option>
              {devices.map(d => (
                <option key={d.id} value={d.serial_number}>
                  {d.serial_number}{d.palmtec_id ? ` (${d.palmtec_id})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Transfer tool status */}
        {(toolBusy || toolMsg || filesDir) && (
          <div className="px-5 py-4 border-b border-slate-100">
            {toolBusy && <p className="text-xs text-slate-400">Preparing tool…</p>}
            {toolMsg && <p className="text-xs text-slate-500">{toolMsg}</p>}
            {filesDir && (
              <button
                onClick={uploadFromToolFolder}
                disabled={toolBusy || uploading || !selectedDevice}
                className="flex items-center gap-2 mt-3 px-3 py-2 text-xs font-semibold bg-slate-800 text-white rounded-lg
                  hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={12} />
                Upload files from tool folder
              </button>
            )}
          </div>
        )}

        {/* Files */}
        <div className="px-5 py-4">
          <p className="text-sm font-semibold text-slate-700">Or pick device files manually</p>
          <p className="text-xs text-slate-400 mb-3">
            BUS.DAT · INSPECTOR.DAT · EXPENSE.DAT · ODOMETER.DAT · RPT01.DAT · TKTS*.DAT · PASS.PAS · …
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg
              text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors bg-white cursor-pointer">
              <Upload size={12} />
              Choose files…
              <input type="file" multiple className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {window.showDirectoryPicker && (
              <button
                onClick={pickFolder}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg
                  text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors bg-white"
              >
                <FolderOpen size={12} />
                Choose folder…
              </button>
            )}
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {files.map(f => (
                <span key={f.name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-md font-medium">
                  {f.name}
                  <button onClick={() => removeFile(f.name)} className="text-slate-400 hover:text-slate-700">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {ignored.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Ignored {ignored.length} unsupported file{ignored.length !== 1 ? 's' : ''}: {ignored.join(', ')}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {done && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
          <div className="flex items-center gap-2">
            <Check size={15} strokeWidth={3} />
            Uploaded {done.saved.length} file{done.saved.length !== 1 ? 's' : ''} successfully.
          </div>
          {done.rejected.length > 0 && (
            <p className="text-xs text-amber-700 font-normal mt-1 ml-[23px]">
              Rejected: {done.rejected.map(r => (typeof r === 'string' ? r : r.name || JSON.stringify(r))).join(', ')}
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => handleUpload()}
        disabled={uploading || files.length === 0 || !selectedDevice}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 text-white
          text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {uploading
          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Upload size={16} />}
        {uploading ? 'Uploading…' : `Upload${files.length ? ` (${files.length})` : ''}`}
      </button>

      {showToolModal && (
        <HasToolModal
          onHave={() => runToolFlow(true)}
          onDontHave={() => runToolFlow(false)}
          onClose={() => setShowToolModal(false)}
        />
      )}
      {!selectedDevice && !uploading && (
        <p className="text-xs text-slate-400 text-center mt-2">Select a device to upload its data.</p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeviceDownload() {
  const [section, setSection] = useState('download');
  const isDownload = section === 'download';

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <MonitorDown size={18} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Device Transfer</h1>
        </div>
        <p className="text-sm text-slate-400 ml-12">
          {isDownload ? 'Select files to transfer to the ETM device.' : 'Upload data files read from the ETM device.'}
        </p>
      </div>

      <div className="flex p-1 mb-6 bg-slate-100 rounded-xl">
        {[
          { key: 'download', label: 'Download to Device', Icon: Download },
          { key: 'upload',   label: 'Upload from Device', Icon: Upload   },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors
              ${section === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {isDownload ? <DownloadSection /> : <UploadSection />}
    </div>
  );
}
