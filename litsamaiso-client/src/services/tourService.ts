import apiClient from '../lib/api';
import type { TourProgress } from '../types';

export const tourService = {
  update: async (action: 'completed' | 'dismissed' | 'reset', version: number) => {
    const { data } = await apiClient.patch<{ tour: TourProgress | null }>('/profile/tour', { action, version });
    return data.tour;
  },
};
