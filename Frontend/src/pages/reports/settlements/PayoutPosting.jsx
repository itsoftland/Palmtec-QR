import React, { useState, useEffect, useRef } from 'react';
import api, { BASE_URL } from '../../../assets/js/axiosConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/kpi-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw, AlertCircle, Eye,
  Banknote, CheckCircle2,
  IndianRupee, Receipt, ListChecks,
} from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];

function statusBadge(status) {
  const isSuccess = status === '1' || status?.toLowerCase() === 'success';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${isSuccess ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
      {isSuccess ? 'Success' : status}
    </span>
  );
}

export default function PayoutPosting() {
  const [payouts, setPayouts]               = useState([]);
  const [isRefreshing, setIsRefreshing]     = useState(false);
  const [error, setError]                   = useState(null);
  const [lastUpdated, setLastUpdated]       = useState(null);
  const [isPageVisible, setIsPageVisible]   = useState(true);
  const pollingRef                          = useRef(null);

  const [selectedPayout, setSelectedPayout] = useState(null);
  const [showModal, setShowModal]           = useState(false);

  const [filters, setFilters] = useState({ startDate: today(), endDate: today() });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: today(), endDate: today() });

  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;

  const hasPending =
    appliedFilters.startDate !== filters.startDate ||
    appliedFilters.endDate   !== filters.endDate;

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async (start, end, showLoader = true) => {
    if (showLoader) setIsRefreshing(true);
    setError(null);
    try {
      const res = await api.get(`${BASE_URL}/get_payout_data?from_date=${start}&to_date=${end}`);
      if (res.data.message === 'success') setPayouts(res.data.data || []);
      setLastUpdated(new Date());
    } catch {
      if (showLoader) setError('Failed to load payout data.');
    } finally {
      if (showLoader) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(filters.startDate, filters.endDate, true);
    const onVis = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (isPageVisible && appliedFilters.startDate) {
      pollingRef.current = setInterval(() => {
        fetchData(appliedFilters.startDate, appliedFilters.endDate, false);
      }, 30000);
    }
    return () => clearInterval(pollingRef.current);
  }, [isPageVisible, appliedFilters]);

  const applyFilters = () => {
    if (filters.endDate < filters.startDate) { alert('End date cannot be before start date'); return; }
    setAppliedFilters({ startDate: filters.startDate, endDate: filters.endDate });
    setCurrentPage(1);
    fetchData(filters.startDate, filters.endDate, true);
  };

  const resetFilters = () => {
    const t = today();
    setFilters({ startDate: t, endDate: t });
    setAppliedFilters({ startDate: t, endDate: t });
    fetchData(t, t, true);
    setCurrentPage(1);
  };

  // ── derived summary ────────────────────────────────────────────────────────
  const totalPayoutAmount = payouts.reduce((s, p) => s + parseFloat(p.payoutAmount || 0), 0);
  const totalTxnCount     = payouts.reduce((s, p) => s + (p.transaction_count || 0), 0);
  const successCount      = payouts.filter(p => p.payoutStatus === '1' || p.payoutStatus?.toLowerCase() === 'success').length;

  // ── pagination ─────────────────────────────────────────────────────────────
  const totalPages  = Math.ceil(payouts.length / PER_PAGE);
  const currentData = payouts.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  // ── time ago ───────────────────────────────────────────────────────────────
  const [timeAgo, setTimeAgo] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      if (!lastUpdated) return;
      const s = Math.floor((new Date() - lastUpdated) / 1000);
      if (s < 10) setTimeAgo('just now');
      else if (s < 60) setTimeAgo(`${s}s ago`);
      else setTimeAgo(`${Math.floor(s / 60)}m ago`);
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Total Payouts"
          value={payouts.length}
          subtitle={`${successCount} successful`}
          icon={Banknote}
          color="#6366f1"
          loading={isRefreshing && !payouts.length}
        />
        <KpiCard
          title="Total Amount Received"
          value={`₹${totalPayoutAmount.toFixed(2)}`}
          // value={`₹${(totalPayoutAmount / 100).toFixed(2)}`}
          subtitle="Across all payouts"
          icon={IndianRupee}
          color="#22c55e"
          loading={isRefreshing && !payouts.length}
        />
        <KpiCard
          title="Transactions Covered"
          value={totalTxnCount}
          subtitle="Across all payouts"
          icon={ListChecks}
          color="#f59e0b"
          loading={isRefreshing && !payouts.length}
        />
        <KpiCard
          title="Successful Payouts"
          value={successCount}
          subtitle={`${payouts.length - successCount} failed/pending`}
          icon={CheckCircle2}
          color="#10b981"
          loading={isRefreshing && !payouts.length}
        />
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4 md:p-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {hasPending && (
            <div className="mb-4 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Filters modified — click Apply to update
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Start Date</label>
              <Input type="date" max={today()} value={filters.startDate}
                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">End Date</label>
              <Input type="date" max={today()} value={filters.endDate}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <Button onClick={applyFilters} disabled={!filters.startDate || !filters.endDate}
              className={hasPending ? 'bg-blue-600 hover:bg-blue-700' : ''}>
              Apply
            </Button>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className={`w-2 h-2 rounded-full ${isRefreshing ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
              {lastUpdated ? (isPageVisible ? `Updated ${timeAgo}` : 'Paused (tab inactive)') : 'Not yet loaded'}
            </div>
            <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-4">
              Reset
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 relative">
          {isRefreshing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
              <RefreshCw size={22} className="animate-spin text-slate-500" />
            </div>
          )}
          <div className="px-4 py-3 border-b border-slate-100 text-xs text-slate-400">
            Showing {currentData.length} of {payouts.length} payouts
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Statement ID</th>
                  <th className="px-4 py-3 font-semibold">Payout Date</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">UTR Number</th>
                  <th className="px-4 py-3 font-semibold">Bank / Account</th>
                  <th className="px-4 py-3 font-semibold">Transactions</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isRefreshing && !currentData.length ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : currentData.length ? currentData.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.statementId}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(p.payoutDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">₹{parseFloat(p.payoutAmount).toFixed(2)}</td>
                    {/* <td className="px-4 py-3 font-bold text-slate-800">₹{parseFloat(p.payoutAmount / 100).toFixed(2)}</td> */}
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600">{p.utrNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{p.payoutBank}</div>
                      <div className="text-xs text-slate-400">•••{p.payoutAccount}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-slate-700">{p.transaction_count}</span>
                        <span className="text-xs text-slate-400">txns</span>
                        {p.verified_count > 0 && (
                          <span className="ml-1 text-xs text-green-600">({p.verified_count} verified)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{statusBadge(p.payoutStatus)}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedPayout(p); setShowModal(true); }}
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                        <Eye size={14} className="mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                      No payouts received for selected date range
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>Prev</Button>
              {[...Array(totalPages)].map((_, i) => {
                const n = i + 1;
                if (n !== 1 && n !== totalPages && (n < currentPage - 1 || n > currentPage + 1)) return null;
                if (n === currentPage - 2 || n === currentPage + 2) return <span key={n} className="text-slate-400 px-1">...</span>;
                return (
                  <Button key={n} variant={currentPage === n ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(n)}>
                    {n}
                  </Button>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout Detail Modal */}
      <Dialog open={showModal} onOpenChange={open => !open && setShowModal(false)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payout Details</DialogTitle>
          </DialogHeader>

          {selectedPayout && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Amount Received</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">₹{parseFloat(selectedPayout.payoutAmount).toFixed(2)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">UTR</span>
                    <span className="font-mono text-indigo-600">{selectedPayout.utrNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Bank</span>
                    <span className="font-medium">{selectedPayout.payoutBank}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Account</span>
                    <span className="font-medium">•••{selectedPayout.payoutAccount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Status</span>
                    {statusBadge(selectedPayout.payoutStatus)}
                  </div>
                </div>
              </div>

              {/* Transactions covered */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Receipt size={14} /> Transactions Covered ({selectedPayout.transaction_count})
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Transaction ID</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedPayout.transactions ?? []).map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">
                            {t.transactionId || t.transactionID}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">
                            ₹{parseFloat(t.amount).toFixed(2)/100}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deductions */}
              {selectedPayout.deductions?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Deductions ({selectedPayout.deductions.length})</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Charge</th>
                          <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          <th className="px-3 py-2 text-right font-semibold">GST</th>
                          <th className="px-3 py-2 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPayout.deductions.map((d, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-700">{d.charge_name || d.chargeName}</div>
                              <div className="text-xs text-slate-400">{d.charge_description || d.chargeDescription}</div>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">₹{d.charge_amount || d.chargeAmount}</td>
                            <td className="px-3 py-2 text-right text-slate-600">₹{d.charge_gst || d.chargeGst}</td>
                            <td className="px-3 py-2 text-right font-medium text-red-700">₹{d.final_charge_amount || d.payoutChargeAmount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                Statement ID: <span className="font-mono">{selectedPayout.statementId}</span>
                <span className="mx-2">·</span>
                Received: {new Date(selectedPayout.created_at).toLocaleString('en-IN')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
