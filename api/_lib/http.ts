/** Shared request/response helpers for the API functions. */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

/**
 * Browsers always send Origin on POST. Requests must come from an explicitly
 * allowed origin (API_ALLOWED_ORIGINS, or the older GOOGLE_OAUTH_ALLOWED_ORIGINS)
 * or, when none are configured, from the deployment itself.
 */
export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = (process.env.API_ALLOWED_ORIGINS || process.env.GOOGLE_OAUTH_ALLOWED_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowed.length > 0) return allowed.includes(origin);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Parse a JSON request body of at most `maxBytes`. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type');
  }
  if (Number(request.headers.get('content-length') || 0) > maxBytes) {
    throw new HttpError(413, 'payload_too_large');
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large');
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid_request');
  }
}

/** Run a handler, turning HttpErrors into JSON responses and hiding internal errors. */
export async function handle(request: Request, handler: () => Promise<Response>): Promise<Response> {
  try {
    if (!isOriginAllowed(request)) throw new HttpError(403, 'forbidden_origin');
    return await handler();
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code }, error.status);
    console.error('API request failed:', error);
    return json({ error: 'internal' }, 500);
  }
}
