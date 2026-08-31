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
  ShieldCheck, ShieldX, CheckCircle2, XCircle,
  Clock, IndianRupee, CreditCard, ReceiptText,
  Flag,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

function verificationBadge(status) {
  const map = {
    UNVERIFIED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    VERIFIED: 'bg-green-100  text-green-700  border-green-200',
    REJECTED: 'bg-red-100    text-red-700    border-red-200',
    FLAGGED: 'bg-orange-100 text-orange-700 border-orange-200',
    DISPUTED: 'bg-purple-100 text-purple-700 border-purple-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ') ?? 'UNKNOWN'}
    </span>
  );
}

function reconciliationBadge(status) {
  const map = {
    PENDING: 'bg-gray-100  text-gray-700',
    AUTO_MATCHED: 'bg-green-100 text-green-700',
    AMOUNT_MISMATCH: 'bg-red-100  text-red-700',
    NOT_FOUND: 'bg-orange-100 text-orange-700',
    DUPLICATE: 'bg-purple-100 text-purple-700',
    MANUAL_MATCH: 'bg-blue-100  text-blue-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ') ?? 'UNKNOWN'}
    </span>
  );
}

function payoutBadge(settlementBatchId) {
  if (settlementBatchId) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200 flex items-center gap-1 w-fit">
        <CheckCircle2 size={11} /> Paid Out
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1 w-fit">
      <Clock size={11} /> Pending Payout
    </span>
  );
}

function getPalmtecIDByTransactionID(txn) {
  return txn?.palmtecID || '—';
}

