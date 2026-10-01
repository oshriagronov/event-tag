/**
 * Cloud-provider OAuth token broker shared by the Google and Dropbox functions.
 *
 * Every call must carry the caller's Firebase ID token and comes from an
 * allowed origin. The provider refresh token lives only in an encrypted
 * HttpOnly cookie (see tokenCookie.ts); responses carry short-lived access
 * tokens. Photos and tokens are never stored server-side.
 *
 * Actions (`grant_type`):
 *   authorization_code - exchange a code; keeps the refresh token in the cookie
 *   refresh_token      - mint a new access token from the cookie
 *   revoke             - revoke the grant at the provider and clear the cookie
 * A `legacy_refresh_token` from older builds (kept in localStorage) is accepted
 * once so existing connections move into the cookie without reconnecting.
 */

import { HttpError, handle, json, readJsonBody } from './http.js';
import { assertNotBlocked, requireUser } from './firebaseAdmin.js';
import { clearCookieHeader, openRefreshToken, readCookie, sealRefreshToken, setCookieHeader } from './tokenCookie.js';

export interface ProviderTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

export interface BrokerConfig {
  cookieName: string;
  tokenUrl: string;
  clientId: () => string | undefined;
  clientSecret?: () => string | undefined;
  defaultExpiresIn: number;
  /** Provider-specific parameters for an authorization-code exchange (without client credentials). */
  codeParams: (body: Record<string, unknown>, request: Request) => Record<string, string>;
  revoke: (refreshToken: string, exchange: (params: Record<string, string>) => Promise<ProviderTokens>) => Promise<void>;
}

export const asBoundedString = (value: unknown, max = 2048): string | null =>
  typeof value === 'string' && value.length > 0 && value.length < max ? value : null;

export function createTokenBroker(config: BrokerConfig) {
  async function exchange(params: Record<string, string>): Promise<ProviderTokens> {
    const clientId = config.clientId();
    const clientSecret = config.clientSecret?.();
    if (!clientId || (config.clientSecret && !clientSecret)) throw new HttpError(501, 'not_configured');
    const form = new URLSearchParams({ ...params, client_id: clientId });
    if (clientSecret) form.set('client_secret', clientSecret);

    let res: Response;
    try {
      res = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
    } catch {
      throw new HttpError(502, 'upstream_unavailable');
    }
    const data = (await res.json().catch(() => ({}))) as Partial<ProviderTokens> & { error?: string };
    if (!res.ok || !data.access_token) {
      // invalid_grant: the code was reused or the grant was revoked, so the
      // user must reconnect. Everything else is treated as transient.
      if (data.error === 'invalid_grant') throw new HttpError(401, 'invalid_grant');
      const code = /^[a-z_]{1,64}$/.test(data.error || '') ? (data.error as string) : 'token_exchange_failed';
      throw new HttpError(res.status >= 500 ? 502 : 400, code);
    }
    return {
      access_token: data.access_token,
      expires_in: data.expires_in ?? config.defaultExpiresIn,
      refresh_token: data.refresh_token,
    };
  }

  return function POST(request: Request): Promise<Response> {
    return handle(request, async () => {
      if (!config.clientId()) throw new HttpError(501, 'not_configured');
      const body = await readJsonBody(request, 8192);
      const user = await requireUser(request);
      await assertNotBlocked(user);

      const stored = openRefreshToken(config.cookieName, readCookie(request, config.cookieName), user.uid);
      const legacy = asBoundedString(body.legacy_refresh_token);

      const respond = (tokens: ProviderTokens, refreshToken: string | null | undefined) =>
        json(
          { access_token: tokens.access_token, expires_in: tokens.expires_in, has_refresh_token: Boolean(refreshToken) },
          200,
          refreshToken
            ? { 'Set-Cookie': setCookieHeader(config.cookieName, sealRefreshToken(config.cookieName, user.uid, refreshToken)) }
            : {}
        );

      switch (body.grant_type) {
        case 'authorization_code': {
          const tokens = await exchange({ grant_type: 'authorization_code', ...config.codeParams(body, request) });
          return respond(tokens, tokens.refresh_token || stored || legacy);
        }
        case 'refresh_token': {
          const refreshToken = stored || legacy;
          if (!refreshToken) throw new HttpError(401, 'invalid_grant');
          try {
            const tokens = await exchange({ grant_type: 'refresh_token', refresh_token: refreshToken });
            return respond(tokens, tokens.refresh_token || refreshToken);
          } catch (error) {
            if (error instanceof HttpError && error.code === 'invalid_grant') {
              return json({ error: 'invalid_grant' }, 401, { 'Set-Cookie': clearCookieHeader(config.cookieName) });
            }
            throw error;
          }
        }
        case 'revoke': {
          const refreshToken = stored || legacy;
          if (refreshToken) {
            await config.revoke(refreshToken, exchange).catch((error) => console.warn('Token revocation failed:', error));
          }
          return json({ ok: true }, 200, { 'Set-Cookie': clearCookieHeader(config.cookieName) });
        }
        default:
          throw new HttpError(400, 'invalid_request');
      }
    });
  };
}

