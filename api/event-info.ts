/**
 * Public event-info endpoint (Vercel Function).
 *
 * Event documents hold private fields (owner ID, the cloud folder ID; Google
 * Drive event folders are shared "anyone with the link"), so firestore.rules
 * lets only the owner and admins read them. Guests get just what the guest
 * page needs through here.
 *
 * Body: { eventId } -> { id, name, status, provider }
 * Requires FIREBASE_SERVICE_ACCOUNT.
 */

import { HttpError, handle, json, readJsonBody } from './_lib/http.js';
import { adminDb } from './_lib/firebaseAdmin.js';
import { checkRateLimit } from './_lib/rateLimit.js';

const LOOKUPS_PER_MINUTE = 60;
const PROVIDERS = new Set(['dropbox', 'google', 'onedrive']);
const STATUSES = new Set(['pending', 'scanning', 'ready']);

export function POST(request: Request): Promise<Response> {
  return handle(request, async () => {
    checkRateLimit(request, 'event-info', LOOKUPS_PER_MINUTE);
    const { eventId } = await readJsonBody(request, 1024);
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) {
      throw new HttpError(400, 'invalid_request');
    }

    const snap = await adminDb().doc(`events/${eventId}`).get();
    if (!snap.exists) throw new HttpError(404, 'event_not_found');

    const name = snap.get('name');
    const status = snap.get('status');
    const provider = snap.get('provider');
    return json({
      id: snap.id,
      name: typeof name === 'string' ? name.slice(0, 100) : '',
      status: STATUSES.has(status) ? status : 'pending',
      provider: PROVIDERS.has(provider) ? provider : 'dropbox',
    });
  });
}
