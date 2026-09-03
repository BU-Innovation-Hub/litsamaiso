import apiClient, { API_BASE_URL } from '../lib/api';

export interface StudentImportProgress {
  type?: 'started' | 'progress' | 'completed' | 'error';
  message?: string;
  processed: number;
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  percent: number;
}

interface StudentUploadResult {
  message: string;
  result?: {
    inserted: number;
    skipped: number;
    errors: string[];
    total?: number;
  };
}

const parseStreamError = (text: string) => {
  try {
    const data = JSON.parse(text);
    return data.message || text;
  } catch {
    return text || 'Upload failed';
  }
};

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

  uploadStudents: async (
    file: File,
    institutionId?: string,
    onProgress?: (progress: StudentImportProgress) => void,
  ): Promise<StudentUploadResult> => {
    const formData = new FormData();
    // AppAdmin imports on behalf of a chosen institution; other roles are
    // pinned to their own institution server-side and this field is ignored.
    if (institutionId) {
      formData.append('institutionId', institutionId);
    }
    formData.append('file', file);

    if (onProgress) {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/students/upload?stream=1`, {
        method: 'POST',
        headers: {
          Accept: 'application/x-ndjson',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok || !response.body) {
        throw new Error(parseStreamError(await response.text()));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed: StudentUploadResult | null = null;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === 'error') {
            throw new Error(event.message || 'Upload failed');
          }

          if (event.type === 'started' || event.type === 'progress' || event.type === 'completed') {
            onProgress(event as StudentImportProgress);
          }

          if (event.type === 'completed') {
            completed = {
              message: event.message || 'Import completed',
              result: event.result,
            };
          }
        }

        if (done) break;
      }

      if (buffer.trim()) {
        const event = JSON.parse(buffer);
        if (event.type === 'error') {
          throw new Error(event.message || 'Upload failed');
        }
        if (event.type === 'completed') {
          onProgress(event as StudentImportProgress);
          completed = {
            message: event.message || 'Import completed',
            result: event.result,
          };
        }
      }

      return completed || { message: 'Import completed' };
    }

    const response = await apiClient.post('/students/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data as StudentUploadResult;
  },
};
