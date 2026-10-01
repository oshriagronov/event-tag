/**
 * Firebase Admin access for the API functions.
 *
 * FIREBASE_SERVICE_ACCOUNT (service-account JSON, raw or base64) grants full
 * database access and is required by the endpoints that read or write data on
 * behalf of users (commit-scan, match). Verifying Firebase ID tokens only needs
 * the project ID, so the OAuth token brokers keep working without it.
 *
 * ID tokens are verified with `jose` rather than `firebase-admin/auth`: the
 * latter loads jwks-rsa, which require()s the ESM-only jose and crashes on
 * Vercel's Node runtime (ERR_REQUIRE_ESM). Do not import firebase-admin/auth.
 */

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import { HttpError } from './http.js';

interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

function readServiceAccount(): ServiceAccountJson | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as ServiceAccountJson;
  } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
    return null;
  }
}

export function firebaseProjectId(): string {
  const projectId =
    readServiceAccount()?.project_id || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(501, 'not_configured');
  return projectId;
}

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const account = readServiceAccount();
  if (account?.client_email && account.private_key) {
    return initializeApp({
      credential: cert({
        projectId: account.project_id,
        clientEmail: account.client_email,
        privateKey: account.private_key.replace(/\\n/g, '\n'),
      }),
      projectId: account.project_id,
    });
  }
  return initializeApp({ projectId: firebaseProjectId() });
}

/** True when the functions can read and write Firestore with admin rights. */
export function hasAdminDatabaseAccess(): boolean {
  return Boolean(readServiceAccount()?.private_key || process.env.FIRESTORE_EMULATOR_HOST);
}

export function adminDb(): Firestore {
  if (!hasAdminDatabaseAccess()) throw new HttpError(501, 'not_configured');
  return getFirestore(adminApp());
}

export interface AuthedUser {
  uid: string;
  email: string | null;
  idToken: string;
}

// Google's public keys for Firebase ID tokens (cached and rotated by jose).
const FIREBASE_ID_TOKEN_KEYS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/**
 * Verify a Firebase ID token as documented for third-party JWT libraries:
 * RS256 signature by Google, issuer/audience of this project, unexpired, and a
 * non-empty subject (the uid).
 */
async function verifyFirebaseIdToken(token: string): Promise<JWTPayload> {
  const projectId = firebaseProjectId();
  let payload: JWTPayload;
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // The Auth emulator issues unsigned tokens; never set this variable in production.
    payload = decodeJwt(token);
    if (payload.aud !== projectId) throw new Error('wrong audience');
  } else {
    ({ payload } = await jwtVerify(token, FIREBASE_ID_TOKEN_KEYS, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 60,
    }));
    const authTime = payload.auth_time;
    if (typeof authTime !== 'number' || authTime * 1000 > Date.now() + 60_000) throw new Error('invalid auth_time');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
    throw new Error('invalid subject');
  }
  return payload;
}

/** Verify the caller's Firebase ID token (`Authorization: Bearer <token>`). */
export async function requireUser(request: Request): Promise<AuthedUser> {
  const match = /^Bearer\s+(\S+)$/.exec(request.headers.get('authorization') || '');
  if (!match) throw new HttpError(401, 'unauthenticated');
  try {
    const payload = await verifyFirebaseIdToken(match[1]);
    return {
      uid: payload.sub as string,
      email: typeof payload.email === 'string' ? payload.email : null,
      idToken: match[1],
    };
  } catch {
    throw new HttpError(401, 'unauthenticated');
  }
}

/**
 * Reject blocked users. Uses admin access when available, otherwise reads the
 * caller's own profile through the Firestore REST API with their ID token
 * (the security rules let users read their own profile).
 */
export async function assertNotBlocked(user: AuthedUser): Promise<void> {
  let status: unknown;
  if (hasAdminDatabaseAccess()) {
    status = (await adminDb().doc(`users/${user.uid}`).get()).get('status');
  } else {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId()}/databases/(default)/documents/users/${encodeURIComponent(user.uid)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${user.idToken}` } });
    if (res.status === 404) return;
    if (!res.ok) throw new HttpError(503, 'profile_unavailable');
    const doc = (await res.json()) as { fields?: { status?: { stringValue?: string } } };
    status = doc.fields?.status?.stringValue;
  }
  if (status === 'blocked') throw new HttpError(403, 'blocked');
}
