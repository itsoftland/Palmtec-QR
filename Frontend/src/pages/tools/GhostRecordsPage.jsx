import React, { useState, useEffect, useCallback } from 'react';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Ghost, Building2, CheckCircle, AlertTriangle } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ─── Inline assign form per row ───────────────────────────────────────────────
function AssignCell({ type, id, onAssigned }) {
  const [open, setOpen]       = useState(false);
  const [companyId, setVal]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const submit = async () => {
    const cid = parseInt(companyId, 10);
    if (!cid || isNaN(cid)) { setErr('Enter a valid Company ID'); return; }
    setSaving(true);
    setErr('');
    try {
      await api.post(`${BASE_URL}/ghost-assign-company`, { type, id, company_id: cid });
      onAssigned(id);
    } catch (e) {
      setErr(e.response?.data?.error || 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setOpen(true)}>
        <Building2 size={12} className="mr-1" /> Assign
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-[220px]">
      <Input
        className="h-7 text-xs w-28"
        placeholder="Company ID"
        value={companyId}
        onChange={e => { setVal(e.target.value); setErr(''); }}
        onKeyDown={e => e.key === 'Enter' && submit()}
        autoFocus
      />
      <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={saving}>
        {saving ? '…' : <CheckCircle size={12} />}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpen(false); setErr(''); }}>
        ✕
      </Button>
      {err && <span className="text-red-500 text-[10px]">{err}</span>}
    </div>
  );
}

// ─── Transactions tab ─────────────────────────────────────────────────────────
function GhostTransactions() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`${BASE_URL}/ghost-transactions`);
      setRows(res.data?.data ?? []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = (id) => setRows(prev => prev.filter(r => r.id !== id));

  if (loading) return <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>;
  if (error)   return <div className="py-12 text-center text-red-500 text-sm">{error}</div>;
  if (!rows.length) return (
    <div className="py-16 text-center text-slate-400">
      <Ghost size={32} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm">No unresolved transactions</p>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr>
            {['ID', 'Transaction ID', 'Terminal ID', 'Narration', 'Amount', 'Date', 'Merchant', 'Status', 'Received', 'Assign Company'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2.5 text-slate-400 text-xs">{r.id}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{r.transactionID}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{r.transactionTerminalId || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[140px] truncate" title={r.narration}>{r.narration || '—'}</td>
              <td className="px-3 py-2.5 text-xs font-medium text-slate-800">₹{r.transactionAmount}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{r.transaction_date}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{r.merchantId}</td>
              <td className="px-3 py-2.5 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                  {r.verification_status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmt(r.first_received_at)}</td>
              <td className="px-3 py-2.5">
                <AssignCell type="transaction" id={r.id} onAssigned={remove} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Payouts tab ──────────────────────────────────────────────────────────────
function GhostPayouts() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`${BASE_URL}/ghost-payouts`);
      setRows(res.data?.data ?? []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = (id) => setRows(prev => prev.filter(r => r.id !== id));

  if (loading) return <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>;
  if (error)   return <div className="py-12 text-center text-red-500 text-sm">{error}</div>;
  if (!rows.length) return (
    <div className="py-16 text-center text-slate-400">
      <Ghost size={32} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm">No unresolved payouts</p>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr>
            {['ID', 'Statement ID', 'Amount', 'UTR', 'Payout Date', 'Bank', 'Status', 'Txn Count', 'Created', 'Assign Company'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2.5 text-slate-400 text-xs">{r.id}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{r.statementId}</td>
              <td className="px-3 py-2.5 text-xs font-medium text-slate-800">₹{r.payoutAmount}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{r.utrNumber}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmt(r.payoutDate)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{r.payoutBank}</td>
              <td className="px-3 py-2.5 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                  {r.payoutStatus}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs text-center text-slate-600">{r.transaction_count}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmt(r.created_at)}</td>
              <td className="px-3 py-2.5">
                <AssignCell type="payout" id={r.id} onAssigned={remove} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const TABS = ['Transactions', 'Payouts'];

export default function GhostRecordsPage() {
  const [tab, setTab] = useState(0);
  const [key, setKey] = useState(0);

  const refresh = () => setKey(k => k + 1);

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Ghost size={20} className="text-slate-500" />
            Ghost Records
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Payment Aggregator transactions and payouts where company could not be resolved automatically
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>
          These records have <strong>no company assigned</strong> and are invisible to company admins.
          Enter the correct Company ID to make them visible in the respective company's settlement views.
        </span>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <div className="flex border-b border-slate-200">
            {TABS.map((label, i) => (
              <button
                key={label}
                onClick={() => setTab(i)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === i
                    ? 'border-slate-800 text-slate-800'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 0 && <GhostTransactions key={`txn-${key}`} />}
            {tab === 1 && <GhostPayouts key={`pay-${key}`} />}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
