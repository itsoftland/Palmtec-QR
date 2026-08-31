import { useState, useEffect } from 'react';
import Select from 'react-select';
import api, { BASE_URL } from '../../assets/js/axiosConfig';

export default function FareEditor() {

  // ── Section 1: State ────────────────────────────────────────────────────
  const [routes, setRoutes]           = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [stages, setStages]           = useState([]);
  const [fareType, setFareType]       = useState(null);  // 1 or 2
  const [fareTypeName, setFareTypeName] = useState('');
  
  // For Table Fare (1D)
  const [fareList, setFareList]       = useState([]);
  
  // For Graph Fare (2D)
  const [fareMatrix, setFareMatrix]   = useState([]);
  
  const [selectedOption, setSelectedOption] = useState(null);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [hasChanges, setHasChanges]   = useState(false);
  const routesLoaded = !routesLoading && !routesError;

  // ── Section 2: Fetch routes on mount ─────────────────────────────────────
  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    setRoutesLoading(true);
    setRoutesError(null);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/routes`);
      setRoutes(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching routes:', err);
      setRoutesError('Failed to load routes. Please retry.');
      setRoutes([]);
    } finally {
      setRoutesLoading(false);
    }
  };

  // ── Section 3: Load fare data when route is selected ─────────────────────
  const handleRouteSelect = async (option) => {
    const routeId = option?.value;
    if (!routeId) {
      setSelectedOption(null);
      setSelectedRoute(null);
      setStages([]);
      setFareList([]);
      setFareMatrix([]);
      setFareType(null);
      return;
    }

    setSelectedOption(option);
    setLoading(true);
    setHasChanges(false);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/fares/editor/${routeId}`);
      const { route, stages: stageList, fare_type_name, fare_list, fare_matrix } = res.data.data;
      
      setSelectedRoute(route);
      setStages(stageList);
      setFareType(route.fare_type);
      setFareTypeName(fare_type_name);
      
      if (route.fare_type === 1) {
        // Table Fare (1D)
        setFareList(fare_list || []);
      } else {
        // Graph Fare (2D)
        setFareMatrix(fare_matrix || []);
      }
    } catch (err) {
      console.error('Error loading fare data:', err);
      window.alert('Failed to load fare data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Section 4a: Update fare in 1D list (Table Fare) ──────────────────────
  const updateTableFare = (index, value) => {
    const updated = [...fareList];
    updated[index] = Number(value) || 0;
    setFareList(updated);
    setHasChanges(true);
  };

  // ── Section 4b: Update fare in 2D matrix (Graph Fare) ────────────────────
  const updateGraphFare = (rowIdx, colIdx, value) => {
    const updated = fareMatrix.map((row, i) =>
      i === rowIdx
        ? row.map((fare, j) => (j === colIdx ? Number(value) || 0 : fare))
        : row
    );
    setFareMatrix(updated);
    setHasChanges(true);
  };

  // ── Section 5: Save fare data ────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedRoute) return;

    setSaving(true);
    try {
      const payload = fareType === 1
        ? { fare_list: fareList }
        : { fare_matrix: fareMatrix };
      
      const res = await api.post(
        `${BASE_URL}/masterdata/fares/update/${selectedRoute.id}`,
        payload
      );
      
      window.alert(res.data.message || 'Fares saved successfully!');
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving fares:', err);
      if (!err.response) return window.alert('Server unreachable. Try later.');
      const { data } = err.response;
      const firstError = data.errors ? Object.values(data.errors)[0][0] : data.message;
      window.alert(firstError || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Section 6: Helper tools ──────────────────────────────────────────────
  const clearAllFares = () => {
    if (!window.confirm('Clear all fares? This will reset the entire table to zero.')) return;
    
    if (fareType === 1) {
      setFareList(fareList.map(() => 0));
    } else {
      setFareMatrix(fareMatrix.map(row => row.map(() => 0)));
    }
    setHasChanges(true);
  };

  const routeOptions = routes.map((route) => ({
    value: route.id,
    label: `${route.route_code} - ${route.route_name}`,
    meta: `Type ${route.fare_type} • Stops ${route.route_stages?.length || 0}`,
  }));

  // ── Section 7: Render ─────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-10 min-h-screen bg-slate-50 animate-fade-in">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Fare Editor</h1>
        <p className="text-slate-500 mt-1">Manage fare structure for routes</p>
      </div>

      {/* Route Selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
        {!routesLoading && routesError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm font-medium text-red-700">{routesError}</p>
              <button
                onClick={fetchRoutes}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
              >
                <i className="fas fa-rotate-right mr-2"></i>
                Retry
              </button>
            </div>
          </div>
        )}

        {!routesLoading && !routesError && routes.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
            <i className="fas fa-route text-2xl text-slate-400 mb-2"></i>
            <p className="text-sm font-medium text-slate-700">No routes available</p>
            <p className="text-xs text-slate-500 mt-1">Create a route first to edit fares.</p>
          </div>
        )}

        {(routesLoading || (routesLoaded && routes.length > 0)) && (
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select Route
              </label>
              <Select
                options={routeOptions}
                value={selectedOption}
                onChange={(option) => handleRouteSelect(option || null)}
                isSearchable
                isClearable
                isDisabled={routesLoading || loading}
                placeholder={routesLoading ? 'Loading routes...' : 'Search by route code or name...'}
                classNamePrefix="fare-route-select"
                formatOptionLabel={(option) => (
                  <div className="py-0.5">
                    <p className="text-sm text-slate-800 font-medium">{option.label}</p>
                    <p className="text-xs text-slate-500">{option.meta}</p>
                  </div>
                )}
              />
            </div>

            {selectedRoute && (
              <div className="flex gap-2">
                <button
                  onClick={clearAllFares}
                  className="px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <i className="fas fa-eraser mr-2"></i>
                  Clear All
                </button>
              </div>
            )}
          </div>
        )}

        {routesLoaded && selectedRoute && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3">
              <i className={`fas ${fareType === 1 ? 'fa-list-ol' : 'fa-th'} text-blue-600 mt-1`}></i>
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {fareTypeName} (Type {fareType})
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  <strong>Route:</strong> {selectedRoute.route_code} - {selectedRoute.route_name} |{' '}
                  <strong>Stops:</strong> {stages.length}
                </p>
                {fareType === 1 && (
                  <p className="text-xs text-blue-700 mt-2">
                    💡 <strong>Table Fare:</strong> Fare is based on the NUMBER of stages traveled, not specific origin/destination.
                  </p>
                )}
                {fareType === 2 && (
                  <p className="text-xs text-blue-700 mt-2">
                    💡 <strong>Graph Fare:</strong> Fare is based on SPECIFIC origin → destination stage pairs.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-6 py-4 border-b border-slate-100">
              <div className="h-4 w-32 bg-slate-200 rounded-full animate-pulse" />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-4 w-16 bg-slate-200 rounded-full animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && routesLoaded && routes.length > 0 && !selectedRoute && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <i className="fas fa-map-marked-alt text-6xl text-slate-300 mb-4"></i>
          <p className="text-slate-500 text-lg">Select a route to start editing fares</p>
        </div>
      )}

      {/* No Stops Warning */}
      {!loading && selectedRoute && stages.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <i className="fas fa-exclamation-triangle text-6xl text-amber-300 mb-4"></i>
          <p className="text-slate-700 text-lg font-medium">No stops defined for this route</p>
          <p className="text-slate-500 mt-2">Please add route stops before editing fares</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TABLE FARE EDITOR (fare_type=1, 1D List)                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!loading && selectedRoute && fareType === 1 && stages.length > 0 && (
        <>
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4 mb-6">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-green-600 mt-1"></i>
              <div className="flex-1 text-sm text-slate-700">
                <p className="font-medium text-slate-800 mb-1">Table Fare Mode:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>Each cell represents the fare for traveling <strong>N stages</strong></li>
                  <li>Example: If "3 Stages" = ₹30, any passenger traveling 3 stages pays ₹30</li>
                  <li>The system counts stages traveled, not specific origin/destination</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Stages Traveled
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    Fare Amount (₹)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fareList.map((fare, idx) => (
                  <tr key={idx} className={idx === 0 ? 'bg-slate-50' : 'hover:bg-slate-50 transition-colors'}>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">
                      {idx + 1} {idx + 1 === 1 ? 'Stage' : 'Stages'}
                      {idx === 0
                        ? <span className="ml-2 text-xs text-slate-400">(locked)</span>
                        : idx < stages.length && (
                          <span className="ml-2 text-xs text-slate-500">
                            (e.g., {stages[0].stage_name} → {stages[idx].stage_name})
                          </span>
                        )
                      }
                    </td>
                    <td className="px-6 py-4">
                      {idx === 0 ? (
                        <input
                          type="number"
                          value={0}
                          disabled
                          className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed"
                        />
                      ) : (
                        <input
                          type="number"
                          value={fare}
                          onChange={(e) => updateTableFare(idx, e.target.value)}
                          min="0"
                          step="1"
                          className="w-full max-w-xs px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

{!loading && selectedRoute && fareType === 2 && stages.length > 0 && (
  <>
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 mb-6">
      <div className="flex items-start gap-3">
        <i className="fas fa-info-circle text-blue-600 mt-1"></i>
        <div className="flex-1 text-sm text-slate-700">
          <p className="font-medium text-slate-800 mb-1">Graph Fare Mode:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Each cell = fare between a pair of stages (same in both directions)</li>
            <li>Row = destination stage, Column = origin stage</li>
            <li>Cells marked <strong>—</strong> are not applicable (same or later stage)</li>
          </ul>
        </div>
      </div>
    </div>

    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-800">
              <th className="sticky left-0 z-20 bg-slate-800 px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-slate-700">
                Stage
              </th>
              {stages.slice(0, stages.length - 1).map((stage, idx) => (
                <th key={idx} className="px-4 py-3 text-center text-xs font-semibold text-white tracking-wider min-w-[100px] border-r border-slate-700">
                  <div className="text-sm font-bold mb-1">{stage.stage_name}</div>
                  <div className="font-mono text-slate-400 text-[9px]">({stage.stage_code})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {fareMatrix.map((row, rIdx) => {
              const rowStage = stages[rIdx + 1]; // stage 2, 3, ..., N
              return (
                <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-10 bg-slate-100 px-4 py-3 text-sm border-r border-slate-300">
                    <div className="font-semibold text-slate-800">{rowStage?.stage_name}</div>
                    <div className="font-mono text-slate-500 text-[9px]">({rowStage?.stage_code})</div>
                  </td>
                  {stages.slice(0, stages.length - 1).map((_colStage, cIdx) => {
                    const isActive = cIdx <= rIdx;
                    return (
                      <td key={cIdx} className={`px-2 py-2 text-center border-r border-slate-200 ${!isActive ? 'bg-slate-100' : ''}`}>
                        {isActive ? (
                          <input
                            type="number"
                            value={row[cIdx] || 0}
                            onChange={(e) => updateGraphFare(rIdx, cIdx, e.target.value)}
                            min="0"
                            step="1"
                            className="w-full px-2 py-1.5 text-center border border-slate-300 bg-white rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                          />
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  </>
)}

      {/* Save Button */}
      {!loading && selectedRoute && stages.length > 0 && (
        <div className="mt-6 flex items-center justify-between bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                <i className="fas fa-exclamation-circle mr-1"></i>
                Unsaved changes
              </span>
            )}
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Saving...
              </>
            ) : (
              <>
                <i className="fas fa-save mr-2"></i>
                Save Fares
              </>
            )}
          </button>
        </div>
      )}

    </div>
  );
}
