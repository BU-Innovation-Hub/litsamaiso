import axios, {
  AxiosError,
  type AxiosResponse,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

const DEFAULT_API_BASE_URL = 'http://localhost:5000';
const API_V1_PATH = '/api/v1';
const AUTH_EXPIRED_EVENT = 'litsamaiso:auth-expired';
const API_DIAGNOSTICS_KEY = '__litsamaisoApiDiagnostics';
const API_DIAGNOSTICS_WINDOW_MS = 10_000;

type ApiDiagnosticEntry = {
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  at: string;
};

declare global {
  interface Window {
    __litsamaisoApiDiagnostics?: ApiDiagnosticEntry[];
    __litsamaisoApiDiagnosticsStartedAt?: number;
  }
}

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startedAt: number;
    };
  }
}

const configuredApiBaseUrl = (
  import.meta.env.VITE_API_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

// Keep configuration flexible for deployments that already include the version.
export const API_BASE_URL = configuredApiBaseUrl.endsWith(API_V1_PATH)
  ? configuredApiBaseUrl
  : `${configuredApiBaseUrl}${API_V1_PATH}`;

const getAuthToken = () => {
  try {
    return localStorage.getItem('authToken');
  } catch {
    return null;
  }
};

const recordApiDiagnostic = (entry: Omit<ApiDiagnosticEntry, 'at'>) => {
  if (typeof window === 'undefined') return;

  const startedAt = window.__litsamaisoApiDiagnosticsStartedAt ?? Date.now();
  window.__litsamaisoApiDiagnosticsStartedAt = startedAt;
  if (Date.now() - startedAt > API_DIAGNOSTICS_WINDOW_MS) return;

  const entries = window[API_DIAGNOSTICS_KEY] ?? [];
  const nextEntries = [
    ...entries.slice(-4),
    {
      ...entry,
      at: new Date().toISOString(),
    },
  ];

  window[API_DIAGNOSTICS_KEY] = nextEntries;
  console.info('[litsamaiso-api-diagnostic]', nextEntries[nextEntries.length - 1]);
};

export const notifyAuthExpired = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
};

export const onAuthExpired = (handler: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(AUTH_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
};

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.metadata = { startedAt: Date.now() };
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response: AxiosResponse) => {
    recordApiDiagnostic({
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status,
      durationMs: Date.now() - (response.config.metadata?.startedAt ?? Date.now()),
    });
    return response;
  },
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    const isAuthEndpoint = url.startsWith('/auth/');
    recordApiDiagnostic({
      method: error.config?.method?.toUpperCase(),
      url,
      status: error.response?.status,
      durationMs: Date.now() - (error.config?.metadata?.startedAt ?? Date.now()),
    });
    if (error.response?.status === 401 && !isAuthEndpoint) {
      notifyAuthExpired();
    }
    return Promise.reject(error);
  }
);

export default api;
