/* eslint-disable @typescript-eslint/no-explicit-any */
import apiClient from '../lib/api';
import type { BranchCode } from '../types';

export const branchCodeService = {
  list: async (params?: { search?: string; institutionId?: string }) => {
    const response = await apiClient.get<{ data: BranchCode[] }>('/branch-codes', { params });
    return response.data.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get<{ data: BranchCode }>(`/branch-codes/${encodeURIComponent(id)}`);
    return response.data.data;
  },

  create: async (data: { bankName: string; branchCode: string; description?: string; institutionId?: string }) => {
    const response = await apiClient.post<{ data: BranchCode }>('/branch-codes', data);
    return response.data.data;
  },

  update: async (id: string, data: { bankName?: string; branchCode?: string; description?: string }) => {
    const response = await apiClient.put<{ data: BranchCode }>(`/branch-codes/${encodeURIComponent(id)}`, data);
    return response.data.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete<{ message: string }>(`/branch-codes/${encodeURIComponent(id)}`);
    return response.data;
  },

  getMissingBanks: async () => {
    const response = await apiClient.get<{ data: string[] }>('/branch-codes/missing-banks');
    return response.data.data;
  },

  createMissingBanks: async () => {
    const response = await apiClient.post<{ message: string; result: { created: number; bankNames: string[] } }>('/branch-codes/create-missing');
    return response.data;
  },
};
