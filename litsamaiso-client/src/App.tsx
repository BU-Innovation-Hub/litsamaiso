import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { PostHogErrorBoundary } from '@posthog/react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, PublicRoute, RoleRoute } from './components/ProtectedRoute';
import { Header } from './components/Header';
import { AdminDashboardShell } from './components/DashboardSidebar';
import { useAuth } from './hooks/useAuth';
import { isAdminDashboardRole } from './navigation';
import { roleAccess } from './utils/roleAccess';
import { getRoleName } from './utils/userDisplay';
import { feedbackService } from './services/feedbackService';
import { LogoutFeedbackModal } from './components/LogoutFeedbackModal';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ElectionsPage = lazy(() => import('./pages/ElectionsPage'));
const VotingPage = lazy(() => import('./pages/VotingPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const AccountConfirmationPage = lazy(() => import('./pages/AccountConfirmationPage'));
const IssuesPage = lazy(() => import('./pages/IssuesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ElectionsManagementPage = lazy(() => import('./pages/ElectionsManagementPage'));
const InstitutionsPage = lazy(() => import('./pages/InstitutionsPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const BranchCodesPage = lazy(() => import('./pages/BranchCodesPage'));
const AIEmailComposerPage = lazy(() => import('./pages/AIEmailComposerPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StudentRegistryPage = lazy(() => import('./pages/StudentRegistryPage'));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-active-clr" />
  </div>
);

const GlobalFeedbackPromptHost = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handlePromptRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      if (detail?.reason === 'logout') {
        return;
      }

      setIsOpen(true);
    };

    window.addEventListener('litsamaiso:feedback-prompt', handlePromptRequest);
    return () => {
      window.removeEventListener('litsamaiso:feedback-prompt', handlePromptRequest);
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSubmit = async (rating: number, comment: string) => {
    setIsSubmitting(true);
    try {
      await feedbackService.submit({ rating, comment });
      setIsOpen(false);
      toast.success('Thanks for your feedback.');
    } catch (error) {
      toast.error('Unable to submit feedback right now. Please try again.');
      console.error('Failed to submit feedback prompt', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LogoutFeedbackModal
      isOpen={isOpen}
      isSubmitting={isSubmitting}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title="Rate Litsamaiso"
      description="Help us improve your experience. Your rating is required, while the comment is optional."
      submitLabel="Submit feedback"
      closeLabel="Skip"
    />
  );
};

import './index.css';

// Protected Layout Component
const ProtectedLayout = () => {
  const { user } = useAuth();
  const roleName = getRoleName(user);

  if (isAdminDashboardRole(roleName)) {
    return (
      <AdminDashboardShell>
        <Outlet />
      </AdminDashboardShell>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
};

function App() {
  return (
    <PostHogErrorBoundary fallback={<div className="flex items-center justify-center min-h-screen text-destructive">Something went wrong. Please try again later.</div>}>
    <BrowserRouter>
      <AuthProvider>
        <GlobalFeedbackPromptHost />
        <Toaster richColors position="top-right" />
        <Suspense fallback={<PageLoader />}>
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
              <Route path="/profile" element={<ProfilePage />} />
              <Route element={<RoleRoute allowedRoles={roleAccess.registry} />}>
                <Route path="/student-registry" element={<StudentRegistryPage />} />
              </Route>
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
              <Route element={<RoleRoute allowedRoles={['AppAdmin']} />}>
                <Route path="/audit-logs" element={<AuditLogsPage />} />
                <Route path="/ai-email-composer" element={<AIEmailComposerPage />} />
              </Route>
              <Route element={<RoleRoute allowedRoles={roleAccess.branchCodes} />}>
                <Route path="/branch-codes" element={<BranchCodesPage />} />
              </Route>
            </Route>
          </Route>
          {/* Catch all - 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
    </PostHogErrorBoundary>
  );
}

export default App;
