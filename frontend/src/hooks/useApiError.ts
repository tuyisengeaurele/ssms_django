import { AxiosError } from 'axios';

export function useApiError() {
  const getErrorMessage = (err: unknown): string => {
    if (err instanceof AxiosError) {
      return (
        (err.response?.data as { message?: string })?.message ??
        err.message ??
        'An unexpected error occurred.'
      );
    }
    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred.';
  };

  return { getErrorMessage };
}
