// ---------------------------------------------------------------
// ImportResults — Step 3
// Responsible ONLY for: displaying import summary, errors, table breakdown
// Receives result object from parent, calls onReset when user wants to restart
// ---------------------------------------------------------------

/*
  Expected shape of `result` prop (must match what your Django view returns):
  {
    imported: 150,          // total rows newly created
    existing: 20,           // total rows already in DB (re-import, no write)
    skipped: 5,             // total rows that failed / were skipped
    table_results: [        // per-table breakdown
      { table: "BusType", imported: 10, existing: 3, skipped: 0 },
      { table: "Employee", imported: 25, existing: 0, skipped: 2 },
      ...
    ],
    errors: [               // human-readable reasons for skipped rows
      "Row 3 CREW: EmployeeType 'XYZ' not found in DB",
      "Row 7 EXPENSE: Driver 'Unknown Name' not found",
      ...
    ]
  }
*/

export default function ImportResults({ result, onReset }) {
  const replaced = result.replaced ?? 0;
  const total = (result.imported ?? 0) + (result.existing ?? 0) + (result.skipped ?? 0);
  const hasReplaced = replaced > 0 || (result.table_results ?? []).some(t => (t.replaced ?? 0) > 0);
  const hasErrors = result.errors && result.errors.length > 0;
  const readErrorEntries = Object.entries(result.read_errors ?? {});
  const hasReadErrors = readErrorEntries.length > 0;
  const isFullSuccess = result.skipped === 0 && !hasReadErrors;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Import Results</h2>
        <p className="text-sm text-slate-500 mt-0.5">Here's a summary of what was imported.</p>
      </div>

      {/* ---- Status Banner ---- */}
      {/* Green = all rows imported, Amber = some skipped */}
      <div className={`rounded-xl p-4 flex items-start gap-4
        ${isFullSuccess
          ? 'bg-emerald-50 border border-emerald-200'
          : 'bg-amber-50 border border-amber-200'}`}
      >
        <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
          ${isFullSuccess ? 'bg-emerald-100' : 'bg-amber-100'}`}>
          {isFullSuccess ? (
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>
        <div>
          <p className={`font-semibold ${isFullSuccess ? 'text-emerald-800' : 'text-amber-800'}`}>
            {isFullSuccess ? 'Import completed successfully!' : 'Import completed with some issues'}
          </p>
          <p className={`text-sm mt-0.5 ${isFullSuccess ? 'text-emerald-600' : 'text-amber-600'}`}>
            {result.imported} new, {result.existing ?? 0} existing, {replaced} replaced, {result.skipped} skipped
          </p>
        </div>
      </div>

      {/* ---- Stats Grid ---- */}
      {/* 4 or 5-number summary depending on whether any table used full-refresh */}
      <div className={`grid gap-3 ${hasReplaced ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
          <p className="text-2xl font-bold text-slate-800">{total}</p>
          <p className="text-xs text-slate-500 mt-0.5">Total</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-200">
          <p className="text-2xl font-bold text-emerald-700">{result.imported}</p>
          <p className="text-xs text-emerald-600 mt-0.5">New</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
          <p className="text-2xl font-bold text-slate-700">{result.existing ?? 0}</p>
          <p className="text-xs text-slate-500 mt-0.5">Existing</p>
        </div>
        {hasReplaced && (
          <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
            <p className="text-2xl font-bold text-blue-700">{replaced}</p>
            <p className="text-xs text-blue-600 mt-0.5">Replaced</p>
          </div>
        )}
        <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
          <p className="text-2xl font-bold text-red-700">{result.skipped}</p>
          <p className="text-xs text-red-600 mt-0.5">Skipped</p>
        </div>
      </div>

      {/* ---- Table-by-table Breakdown ---- */}
      {/* Only shown if backend returned per-table data */}
      {result.table_results && result.table_results.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Breakdown by table</p>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Table</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">New</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Existing</th>
                  {hasReplaced && <th className="px-3 py-2 text-right font-medium text-blue-600">Replaced</th>}
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {result.table_results.map((t, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700 font-medium">{t.table}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{t.imported}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{t.existing ?? 0}</td>
                    {hasReplaced && (
                      <td className={`px-3 py-2 text-right ${(t.replaced ?? 0) > 0 ? 'text-blue-600 font-medium' : 'text-slate-300'}`}>
                        {t.replaced ?? 0}
                      </td>
                    )}
                    <td className={`px-3 py-2 text-right ${t.skipped > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {t.skipped}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Skipped Row Errors ---- */}
      {/* Shows each individual row failure reason from backend */}
      {hasErrors && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Skipped rows — reasons
            <span className="ml-2 text-xs font-normal text-slate-400">({result.errors.length} issues)</span>
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
            {result.errors.map((err, i) => (
              <p key={i} className="text-xs text-red-700 font-mono">{err}</p>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Fix these mismatches in the source file and re-import if needed.
          </p>
        </div>
      )}

      {/* ---- Table Read Errors ---- */}
      {/* Tables mdbtools could not read at all (not row-level failures) */}
      {hasReadErrors && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Tables not readable
            <span className="ml-2 text-xs font-normal text-slate-400">({readErrorEntries.length} table{readErrorEntries.length > 1 ? 's' : ''})</span>
          </p>
          <div className="rounded-lg border border-orange-200 bg-orange-50 overflow-hidden">
            {readErrorEntries.map(([table, errMsg]) => (
              <div key={table} className="px-3 py-2 border-b border-orange-100 last:border-b-0">
                <p className="text-xs font-semibold text-orange-800">{table}</p>
                <p className="text-xs text-orange-700 font-mono mt-0.5 break-all">{errMsg}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            These tables were skipped entirely. All rows from them are missing from this import.
          </p>
        </div>
      )}

      {/* ---- Reset Button ---- */}
      <button
        onClick={onReset}
        className="w-full py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
      >
        Import Another File
      </button>
    </div>
  );
}