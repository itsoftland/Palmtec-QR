import { useEffect, useRef, useState } from "react";
import ExcelJS from "exceljs";
import api, { BASE_URL } from "../../assets/js/axiosConfig";
import TableSkeleton from "../../components/TableSkeleton";
import Modal from "../../components/Modal";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  Stock:      "bg-slate-100  text-slate-600  border-slate-300",
  DealerPool: "bg-blue-100   text-blue-700   border-blue-300",
  Allocated:  "bg-green-100  text-green-700  border-green-300",
  Inactive:   "bg-red-100    text-red-600    border-red-300",
};

const STATUS_TABS = ["All", "Stock", "DealerPool", "Allocated", "Inactive"];

// ── Small components ──────────────────────────────────────────────────────────

function StatusBadge({ value }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGE[value] ?? "bg-slate-100 text-slate-600 border-slate-300"}`}>
      {value === "DealerPool" ? "Dealer Pool" : value}
    </span>
  );
}

// allocation_status has no "Inactive" value — deactivation is tracked via is_active.
function displayStatus(device) {
  return device.is_active === false ? "Inactive" : device.allocation_status;
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-1">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value ?? "—"}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DeviceRegistry() {
  const user       = JSON.parse(localStorage.getItem("user") || "{}");
  const role       = user?.role;
  const isSuperadmin   = role === "superadmin";
  const isDealerAdmin  = role === "dealer_admin";
  const isProduction   = role === "production";
  const isCompanyAdmin = role === "company_admin";

  // ── State ─────────────────────────────────────────────────────────────────
  const [devices,   setDevices]   = useState([]);
  const [companies, setCompanies] = useState([]);
  const [dealers,   setDealers]   = useState([]);
  const [summary,   setSummary]   = useState(null);
  const [loading,   setLoading]   = useState(true);

  const [activeTab,      setActiveTab]      = useState("All");
  const [filterCompany,  setFilterCompany]  = useState("");
  const [filterDealer,   setFilterDealer]   = useState("");

  // Selected rows (serial_number strings)
  const [selected, setSelected] = useState(new Set());

  // Upload
  const [uploading,     setUploading]     = useState(false);
  const [uploadResult,  setUploadResult]  = useState(null);
  const fileInputRef = useRef();

  // Assign modal state
  const [assignModal,  setAssignModal]  = useState(null); // "dealer" | "company" | "allocate"
  const [assignTarget, setAssignTarget] = useState(null); // device id (for allocate)
  const [assignValue,  setAssignValue]  = useState("");
  const [assignBusy,   setAssignBusy]   = useState(false);
  const [assignError,  setAssignError]  = useState("");

  // Palmtec ID modal state
  const [palmtecModal, setPalmtecModal] = useState(null); // { device } | null
  const [palmtecValue, setPalmtecValue] = useState('');
  const [palmtecBusy,  setPalmtecBusy]  = useState(false);
  const [palmtecError, setPalmtecError] = useState('');

  // Aggregator TID modal state
  const [aggregatorModal, setAggregatorModal] = useState(null); // { device } | null
  const [aggregatorValue, setAggregatorValue] = useState('');
  const [aggregatorBusy,   setAggregatorBusy]   = useState(false);
  const [aggregatorError, setAggregatorError] = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // "Inactive" isn't an allocation_status value — filter client-side on is_active instead.
      if (activeTab !== "All" && activeTab !== "Inactive") params.set("status", activeTab);
      if (filterCompany) params.set("company", filterCompany);
      if (filterDealer)  params.set("dealer",  filterDealer);

      const reqs = [
        api.get(`${BASE_URL}/etm-devices?${params}`),
        api.get(`${BASE_URL}/etm-devices/summary`),
      ];
      if (isSuperadmin) {
        reqs.push(api.get(`${BASE_URL}/customer-data`));
        reqs.push(api.get(`${BASE_URL}/dealers`));
      }
      if (isDealerAdmin) {
        reqs.push(api.get(`${BASE_URL}/customer-data`));
      }

      const [devRes, sumRes, ...rest] = await Promise.all(reqs);
      let devs = devRes.data?.data ?? [];
      if (activeTab === "Inactive") devs = devs.filter(d => d.is_active === false);
      setDevices(devs);
      setSummary(sumRes.data?.data ?? null);
      if (isSuperadmin) {
        setCompanies(rest[0]?.data?.data ?? []);
        setDealers(rest[1]?.data?.data ?? []);
      }
      if (isDealerAdmin) {
        setCompanies(rest[0]?.data?.data ?? []);
      }
    } catch (err) {
      console.error("DeviceRegistry fetch:", err);
    } finally {
      setLoading(false);
      setSelected(new Set());
    }
  };

  useEffect(() => { fetchAll(); }, [activeTab, filterCompany, filterDealer]);

  // ── Template download ─────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Devices");
    ws.getColumn(1).width = 24;
    ws.mergeCells("A1:Z1");
    ws.getCell("A1").value = "Note: Enter the allocated serial number in the Serial Number column, with one serial number per row.";
    ws.getCell("A1").font = { italic: true, color: { argb: "FF808080" } };
    ws.getCell("A2").value = "serial_number";
    ws.getCell("A2").font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "device_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post(`${BASE_URL}/etm-devices/upload`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
      setUploadResult({ type: "success", ...res.data });
      fetchAll();
    } catch (err) {
      setUploadResult({ type: "error", message: err?.response?.data?.error || "Upload failed" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const visibleSerials = devices.map(d => d.serial_number);
  const allSelected    = visibleSerials.length > 0 && visibleSerials.every(s => selected.has(s));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleSerials));
  };
  const toggleOne = (serial) => {
    const next = new Set(selected);
    next.has(serial) ? next.delete(serial) : next.add(serial);
    setSelected(next);
  };

  // ── Assign actions ────────────────────────────────────────────────────────
  const openAssignDealer  = () => { setAssignModal("dealer");  setAssignValue(""); setAssignError(""); };
  const openAssignCompany = () => { setAssignModal("company"); setAssignValue(""); setAssignError(""); };
  const openAllocate      = (device) => { setAssignModal("allocate"); setAssignTarget(device); setAssignValue(""); setAssignError(""); };

  const handleAssignSubmit = async () => {
    if (!assignValue) { setAssignError("Please select a value"); return; }
    setAssignBusy(true);
    setAssignError("");
    try {
      if (assignModal === "dealer") {
        await api.post(`${BASE_URL}/etm-devices/bulk-assign-dealer`, {
          serial_numbers: [...selected],
          dealer_id: assignValue,
        });
      } else if (assignModal === "company") {
        await api.post(`${BASE_URL}/etm-devices/bulk-assign-company`, {
          serial_numbers: [...selected],
          company_id: assignValue,
        });
      } else if (assignModal === "allocate") {
        await api.post(`${BASE_URL}/etm-devices/${assignTarget.id}/allocate`, {
          company_id: assignValue,
        });
      }
      setAssignModal(null);
      fetchAll();
    } catch (err) {
      setAssignError(err?.response?.data?.error || "Action failed");
    } finally {
      setAssignBusy(false);
    }
  };

  const handleSetPalmtecId = async () => {
    if (!/^\d{5}$/.test(palmtecValue)) { setPalmtecError('Enter exactly 5 digits.'); return; }
    const val = parseInt(palmtecValue, 10);
    setPalmtecBusy(true);
    setPalmtecError('');
    try {
      await api.post(`${BASE_URL}/etm-devices/${palmtecModal.device.id}/set-palmtec-id`, { palmtec_id: val });
      setPalmtecModal(null);
      fetchAll();
    } catch (err) {
      setPalmtecError(err?.response?.data?.error || 'Failed to set Palmtec ID.');
    } finally { setPalmtecBusy(false); }
  };

  const handleSetAggregatorTid = async () => {
    const val = aggregatorValue.trim();
    if (!val) { setAggregatorError('Enter a Payment Aggregator TID.'); return; }
    setAggregatorBusy(true);
    setAggregatorError('');
    try {
      await api.post(`${BASE_URL}/etm-devices/${aggregatorModal.device.id}/set-aggregator-tid`, { aggregator_tid: val });
      setAggregatorModal(null);
      fetchAll();
    } catch (err) {
      setAggregatorError(err?.response?.data?.error || 'Failed to set Payment Aggregator TID.');
    } finally { setAggregatorBusy(false); }
  };

  const handleDeactivate = async (device) => {
    if (!window.confirm(`Deactivate device ${device.serial_number}? It stays mapped. Ticket/trip/schedule data will still be received, but setup (config) fetch will fail until reactivated.`)) return;
    try {
      await api.post(`${BASE_URL}/etm-devices/${device.id}/deactivate`);
      fetchAll();
    } catch (err) {
      alert(err?.response?.data?.error || "Deactivate failed");
    }
  };

  const handleReactivate = async (device) => {
    if (!window.confirm(`Reactivate device ${device.serial_number}? It stays at its current allocation.`)) return;
    try {
      await api.post(`${BASE_URL}/etm-devices/${device.id}/reactivate`);
      fetchAll();
    } catch (err) {
      alert(err?.response?.data?.error || "Reactivate failed");
    }
  };

  const handleUnmap = async (device) => {
    if (!window.confirm(`Unmap device ${device.serial_number} from ${device.company_name || "its company"}? It will return to the dealer pool or Stock.`)) return;
    try {
      await api.post(`${BASE_URL}/etm-devices/${device.id}/unmap`);
      fetchAll();
    } catch (err) {
      alert(err?.response?.data?.error || "Unmap failed");
    }
  };

  const handleReturnToStock = async (device) => {
    if (!window.confirm(`Return device ${device.serial_number} to Stock?`)) return;
    try {
      await api.post(`${BASE_URL}/etm-devices/${device.id}/return-to-stock`);
      fetchAll();
    } catch (err) {
      alert(err?.response?.data?.error || "Return to stock failed");
    }
  };

  const handleDelete = async (device) => {
    if (!window.confirm(`Permanently delete device ${device.serial_number}? This cannot be undone.`)) return;
    try {
      await api.delete(`${BASE_URL}/etm-devices/${device.id}/delete`);
      fetchAll();
    } catch (err) {
      alert(err?.response?.data?.error || "Delete failed");
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const by = summary?.by_status ?? {};
  const stockSelected = devices.filter(d => selected.has(d.serial_number) && d.allocation_status === "Stock");
  const canBulkDealer   = isSuperadmin && stockSelected.length > 0;
  const canBulkCompany  = isSuperadmin && stockSelected.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-10 min-h-screen bg-slate-50 space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">ETM Device Registry</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage device serial numbers and their allocation across dealers and companies.
          </p>
        </div>

        {/* Upload button — superadmin and production */}
        {(isSuperadmin || isProduction) && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
              >
                Download Template
              </button>
              <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? "Uploading…" : "Upload Excel"}
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
            <span className="text-[10px] text-slate-400">Column required: serial_number</span>
            <p className="text-xs text-slate-600 text-left bg-yellow-50 border border-yellow-200 rounded px-2 py-1 inline-block">
              Step 1: Download template and enter serial number in that template.<br />
              Step 2: Upload updated template to register serial number.
            </p>
          </div>
        )}
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${uploadResult.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {uploadResult.type === "success"
            ? `${uploadResult.created} device(s) added to stock. ${uploadResult.skipped} skipped (duplicates).`
            : uploadResult.message}
          <button className="ml-3 text-xs underline opacity-60" onClick={() => setUploadResult(null)}>dismiss</button>
        </div>
      )}

      {/* Summary cards, tabs, filters, bulk bar — hidden for production users */}
      {!isProduction && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total"       value={summary?.total} />
            <SummaryCard label="Stock"       value={by.Stock} />
            <SummaryCard label="Dealer Pool" value={by.DealerPool} />
            <SummaryCard label="Allocated"   value={by.Allocated} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-sm font-medium border-r last:border-r-0 border-slate-200 transition-colors ${activeTab === tab ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {tab === "DealerPool" ? "Dealer Pool" : tab}
                </button>
              ))}
            </div>

            {isSuperadmin && (
              <>
                <select
                  value={filterDealer}
                  onChange={e => setFilterDealer(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">All dealers</option>
                  {dealers.map(d => <option key={d.id} value={d.id}>{d.dealer_name}</option>)}
                </select>
                <select
                  value={filterCompany}
                  onChange={e => setFilterCompany(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">All companies</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </>
            )}

            <button onClick={fetchAll} className="ml-auto border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 bg-white hover:bg-slate-50 transition-colors">
              Refresh
            </button>
          </div>

          {(canBulkDealer || canBulkCompany) && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <span className="text-slate-400 text-xs">({stockSelected.length} Stock)</span>
              <div className="ml-auto flex gap-2">
                {canBulkDealer && (
                  <button onClick={openAssignDealer} className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium transition-colors">
                    Assign to Dealer
                  </button>
                )}
                {canBulkCompany && (
                  <button onClick={openAssignCompany} className="px-3 py-1 rounded-md bg-green-600 hover:bg-green-500 text-xs font-medium transition-colors">
                    Assign to Company
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-slate-50">
            <tr>
              {isSuperadmin && (
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </th>
              )}
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Serial Number</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Dealer</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Company</th>
              {isCompanyAdmin && (
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Palmtec ID</th>
              )}
              {isCompanyAdmin && (
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Payment Aggregator TID</th>
              )}
              {(isSuperadmin || isDealerAdmin) && (
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={["w-8","w-32","w-24","w-28","w-32","w-24"]} />
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={isSuperadmin ? 6 : 5} className="px-4 py-8 text-center text-slate-400">
                  No devices found
                </td>
              </tr>
            ) : devices.map(device => (
              <tr key={device.id} className="border-t border-slate-100 hover:bg-slate-50">
                {isSuperadmin && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(device.serial_number)}
                      onChange={() => toggleOne(device.serial_number)}
                      className="rounded"
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-xs text-slate-800 font-medium">{device.serial_number}</td>
                <td className="px-4 py-3"><StatusBadge value={displayStatus(device)} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">{device.dealer_name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 text-xs">{device.company_name ?? <span className="text-slate-300 italic">Unassigned</span>}</td>
                {isCompanyAdmin && (
                  <td className="px-4 py-3">
                    {device.allocation_status === "Allocated" ? (
                      device.palmtec_id ? (
                        <button
                          onClick={() => { setPalmtecModal({ device }); setPalmtecValue(String(device.palmtec_id)); setPalmtecError(''); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                        >
                          <span className="font-mono">{device.palmtec_id}</span>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      ) : (
                        <button
                          onClick={() => { setPalmtecModal({ device }); setPalmtecValue(''); setPalmtecError(''); }}
                          className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                          Set ID
                        </button>
                      )
                    ) : (
                      <span className="text-slate-300 text-xs italic">—</span>
                    )}
                  </td>
                )}
                {isCompanyAdmin && (
                  <td className="px-4 py-3">
                    {device.allocation_status === "Allocated" ? (
                      device.aggregator_tid ? (
                        <button
                          onClick={() => { setAggregatorModal({ device }); setAggregatorValue(device.aggregator_tid); setAggregatorError(''); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                        >
                          <span className="font-mono">{device.aggregator_tid}</span>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      ) : (
                        <button
                          onClick={() => { setAggregatorModal({ device }); setAggregatorValue(''); setAggregatorError(''); }}
                          className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                          Set TID
                        </button>
                      )
                    ) : (
                      <span className="text-slate-300 text-xs italic">—</span>
                    )}
                  </td>
                )}
                {(isSuperadmin || isDealerAdmin) && (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {/* Dealer can allocate active DealerPool devices */}
                      {isDealerAdmin && device.allocation_status === "DealerPool" && device.is_active && (
                        <button
                          onClick={() => openAllocate(device)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                        >
                          Allocate
                        </button>
                      )}
                      {/* Deactivate — Stock (superadmin only) or mapped devices (superadmin/dealer_admin, dealer_admin scoped to their own devices server-side) */}
                      {device.is_active && (
                        (isSuperadmin && device.allocation_status === "Stock") ||
                        ["DealerPool", "Allocated"].includes(device.allocation_status)
                      ) && (
                        <button
                          onClick={() => handleDeactivate(device)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          Deactivate
                        </button>
                      )}
                      {/* Reactivate — superadmin only, any inactive device, stays at current allocation */}
                      {isSuperadmin && device.is_active === false && (
                        <button
                          onClick={() => handleReactivate(device)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                        >
                          Reactivate
                        </button>
                      )}
                      {/* Unmap — inactive Allocated devices only */}
                      {device.allocation_status === "Allocated" && device.is_active === false && (
                        <button
                          onClick={() => handleUnmap(device)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                          Unmap
                        </button>
                      )}
                      {/* Return to Stock — inactive DealerPool devices only */}
                      {device.allocation_status === "DealerPool" && device.is_active === false && (
                        <button
                          onClick={() => handleReturnToStock(device)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200 transition-colors"
                        >
                          Return to Stock
                        </button>
                      )}
                      {/* Delete — superadmin only, Stock devices only */}
                      {isSuperadmin && device.allocation_status === "Stock" && (
                        <button
                          onClick={() => handleDelete(device)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-600 text-white border border-red-600 hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Palmtec ID Modal */}
      <Modal isOpen={!!palmtecModal} onClose={() => setPalmtecModal(null)}>
        <div className="space-y-4 w-full max-w-sm">
          <div>
            <h2 className="text-base font-bold text-slate-800">Set Palmtec ID</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{palmtecModal?.device?.serial_number}</p>
          </div>

          {palmtecError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{palmtecError}</p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Palmtec ID *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={palmtecValue}
              onChange={e => setPalmtecValue(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="Enter 5-digit ID"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setPalmtecModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSetPalmtecId}
              disabled={palmtecBusy}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {palmtecBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Aggregator TID Modal */}
      <Modal isOpen={!!aggregatorModal} onClose={() => setAggregatorModal(null)}>
        <div className="space-y-4 w-full max-w-sm">
          <div>
            <h2 className="text-base font-bold text-slate-800">Set Payment Aggregator TID</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{aggregatorModal?.device?.serial_number}</p>
          </div>

          {aggregatorError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{aggregatorError}</p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Aggregator Terminal ID *</label>
            <input
              type="text"
              value={aggregatorValue}
              onChange={e => setAggregatorValue(e.target.value)}
              placeholder="e.g. 99895611"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setAggregatorModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSetAggregatorTid}
              disabled={aggregatorBusy}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {aggregatorBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Assign / Allocate Modal */}
      <Modal isOpen={!!assignModal} onClose={() => setAssignModal(null)}>
        <div className="space-y-4 w-full max-w-sm">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {assignModal === "dealer"   && "Assign to Dealer"}
              {assignModal === "company"  && "Assign to Company"}
              {assignModal === "allocate" && "Allocate to Company"}
            </h2>
            {assignModal !== "allocate" && (
              <p className="text-xs text-slate-400 mt-0.5">{selected.size} device(s) selected</p>
            )}
            {assignModal === "allocate" && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{assignTarget?.serial_number}</p>
            )}
          </div>

          {assignError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{assignError}</p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {assignModal === "dealer" ? "Dealer" : "Company"} *
            </label>
            <select
              value={assignValue}
              onChange={e => setAssignValue(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">— Select —</option>
              {assignModal === "dealer"
                ? dealers.map(d => <option key={d.id} value={d.id}>{d.dealer_name}</option>)
                : companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)
              }
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setAssignModal(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignSubmit}
              disabled={assignBusy}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {assignBusy ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
