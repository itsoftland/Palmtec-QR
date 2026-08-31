// ---------------------------------------------------------------
// ConfigureStep — Step 2
// Responsible for: company select + import trigger
// ---------------------------------------------------------------

// The tables this import covers — purely informational for the user
// Maps MDB table name → Django model name
const TABLE_MAPPINGS = [
  { mdb: 'bustype',       model: 'BusType'       },
  { mdb: 'EMPLOYEETYPE',  model: 'EmployeeType'  },
  { mdb: 'CREW',          model: 'Employee'      },
  { mdb: 'STAGE',         model: 'Stage'         },
  { mdb: 'ROUTE',         model: 'Route'         },
  { mdb: 'VEHICLETYPE',   model: 'VehicleType'   },
  { mdb: 'EXPMASTER',     model: 'ExpenseMaster' },
  { mdb: 'EXPENSE',       model: 'Expense'       },
  { mdb: 'CREWDET',       model: 'CrewAssignment'},
  { mdb: 'SETTINGS',      model: 'Settings'      },
];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ConfigureStep({
  // File info (read-only display)
  selectedFile,

  // Company selection
  companies,
  loadingCompanies,
  selectedCompanyId,
  onCompanyChange,

  // Password
  isPasswordProtected,
  mdbPassword,
  onPasswordProtectedChange,
  onPasswordChange,

  // Actions
  onBack,
  onImport,
  importing,
  importError,
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Configure Import</h2>
        <p className="text-sm text-slate-500 mt-0.5">Select the company and provide file settings.</p>
      </div>

      {/* Selected file reminder (read-only, just for context) */}
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm text-slate-600 truncate">{selectedFile?.name}</span>
        <span className="text-xs text-slate-400 ml-auto flex-shrink-0">
          {selectedFile && formatFileSize(selectedFile.size)}
        </span>
      </div>

      {/* ---- Company Dropdown ---- */}
      {/*
        WHY this field exists:
        Every Django model (BusType, Employee, Route etc.) has a `company` FK.
        Without knowing which company, we can't save any record.
        So this is the most critical field in this step.
      */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          Company <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-slate-400">All imported records will be linked to this company.</p>
        <select
          value={selectedCompanyId}
          onChange={(e) => onCompanyChange(e.target.value)}
          disabled={loadingCompanies}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all bg-white disabled:bg-slate-50"
        >
          <option value="">
            {loadingCompanies ? 'Loading companies...' : '— Select a company —'}
          </option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}{c.company_id ? ` (${c.company_id})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Password Section ---- */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={isPasswordProtected}
            onChange={(e) => onPasswordProtectedChange(e.target.checked)}
            className="rounded border-slate-300 text-slate-800 focus:ring-slate-500"
          />
          File is password protected
        </label>
        {isPasswordProtected && (
          <input
            type="password"
            value={mdbPassword}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="MDB database password"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all"
          />
        )}
      </div>

      {/* ---- Tables info panel ---- */}
      {/* Informational only — shows user what will be imported */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Tables that will be imported</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TABLE_MAPPINGS.map((t) => (
            <div key={t.mdb} className="flex items-center gap-1.5 text-xs text-slate-600">
              <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd" />
              </svg>
              <span className="font-mono bg-white border border-slate-200 rounded px-1">{t.mdb}</span>
              <span className="text-slate-400">→</span>
              <span>{t.model}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Error from API */}
      {importError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-700">{importError}</p>
        </div>
      )}

      {/* Footer: Back + Import buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          disabled={importing}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onImport}
          disabled={importing || !selectedCompanyId}
          className="px-5 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
        >
          {importing ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Importing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Start Import
            </>
          )}
        </button>
      </div>
    </div>
  );
}