import apiClient from '../lib/api';

export type FinancialStatus = 'pending' | 'confirmed' | 'paid';

export interface EmailRecipientSelection {
  role: string;
  financialStatus?: FinancialStatus;
  batchNumber?: number;
}

export interface GeneratedEmailDraft {
  subject: string;
  body: string;
}

export interface EmailComposerJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  recipientSelection?: EmailRecipientSelection;
  totalRecipients: number;
  successfulSends: number;
  failedSends: number;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}

export const aiEmailComposerService = {
  countRecipients: async (selection: EmailRecipientSelection) => {
    const response = await apiClient.get<{ count: number }>(
      '/admin/email-composer/recipient-count',
      { params: selection },
    );
    return response.data.count;
  },

  generateEmail: async (input: {
    prompt: string;
    tone: string;
    recipientSelection?: EmailRecipientSelection;
  }) => {
    const response = await apiClient.post<{ draft: GeneratedEmailDraft }>(
      '/admin/email-composer/generate',
      input,
    );
    return response.data.draft;
  },

  sendEmail: async (input: {
    recipients: EmailRecipientSelection;
    subject: string;
    body: string;
  }) => {
    const response = await apiClient.post<{
      message: string;
      job: EmailComposerJob;
    }>('/admin/email-composer/send', input);
    return response.data;
  },

  getJob: async (jobId: string) => {
    const response = await apiClient.get<{ job: EmailComposerJob }>(
      `/admin/email-composer/jobs/${jobId}`,
    );
    return response.data.job;
  },
};
