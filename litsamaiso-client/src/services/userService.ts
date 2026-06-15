import apiClient from './authService';
import type { Role, User } from '../types';

export const userService = {
  // Get all users (admin/institution admin)
  getUsers: async (params?: {
    search?: string;
    role?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<{ users: User[] }>(
      '/users',
      { params }
    );
    return response.data.users;
  },

  // Get user by ID
  getUser: async (userId: string) => {
    const response = await apiClient.get<{ user: User }>(`/users/${userId}`);
    return response.data.user;
  },

  getRoles: async () => {
    const response = await apiClient.get<{ roles: Role[] }>('/users/roles');
    return response.data.roles;
  },

  // Update user profile
  updateUser: async (userId: string, data: {
    name?: string;
    email?: string;
    role?: string;
    studentId?: string;
    institution?: string;
    password?: string;
    faceDescriptor?: number[];
    faceImageUrl?: string;
  }) => {
    const response = await apiClient.put<{ user: User }>(`/users/${userId}`, data);
    return response.data.user;
  },

  deleteUser: async (userId: string) => {
    const response = await apiClient.delete<{ message: string }>(`/users/${userId}`);
    return response.data;
  },

  // Change password
  changePassword: async (oldPassword: string, newPassword: string) => {
    const response = await apiClient.post('/users/change-password', {
      oldPassword,
      newPassword,
    });
    return response.data;
  },

};
