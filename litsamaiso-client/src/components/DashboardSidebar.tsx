import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getInstitutionName, getRoleName, getUserInitials } from '../utils/userDisplay';
import { getVisibleNavItems, isNavItemActive } from '../navigation';

const sidebarWidth = 'lg:w-72';

export const DashboardSidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const roleName = getRoleName(user);
  const institutionName = getInstitutionName(user);
  const username = user?.name || user?.email?.split('@')[0] || 'User';
  const visibleNavItems = getVisibleNavItems(roleName);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const nav = (
    <nav className="mt-8 space-y-1 px-3">
      {visibleNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = isNavItemActive(location.pathname, item.href);

        return (
          <Link
            key={item.id}
            to={item.href}
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              isActive
                ? 'bg-active-clr text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-primary-clr'
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
    <div className="mt-auto border-t border-slate-200 p-4">
      <button
        type="button"
        onClick={() => {
          setIsOpen(false);
          navigate('/profile');
        }}
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-100"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-clr text-sm font-bold text-white">
          {getUserInitials(username)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-primary-clr">{username}</span>
          <span className="block truncate text-xs text-slate-500">{roleName || 'User'}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={handleLogout}
        className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-primary-clr"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Logout
      </button>
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <Link
          to="/dashboard"
          onClick={() => setIsOpen(false)}
          className="flex items-center gap-3"
        >
          <img src="/logo-1.png" alt="Logo" className="h-9 w-9" />
          <span>
            <span className="block text-lg font-bold leading-5 text-primary-clr">Litsamaiso</span>
            <span className="mt-1 block text-xs font-medium text-slate-500">
              {institutionName || 'Dashboard'}
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
          <img src="/logo-1.png" alt="Logo" className="h-8 w-8" />
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

      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 ${sidebarWidth} lg:block`}>
        {sidebarContent}
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-primary-clr/40"
            onClick={() => setIsOpen(false)}
          />
          <aside className="relative h-full w-[min(20rem,85vw)] border-r border-slate-200 shadow-2xl">
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
  <div className="min-h-screen bg-slate-50">
    <DashboardSidebar />
    <main className="min-w-0 lg:pl-72">{children}</main>
  </div>
);
