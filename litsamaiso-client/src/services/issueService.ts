import apiClient from '../lib/api';

export const issueService = {
  listIssues: async (params?: { limit?: number }) => {
    const response = await apiClient.get<{ issues: any[] }>('/issues', { params });
    return response.data.issues;
  },
  createIssue: async (payload: { borrowerNumber: string; bankName: string; accountNumber: string; proofUrls?: string[]; notes?: string }) => {
    const response = await apiClient.post('/issues', payload);
    return response.data;
  },
  updateIssue: async (id: string, data: { bankName?: string; accountNumber?: string; notes?: string; proofUrls?: string[] }) => {
    const response = await apiClient.put(`/issues/${encodeURIComponent(id)}`, data);
    return response.data;
  },
  deleteIssuesForStudent: async () => {
    const response = await apiClient.delete('/issues');
    return response.data;
  },
};
