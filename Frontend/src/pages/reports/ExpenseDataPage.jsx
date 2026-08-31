import { useState } from 'react';
import { Receipt, Search, Calendar } from 'lucide-react';
import { useFilteredList } from '../../assets/js/useFilteredList';
import { usePagination }   from '../../assets/js/usePagination';
import api, { BASE_URL }   from '../../assets/js/axiosConfig';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const today = new Date().toISOString().slice(0, 10);
const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

export default function ExpenseDataPage() {
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [fetched, setFetched]   = useState(false);
  const [fromDate, setFromDate] = useState(oneWeekAgo);
  const [toDate, setToDate]     = useState(today);
  const [error, setError]       = useState('');

  const { filteredItems, searchTerm, setSearchTerm } = useFilteredList(
    records,
    ['expense_code', 'expense_name', 'driver_name', 'bus_number', 'palmtec_id', 'receipt_no']
  );

  const {
    currentItems, currentPage, totalPages,
    setCurrentPage, indexOfFirstItem, indexOfLastItem, getPageNumbers,
  } = usePagination(filteredItems, 20);

  const fetchRecords = async () => {
    if (!fromDate || !toDate) { setError('Both dates required.'); return; }
    if (fromDate > toDate) { setError('From date must be before to date.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`${BASE_URL}/masterdata/expenses`, {
        params: { from_date: fromDate, to_date: toDate },
      });
      setRecords(res.data?.data || []);
      setCurrentPage(1);
      setFetched(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load records.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (t) => t ? t.slice(0, 5) : '—';
  const formatAmt  = (v) => v != null ? `₹${parseFloat(v).toFixed(2)}` : '—';

  return (
    <div className="p-3 sm:p-5 lg:p-7 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-slate-900">
          <Receipt size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Expense Records</h1>
          <p className="text-slate-500 text-sm mt-0.5">Trip expense transactions recorded by ETM devices</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-slate-600">From Date</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                className="pl-8"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1 flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-slate-600">To Date</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                className="pl-8"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={fetchRecords} disabled={loading} className="shrink-0">
            {loading ? 'Loading…' : 'Fetch Records'}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      {/* Search */}
      {fetched && (
        <div className="relative mb-4 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search expense, driver, bus…"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>
      )}

      {/* Table */}
      {(fetched || loading) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Expense</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Driver</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bus</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Schedule</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400 text-sm">
                      {searchTerm
                        ? 'No results for your search.'
                        : 'No expense records found for this date range.'}
                    </td>
                  </tr>
                ) : (
                  currentItems.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-slate-800">{r.expense_name || '—'}</p>
                        {r.expense_code && (
                          <p className="text-xs text-slate-400 font-mono">{r.expense_code}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800">{formatAmt(r.expense_amount)}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{r.date}</td>
                      <td className="px-5 py-3 text-sm text-slate-700 font-mono">{formatTime(r.time)}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{r.driver_name || '—'}</td>
                      <td className="px-5 py-3 text-sm font-mono text-slate-600">{r.bus_number || '—'}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{r.schedule_no ?? '—'}</td>
                      <td className="px-5 py-3 text-xs font-mono text-slate-500">{r.palmtec_id || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination + count */}
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>
              {loading ? '' : `${filteredItems.length} record${filteredItems.length !== 1 ? 's' : ''}`}
              {totalPages > 1 && !loading && ` — showing ${indexOfFirstItem + 1}–${Math.min(indexOfLastItem, filteredItems.length)}`}
            </span>
            {totalPages > 1 && (
              <div className="flex gap-1">
                {getPageNumbers().map((p, i) =>
                  p === '...' ? (
                    <span key={i} className="px-2 py-1">…</span>
                  ) : (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        p === currentPage ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!fetched && !loading && (
        <div className="text-center py-16 text-slate-400">
          <Receipt size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Select a date range and click Fetch Records.</p>
        </div>
      )}
    </div>
  );
}
