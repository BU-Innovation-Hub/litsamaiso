import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { User } from '../types';
import { authService } from '../services/authService';
import { accountService } from '../services/accountService';
import { feedbackService } from '../services/feedbackService';
import { profileService } from '../services/profileService';
import { AuthContext } from './authContextValue';
import { onAuthExpired } from '../lib/api';
import {
  clearStoredActiveRole,
  getStoredActiveRole,
  onActiveRoleRevoked,
  storeActiveRole,
} from '../lib/activeRole';
import { getRoleName, normalizeRoleName, sanitizeUserForStorage } from '../utils/userDisplay';
import posthog from 'posthog-js';

const clearStoredAuth = () => {
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  } catch {
    // Storage can be unavailable on some mobile WebKit contexts.
  }
};

const getStoredUser = (): User | null => {
  try {
    const token = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('user');
    if (!token || !storedUser) {
      clearStoredAuth();
      return null;
    }

    return JSON.parse(storedUser) as User;
  } catch {
    clearStoredAuth();
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(false);
  const [chosenRole, setChosenRole] = useState<string | null>(() =>
    getStoredActiveRole(getStoredUser()?.id)
  );

  const primaryRole = getRoleName(user);
  const availableRoles = useMemo(() => {
    const names = (user?.availableRoles ?? []).map(normalizeRoleName);
    return [...new Set([primaryRole, ...names].filter(Boolean))];
  }, [user?.availableRoles, primaryRole]);
  const hasValidChoice = Boolean(chosenRole && availableRoles.includes(chosenRole));
  // The role the app is shown as; anyone with a single role simply has their own
  const activeRole = hasValidChoice ? (chosenRole as string) : primaryRole;
  const needsRoleChoice = availableRoles.length > 1 && !hasValidChoice;
  // IEC members run elections, so they can't vote in them while they're on the IEC
  const isIecMember = availableRoles.includes('IEC');
  const canVote = activeRole === 'Student' && !isIecMember;
  // Stays false until the profile has loaded, so the prompt never flashes at someone with a photo
  const needsVotingPhoto = canVote && user?.hasFaceProfile === false;
  const userId = user?.id;

  // The login response doesn't say whether a face is on file, and it can change on another device
  useEffect(() => {
    if (!canVote || !userId) return;
    let cancelled = false;
    profileService
      .getProfile()
      .then((profile) => {
        if (cancelled) return;
        setUser((current) => {
          if (!current || current.id !== userId) return current;
          const updated = {
            ...current,
            hasFaceProfile: Boolean(profile.hasFaceProfile),
            studentCardUrl: profile.studentCardUrl,
          };
          try {
            localStorage.setItem('user', JSON.stringify(sanitizeUserForStorage(updated)));
          } catch {
            // Storage can be unavailable on some mobile WebKit contexts.
          }
          return updated;
        });
      })
      .catch(() => {
        // The prompts stay as they were; the voting page checks again before opening a ballot
      });
    return () => {
      cancelled = true;
    };
  }, [canVote, userId]);

  const switchRole = (role: string) => {
    if (!user || !availableRoles.includes(role)) return;
    storeActiveRole(user.id, role);
    setChosenRole(role);
  };

  // The API refused the role being sent, e.g. they were removed from the IEC while signed in
  useEffect(() => {
    return onActiveRoleRevoked(() => {
      clearStoredActiveRole();
      setChosenRole(null);
      setUser((current) => {
        if (!current) return current;
        const updated = { ...current, availableRoles: [getRoleName(current)] };
        try {
          localStorage.setItem('user', JSON.stringify(sanitizeUserForStorage(updated)));
        } catch {
          // Storage can be unavailable on some mobile WebKit contexts.
        }
        return updated;
      });
      toast.info('You no longer have that role, so you are back on your own dashboard.');
      navigate('/dashboard', { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    return onAuthExpired(() => {
      posthog.capture('auth_expired_redirect', {
        path: location.pathname,
        apiDiagnostics: window.__litsamaisoApiDiagnostics || [],
      });
      clearStoredAuth();
      setUser(null);
      posthog.reset();
      if (location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (user) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
        role: user.role,
      });
    }
    // Only run on mount to identify user restored from localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (
    identifier: string,
    password: string,
    rememberMe?: boolean
  ) => {
    setIsLoading(true);
    try {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      const response = await authService.login({
        email: isEmail ? identifier : '',
        studentId: isEmail ? undefined : identifier,
        password,
        rememberMe,
      });
      setUser(response.user);
      // Keep the role this user last worked as; a different user on this device starts fresh
      const rememberedRole = getStoredActiveRole(response.user.id);
      if (!rememberedRole) clearStoredActiveRole();
      setChosenRole(rememberedRole);
      posthog.identify(response.user.id, {
        email: response.user.email,
        name: response.user.name,
        role: response.user.role,
      });

      if (response.user?.role?.name === 'Student') {
        try {
          const confirmationStatus = await accountService.getConfirmationStatus();
          if (!confirmationStatus.confirmed) {
            return;
          }

          const feedbackStatus = await feedbackService.getStatus();
          if (feedbackStatus.hasSubmittedFeedback) {
            return;
          }

          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('litsamaiso:feedback-prompt', {
                detail: { reason: 'login' },
              })
            );
          }, 0);
        } catch {
          // Ignore prompt gating failures and keep the login flow stable.
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Doesn't set isLoading: the route guards replace the page while it's true, and the register page
  // has to survive a refused submit to keep the student's details or move on to the authenticator step
  const register = async (data: Parameters<typeof authService.register>[0]) => {
    const response = await authService.register(data);
    if (response.token) {
      setUser(response.user);
      posthog.identify(response.user.id, {
        email: response.user.email,
        name: response.user.name,
        role: response.user.role,
      });
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
      posthog.reset();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        setUser,
        activeRole,
        availableRoles,
        needsRoleChoice,
        isIecMember,
        needsVotingPhoto,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
