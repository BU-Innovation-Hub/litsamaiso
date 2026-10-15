import apiClient from '../lib/api';
import type { Institution, User } from '../types';

export interface UserProfile {
  id: string;
  _id?: string;
  name: string;
  email: string;
  studentId: string;
  studentCardUrl: string;
  faceImageUrl?: string;
  // Whether a face is on file from the profile photo, needed before voting
  hasFaceProfile?: boolean;
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

  // Saves a camera photo as the profile photo; the server keeps its face for voter checks
  uploadFacePhoto: async (photo: Blob): Promise<UserProfile> => {
    const formData = new FormData();
    formData.append('photo', photo, 'profile-photo.jpg');

    const response = await apiClient.post<{ data: UserProfile }>(
      '/profile/face',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    return unwrapProfile(response.data);
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
