import api from './api';

/** The file name the server chose, kept to a plain name. */
export function fileNameFrom(disposition: string | undefined, fallback: string): string {
  const found = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  if (!found) return fallback;
  // A name that carries folders is cut down to its last part.
  return found.split(/[\\/]/).pop() || fallback;
}

/** Hand a file that is already in memory to the browser as a download. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fetch a file through the shared API client, so a stale sign-in is refreshed like any other request,
 * and hand it to the browser as a download.
 */
export async function downloadFile(path: string, params: Record<string, string>, fallbackName: string): Promise<void> {
  const res = await api.get(path, { params, responseType: 'blob' });
  saveBlob(res.data as Blob, fileNameFrom(res.headers?.['content-disposition'] as string | undefined, fallbackName));
}

/**
 * A request that asked for a file gets a refusal as a file too. This reads that refusal back into the object a page expects,
 * so the sentence and the code can be shown. An error with nothing readable in it is left as it is.
 */
export async function readRefusedFile(err: unknown): Promise<void> {
  const response = (err as { response?: { data?: unknown } } | null)?.response;
  if (!response || !(response.data instanceof Blob)) return;
  try {
    response.data = JSON.parse(await response.data.text());
  } catch {
    // Not JSON, so there is nothing a page could use.
  }
}
