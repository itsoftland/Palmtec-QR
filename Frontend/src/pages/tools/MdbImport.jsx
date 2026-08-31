import { useState, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { Database } from 'lucide-react';

// Components — each handles one step's UI only
import FileUploadStep   from '../../components/FileUploadStep';
import ConfigureStep    from '../../components/ConfigureStep';
import ImportProgress   from '../../components/ImportProgress';
import ImportResults    from '../../components/ImportResults';

const IMPORT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------
// MdbImport — Main Page
//
// This file owns ALL state and ALL API calls.
// It passes data down to child components via props.
// Child components call back up via callback props (onXxx).
//
// Steps:
//   1 → FileUploadStep   — user picks .mdb file
//   2 → ConfigureStep    — user picks company + optional password
//   3 → ImportProgress   — live per-table progress (while importing)
//   3 → ImportResults    — final summary (once done event arrives)
//
// Streaming approach:
//   axios onDownloadProgress + responseType:'text'
//   XHR accumulates responseText as chunks arrive.
//   We parse SSE lines ("data: {...}") from each new chunk.
//   This keeps the full axios instance (interceptors, withCredentials, baseURL).
// ---------------------------------------------------------------

// ---- Small shared UI: Step indicator at the top ----
function StepBadge({ number, label, active, done }) {
  return (
    <div className={`flex items-center gap-2 transition-opacity ${active ? 'opacity-100' : done ? 'opacity-60' : 'opacity-30'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
        ${done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'}`}>
        {done ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : number}
      </div>
      <span className={`text-sm font-medium hidden md:block ${active ? 'text-slate-800' : 'text-slate-500'}`}>
        {label}
      </span>
    </div>
  );
}

function StepDivider() {
  return <div className="flex-1 h-px bg-slate-200 mx-2 hidden md:block" />;
}

// ================================================================

export default function MdbImport() {

  // ---- Step tracking ----
  // 1 = file upload, 2 = configure, 3 = progress/results
  const [step, setStep] = useState(1);

  // ---- Step 1 state ----
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging]     = useState(false);

  // ---- Step 2 state ----
  const [companies, setCompanies]                     = useState([]);
  const [loadingCompanies, setLoadingCompanies]       = useState(false);
  const [selectedCompanyId, setSelectedCompanyId]     = useState('');
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [mdbPassword, setMdbPassword]                 = useState('');

  // ---- Import / Step 3 state ----
  const [importing, setImporting]         = useState(false);
  const [importResult, setImportResult]   = useState(null);  // set on 'done' event
  const [importError, setImportError]     = useState('');
  const [tableProgress, setTableProgress] = useState([]);    // grows as tables complete

  // Ref to read latest tableProgress inside the onDownloadProgress closure
  // (avoids stale closure when building the final importResult)
  const tableProgressRef = useRef([]);

  // Block in-app (React Router) navigation while import is running
  const blocker = useBlocker(importing);


  // ==================== EFFECTS ====================

  // Fetch companies once on mount so the dropdown is ready when user reaches step 2
  useEffect(() => {
    fetchCompanies();
  }, []);

  // Warn user if they try to leave/reload while an import is in progress
  useEffect(() => {
    if (!importing) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Import is in progress. Leaving now will cancel the import.';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [importing]);

  const fetchCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const response = await api.get(`${BASE_URL}/customer-data`);
      setCompanies(response.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    } finally {
      setLoadingCompanies(false);
    }
  };


  // ==================== STEP 1 HANDLERS ====================

  const handleFileSelect = (file) => setSelectedFile(file);
  const handleFileRemove = () => setSelectedFile(null);

  const handleProceedToConfig = () => {
    if (selectedFile) setStep(2);
  };


  // ==================== STEP 2 HANDLERS ====================

  const handleCompanyChange = (id) => setSelectedCompanyId(id);

  const handlePasswordProtectedChange = (checked) => {
    setIsPasswordProtected(checked);
    if (!checked) setMdbPassword('');
  };

  const handlePasswordChange = (val) => setMdbPassword(val);

  const handleBackToUpload = () => {
    setStep(1);
    setImportError('');
  };


  // ==================== IMPORT (API CALL) ====================

  const handleImport = async () => {
    if (!selectedFile)      return window.alert('No file selected.');
    if (!selectedCompanyId) return window.alert('Please select a company.');
    if (isPasswordProtected && !mdbPassword.trim()) return window.alert('Please enter the MDB password.');

    setImporting(true);
    setImportError('');
    setTableProgress([]);
    tableProgressRef.current = [];

    /*
      FormData is used here because we're sending a FILE + text fields together.
      JSON cannot carry binary file data.
      Do NOT set Content-Type manually — axios sets multipart/form-data automatically.
    */
    const formData = new FormData();
    formData.append('mdb_file',   selectedFile);
    formData.append('company_id', selectedCompanyId);
    if (isPasswordProtected && mdbPassword.trim()) {
      formData.append('password', mdbPassword.trim());
    }

    /*
      Streaming approach: axios + responseType:'text' + onDownloadProgress

      XHR (used by axios in browsers) accumulates responseText as chunks arrive.
      onDownloadProgress fires each time a new chunk lands.
      We slice off only the new bytes, parse complete SSE lines ("data: {...}"),
      and update state incrementally — no fetch, no EventSource needed.

      The existing axios instance is used as-is:
        - withCredentials: true  → cookies sent automatically
        - 401 interceptor        → fires if session expires before stream starts,
                                   auto-refreshes token and retries the import
        - baseURL / timeout      → inherited from instance

      streamStarted flag: we only move to step 3 after the first chunk arrives.
      This way, pre-stream validation errors (400/401) stay on step 2 and show
      normally through the catch block — the user never sees a blank progress screen.
    */
    let processedLength = 0;
    let streamStarted   = false;

    try {
      await api.post(`${BASE_URL}/import-mdb`, formData, {
        headers: { 'Content-Type': undefined },
        timeout: IMPORT_TIMEOUT_MS,
        responseType: 'text',

        onDownloadProgress: (progressEvent) => {
          // Move to progress view on first chunk (confirms streaming has started)
          if (!streamStarted) {
            streamStarted = true;
            setStep(3);
          }

          // Slice only the new bytes from the accumulated responseText
          const fullText = progressEvent.event.target.responseText;
          const newChunk = fullText.slice(processedLength);
          processedLength = fullText.length;

          // Parse each complete SSE line in the new chunk
          for (const line of newChunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === 'table_done') {
                // Accumulate via ref (avoids stale closure) + sync to state for render
                tableProgressRef.current = [...tableProgressRef.current, event];
                setTableProgress([...tableProgressRef.current]);

              } else if (event.type === 'done') {
                // Build the final result object for ImportResults
                // using ref for table_results to get the latest accumulated list
                setImportResult({
                  imported:      event.total_imported,
                  existing:      event.total_existing,
                  skipped:       event.total_skipped,
                  replaced:      event.total_replaced ?? 0,
                  table_results: tableProgressRef.current,
                  errors:        event.errors,
                  read_errors:   event.read_errors,
                });

              } else if (event.type === 'error') {
                // Fatal backend error mid-stream
                setImportError(event.message);
              }

            } catch (_) {
              // Incomplete JSON chunk — next onDownloadProgress will have the rest
            }
          }
        },
      });

    } catch (err) {
      // err.response exists when server replied with 4xx/5xx before streaming
      // err.response is undefined on network errors, CORS failures, or timeouts
      const responseData = err.response?.data;

      let errorMessage = 'Import failed. Please try again.';

      if (err.code === 'ECONNABORTED') {
        errorMessage = 'Import timed out. The file is large or server is busy. Please retry and check backend logs.';
      } else if (responseData) {
        if (typeof responseData === 'object') {
          errorMessage = responseData.message || responseData.error || responseData.detail || JSON.stringify(responseData);
        } else if (typeof responseData === 'string' && !responseData.startsWith('<')) {
          errorMessage = responseData;
        } else {
          errorMessage = `Server error (${err.response.status}). Check Django logs for details.`;
        }
      } else if (err.message) {
        errorMessage = `Network error: ${err.message}`;
      }

      setImportError(errorMessage);

      // If streaming hadn't started yet, stay on step 2 so the error shows inline
      // If it had started, step 3 is already showing — error displayed there
      if (!streamStarted) {
        // step remains 2, error shows in ConfigureStep
      }

    } finally {
      setImporting(false);
    }
  };


  // ==================== RESET ====================

  // Called from ImportResults when user clicks "Import Another File"
  const handleReset = () => {
    setStep(1);
    setSelectedFile(null);
    setSelectedCompanyId('');
    setIsPasswordProtected(false);
    setMdbPassword('');
    setImportResult(null);
    setImportError('');
    setTableProgress([]);
    tableProgressRef.current = [];
  };


  // ==================== RENDER ====================

  return (
    <div className="p-6 md:p-10 min-h-screen bg-slate-50 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* Page Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-2.5 rounded-xl bg-slate-900 text-white shadow">
            <Database size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Import MDB Data</h1>
            <p className="text-sm text-slate-500 mt-0.5">Upload a Microsoft Access (.mdb) file to import data into the system.</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center mb-8 px-2">
          <StepBadge number="1" label="Select File" active={step === 1} done={step > 1} />
          <StepDivider />
          <StepBadge number="2" label="Configure"   active={step === 2} done={step > 2} />
          <StepDivider />
          <StepBadge number="3" label="Results"     active={step === 3} done={false} />
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

          {/* Step 1 */}
          {step === 1 && (
            <FileUploadStep
              selectedFile={selectedFile}
              isDragging={isDragging}
              onFileSelect={handleFileSelect}
              onFileRemove={handleFileRemove}
              onDragChange={setIsDragging}
              onContinue={handleProceedToConfig}
            />
          )}

          {/* Step 2 */}
          {step === 2 && (
            <ConfigureStep
              selectedFile={selectedFile}
              companies={companies}
              loadingCompanies={loadingCompanies}
              selectedCompanyId={selectedCompanyId}
              onCompanyChange={handleCompanyChange}
              isPasswordProtected={isPasswordProtected}
              mdbPassword={mdbPassword}
              onPasswordProtectedChange={handlePasswordProtectedChange}
              onPasswordChange={handlePasswordChange}
              onBack={handleBackToUpload}
              onImport={handleImport}
              importing={importing}
              importError={importError}
            />
          )}

          {/* Step 3a — live progress while import is running or stream errored */}
          {step === 3 && !importResult && (
            <ImportProgress
              tableProgress={tableProgress}
              importing={importing}
              importError={importError}
            />
          )}

          {/* Step 3b — final results after 'done' event */}
          {step === 3 && importResult && (
            <ImportResults
              result={importResult}
              onReset={handleReset}
            />
          )}

        </div>

        <p className="text-xs text-slate-400 text-center mt-5">
          Only Microsoft Access .mdb files are supported.
        </p>
      </div>

      {/* Navigation-block confirmation modal */}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Import in progress</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Leaving this page will cancel the ongoing import. Are you sure you want to leave?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => blocker.reset()}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Stay
              </button>
              <button
                onClick={() => blocker.proceed()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
