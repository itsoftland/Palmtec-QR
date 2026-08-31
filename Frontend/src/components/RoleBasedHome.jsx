import { Navigate } from 'react-router-dom';
import AdminHome from '../pages/dashboards/AdminHome';
import CompanyDashboard from '../pages/dashboards/CompanyDashboard';
import DealerDashboard from '../pages/dashboards/DealerDashboard';
import ExecutiveDashboard from '../pages/dashboards/ExecutiveDashboard';

export default function RoleBasedHome() {
  const storedUser = localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.role;

  if (role === 'superadmin') return <AdminHome />;
  if (role === 'company_admin') return <CompanyDashboard />;
  if (role === 'company_user') return <CompanyDashboard />;
  if (role === 'dealer_admin') return <DealerDashboard />;
  if (role === 'executive') return <ExecutiveDashboard />;
  if (role === 'production') return <Navigate to="/dashboard/device-registry" replace />;

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Unknown Role</h1>
      <p className="text-slate-600">Contact admin.</p>
    </div>
  );
}
