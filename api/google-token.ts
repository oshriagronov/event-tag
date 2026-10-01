/**
 * Google OAuth token broker (Vercel Function).
 *
 * Google only issues refresh tokens to confidential clients, so the client
 * secret must stay server-side. See _lib/oauthBroker.ts for the protocol.
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_SECRET  - OAuth client secret (server-only, never VITE_ prefixed)
 *   VITE_GOOGLE_CLIENT_ID - OAuth web client ID (shared with the SPA)
 *   TOKEN_COOKIE_SECRET   - 32+ character secret that encrypts the refresh-token cookie
 * Optional:
 *   API_ALLOWED_ORIGINS   - comma-separated list of allowed request origins
 *                           (defaults to the deployment's own origin)
 */

import { asBoundedString, createTokenBroker } from './_lib/oauthBroker.js';
import { HttpError } from './_lib/http.js';

export const POST = createTokenBroker({
  cookieName: '__Host-et_google_rt',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  clientId: () => process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID,
  clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  defaultExpiresIn: 3600,
  codeParams: (body) => {
    const code = asBoundedString(body.code);
    if (!code) throw new HttpError(400, 'invalid_request');
    // GIS popup code flow uses the special "postmessage" redirect URI.
    return { code, redirect_uri: 'postmessage' };
  },
  revoke: async (refreshToken) => {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    });
  },
});
