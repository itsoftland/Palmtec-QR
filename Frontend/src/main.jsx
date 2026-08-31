import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'


import './index.css'

import Login from './pages/auth/Login'
import Dashboard from './layouts/Dashboard'
import RoleBasedHome from './components/RoleBasedHome'
import ProtectedRoute from './components/ProtectedRoute'

import CompanyListing from './pages/listings/CompanyListing'
import DealerListing from './pages/listings/DealerListing'
import UserListing from './pages/listings/UserListing'
import DepotListing from './pages/listings/DepotListing'
import VehicleCombined from './pages/listings/VehicleCombined'
import CurrencyListing from './pages/listings/CurrencyListing'
import RouteListing from './pages/listings/RouteListing'
import EmployeeCombined from './pages/listings/EmployeeCombined'
import InspectorListing from './pages/listings/InspectorListing'

import CrewAssignmentListing from './pages/operations/CrewAssignmentListing'
import DeviceRegistry from './pages/operations/DeviceRegistry'
import FareEditor from './pages/operations/FareEditor'
import StageEditor from './pages/operations/StageEditor'
import ExpenseMasterPage from './pages/operations/ExpenseMasterPage'

import TicketDataPage from './pages/reports/TicketDataPage'
import ExpenseDataPage from './pages/reports/ExpenseDataPage'
import TripDataPage from './pages/reports/TripDataPage'
import ScheduleDataPage from './pages/reports/ScheduleDataPage'
import SettlementsLayout from './pages/reports/settlements/SettlementsLayout'

import TransactionPosting from './pages/reports/settlements/TransactionPosting'
import PayoutPosting from './pages/reports/settlements/PayoutPosting'

import MdbImport from './pages/tools/MdbImport'
import SettingsPage from './pages/tools/SettingsPage'
import DeviceDownload from './pages/tools/DeviceDownload'
import FailedPayloadsPage from './pages/tools/FailedPayloadsPage'
import GhostRecordsPage from './pages/tools/GhostRecordsPage'
import AuditLogPage from './pages/tools/AuditLogPage'
import AboutPage from './pages/tools/AboutPage'
import GlobalSettingsPage from './pages/tools/GlobalSettingsPage'

import SessionsPage from './pages/tools/SessionsPage'
import PalmtecDevicesPage from './pages/operations/PalmtecDevicesPage'
import AdminSessionsPage from './pages/tools/AdminSessionsPage'

import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

// Catch-all: hard-redirect based on auth state
function SmartRedirect() {
  const base = import.meta.env.BASE_URL;
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const role = JSON.parse(userStr)?.role;
      window.location.replace(role === 'production' ? `${base}dashboard/device-registry` : `${base}dashboard`);
    } catch {
      window.location.replace(`${base}login`);
    }
  } else {
    window.location.replace(`${base}login`);
  }
  return null;
}

const router = createBrowserRouter([
  {
    path: '*',
    element: <SmartRedirect />,
  },
  {
    path: '/',
    element: <Navigate to="/login" replace />
  },
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '/forgot-password',
    element: <ForgotPassword />
  },
  {
    path: '/reset-password',
    element: <ResetPassword />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/dashboard',
        element: <Dashboard />,
        children: [
          {
            index: true,
            element: <RoleBasedHome />
          },
          {
            path: 'companies',
            element: <CompanyListing />
          },
          {
            path: 'users',
            element: <UserListing />
          },
          {
            path: 'depots',
            element: <DepotListing />
          },
          {
            path: 'ticket-data',
            element: <TicketDataPage />
          },
          {
            path: 'trip-data',
            element: <TripDataPage />
          },
          {
            path: 'schedule-data',
            element: <ScheduleDataPage />
          },
          {
            path: 'settlements',
            element: <SettlementsLayout />,
            children: [
              { index: true, element: <Navigate to="transactions" replace /> },
              { path: 'transactions', element: <TransactionPosting /> },
              { path: 'payouts', element: <PayoutPosting /> },
            ]
          },
          {
            path: 'dealers',
            element: <DealerListing />
          },
          {
            path: 'device-registry',
            element: <DeviceRegistry />
          },
          {
            path: 'data-import',
            element: <MdbImport/>
          },
          {
            path: 'master-data/currencies',
            element: <CurrencyListing />
          },
          {
            path: 'master-data/employees',
            element: <EmployeeCombined />
          },
          {
            path: 'master-data/vehicles',
            element: <VehicleCombined />
          },
          {
            path: 'master-data/routes',
            element: <RouteListing />
          },
          {
            path: 'master-data/fares',
            element: <FareEditor />
          },
          {
            path: 'master-data/stages',
            element: <StageEditor />
          },
          {
            path: 'master-data/expense-master',
            element: <ExpenseMasterPage />
          },
          {
            path: 'master-data/crew-assignments',
            element: <CrewAssignmentListing />
          },
          {
            path: 'master-data/inspector-records',
            element: <InspectorListing />
          },
          {
            path: 'expense-records',
            element: <ExpenseDataPage />
          },
          {
            path: 'master-data/settings',
            element: <SettingsPage />
          },
          {
            path: 'palmtec-devices',
            element: <PalmtecDevicesPage />
          },
          {
            path: 'device-download',
            element: <DeviceDownload />
          },
          {
            path: 'failed-payloads',
            element: <FailedPayloadsPage />
          },
          {
            path: 'ghost-records',
            element: <GhostRecordsPage />
          },
          {
            path: 'audit-logs',
            element: <AuditLogPage />
          },
          {
            path: 'about',
            element: <AboutPage />
          },
          {
            path: 'global-settings',
            element: <GlobalSettingsPage />
          },
          {
            path: 'sessions',
            element: <SessionsPage />
          },
          {
            path: 'admin-sessions',
            element: <AdminSessionsPage />
          },
        ]
      }
    ]
  }
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);