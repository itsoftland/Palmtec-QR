import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../assets/js/axiosConfig';
import { PropagateLoader } from "react-spinners";

// Allowed sub-paths per role (path.startsWith check).
// '/dashboard' index is always allowed for every role except 'production'.
const ROLE_PATHS = {
  superadmin:    [
    '/dashboard/companies',
    '/dashboard/dealers',
    '/dashboard/users',
    '/dashboard/device-registry',
    '/dashboard/data-import',
    '/dashboard/failed-payloads',
    '/dashboard/ghost-records',
    '/dashboard/audit-logs',
    '/dashboard/global-settings',
    '/dashboard/admin-sessions',
    '/dashboard/about',
  ],
  company_admin: [
    '/dashboard/users',
    '/dashboard/depots',
    '/dashboard/palmtec-devices',
    '/dashboard/master-data',
    '/dashboard/device-download',
    '/dashboard/schedule-data',
    '/dashboard/trip-data',
    '/dashboard/ticket-data',
    '/dashboard/expense-records',
    '/dashboard/settlements',
    '/dashboard/sessions',
    '/dashboard/about',
  ],
  dealer_admin:  [
    '/dashboard/companies',
    '/dashboard/device-registry',
    '/dashboard/about',
  ],
  executive:     [
    '/dashboard/companies',
    '/dashboard/users',
    '/dashboard/device-registry',
    '/dashboard/about',
  ],
  user:          [],
  company_user:  [
    '/dashboard/schedule-data',
    '/dashboard/trip-data',
    '/dashboard/ticket-data',
    '/dashboard/about',
  ],
  production:    [],  // handled separately — always /dashboard/device-registry
};

export default function ProtectedRoute() {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    verifyAuthFromBackend();
  }, []);

  // Redirect immediately if another tab logs out (clears localStorage)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'user' && e.newValue === null) {
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [navigate]);

  const verifyAuthFromBackend = async () => {
    try {
      const response = await api.get('/verify-auth');
      if (response.data.authenticated) {
        setIsAuthenticated(true);
        setUserRole(response.data.user.role);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        if (response.data.session_timeout_seconds) {
          localStorage.setItem('session_timeout_seconds', String(response.data.session_timeout_seconds));
        }
      } else {
        setIsAuthenticated(false);
        localStorage.removeItem('user');
        localStorage.removeItem('session_timeout_seconds');
      }
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        setIsAuthenticated(false);
        localStorage.removeItem('user');
      } else {
        // Network/server error — keep cached session optimistically
        const cached = localStorage.getItem('user');
        if (cached) {
          try {
            const cachedUser = JSON.parse(cached);
            setIsAuthenticated(true);
            setUserRole(cachedUser.role);
          } catch {
            setIsAuthenticated(false);
            localStorage.removeItem('user');
          }
        } else {
          setIsAuthenticated(false);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Whitelist-based route guard — hard redirect for any unauthorized path
  useEffect(() => {
    if (!loading && isAuthenticated && userRole) {
      const path = location.pathname;

      // Production: always stays on device-registry
      if (userRole === 'production') {
        if (!path.startsWith('/dashboard/device-registry')) {
          window.location.replace('/dashboard/device-registry');
        }
        return;
      }

      // Dashboard index is allowed for all non-production roles
      if (path === '/dashboard') return;

      // Check whitelist
      const allowed = ROLE_PATHS[userRole] || [];
      const isAllowed = allowed.some(p => path.startsWith(p));
      if (!isAllowed) {
        window.location.replace('/dashboard');
      }
    }
  }, [loading, isAuthenticated, userRole, location.pathname]);

  if (!loading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const hasCachedSession = !!localStorage.getItem('user');
  if (loading && !hasCachedSession) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <PropagateLoader />
      </div>
    );
  }

  return (
    <>
      <Outlet />
      {loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'all' }} />
      )}
    </>
  );
}
