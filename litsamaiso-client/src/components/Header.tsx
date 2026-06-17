import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRoleName, getUserInitials } from '../utils/userDisplay';
import { getVisibleNavItems, isNavItemActive } from '../navigation';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const roleName = getRoleName(user);
  const username = user?.name || user?.email?.split('@')[0] || 'User';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinkClass = (href: string) =>
    `p-2 sm:p-0 rounded transition-colors ${
      isNavItemActive(location.pathname, href)
        ? 'text-active font-semibold'
        : 'text-primary-clr hover:text-active'
    }`;

  const visibleNavItems = getVisibleNavItems(roleName);

  return (
    <div className="fixed top-0 z-50 w-full pb-8 backdrop-blur-md">
      <header
        className="mx-auto mt-6 flex w-[90%] flex-wrap items-center justify-between rounded-4xl bg-white p-4 shadow-xl md:w-[80%]"
        style={{ boxShadow: '0 0 25px -5px rgba(129, 129, 129, 0.3)' }}
      >
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo-1.png" alt="Logo" width={32} height={32} />
          <span className="text-lg font-bold">Litsamaiso</span>
        </Link>

        <button
          className="flex flex-col items-center justify-center sm:hidden"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          <span
            className={`block h-0.5 w-6 rounded-sm bg-primary-clr transition-all duration-300 ease-out ${
              isMenuOpen ? 'translate-y-1 rotate-45' : '-translate-y-0.5'
            }`}
          />
          <span
            className={`my-0.5 block h-0.5 w-6 rounded-sm bg-primary-clr transition-all duration-300 ease-out ${
              isMenuOpen ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`block h-0.5 w-6 rounded-sm bg-primary-clr transition-all duration-300 ease-out ${
              isMenuOpen ? '-translate-y-1 -rotate-45' : 'translate-y-0.5'
            }`}
          />
        </button>

        <div
          className={`${
            isMenuOpen ? 'flex' : 'hidden'
          } mt-4 w-full flex-col sm:mt-0 sm:flex sm:w-auto sm:flex-row sm:items-center sm:gap-6`}
        >
          <nav className="flex flex-col justify-center gap-4 text-sm font-medium sm:flex-row">
            {visibleNavItems.map((item) => (
              <Link key={item.id} to={item.href} className={navLinkClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-2 flex items-center gap-3 sm:mt-0 sm:ml-4">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
              onClick={() => navigate('/profile')}
              type="button"
              aria-label="Open profile"
            >
              {getUserInitials(username)}
            </button>
            <span className="text-sm font-medium">{username}</span>
            <button type="button" onClick={handleLogout} aria-label="Logout">
              <img src="/logout.png" alt="" width={24} height={24} />
            </button>
          </div>
        </div>
      </header>
    </div>
  );
};
