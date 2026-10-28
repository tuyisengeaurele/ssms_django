import api from './api';

/** The file name the server chose, kept to a plain name. */
export function fileNameFrom(disposition: string | undefined, fallback: string): string {
  const found = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  if (!found) return fallback;
  // A name that carries folders is cut down to its last part.
  return found.split(/[\\/]/).pop() || fallback;
}

/**
 * Fetch a file through the shared API client, so a stale sign-in is refreshed like any other request,
 * and hand it to the browser as a download.
 */
export async function downloadFile(path: string, params: Record<string, string>, fallbackName: string): Promise<void> {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameFrom(res.headers?.['content-disposition'] as string | undefined, fallbackName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
