import axios, {
  type AxiosInstance,
  AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { AuthResponse, LoginRequest, RegisterRequest } from '../types';
import type { Institution, Role, User } from '../types';

const API_BASE_URL = '/api';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

// Request interceptor — attach JWT to every request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — only redirect on 401 for protected routes (not auth endpoints)
// This prevents an infinite redirect loop when a login/register attempt returns 401/400.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    const isAuthEndpoint = url.startsWith('/auth/');
    if (error.response?.status === 401 && !isAuthEndpoint) {
      // Session expired — clear local state and send to login
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    const data = normalizeAuthResponse(response.data);
    if (data.token) {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    // Send as JSON — the Express authController reads from req.body (not multipart/form-data).
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
    // faceDescriptor must stay as number[] — never JSON.stringify it
    if (Array.isArray(data.faceDescriptor)) payload.faceDescriptor = data.faceDescriptor;

    const response = await apiClient.post<AuthResponse>('/auth/register', payload);
    const responseData = normalizeAuthResponse(response.data);
    if (responseData.token) {
      localStorage.setItem('authToken', responseData.token);
      localStorage.setItem('user', JSON.stringify(responseData.user));
    }
    return responseData;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      if (!(error instanceof AxiosError) || error.response?.status !== 404) {
        throw error;
      }
    } finally {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
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
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('authToken');
  },
};

export default apiClient;
