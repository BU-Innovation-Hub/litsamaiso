import apiClient from '../lib/api';
import type { AuditLogsResponse } from '../types';

export const auditLogService = {
  getAuditLogs: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await apiClient.get<AuditLogsResponse>(
      '/audit-logs',
      { params },
    );
    return response.data;
  },
};
