// ---------------------------------------------------------------
// ImportProgress — Step 3 (live view while import is running)
//
// Shows all 15 tables in processing order.
// As each table_done event arrives, the row fills in with counts.
// Current table has a spinner. Completed tables show check / warning.
// Transitions to ImportResults (in parent) when 'done' event arrives.
// ---------------------------------------------------------------

// Must match backend processor order exactly
const IMPORT_TABLES = [
  'BusType',
  'EmployeeType',
  'Currency',
  'Stage',
  'Employee',
  'Route',
  'RouteStage',
  'RouteBusType',
  'Fare',
  'VehicleType',
  'Settings',
  'ExpenseMaster',
  'Expense',
  'CrewAssignment',
  'InspectorDetails',
];

function Spinner() {
  return (
    <svg className="w-4 h-4 text-slate-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function PendingDot() {
  return (
    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
    </span>
  );
}

export default function ImportProgress({ tableProgress, importing, importError }) {
  // Build a lookup: table name → result object
  const resultByTable = {};
  for (const t of tableProgress) {
    resultByTable[t.table] = t;
  }

  // The table currently being processed is the one right after the last completed
  const currentIndex = tableProgress.length;

  const completedCount = tableProgress.length;
  const totalCount     = IMPORT_TABLES.length;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-slate-800">
          {importing ? 'Importing...' : importError ? 'Import stopped' : 'Processing complete'}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {completedCount} of {totalCount} tables done
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div
          className="bg-slate-800 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>

      {/* Per-table list */}
      <div className="space-y-0.5">
        {IMPORT_TABLES.map((tableName, index) => {
          const result    = resultByTable[tableName];
          const isDone    = !!result;
          const isCurrent = !isDone && index === currentIndex && importing;
          const isPending = !isDone && !isCurrent;

          const hasSkipped = isDone && result.skipped > 0;

          return (
            <div
              key={tableName}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                ${isDone    ? 'bg-slate-50'   : ''}
                ${isCurrent ? 'bg-slate-50 border border-slate-200' : ''}`}
            >
              {/* Status icon */}
              {isDone    && !hasSkipped && <CheckIcon />}
              {isDone    && hasSkipped  && <WarnIcon />}
              {isCurrent && <Spinner />}
              {isPending && <PendingDot />}

              {/* Table name */}
              <span className={`text-sm font-medium flex-1 ${isPending ? 'text-slate-400' : 'text-slate-700'}`}>
                {tableName}
              </span>

              {/* Counts — only shown when done */}
              {isDone && (
                <div className="flex items-center gap-3 text-xs">
                  {result.imported > 0 && (
                    <span className="text-emerald-600 font-medium">{result.imported} new</span>
                  )}
                  {result.existing > 0 && (
                    <span className="text-slate-500">{result.existing} existing</span>
                  )}
                  {result.skipped > 0 && (
                    <span className="text-amber-600 font-medium">{result.skipped} skipped</span>
                  )}
                  {result.imported === 0 && result.existing === 0 && result.skipped === 0 && (
                    <span className="text-slate-400">empty</span>
                  )}
                </div>
              )}

              {/* Processing label on current row */}
              {isCurrent && (
                <span className="text-xs text-slate-500">processing...</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Mid-stream fatal error */}
      {importError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm font-medium text-red-700">Import error</p>
          <p className="text-xs text-red-600 mt-0.5 font-mono">{importError}</p>
        </div>
      )}

    </div>
  );
}
