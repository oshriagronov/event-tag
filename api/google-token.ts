/**
 * Google OAuth token broker (Vercel Function).
 *
 * Google only issues refresh tokens to confidential clients, so the client
 * secret must stay server-side. This endpoint exchanges a GIS authorization
 * code for renewable credentials and renews access tokens on demand. It never
 * stores tokens and never touches photo data.
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_SECRET  - OAuth client secret (server-only, never VITE_ prefixed)
 *   VITE_GOOGLE_CLIENT_ID - OAuth web client ID (shared with the SPA)
 * Optional:
 *   GOOGLE_OAUTH_ALLOWED_ORIGINS - comma-separated list of allowed request origins
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface TokenRequestBody {
  grant_type?: unknown;
  code?: unknown;
  refresh_token?: unknown;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function isOriginAllowed(request: Request): boolean {
  const allowed = (process.env.GOOGLE_OAUTH_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const origin = request.headers.get('origin');
  return Boolean(origin && allowed.includes(origin));
}

export async function POST(request: Request): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return json({ error: 'not_configured' }, 501);
  }
  if (!isOriginAllowed(request)) {
    return json({ error: 'forbidden_origin' }, 403);
  }

  let body: TokenRequestBody;
  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  if (body.grant_type === 'authorization_code' && typeof body.code === 'string' && body.code.length < 2048) {
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
    // GIS popup code flow uses the special "postmessage" redirect URI.
    params.set('redirect_uri', 'postmessage');
  } else if (
    body.grant_type === 'refresh_token' &&
    typeof body.refresh_token === 'string' &&
    body.refresh_token.length < 2048
  ) {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refresh_token);
  } else {
    return json({ error: 'invalid_request' }, 400);
  }

  let googleRes: Response;
  try {
    googleRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
  } catch {
    return json({ error: 'upstream_unavailable' }, 502);
  }

  const data = (await googleRes.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!googleRes.ok || !data.access_token) {
    // invalid_grant means the code was reused or the refresh token was revoked:
    // the client must reconnect. Everything else is treated as transient.
    if (data.error === 'invalid_grant') return json({ error: 'invalid_grant' }, 401);
    return json({ error: data.error || 'token_exchange_failed' }, googleRes.status >= 500 ? 502 : 400);
  }

  return json({
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3600,
    refresh_token: data.refresh_token,
    scope: data.scope,
  });
}
