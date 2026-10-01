/**
 * Refresh tokens are kept in an encrypted, HttpOnly cookie instead of the
 * browser's localStorage, so page scripts can never read them. The cookie is
 * sealed with AES-256-GCM under TOKEN_COOKIE_SECRET and bound to the Firebase
 * user ID, so it only works for the account that connected the provider.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { HttpError } from './http.js';

const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function cookieKey(): Buffer {
  const secret = process.env.TOKEN_COOKIE_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(501, 'not_configured');
  return createHash('sha256').update(secret).digest();
}

export function sealRefreshToken(cookieName: string, uid: string, refreshToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(), iv);
  cipher.setAAD(Buffer.from(cookieName));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ u: uid, t: refreshToken }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

/** Return the refresh token in the cookie if it belongs to `uid`, otherwise null. */
export function openRefreshToken(cookieName: string, sealed: string | null, uid: string): string | null {
  if (!sealed) return null;
  const key = cookieKey();
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(cookieName));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plain) as { u?: unknown; t?: unknown };
    return payload.u === uid && typeof payload.t === 'string' ? payload.t : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function setCookieHeader(name: string, value: string): string {
  return `${name}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookieHeader(name: string): string {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