function getPalmtecSerialByTransactionID(txn) {
  return txn?.palmtecSerialNumber || '—';
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TransactionPosting() {
  const [settlements, setSettlements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const pollingRef = useRef(null);

  const [selectedTxn, setSelectedTxn] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filters, setFilters] = useState({
    startDate: today(), endDate: today(),
    verificationStatus: 'ALL',
    reconciliationStatus: 'ALL',
    paymentStatus: 'ALL',
  });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: today(), endDate: today() });

  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;

  const hasPending =
    appliedFilters.startDate !== filters.startDate ||
    appliedFilters.endDate !== filters.endDate;

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async (start, end, showLoader = true) => {
    if (showLoader) setIsRefreshing(true);
    setError(null);
    try {
      let url = `${BASE_URL}/get_settlement_data?from_date=${start}&to_date=${end}`;
      if (filters.verificationStatus !== 'ALL') url += `&verification_status=${filters.verificationStatus}`;
      if (filters.reconciliationStatus !== 'ALL') url += `&reconciliation_status=${filters.reconciliationStatus}`;
      if (filters.paymentStatus !== 'ALL') url += `&payment_status=${filters.paymentStatus}`;

      const [txnRes, sumRes] = await Promise.all([
        api.get(url),
        api.get(`${BASE_URL}/get_settlement_summary?from_date=${start}&to_date=${end}`),
      ]);

      console.log(txnRes);

      if (txnRes.data.message === 'success') setSettlements(txnRes.data.data || []);
      if (sumRes.data.message === 'success') setSummary(sumRes.data.data);
      setLastUpdated(new Date());
    } catch {
      if (showLoader) setError('Failed to load data.');
    } finally {
      if (showLoader) setIsRefreshing(false);
    }
  };

  // init + visibility
  useEffect(() => {
    fetchData(filters.startDate, filters.endDate, true);
    const onVis = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // polling
  useEffect(() => {
    if (isPageVisible && appliedFilters.startDate) {
      pollingRef.current = setInterval(() => {
        fetchData(appliedFilters.startDate, appliedFilters.endDate, false);
      }, 15000);
    }
    return () => clearInterval(pollingRef.current);
  }, [isPageVisible, appliedFilters, filters]);

  // ── verify action ──────────────────────────────────────────────────────────
  const handleVerify = async (newStatus) => {
    if (!selectedTxn) return;
    if (newStatus === 'VERIFIED' && selectedTxn.reconciliation_status === 'AMOUNT_MISMATCH' && !notes) {
      alert('Please add a note for Amount Mismatch verifications.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.post(`${BASE_URL}/verify_settlement`, {
        transaction_id: selectedTxn.id,
        verification_status: newStatus,
        verification_notes: notes,
      });
      if (res.data.message === 'Transaction verified successfully') {
        setSettlements(prev => prev.map(t => t.id === res.data.data.id ? res.data.data : t));
        fetchData(appliedFilters.startDate, appliedFilters.endDate, false);
        closeModal();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Verification failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openModal = (txn) => { setSelectedTxn(txn); setNotes(txn.verification_notes || ''); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setSelectedTxn(null); setNotes(''); };

  const applyFilters = () => {
    if (filters.endDate < filters.startDate) { alert('End date cannot be before start date'); return; }
    setAppliedFilters({ startDate: filters.startDate, endDate: filters.endDate });
    setCurrentPage(1);
    fetchData(filters.startDate, filters.endDate, true);
  };

  const resetFilters = () => {
    const t = today();
    const reset = { startDate: t, endDate: t, verificationStatus: 'ALL', reconciliationStatus: 'ALL', paymentStatus: 'ALL' };
    setFilters(reset);
    setAppliedFilters({ startDate: t, endDate: t });
    fetchData(t, t, true);
    setCurrentPage(1);
  };

  // ── pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(settlements.length / PER_PAGE);
  const currentData = settlements.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

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
          title="Pending Verification"
          value={summary?.verification_summary?.unverified ?? '—'}
          subtitle={summary ? `of ${summary.verification_summary.total} total` : ''}
          icon={Clock}
          color="#f59e0b"
          loading={isRefreshing && !summary}
        />
        <KpiCard
          title="Auto-Matched"
          value={summary?.reconciliation_summary?.auto_matched ?? '—'}
          subtitle="Ready for verification"
          icon={CheckCircle2}
          color="#22c55e"
          loading={isRefreshing && !summary}
        />
        <KpiCard
          title="Issues Found"
          value={summary ? (
            summary.reconciliation_summary.amount_mismatch +
            summary.reconciliation_summary.not_found +
            summary.reconciliation_summary.duplicate
          ) : '—'}
          subtitle="Needs attention"
          icon={AlertCircle}
          color="#ef4444"
          loading={isRefreshing && !summary}
        />
        <KpiCard
          title="Total Amount"
          value={summary ? `₹${summary.amount_summary.total_amount.toFixed(2)}` : '—'}
          subtitle={summary ? `₹${summary.amount_summary.verified_amount.toFixed(2)} verified` : ''}
          icon={IndianRupee}
          color="#6366f1"
          loading={isRefreshing && !summary}
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Verification</label>
              <select value={filters.verificationStatus}
                onChange={e => setFilters(f => ({ ...f, verificationStatus: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500 outline-none">
                <option value="ALL">All</option>
                <option value="UNVERIFIED">Unverified</option>
                <option value="VERIFIED">Verified</option>
                <option value="REJECTED">Rejected</option>
                <option value="FLAGGED">Flagged</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Reconciliation</label>
              <select value={filters.reconciliationStatus}
                onChange={e => setFilters(f => ({ ...f, reconciliationStatus: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500 outline-none">
                <option value="ALL">All</option>
                <option value="AUTO_MATCHED">Auto-Matched</option>
                <option value="AMOUNT_MISMATCH">Amount Mismatch</option>
                <option value="NOT_FOUND">Not Found</option>
                <option value="DUPLICATE">Duplicate</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Payment</label>
              <select value={filters.paymentStatus}
                onChange={e => setFilters(f => ({ ...f, paymentStatus: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500 outline-none">
                <option value="ALL">All</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <Button onClick={applyFilters} disabled={!filters.startDate || !filters.endDate}
                className={`h-10 px-6 ${hasPending ? 'bg-blue-600 hover:bg-blue-700' : ''}`}>
                Apply
              </Button>
            </div>
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
            Showing {currentData.length} of {settlements.length} transactions
          </div>
          <div className="overflow-x-auto">
            {/* <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Transaction ID</th>
                  <th className="px-4 py-3 font-semibold">Date / Time</th>
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold">Reconciliation</th>
                  <th className="px-4 py-3 font-semibold">Payout</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isRefreshing && !currentData.length ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(14)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : currentData.length ? currentData.map(txn => (
                  <tr key={txn.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{txn.transactionID}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{txn.formatted_transaction_date}</div>
                      <div className="text-xs text-slate-400">{txn.transaction_time}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{txn.invoiceNumber || '—'}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">₹{txn.transactionAmount}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${txn.payment_status_display === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {txn.payment_status_display}
                      </span>
                    </td>
                    <td className="px-4 py-3">{reconciliationBadge(txn.reconciliation_status)}</td>
                    <td className="px-4 py-3">{payoutBadge(txn.settlement_batch_id)}</td>
                    <td className="px-4 py-3">{verificationBadge(txn.verification_status)}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => openModal(txn)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                        <Eye size={14} className="mr-1" /> Review
                      </Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-slate-400 text-sm">
                      No transactions found for selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table> */}
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Sl.No</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Date & Time</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Palmtec sl.no</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Palmtec ID</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Ticket No</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Amount</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Invoice</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Transaction ID</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Application Number</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Reconciliation</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Payment</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Payout</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Verification</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isRefreshing && !currentData.length ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(14)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : currentData.length ? currentData.map((txn, index) => (
                  <tr key={txn.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{(currentPage - 1) * PER_PAGE + index + 1}</td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{txn.formatted_transaction_date}</div>
                      <div className="text-xs text-slate-400">{txn.transaction_time}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{getPalmtecSerialByTransactionID(txn)}</td>
                    <td className="px-4 py-3 text-slate-600">{getPalmtecIDByTransactionID(txn)}</td>
                    <td className="px-4 py-3 text-slate-600">{txn.related_ticket_number || 'N/A'}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">₹{txn.transactionAmount}</td>
                    <td className="px-4 py-3 text-slate-600">{txn.invoiceNumber || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{txn.transactionID}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{txn.tgTransactionId}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{reconciliationBadge(txn.reconciliation_status)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${txn.payment_status_display === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {txn.payment_status_display}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{payoutBadge(txn.settlement_batch_id)}</td>
                    <td className="px-4 py-3">{verificationBadge(txn.verification_status)}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => openModal(txn)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                        <Eye size={14} className="mr-1" /> Review
                      </Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-slate-400 text-sm">
                      No transactions found for selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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

      {/* Verification Modal */}
      <Dialog open={showModal} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="sm:max-w-2xl max-w-5xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Verification</DialogTitle>
          </DialogHeader>

          {selectedTxn && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Payment side */}
                <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/30">
                  <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2 pb-2 border-b border-blue-100">
                    <CreditCard size={15} className="text-blue-600" /> Payment (Payment Aggregator)
                  </h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Ticket Transaction ID</p>
                        <p className="text-sm font-mono mt-0.5">{selectedTxn.transactionID}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Application Transaction ID</p>
                        <p className="text-sm font-mono mt-0.5">{selectedTxn.tgTransactionId || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Invoice</p>
                        <p className="text-sm font-semibold text-blue-700 mt-0.5">{selectedTxn.invoiceNumber || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">BQR Merchant ID</p>
                        <p className="text-xs font-mono mt-0.5 break-all">{selectedTxn.narration || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-blue-100">
                      <p className="text-xs text-slate-400 uppercase tracking-wider">Paid Amount</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">₹{selectedTxn.transactionAmount}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Date</p>
                        <p className="text-sm mt-0.5">{selectedTxn.formatted_transaction_date}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Time</p>
                        <p className="text-sm mt-0.5">{selectedTxn.transaction_time}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Card</p>
                        <p className="text-sm mt-0.5">
                          {selectedTxn.cardType}{' '}
                          {selectedTxn.transactionCardNumber
                            ? `${selectedTxn.transactionCardNumber.slice(0, 3)} •••• ${selectedTxn.transactionCardNumber.slice(-4)}`
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Checksum</p>
                        <div className="mt-0.5">
                          {selectedTxn.is_checksum_valid
                            ? <span className="flex items-center gap-1 text-xs text-green-700"><ShieldCheck size={12} /> Valid</span>
                            : <span className="flex items-center gap-1 text-xs text-red-700"><ShieldX size={12} /> Tampered</span>}
                        </div>
                      </div>
                    </div>
                    {/* Payout status in modal */}
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Payout Status</p>
                      {selectedTxn.settlement_batch_id ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 space-y-1">
                          <div className="flex items-center gap-1 font-semibold"><CheckCircle2 size={12} /> Money received</div>
                          <div>Batch: <span className="font-mono">{selectedTxn.settlement_batch_id}</span></div>
                          {selectedTxn.settled_at && <div>Settled: {new Date(selectedTxn.settled_at).toLocaleDateString('en-IN')}</div>}
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={12} /> Awaiting payout from aggregator
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ticket side */}
                <div className="border border-green-200 rounded-xl p-5 bg-green-50/30">
                  <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2 pb-2 border-b border-green-100">
                    <ReceiptText size={15} className="text-green-600" /> Bus Ticket (System)
                  </h3>
                  {selectedTxn.related_ticket_number ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Ticket No</p>
                          <p className="text-sm font-semibold text-green-700 mt-0.5">{selectedTxn.related_ticket_number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Match Status</p>
                          <div className="mt-0.5">{reconciliationBadge(selectedTxn.reconciliation_status)}</div>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-green-100">
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Ticket Amount</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">₹{selectedTxn.related_ticket_amount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Ticket Date</p>
                        <p className="text-sm mt-0.5">{selectedTxn.related_ticket_date}</p>
                      </div>
                      {/* Amount comparison */}
                      {parseFloat(selectedTxn.transactionAmount) === parseFloat(selectedTxn.related_ticket_amount) ? (
                        <div className="flex items-center gap-2 p-3 bg-green-100 border border-green-200 rounded-lg text-green-800 text-sm font-semibold">
                          <CheckCircle2 size={16} /> Perfect Match
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 p-3 bg-red-100 border border-red-200 rounded-lg text-red-800 text-sm">
                          <XCircle size={16} className="mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold">Amount Mismatch</p>
                            <p className="text-xs opacity-75 mt-0.5">
                              Diff: ₹{(parseFloat(selectedTxn.transactionAmount) - parseFloat(selectedTxn.related_ticket_amount)).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-sm">
                      No ticket matched yet
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Manager Notes</label>
                <textarea
                  rows={2}
                  placeholder="Required for Rejection / Flagging..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-500 outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="text-xs text-slate-400">
                  {selectedTxn.verification_status !== 'UNVERIFIED' && (
                    <span>
                      Marked <strong>{selectedTxn.verification_status}</strong>
                      {selectedTxn.verified_by_username ? ` by ${selectedTxn.verified_by_username}` : ''}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleVerify('FLAGGED')} disabled={isSubmitting}
                    className="text-orange-600 border-orange-200 hover:bg-orange-50">
                    <Flag size={13} className="mr-1" /> Flag
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleVerify('REJECTED')} disabled={isSubmitting}
                    className="text-red-600 border-red-200 hover:bg-red-50">
                    <XCircle size={13} className="mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => handleVerify('VERIFIED')} disabled={isSubmitting}>
                    {isSubmitting
                      ? <RefreshCw size={13} className="animate-spin mr-1" />
                      : <CheckCircle2 size={13} className="mr-1" />}
                    Verify
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
