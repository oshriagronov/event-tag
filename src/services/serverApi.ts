/**
 * Client for EventTag's own API functions (`/api/*`).
 */

import { auth } from '../firebase';

/** A non-2xx response from an API function; `code` is the function's error code. */
export class ServerApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`EventTag API error ${status} (${code})`);
    this.name = 'ServerApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * POST JSON to an API function. With `authenticated`, the signed-in user's
 * Firebase ID token is attached. Network failures reject with the fetch error.
 */
export async function postApi<T>(path: string, body: unknown, { authenticated = false } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) {
    const user = auth.currentUser;
    if (!user) throw new ServerApiError(401, 'unauthenticated');
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) throw new ServerApiError(res.status, typeof data.error === 'string' ? data.error : 'request_failed');
  return data as T;
}
