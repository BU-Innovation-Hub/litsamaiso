import { AxiosError } from 'axios';
import apiClient from '../lib/api';
import type { AuthResponse, LoginRequest, RegisterRequest } from '../types';
import type { Institution, Role, User } from '../types';
import { sanitizeUserForStorage } from '../utils/userDisplay';

const normalizeRole = (role: User['role'] | string): Role => {
  if (typeof role === 'string') {
    return { _id: role, name: role as Role['name'] };
  }
  return role;
};

const normalizeInstitution = (
  institution: User['institution'] | string | undefined
): Institution | undefined => {
  if (!institution) return undefined;
  if (typeof institution === 'string') {
    return { _id: institution, name: 'Your institution', email: '' };
  }
  return institution;
};

const normalizeAuthResponse = (data: AuthResponse): AuthResponse => ({
  ...data,
  user: {
    ...data.user,
    role: normalizeRole(data.user.role),
    institution: normalizeInstitution(data.user.institution),
  },
});

const storeAuthSession = (data: AuthResponse) => {
  if (!data.token) return;
  try {
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('user', JSON.stringify(sanitizeUserForStorage(data.user)));
  } catch (error) {
    clearAuthSession();
    throw error;
  }
};

const clearAuthSession = () => {
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  } catch {
    // Ignore storage cleanup failures; callers still update React auth state.
  }
};

export const authService = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    const data = normalizeAuthResponse(response.data);
    storeAuthSession(data);
    return data;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const payload: Record<string, unknown> = {
      email: data.email,
      password: data.password,
      role: data.role,
    };

    if (data.institutionId) payload.institutionId = data.institutionId;
    if (data.institutionName) payload.institutionName = data.institutionName;
    if (data.institutionEmail) payload.institutionEmail = data.institutionEmail;
    if (data.studentId) payload.studentId = data.studentId;
    if (data.faceImageBase64) payload.faceImageBase64 = data.faceImageBase64;
    if (Array.isArray(data.faceDescriptor)) payload.faceDescriptor = data.faceDescriptor;

    const response = await apiClient.post<{ message: string }>('/auth/register', payload);
    return {
      token: '',
      message: response.data.message,
      user: {
        id: '',
        email: data.email,
        role: { _id: 'student', name: 'Student' } as Role,
        institution: undefined,
      } as User,
    };
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      if (!(error instanceof AxiosError) || error.response?.status !== 404) {
        throw error;
      }
    } finally {
      clearAuthSession();
    }
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (
    email: string,
    token: string,
    password: string
  ): Promise<{ message: string }> => {
    const response = await apiClient.post('/auth/reset-password', {
      email,
      token,
      password,
    });
    return response.data;
  },

  getCurrentUser: async () => {
    const token = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('user');
    return token && storedUser ? JSON.parse(storedUser) : null;
  },

  getProfile: async (): Promise<{ data: User }> => {
    const response = await apiClient.get('/profile');
    let user = response.data?.data || response.data?.user || response.data;
    user = {
      ...user,
      role: normalizeRole(user.role),
      institution: normalizeInstitution(user.institution),
    };
    return { data: user };
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('authToken') && !!localStorage.getItem('user');
  },
};

export default apiClient;
