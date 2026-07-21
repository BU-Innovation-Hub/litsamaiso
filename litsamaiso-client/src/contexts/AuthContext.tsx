import React, { useState, useEffect } from 'react';
import type { User } from '../types';
import { authService } from '../services/authService';
import { AuthContext } from './authContextValue';
import posthog from 'posthog-js';

const getStoredUser = (): User | null => {
  const storedUser = localStorage.getItem('user');
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as User;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(false);

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
