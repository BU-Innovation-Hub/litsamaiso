import axios from 'axios';

type ErrorResponse = {
  message?: string;
  error?: string;
};

export const getApiErrorMessage = (
  error: unknown,
  fallback: string
): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ErrorResponse | undefined;
    return data?.message || data?.error || fallback;
  }

  if (error && typeof error === 'object') {
    const direct = error as ErrorResponse;
    if (direct.message || direct.error) {
      return direct.message || direct.error || fallback;
    }

    const response = (error as { response?: { data?: ErrorResponse } }).response;
    const data = response?.data;
    if (data?.message || data?.error) {
      return data.message || data.error || fallback;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};
