import apiClient from './authService';
import type { Institution, User } from '../types';

export interface UserProfile {
  id: string;
  _id?: string;
  name: string;
  email: string;
  studentId: string;
  studentCardUrl: string;
  faceImageUrl?: string;
  role: string;
  institution?: Institution;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateProfilePayload {
  name: string;
  email: string;
  studentCardUrl?: string;
}

const unwrapProfile = (data: { data: UserProfile }): UserProfile => data.data;

export const profileService = {
  getProfile: async (): Promise<UserProfile> => {
    const response = await apiClient.get<{ data: UserProfile }>('/profile');
    return unwrapProfile(response.data);
  },

  updateProfile: async (
    payload: UpdateProfilePayload
  ): Promise<UserProfile> => {
    const response = await apiClient.put<{ data: UserProfile }>('/profile', payload);
    return unwrapProfile(response.data);
  },

  uploadProfileImage: async (file: File): Promise<{ url: string; publicId: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<{ url: string; publicId: string }>(
      '/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    return response.data;
  },
};

export const mergeProfileIntoUser = (
  currentUser: User | null,
  profile: UserProfile
): User => ({
  ...(currentUser || {
    id: profile.id,
    email: profile.email,
    role: { _id: profile.role, name: profile.role as User['role']['name'] },
  }),
  id: profile.id,
  _id: profile._id || profile.id,
  name: profile.name,
  email: profile.email,
  studentId: profile.studentId,
  studentCardUrl: profile.studentCardUrl,
  faceImageUrl: profile.faceImageUrl,
  institution: profile.institution || currentUser?.institution,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});
