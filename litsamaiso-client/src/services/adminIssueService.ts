import apiClient from '../lib/api';

export const adminIssueService = {
  listIssues: async (params?: { status?: string; search?: string }) => {
    const response = await apiClient.get('/admin/issues', { params });
    return response.data.data;
  },
  approveIssue: async (id: string) => {
    const response = await apiClient.put(`/admin/issues/${encodeURIComponent(id)}/approve`);
    return response.data;
  },
  rejectIssue: async (id: string, reason?: string) => {
    const response = await apiClient.put(`/admin/issues/${encodeURIComponent(id)}/reject`, { reason });
    return response.data;
  },
};
