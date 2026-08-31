import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { BASE_URL } from '../../assets/js/axiosConfig';
import { Building2, Cpu, CheckCircle2, MapPin, XCircle } from 'lucide-react';

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value ?? '—'}</p>
      </div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const navigate = useNavigate();

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
  })();

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`${BASE_URL}/executive-dashboard`);
      setCompanies(res.data?.data ?? []);
    } catch (err) {
      console.error('ExecutiveDashboard fetch error:', err);
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const totalDevices = companies.reduce((s, c) => s + (c.palmtec_count ?? 0), 0);
  const approvedCount = companies.filter(c => c.authentication_status === 'Approve').length;

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Companies you manage.</p>
        </div>
        {user.state && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full shrink-0">
            <MapPin size={13} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-700">{user.state}</span>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard icon={Building2}    label="Companies"        value={companies.length}  color="bg-blue-50 text-blue-600" />
        <SummaryCard icon={Cpu}          label="Total ETM Slots"  value={totalDevices}      color="bg-slate-100 text-slate-600" />
        <SummaryCard icon={CheckCircle2} label="Approved"         value={approvedCount}     color="bg-green-50 text-green-600" />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} />
          {error}
        </div>
      )}

      {/* Company cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-2/3 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No companies created yet.</p>
          <button
            onClick={() => navigate('/dashboard/companies')}
            className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Create first company →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map(company => {
            const statusColour =
              company.authentication_status === 'Approve'
                ? 'bg-green-50 text-green-700 border-green-200'
                : company.authentication_status === 'Expired'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-yellow-50 text-yellow-700 border-yellow-200';

            const basicUsers = Math.max(
              0,
              (company.total_user_count ?? 0)
              - (company.premium_user_count ?? 0)
              - (company.intermediate_user_count ?? 0),
            );

            return (
              <div
                key={company.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Name + status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800 leading-tight">{company.company_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{company.company_email}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColour}`}>
                    {company.authentication_status ?? 'Pending'}
                  </span>
                </div>

                {/* Location */}
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin size={11} />
                  {[company.city, company.state].filter(Boolean).join(', ') || '—'}
                </div>

                {/* Allocation badges */}
                {(company.palmtec_count > 0 || company.total_user_count > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {company.palmtec_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-50 border border-slate-100 text-slate-600">
                        {company.palmtec_count} ETM
                      </span>
                    )}
                    {company.total_user_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-50 border border-slate-100 text-slate-600">
                        {company.total_user_count} users
                      </span>
                    )}
                    {company.premium_user_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 border border-purple-100 text-purple-600">
                        {company.premium_user_count} premium
                      </span>
                    )}
                    {company.intermediate_user_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 border border-blue-100 text-blue-600">
                        {company.intermediate_user_count} inter
                      </span>
                    )}
                    {basicUsers > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-50 border border-slate-100 text-slate-500">
                        {basicUsers} basic
                      </span>
                    )}
                  </div>
                )}

                <button
                  onClick={() => navigate(`/dashboard/device-registry?company=${company.id}`)}
                  className="mt-auto text-xs font-medium text-slate-500 hover:text-slate-800 text-left transition-colors pt-1 border-t border-slate-100"
                >
                  View devices →
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
