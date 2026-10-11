import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Compass, LogOut, Menu, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { getInstitutionName, getRoleName, getUserInitials } from '../utils/userDisplay';
import { getVisibleNavItems, isNavItemActive } from '../navigation';
import { feedbackService } from '../services/feedbackService';
import { LogoutFeedbackModal } from './LogoutFeedbackModal';
import { DEFAULT_LOGO_URL, useInstitutionLogo } from '../theme/useInstitutionLogo';
import { useTour } from '../tour/tourContext';

const sidebarWidth = 'lg:w-72';

export const DashboardSidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const roleName = getRoleName(user);
  const institutionName = getInstitutionName(user);
  const username = user?.name || user?.email?.split('@')[0] || 'User';
  const visibleNavItems = getVisibleNavItems(roleName);
  const logoUrl = useInstitutionLogo();
  const tour = useTour();
  const hasCustomLogo = logoUrl !== DEFAULT_LOGO_URL;

  const completeLogout = async () => {
    setShowFeedbackModal(false);
    await logout();
    navigate('/login');
  };

  const handleLogout = async () => {
    try {
      const { hasSubmittedFeedback } = await feedbackService.getStatus();
      if (hasSubmittedFeedback) {
        await completeLogout();
        return;
      }

      setShowFeedbackModal(true);
    } catch {
      await completeLogout();
    }
  };

  const handleFeedbackSubmit = async (rating: number, comment: string) => {
    setIsSubmittingFeedback(true);
    try {
      await feedbackService.submit({ rating, comment });
      await completeLogout();
    } catch (error) {
      toast.error('Unable to submit feedback right now. Please try again.');
      console.error('Failed to submit feedback during logout', error);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const nav = (
    <nav className="mt-8 space-y-1 px-3" data-tour="sidebar-nav">
      {visibleNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = isNavItemActive(location.pathname, item.href);

        return (
          <Link
            key={item.id}
            to={item.href}
            data-tour={`nav-${item.id}`}
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              isActive
                ? 'bg-brand-active text-brand-active-foreground shadow-sm'
                : 'text-brand-sidebar-foreground hover:bg-brand-sidebar-hover hover:text-brand-sidebar-heading'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const accountPanel = (
    <div className="mt-auto border-t border-brand-sidebar-border p-4" data-tour="account-panel">
      <button
        type="button"
        onClick={() => {
          setIsOpen(false);
          navigate('/profile');
        }}
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-brand-sidebar-hover"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-sidebar-heading text-sm font-bold text-brand-sidebar">
          {getUserInitials(username)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-brand-sidebar-heading">{username}</span>
          <span className="block truncate text-xs text-brand-sidebar-muted">{roleName || 'User'}</span>
        </span>
      </button>
      {tour.available && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            tour.start();
          }}
          className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-brand-sidebar-foreground transition hover:bg-brand-sidebar-hover hover:text-brand-sidebar-heading"
        >
          <Compass className="h-4 w-4" aria-hidden="true" />
          Take the tour
        </button>
      )}
      <button
        type="button"
        onClick={handleLogout}
        className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-brand-sidebar-foreground transition hover:bg-brand-sidebar-hover hover:text-brand-sidebar-heading"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Logout
      </button>
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col bg-brand-sidebar">
      <div className="border-b border-brand-sidebar-border px-5 py-5">
        <Link
          to="/dashboard"
          onClick={() => setIsOpen(false)}
          className="flex items-center gap-3"
        >
          <img src={logoUrl} alt="Logo" className="h-9 w-9 rounded object-contain" />
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold leading-5 text-brand-sidebar-heading">
              {hasCustomLogo && institutionName ? institutionName : 'Litsamaiso'}
            </span>
            <span className="mt-1 block truncate text-xs font-medium text-brand-sidebar-muted">
              {hasCustomLogo ? 'Powered by Litsamaiso' : institutionName || 'Dashboard'}
            </span>
          </span>
        </Link>
      </div>
      {nav}
      {accountPanel}
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded object-contain" />
          <span className="text-base font-bold text-primary-clr">Litsamaiso</span>
        </Link>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-primary-clr"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-brand-sidebar-border ${sidebarWidth} lg:block`}>
        {sidebarContent}
      </aside>
      <LogoutFeedbackModal
        isOpen={showFeedbackModal}
        isSubmitting={isSubmittingFeedback}
        onClose={async () => {
          setShowFeedbackModal(false);
          await completeLogout();
        }}
        onSubmit={handleFeedbackSubmit}
      />

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-primary-clr/40"
            onClick={() => setIsOpen(false)}
          />
          <aside className="relative h-full w-[min(20rem,85vw)] border-r border-brand-sidebar-border shadow-2xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-primary-clr"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

export const AdminDashboardShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-brand-surface">
    <DashboardSidebar />
    <main className="min-w-0 lg:pl-72">{children}</main>
  </div>
);
