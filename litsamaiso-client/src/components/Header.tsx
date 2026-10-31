import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { getUserInitials } from '../utils/userDisplay';
import { getVisibleNavItems, isNavItemActive } from '../navigation';
import { feedbackService } from '../services/feedbackService';
import { LogoutFeedbackModal } from './LogoutFeedbackModal';
import { RoleSwitcher } from './RoleSwitcher';
import { Avatar } from './elections/ui';

const AttentionDot: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`block h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white ${className}`}
    aria-hidden="true"
  />
);

export const Header: React.FC = () => {
  const { user, logout, activeRole, needsVotingPhoto } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const roleName = activeRole;
  const username = user?.name || user?.email?.split('@')[0] || 'User';

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      if (target instanceof Node && headerRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideInteraction);
    document.addEventListener('touchstart', handleOutsideInteraction);

    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction);
      document.removeEventListener('touchstart', handleOutsideInteraction);
    };
  }, [isMenuOpen]);

  const completeLogout = async () => {
    setShowFeedbackModal(false);
    await logout();
    navigate('/login');
  };

  const handleLogout = async () => {
    setIsMenuOpen(false);

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

  const closeMobileMenu = () => {
    setIsMenuOpen(false);
  };

  const navLinkClass = (href: string) =>
    `block whitespace-nowrap rounded p-2 transition-colors lg:p-0 ${
      isNavItemActive(location.pathname, href)
        ? 'text-active font-semibold'
        : 'text-primary-clr hover:text-active'
    }`;

  const visibleNavItems = getVisibleNavItems(roleName);

  return (
    <div className="fixed top-0 z-50 w-full pb-8 backdrop-blur-md">
      <header
        ref={headerRef}
        className="mx-auto mt-6 flex w-[92%] flex-wrap items-center justify-between rounded-4xl bg-white p-4 shadow-xl xl:w-[80%]"
        style={{ boxShadow: '0 0 25px -5px rgba(129, 129, 129, 0.3)' }}
      >
        <Link to="/" className="flex items-center gap-2" onClick={closeMobileMenu}>
          <img src="/logo-1.png" alt="Logo" width={32} height={32} />
          <span className="text-lg font-bold">Litsamaiso</span>
        </Link>

        <button
          className="relative flex h-10 w-10 flex-col items-center justify-center lg:hidden"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={needsVotingPhoto ? 'Toggle menu, your profile photo is needed' : 'Toggle menu'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation-menu"
        >
          {needsVotingPhoto && !isMenuOpen && <AttentionDot className="absolute right-0 top-1.5" />}
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
          id="mobile-navigation-menu"
          className={`${
            isMenuOpen ? 'flex' : 'hidden'
          } mt-2 max-h-[calc(100dvh-7rem)] w-full flex-col overflow-y-auto lg:mt-0 lg:flex lg:max-h-none lg:w-auto lg:flex-row lg:items-center lg:gap-6 lg:overflow-visible`}
        >
          <nav className="flex flex-col justify-center gap-1 text-sm font-medium lg:flex-row lg:gap-4">
            {visibleNavItems.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className={navLinkClass(item.href)}
                onClick={closeMobileMenu}
              >
                <span className="inline-flex items-center gap-1.5">
                  {item.label}
                  {item.id === 'profile' && needsVotingPhoto && (
                    <>
                      <AttentionDot className="ring-0" />
                      <span className="sr-only">, your photo is needed</span>
                    </>
                  )}
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 lg:mt-0 lg:ml-4 lg:flex-nowrap lg:border-0 lg:pt-0">
            <RoleSwitcher onSwitch={closeMobileMenu} />
            <Link
              to="/profile"
              onClick={closeMobileMenu}
              title="Open your profile"
              className="flex min-w-0 items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition hover:bg-slate-100"
            >
              <Avatar
                name={username}
                initials={getUserInitials(username)}
                imageUrl={user?.studentCardUrl}
                size="sm"
                className="bg-blue-600 text-sm text-white ring-0"
              />
              <span className="max-w-40 truncate text-sm font-medium">{username}</span>
              <span className="sr-only">, open your profile</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center lg:ml-0 lg:h-auto lg:w-auto"
            >
              <img src="/logout.png" alt="" width={24} height={24} />
            </button>
          </div>
        </div>
      </header>
      <LogoutFeedbackModal
        isOpen={showFeedbackModal}
        isSubmitting={isSubmittingFeedback}
        onClose={async () => {
          setShowFeedbackModal(false);
          await completeLogout();
        }}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
};
