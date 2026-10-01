/**
 * Dropbox OAuth token broker (Vercel Function).
 *
 * Dropbox uses PKCE as a public client, so no client secret is needed; the
 * broker exists to keep the refresh token in an encrypted HttpOnly cookie
 * instead of the browser's storage. See _lib/oauthBroker.ts for the protocol.
 *
 * Required environment variables:
 *   VITE_DROPBOX_CLIENT_ID - Dropbox app key (shared with the SPA)
 *   TOKEN_COOKIE_SECRET    - 32+ character secret that encrypts the refresh-token cookie
 */

import { asBoundedString, createTokenBroker } from './_lib/oauthBroker.js';
import { HttpError } from './_lib/http.js';

export const POST = createTokenBroker({
  cookieName: '__Host-et_dropbox_rt',
  tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
  clientId: () => process.env.DROPBOX_CLIENT_ID || process.env.VITE_DROPBOX_CLIENT_ID,
  defaultExpiresIn: 14_400,
  codeParams: (body, request) => {
    const code = asBoundedString(body.code);
    const verifier = asBoundedString(body.code_verifier, 129);
    if (!code || !verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new HttpError(400, 'invalid_request');
    }
    // The redirect URI must match the one used to start the flow, which is
    // always this origin's dashboard (the origin was already validated).
    return { code, code_verifier: verifier, redirect_uri: `${request.headers.get('origin')}/dashboard` };
  },
  revoke: async (refreshToken, exchange) => {
    // Dropbox revokes through an access token belonging to the grant.
    const { access_token } = await exchange({ grant_type: 'refresh_token', refresh_token: refreshToken });
    await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
    });
  },
});
