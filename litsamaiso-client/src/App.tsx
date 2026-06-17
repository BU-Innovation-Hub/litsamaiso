import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, PublicRoute, RoleRoute } from './components/ProtectedRoute';
import { Header } from './components/Header';
import { roleAccess } from './utils/roleAccess';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ElectionsPage from './pages/ElectionsPage';
import VotingPage from './pages/VotingPage';
import AccountsPage from './pages/AccountsPage';
import AccountConfirmationPage from './pages/AccountConfirmationPage';
import IssuesPage from './pages/IssuesPage';
import UsersPage from './pages/UsersPage';
import ElectionsManagementPage from './pages/ElectionsManagementPage';
import InstitutionsPage from './pages/InstitutionsPage';
import NotFoundPage from './pages/NotFoundPage';

import './index.css';

// Protected Layout Component
const ProtectedLayout = () => (
  <div className="min-h-screen">
    <Header />
    <main>
      <Outlet />
    </main>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/" element={<LandingPage />} />

          {/* Public Routes */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/sign-in" element={<Navigate to="/login" replace />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/sign-up" element={<Navigate to="/register" replace />} />
          </Route>

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route element={<RoleRoute allowedRoles={roleAccess.elections} />}>
                <Route path="/elections" element={<ElectionsPage />} />
                <Route path="/elections/:id/vote" element={<VotingPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={roleAccess.electionManagement} />}>
                <Route path="/elections/manage" element={<ElectionsManagementPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={roleAccess.accounts} />}>
                <Route path="/accounts" element={<AccountsPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={roleAccess.accountConfirmation} />}>
                <Route path="/accounts/confirm" element={<AccountConfirmationPage />} />
                <Route path="/confirmation" element={<AccountConfirmationPage />} />
                <Route path="/issues" element={<IssuesPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={roleAccess.users} />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={roleAccess.institutions} />}>
                <Route path="/institutions" element={<InstitutionsPage />} />
              </Route>
            </Route>
          </Route>
          {/* Catch all - 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
