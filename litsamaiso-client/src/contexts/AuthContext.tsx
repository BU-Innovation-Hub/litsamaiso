import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { User } from '../types';
import { authService } from '../services/authService';
import { accountService } from '../services/accountService';
import { feedbackService } from '../services/feedbackService';
import { AuthContext } from './authContextValue';
import { onAuthExpired, onInstitutionLocked } from '../lib/api';
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
    return onInstitutionLocked((detail) => {
      clearStoredAuth();
      setUser(null);
      posthog.reset();
      navigate('/locked', { replace: true, state: detail });
    });
  }, [navigate]);

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

  const register = async (data: Parameters<typeof authService.register>[0]) => {
    setIsLoading(true);
    try {
      const response = await authService.register(data);
      if (response.token) {
        setUser(response.user);
        posthog.identify(response.user.id, {
          email: response.user.email,
          name: response.user.name,
          role: response.user.role,
        });
      }
    } finally {
      setIsLoading(false);
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
