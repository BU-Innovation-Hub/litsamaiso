import apiClient from './authService';

export const issueService = {
  listIssues: async () => {
    const response = await apiClient.get<{ issues: any[] }>('/issues');
    return response.data.issues;
  },
  createIssue: async (payload: { contractNumber: string; bankName: string; accountNumber: string; proofUrls?: string[]; notes?: string }) => {
    const response = await apiClient.post('/issues', payload);
    return response.data;
  },
  deleteIssuesForStudent: async () => {
    const response = await apiClient.delete('/issues');
    return response.data;
  },
};
