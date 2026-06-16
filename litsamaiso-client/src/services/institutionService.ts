import apiClient from './authService';
import type { Institution, User } from '../types';

export interface InstitutionUsersResponse {
  institution: Institution;
  users: User[];
  roleCounts: Array<{ role: string; count: number }>;
  total: number;
}

export const institutionService = {
  getInstitutions: async () => {
    const response = await apiClient.get<{ institutions: Institution[] }>('/institutions');
    return response.data.institutions;
  },

  createInstitution: async (data: {
    name: string;
    email: string;
    adminName?: string;
    adminEmail: string;
    adminPassword: string;
  }) => {
    const response = await apiClient.post<{
      institution: Institution;
      admin: {
        id: string;
        email: string;
        name?: string;
        role: string;
        institution: string;
      };
    }>('/institutions', data);
    return response.data;
  },

  updateInstitution: async (
    institutionId: string,
    data: { name: string; email: string },
  ) => {
    const response = await apiClient.put<{ institution: Institution }>(
      `/institutions/${institutionId}`,
      data,
    );
    return response.data.institution;
  },

  lockInstitution: async (institutionId: string, reason?: string) => {
    const response = await apiClient.post<{ institution: Institution }>(
      `/institutions/${institutionId}/lock`,
      { reason },
    );
    return response.data.institution;
  },

  unlockInstitution: async (institutionId: string) => {
    const response = await apiClient.post<{ institution: Institution }>(
      `/institutions/${institutionId}/unlock`,
    );
    return response.data.institution;
  },

  deleteInstitution: async (institutionId: string) => {
    const response = await apiClient.delete<{
      message: string;
      deleted: Record<string, number>;
    }>(`/institutions/${institutionId}`);
    return response.data;
  },

  getInstitutionUsers: async (
    institutionId: string,
    params?: { search?: string; role?: string },
  ) => {
    const response = await apiClient.get<InstitutionUsersResponse>(
      `/institutions/${institutionId}/users`,
      { params },
    );
    return response.data;
  },

  createInstitutionRoleUser: async (
    institutionId: string,
    data: {
      name?: string;
      email: string;
      password: string;
      role: string;
      studentId?: string;
    },
  ) => {
    const response = await apiClient.post<{ message: string; user: User }>(
      `/institutions/${institutionId}/users`,
      data,
    );
    return response.data;
  },
};
