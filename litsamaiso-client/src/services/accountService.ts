import apiClient from './authService';
import type { Account } from '../types';

export interface AccountReports {
  scope: {
    institutionId?: string;
    institutionName?: string;
    allInstitutions: boolean;
  };
  reports: {
    summary?: {
      total: number;
      confirmed: number;
      paid: number;
      unconfirmed: number;
      confirmationRate: number;
      paymentRate: number;
    };
    statusBreakdown?: Array<{ label: string; count: number }>;
    confirmedNotPaid?: {
      total: number;
      accounts: Array<{
        contractNumber: string;
        accountNumber: string;
        bankName: string;
        courseOfStudy: string;
        fullnames: string;
        batchNumber: number;
        confirmationDate?: string | null;
      }>;
    };
    stuckConfirmed?: {
      total: number;
      thresholdDays: number;
    };
    anomalies?: {
      total: number;
    };
  };
  catalog: Array<{ key: string; title: string; description: string }>;
}

export const accountService = {
  listAccounts: async (params?: {
    search?: string;
    status?: string;
    batchNumber?: string;
    startDate?: string;
    endDate?: string;
    institutionId?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get<{ accounts: Account[]; batches: number[] }>('/accounts', { params });
    return response.data;
  },

  updateAccount: async (
    accountId: string,
    data: Partial<Pick<Account, 'fullnames' | 'contractNumber' | 'courseOfStudy' | 'bankName' | 'accountNumber' | 'batchNumber' | 'graduating' | 'status'>>
  ) => {
    const response = await apiClient.put<{ account: Account }>(`/accounts/${accountId}`, data);
    return response.data.account;
  },

  getConfirmationStatus: async () => {
    const response = await apiClient.get<{
      confirmed: boolean;
      message: string;
      record?: {
        contractNumber: string;
        accountNumber: string;
        bankName: string;
        status: string;
        confirmationDate?: string;
        graduating?: boolean;
      };
    }>('/accounts/confirmation-status');
    return response.data;
  },

  // Confirm account against the current student's institution.
  confirmAccount: async (confirmationData: {
    contractNumber?: string;
    bankName?: string;
    accountNumber?: string;
    graduating?: boolean;
  }) => {
    const response = await apiClient.post('/accounts/confirm', confirmationData);
    return response.data;
  },

  uploadAccounts: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/accounts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  uploadPaidStudents: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/accounts/load_payed_students', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getReports: async (params?: { institutionId?: string }) => {
    const response = await apiClient.get<AccountReports>('/reports/accounts', { params });
    return response.data;
  },

  getReport: async (reportKey: string, params?: { institutionId?: string; stuckDays?: number; recentDays?: number }) => {
    const response = await apiClient.get(`/reports/accounts/${encodeURIComponent(reportKey)}`, { params });
    return response.data;
  },

  submitCorrection: async (data: {
    correctedBankName: string;
    correctedAccountNumber: string;
    document: File;
  }) => {
    const formData = new FormData();
    formData.append('correctedBankName', data.correctedBankName);
    formData.append('correctedAccountNumber', data.correctedAccountNumber);
    formData.append('document', data.document);

    const response = await apiClient.post('/accounts/resolve', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  financeResolveIssue: async (studentId: string) => {
    const response = await apiClient.post('/accounts/finance-resolve', { studentId });
    return response.data;
  },
};
