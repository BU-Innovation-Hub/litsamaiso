import { AxiosError } from 'axios';
import apiClient from '../lib/api';
import type { AuthResponse, PlanKey } from '../types';
import type { InstitutionTheme } from '../theme/palette';

const STORAGE_KEY = 'litsamaiso.onboarding';

export interface OnboardingDraft {
  id: string;
  status: 'draft' | 'checkout' | 'provisioning' | 'provisioned' | 'failed';
  plan: PlanKey;
  institution: {
    name: string;
    email: string;
    phone: string;
    address: string;
    website: string;
    country: string;
    expectedStudents: number | null;
  };
  admin: { name: string; email: string; title: string; hasPassword: boolean };
  theme: InstitutionTheme | null;
  acknowledgedInstitutionAdmin: boolean;
  failureReason: string | null;
}

export interface DraftUpdate {
  plan?: PlanKey;
  institution?: Partial<Omit<OnboardingDraft['institution'], 'expectedStudents'>> & {
    expectedStudents?: number | null;
  };
  admin?: { name: string; email: string; title?: string; password?: string };
  theme?: InstitutionTheme;
  acknowledgedInstitutionAdmin?: boolean;
}

export type CompletionResult =
  | ({ status: 'ready' } & AuthResponse)
  | { status: 'pending' }
  | { status: 'claimed' | 'failed'; message: string };

interface StoredDraft {
  draftId: string;
  resumeToken: string;
}

/** Kept in sessionStorage: the resume token only lives in the tab that started onboarding. */
export const onboardingStorage = {
  get: (): StoredDraft | null => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredDraft) : null;
    } catch {
      return null;
    }
  },
  set: (value: StoredDraft) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Without storage the wizard still works; it just can't resume after a reload.
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};

const tokenHeaders = (token: string) => ({ headers: { 'X-Onboarding-Token': token } });

export interface ApiFieldError {
  message: string;
  field?: string;
}

/** Extracts `{ message, field }` from an API error for inline form errors. */
export const toFieldError = (error: unknown): ApiFieldError => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string; field?: string } | undefined;
    if (data?.message) return { message: data.message, field: data.field };
    if (error.response?.status === 429) return { message: 'Too many attempts. Please wait a few minutes.' };
  }
  return { message: 'Something went wrong. Please check your connection and try again.' };
};

export const onboardingService = {
  createDraft: async (plan: PlanKey) => {
    const { data } = await apiClient.post<{ draft: OnboardingDraft; resumeToken: string }>(
      '/onboarding/drafts',
      { plan },
    );
    onboardingStorage.set({ draftId: data.draft.id, resumeToken: data.resumeToken });
    return data.draft;
  },

  getDraft: async (stored: StoredDraft) => {
    const { data } = await apiClient.get<{ draft: OnboardingDraft }>(
      `/onboarding/drafts/${stored.draftId}`,
      tokenHeaders(stored.resumeToken),
    );
    return data.draft;
  },

  updateDraft: async (stored: StoredDraft, update: DraftUpdate) => {
    const { data } = await apiClient.patch<{ draft: OnboardingDraft }>(
      `/onboarding/drafts/${stored.draftId}`,
      update,
      tokenHeaders(stored.resumeToken),
    );
    return data.draft;
  },

  startCheckout: async (stored: StoredDraft) => {
    const { data } = await apiClient.post<{ url: string }>(
      `/onboarding/drafts/${stored.draftId}/checkout`,
      {},
      tokenHeaders(stored.resumeToken),
    );
    return data.url;
  },

  complete: async (stored: StoredDraft, sessionId: string) => {
    const { data } = await apiClient.post<CompletionResult>(
      '/onboarding/complete',
      { sessionId },
      tokenHeaders(stored.resumeToken),
    );
    return data;
  },
};
