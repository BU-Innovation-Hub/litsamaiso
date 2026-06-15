import apiClient from './authService';

export const studentService = {
  getStudentStats: async () => {
    const response = await apiClient.get<{
      stats: {
        total: number;
        active: number;
        inactive: number;
        registeredUsers: number;
        unregistered: number;
      };
    }>('/students/stats');

    return response.data.stats;
  },

  uploadStudents: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/students/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data as {
      message: string;
      result?: {
        inserted: number;
        skipped: number;
        errors: string[];
      };
    };
  },
};
