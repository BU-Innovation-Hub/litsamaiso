import apiClient from '../lib/api';
import type { BillingStatus, Institution, InstitutionTheme, PlanKey } from '../types';

export interface BillingSummary {
  plan: PlanKey | null;
  planName: string | null;
  status: BillingStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: string | null;
  hasStripeCustomer: boolean;
  locked: boolean;
  lockedBy: 'manual' | 'billing' | null;
  usage: { students: number; studentCap: number | null };
}

export const billingService = {
  getStatus: async (institutionId?: string) => {
    const { data } = await apiClient.get<{ billing: BillingSummary }>('/billing/status', {
      params: institutionId ? { institutionId } : undefined,
    });
    return data.billing;
  },

  /** Returns a Stripe Customer Portal URL for the signed-in InstitutionAdmin. */
  openPortal: async () => {
    const { data } = await apiClient.post<{ url: string }>('/billing/portal');
    return data.url;
  },

  /** Public: renew a subscription for an institution locked for non-payment. */
  renew: async (email: string, password: string) => {
    const { data } = await apiClient.post<{ url: string }>('/billing/renew', { email, password });
    return data.url;
  },

  /** AppAdmin: take billing out of Stripe's hands (manual) or hand it back. */
  overrideBilling: async (institutionId: string, body: { manual: boolean; plan?: PlanKey | null }) => {
    const { data } = await apiClient.patch<{ institution: Institution; billing: BillingSummary }>(
      `/institutions/${institutionId}/billing`,
      body,
    );
    return data;
  },

  updateTheme: async (theme: InstitutionTheme) => {
    const { data } = await apiClient.put<{ institution: Institution }>('/institutions/me/theme', { theme });
    return data.institution;
  },
};
