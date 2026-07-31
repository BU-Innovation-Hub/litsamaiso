import apiClient from '../lib/api';
import type { FeedbackStatusResponse, FeedbackSubmission } from '../types';

export const feedbackService = {
  getStatus: async (): Promise<FeedbackStatusResponse> => {
    const response = await apiClient.get<FeedbackStatusResponse>('/feedback/status');
    return response.data;
  },

  submit: async (payload: FeedbackSubmission): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/feedback', payload);
    return response.data;
  },
};
