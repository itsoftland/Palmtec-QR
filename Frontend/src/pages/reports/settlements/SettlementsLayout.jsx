import { NavLink, Outlet } from 'react-router-dom';
import { CreditCard, Banknote } from 'lucide-react';

export default function SettlementsLayout() {
  const tabClass = ({ isActive }) =>
    `flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 ${
      isActive
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
    }`;

  return (
    <div className="p-6 md:p-10 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">Settlements</h1>
        <p className="text-slate-500 mt-1">Verify card transactions and confirm payouts received</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm w-fit mb-6">
        <NavLink to="transactions" className={tabClass}>
          <CreditCard size={15} />
          Transaction Posting
        </NavLink>
        <NavLink to="payouts" className={tabClass}>
          <Banknote size={15} />
          Payout Posting
        </NavLink>
      </div>

      {/* Child route renders here */}
      <Outlet />
    </div>
  );
}
