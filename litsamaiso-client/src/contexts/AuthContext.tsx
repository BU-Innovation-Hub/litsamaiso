import React, { useState } from 'react';
import type { User } from '../types';
import { authService } from '../services/authService';
import { AuthContext } from './authContextValue';

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

  const login = async (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => {
    setIsLoading(true);
    try {
      const response = await authService.login({
        email,
        studentId: email,
        password,
        rememberMe,
      });
      setUser(response.user);
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
