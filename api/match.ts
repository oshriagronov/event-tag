/**
 * Guest face-matching endpoint (Vercel Function).
 *
 * The guest's selfie is processed on their device; only its 128-number face
 * descriptor is sent here. It is compared with the event's stored descriptors
 * in memory and never stored or logged. Only the guest's own matching photos
 * are returned, so guests can no longer download every attendee's face data
 * or the full photo list (both are owner-only in firestore.rules).
 *
 * Body: { eventId, descriptor: number[128] }
 * Requires FIREBASE_SERVICE_ACCOUNT.
 */

import { HttpError, handle, json, readJsonBody } from './_lib/http.js';
import { adminDb } from './_lib/firebaseAdmin.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { toTrustedPhotoUrl } from '../src/utils/photoUrls.js';

// Strict threshold on L2-normalized SFace descriptors, to prevent false positives.
const MATCH_THRESHOLD = 0.85;
const EMBEDDING_SIZE = 128;
const MAX_RESULTS = 500;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_EVENTS = 50;
const MATCHES_PER_MINUTE = 20;

interface StoredFace {
  photoId: string;
  driveFileId: string;
  embedding: number[];
  box: { x: number; y: number; width: number; height: number };
}

const faceCache = new Map<string, { expiresAt: number; faces: StoredFace[] }>();

async function loadFaces(eventId: string): Promise<StoredFace[]> {
  const cached = faceCache.get(eventId);
  if (cached && cached.expiresAt > Date.now()) return cached.faces;

  const db = adminDb();
  const eventRef = db.doc(`events/${eventId}`);
  if (!(await eventRef.get()).exists) throw new HttpError(404, 'event_not_found');
  const batches = await eventRef.collection('faceBatches').get();
  const faces = batches.docs.flatMap((doc) => (doc.get('faces') as StoredFace[] | undefined) || []);

  if (faceCache.size >= CACHE_MAX_EVENTS) faceCache.delete(faceCache.keys().next().value as string);
  faceCache.set(eventId, { expiresAt: Date.now() + CACHE_TTL_MS, faces });
  return faces;
}

function euclideanDistance(a: number[], b: number[]): number {
  if (!Array.isArray(b) || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function POST(request: Request): Promise<Response> {
  return handle(request, async () => {
    checkRateLimit(request, 'match', MATCHES_PER_MINUTE);
    const body = await readJsonBody(request, 16 * 1024);
    const { eventId, descriptor } = body;
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) {
      throw new HttpError(400, 'invalid_request');
    }
    if (
      !Array.isArray(descriptor) ||
      descriptor.length !== EMBEDDING_SIZE ||
      !descriptor.every((v) => typeof v === 'number' && Number.isFinite(v))
    ) {
      throw new HttpError(400, 'invalid_request');
    }
    // Descriptors are L2-normalized; reject arbitrary probe vectors.
    const norm = Math.sqrt(descriptor.reduce((sum: number, v: number) => sum + v * v, 0));
    if (norm < 0.9 || norm > 1.1) throw new HttpError(400, 'invalid_request');

    const faces = await loadFaces(eventId);

    // Keep the best match per photo.
    const best = new Map<string, { face: StoredFace; distance: number }>();
    for (const face of faces) {
      const distance = euclideanDistance(descriptor as number[], face.embedding);
      if (distance >= MATCH_THRESHOLD) continue;
      const current = best.get(face.driveFileId);
      if (!current || distance < current.distance) best.set(face.driveFileId, { face, distance });
    }
    const ranked = [...best.values()].sort((a, b) => a.distance - b.distance).slice(0, MAX_RESULTS);
    if (ranked.length === 0) return json({ matches: [] });

    const db = adminDb();
    const photoIds = [...new Set(ranked.map((m) => m.face.photoId))].filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id));
    const photoSnaps = photoIds.length
      ? await db.getAll(...photoIds.map((id) => db.doc(`events/${eventId}/photos/${id}`)), {
          fieldMask: ['publicUrl', 'fileName'],
        })
      : [];
    const photoInfo = new Map(photoSnaps.map((snap) => [snap.id, snap.data() || {}]));

    const matches = ranked.map(({ face, distance }) => {
      const info = photoInfo.get(face.photoId) as { publicUrl?: string; fileName?: string } | undefined;
      return {
        photoId: face.photoId,
        driveFileId: face.driveFileId,
        distance,
        box: face.box,
        publicUrl: toTrustedPhotoUrl(info?.publicUrl) || undefined,
        fileName: typeof info?.fileName === 'string' ? info.fileName : undefined,
      };
    });
    return json({ matches });
  });
}
