import axios, {
  AxiosError,
  type AxiosResponse,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

const DEFAULT_API_BASE_URL = 'http://localhost:5000';
const API_V1_PATH = '/api/v1';
const AUTH_EXPIRED_EVENT = 'litsamaiso:auth-expired';
const INSTITUTION_LOCKED_EVENT = 'litsamaiso:institution-locked';
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

const API_VERSION_SUFFIX = /\/api\/v\d+$/i;

// VITE_API_URL is normally the backend origin, and `/api/v1` is appended. A URL that
// already ends in a version path (any version) is used as-is, so a deployment can
// target a different version. The server only accepts a lowercase version prefix.
const resolveApiBaseUrl = (configured: string): string => {
  const url = configured.trim().replace(/\/+$/, '');
  if (API_VERSION_SUFFIX.test(url)) {
    return url.replace(API_VERSION_SUFFIX, (suffix) => suffix.toLowerCase());
  }

  const path = new URL(url, 'http://placeholder').pathname.replace(/\/+$/, '');
  if (path) {
    console.warn(
      `[litsamaiso-api] VITE_API_URL "${configured}" has the path "${path}"; ` +
        `requests will go to "${url}${API_V1_PATH}". Set VITE_API_URL to the backend ` +
        `origin, or to a URL ending in "${API_V1_PATH}".`
    );
  }
  return `${url}${API_V1_PATH}`;
};

// The versioned API root (origin + version path), not the bare backend origin: only
// use it to build API route URLs.
export const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env.VITE_API_URL || DEFAULT_API_BASE_URL
);

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

export interface InstitutionLockDetail {
  reason?: string;
  lockedBy?: 'manual' | 'billing';
}

export const notifyInstitutionLocked = (detail: InstitutionLockDetail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INSTITUTION_LOCKED_EVENT, { detail }));
};

export const onInstitutionLocked = (handler: (detail: InstitutionLockDetail) => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) =>
    handler((event as CustomEvent<InstitutionLockDetail>).detail ?? {});
  window.addEventListener(INSTITUTION_LOCKED_EVENT, listener);
  return () => window.removeEventListener(INSTITUTION_LOCKED_EVENT, listener);
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
    const lockedBody = error.response?.data as
      | { locked?: boolean; lockedReason?: string; lockedBy?: 'manual' | 'billing' }
      | undefined;
    if (error.response?.status === 403 && lockedBody?.locked && !isAuthEndpoint) {
      notifyInstitutionLocked({ reason: lockedBody.lockedReason, lockedBy: lockedBody.lockedBy });
    }
    return Promise.reject(error);
  }
);

export default api;
