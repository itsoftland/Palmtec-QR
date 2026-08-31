import { useState, useEffect } from 'react';
import Select from 'react-select';
import { Layers, Save, CheckCircle2, AlertCircle, Route } from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import api, { BASE_URL } from '../../assets/js/axiosConfig';

export default function StageEditor() {

  // ── Section 1: State ────────────────────────────────────────────────────────
  const [routes, setRoutes]             = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedRoute, setSelectedRoute]   = useState(null);
  const [stageRows, setStageRows]       = useState([]);  // [{id, sequence_no, stage_name, distance, saving, saved, error}]
  const [routesLoading, setRoutesLoading]   = useState(true);
  const [routesError, setRoutesError]       = useState(null);
  const [stagesLoading, setStagesLoading]   = useState(false);

  // ── Section 2: Fetch routes on mount ────────────────────────────────────────
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

  // ── Section 3: Load stages when route is selected ───────────────────────────
  const handleRouteSelect = (option) => {
    if (!option) {
      setSelectedOption(null);
      setSelectedRoute(null);
      setStageRows([]);
      return;
    }

    setSelectedOption(option);
    const route = routes.find(r => r.id === option.value);
    setSelectedRoute(route || null);

    // Populate stage rows from route_stages
    const stages = (route?.route_stages || []).map(s => ({
      id:          s.id,
      sequence_no: s.sequence_no,
      stage_name:  s.stage_name,
      distance:    s.distance ?? '',
      saving:      false,
      saved:       false,
      error:       null,
    }));
    stages.sort((a, b) => a.sequence_no - b.sequence_no);
    setStageRows(stages);
  };

  // ── Section 4: In-table edit handlers ───────────────────────────────────────
  const handleFieldChange = (index, field, value) => {
    setStageRows(prev => prev.map((row, i) =>
      i === index ? { ...row, [field]: value, saved: false, error: null } : row
    ));
  };

  const handleSaveRow = async (index) => {
    const row = stageRows[index];
    if (!row.stage_name.trim()) {
      setStageRows(prev => prev.map((r, i) =>
        i === index ? { ...r, error: 'Stage name is required' } : r
      ));
      return;
    }

    setStageRows(prev => prev.map((r, i) =>
      i === index ? { ...r, saving: true, error: null } : r
    ));

    try {
      await api.put(`${BASE_URL}/masterdata/routestages/update/${row.id}`, {
        stage_name: row.stage_name.trim(),
        distance:   row.distance !== '' ? Number(row.distance) : null,
      });

      setStageRows(prev => prev.map((r, i) =>
        i === index ? { ...r, saving: false, saved: true } : r
      ));

      // Auto-clear saved indicator after 2 seconds
      setTimeout(() => {
        setStageRows(prev => prev.map((r, i) =>
          i === index ? { ...r, saved: false } : r
        ));
      }, 2000);

    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed';
      setStageRows(prev => prev.map((r, i) =>
        i === index ? { ...r, saving: false, error: msg } : r
      ));
    }
  };

  // ── Section 5: Derived / helpers ────────────────────────────────────────────
  const routeOptions = routes.map(r => ({
    value: r.id,
    label: `${r.route_code} — ${r.route_name}`,
  }));

  const routesLoaded = !routesLoading && !routesError;

  // ── Section 6: Render ────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-5 lg:p-7 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900">
            <Layers size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Stage Editor</h1>
            <p className="text-slate-500 text-sm mt-0.5">Edit stage names and distances for existing routes</p>
          </div>
        </div>
      </div>

      {/* Route selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Route size={15} className="text-slate-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-700">Select Route</span>
        </div>

        {routesLoading ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : routesError ? (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle size={15} />
            <span>{routesError}</span>
            <button
              onClick={fetchRoutes}
              className="ml-2 underline hover:no-underline text-red-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <Select
            options={routeOptions}
            value={selectedOption}
            onChange={handleRouteSelect}
            isClearable
            placeholder="Search or select a route..."
            classNamePrefix="rs"
            styles={{
              control: (base, state) => ({
                ...base,
                borderColor: state.isFocused ? '#1e293b' : '#e2e8f0',
                boxShadow: state.isFocused ? '0 0 0 2px #1e293b' : base.boxShadow,
                borderRadius: '0.5rem',
                minHeight: '40px',
                fontSize: '14px',
              }),
              option: (base, state) => ({
                ...base,
                backgroundColor: state.isSelected ? '#1e293b' : state.isFocused ? '#f1f5f9' : 'white',
                color: state.isSelected ? 'white' : '#334155',
                fontSize: '14px',
              }),
            }}
          />
        )}

        {/* Route info bar */}
        {selectedRoute && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className="bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-100 font-mono text-xs">
              {selectedRoute.route_code}
            </Badge>
            <Badge className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50 text-xs">
              {stageRows.length} stage{stageRows.length !== 1 ? 's' : ''}
            </Badge>
            <Badge className="bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-50 text-xs">
              {selectedRoute.fare_type_display ?? (selectedRoute.fare_type == 1 ? 'TABLE' : selectedRoute.fare_type == 2 ? 'GRAPH' : '—')}
            </Badge>
          </div>
        )}
      </div>

      {/* Stages table */}
      {selectedRoute ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Stages</span>
            <span className="text-xs text-slate-400">
              Click Save on any row to commit changes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Seq</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage Name</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">Distance (km)</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stageRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">
                      This route has no stages configured.
                    </td>
                  </tr>
                ) : stageRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono text-slate-500 text-xs font-semibold">{row.sequence_no}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-1">
                        <Input
                          value={row.stage_name}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11);
                            handleFieldChange(idx, 'stage_name', val);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRow(idx)}
                          className="h-8 text-sm"
                          placeholder="Stage name"
                        />
                        {row.error && (
                          <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle size={11} />
                            {row.error}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.distance}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '').slice(0, 11);
                          handleFieldChange(idx, 'distance', val);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRow(idx)}
                        className="h-8 text-sm w-28"
                        placeholder="0.0"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        {row.saved ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 size={14} />
                            Saved
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleSaveRow(idx)}
                            disabled={row.saving}
                            className="h-7 px-3 text-xs bg-slate-900 hover:bg-slate-700 text-white gap-1"
                          >
                            {row.saving ? (
                              <>
                                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                Saving
                              </>
                            ) : (
                              <>
                                <Save size={12} />
                                Save
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : routesLoaded && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 mb-4">
            <Layers size={22} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">Select a route to edit its stages</p>
          <p className="text-slate-400 text-sm mt-1">Choose a route from the dropdown above</p>
        </div>
      )}

    </div>
  );
}
