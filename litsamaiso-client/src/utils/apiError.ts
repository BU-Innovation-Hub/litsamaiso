import { AxiosError } from 'axios';

type ErrorResponse = {
  message?: string;
};

export const getApiErrorMessage = (
  error: unknown,
  fallback: string
): string => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ErrorResponse | undefined;
    return data?.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};
