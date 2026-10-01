/**
 * Scan-result commit endpoint (Vercel Function).
 *
 * Clients cannot create photo or face documents directly (see firestore.rules);
 * every new photo goes through here so the rolling 30-day photo quota is
 * enforced server-side. In one transaction it checks the caller (owner or
 * admin, not blocked, no maintenance mode), counts the photos that do not exist
 * yet against the caller's tier limit, and stores photos, face descriptors,
 * progress counters and the usage counter together.
 *
 * Body: { eventId, photos: [{ id, data }], faces: CloudFaceEntry[], progress? }
 * Requires FIREBASE_SERVICE_ACCOUNT.
 */

import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { HttpError, handle, json, readJsonBody } from './_lib/http.js';
import { adminDb, requireUser } from './_lib/firebaseAdmin.js';
import { toTrustedPhotoUrl } from '../src/utils/photoUrls.js';

const MAX_PHOTOS = 400;
const MAX_FACES = 2000;
const FACES_PER_BATCH = 100;
const EMBEDDING_SIZE = 128;
const CYCLE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMITS = { standard: 500, premium: 10_000 };

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

const isFiniteNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const isString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

interface PhotoWrite {
  id: string;
  data: Record<string, string | number | boolean>;
}

interface FaceEntry {
  photoId: string;
  driveFileId: string;
  embedding: number[];
  box: { x: number; y: number; width: number; height: number };
}

function parsePhoto(raw: unknown): PhotoWrite {
  const photo = raw as { id?: unknown; data?: unknown };
  if (!photo || !isString(photo.id, 128) || !DOC_ID.test(photo.id) || !photo.data || typeof photo.data !== 'object') {
    throw new HttpError(400, 'invalid_photo');
  }
  const data: PhotoWrite['data'] = {};
  for (const [key, value] of Object.entries(photo.data as Record<string, unknown>)) {
    if (value === undefined) continue;
    if ((key === 'driveFileId' && isString(value, 1024)) || (key === 'fileName' && isString(value, 512))) {
      data[key] = value;
    } else if ((key === 'width' || key === 'height') && isFiniteNumber(value, 0, 100_000)) {
      data[key] = value;
    } else if (key === 'processed' && typeof value === 'boolean') {
      data[key] = value;
    } else if (key === 'publicUrl' && typeof value === 'string' && value.length <= 2048) {
      // Guests open these links, so only https links on provider hosts are kept.
      const trusted = toTrustedPhotoUrl(value);
      if (trusted) data[key] = trusted;
    } else {
      throw new HttpError(400, 'invalid_photo');
    }
  }
  return { id: photo.id, data };
}

function parseFace(raw: unknown, photoIds: Set<string>): FaceEntry {
  const face = raw as Partial<FaceEntry>;
  const box = face?.box;
  if (
    !face ||
    !isString(face.photoId, 128) ||
    !photoIds.has(face.photoId) ||
    !isString(face.driveFileId, 1024) ||
    !Array.isArray(face.embedding) ||
    face.embedding.length !== EMBEDDING_SIZE ||
    !face.embedding.every((v) => isFiniteNumber(v, -10, 10)) ||
    !box ||
    !['x', 'y', 'width', 'height'].every((k) => isFiniteNumber(box[k as keyof typeof box], -1, 2))
  ) {
    throw new HttpError(400, 'invalid_face');
  }
  return {
    photoId: face.photoId,
    driveFileId: face.driveFileId,
    embedding: face.embedding,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
  };
}

function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/** premiumUntil is an ISO date ("YYYY-MM-DD"); premium ends at its UTC midnight. */
function isPremiumActive(premiumUntil: unknown, now: number): boolean {
  return typeof premiumUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(premiumUntil) && Date.parse(premiumUntil) > now;
}

function photoLimit(profile: DocumentData | undefined, config: DocumentData | undefined, now: number): number {
  const quotas = config?.quotas as { standard?: { maxPhotosPerMonth?: unknown }; premium?: { maxPhotosPerMonth?: unknown } } | undefined;
  if (isPremiumActive(profile?.premiumUntil, now)) {
    const premium = quotas?.premium?.maxPhotosPerMonth;
    return typeof premium === 'number' ? premium : DEFAULT_LIMITS.premium;
  }
  const standard = quotas?.standard?.maxPhotosPerMonth;
  return typeof standard === 'number' ? standard : DEFAULT_LIMITS.standard;
}

export function POST(request: Request): Promise<Response> {
  return handle(request, async () => {
    const body = await readJsonBody(request, 4 * 1024 * 1024);
    const user = await requireUser(request);

    const { eventId } = body;
    if (!isString(eventId, 128) || !DOC_ID.test(eventId)) throw new HttpError(400, 'invalid_request');
    if (!Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS) throw new HttpError(400, 'invalid_request');
    if (!Array.isArray(body.faces) || body.faces.length > MAX_FACES) throw new HttpError(400, 'invalid_request');

    const photos = body.photos.map(parsePhoto);
    const photoIds = new Set(photos.map((p) => p.id));
    if (photoIds.size !== photos.length) throw new HttpError(400, 'invalid_photo');
    const faces = body.faces.map((face) => parseFace(face, photoIds));

    let progress: { photoCount: number; faceCount: number } | null = null;
    if (body.progress !== undefined && body.progress !== null) {
      const raw = body.progress as { photoCount?: unknown; faceCount?: unknown };
      if (!isFiniteNumber(raw.photoCount, 0, 1_000_000) || !isFiniteNumber(raw.faceCount, 0, 10_000_000)) {
        throw new HttpError(400, 'invalid_request');
      }
      progress = { photoCount: Math.floor(raw.photoCount), faceCount: Math.floor(raw.faceCount) };
    }
    if (photos.length === 0 && faces.length === 0 && !progress) return json({ ok: true, newPhotos: 0 });

    const db = adminDb();
    const eventRef = db.doc(`events/${eventId}`);
    const profileRef = db.doc(`users/${user.uid}`);
    const usageRef = db.doc(`users/${user.uid}/usage/current`);
    const configRef = db.doc('system/config');
    const photoRefs = photos.map((p) => eventRef.collection('photos').doc(p.id));

    const newPhotos = await db.runTransaction(async (tx) => {
      const [eventSnap, profileSnap, usageSnap, configSnap, ...photoSnaps] = await tx.getAll(
        eventRef,
        profileRef,
        usageRef,
        configRef,
        ...photoRefs
      );
      if (!eventSnap.exists) throw new HttpError(404, 'event_not_found');
      const profile = profileSnap.data();
      const config = configSnap.data();
      const isAdmin = profile?.role === 'admin';
      if (eventSnap.get('ownerId') !== user.uid && !isAdmin) throw new HttpError(403, 'forbidden');
      if (profile?.status === 'blocked') throw new HttpError(403, 'blocked');
      if (config?.maintenanceMode === true && !isAdmin) throw new HttpError(503, 'maintenance');

      const created = photoSnaps.filter((snap) => !snap.exists).length;
      const now = Date.now();
      if (created > 0) {
        const cycleReset = toMillis(usageSnap.get('cycleReset'));
        const cycleActive = usageSnap.exists && cycleReset !== null && cycleReset > now;
        const used = cycleActive ? Number(usageSnap.get('photosThisCycle')) || 0 : 0;
        if (!isAdmin && used + created > photoLimit(profile, config, now)) {
          throw new HttpError(403, 'photo_limit_reached');
        }
        tx.set(
          usageRef,
          cycleActive
            ? { photosThisCycle: used + created, updatedAt: FieldValue.serverTimestamp() }
            : {
                cycleStart: FieldValue.serverTimestamp(),
                cycleReset: Timestamp.fromMillis(now + CYCLE_MS),
                photosThisCycle: created,
                updatedAt: FieldValue.serverTimestamp(),
              },
          { merge: cycleActive }
        );
      }

      photos.forEach((photo, i) => {
        const isNew = !photoSnaps[i].exists;
        if (isNew && (typeof photo.data.driveFileId !== 'string' || typeof photo.data.fileName !== 'string')) {
          throw new HttpError(400, 'invalid_photo');
        }
        tx.set(photoRefs[i], photo.data, { merge: true });
      });
      for (let i = 0; i < faces.length; i += FACES_PER_BATCH) {
        tx.create(eventRef.collection('faceBatches').doc(), {
          batchIndex: now + i,
          faces: faces.slice(i, i + FACES_PER_BATCH),
        });
      }
      if (progress) tx.update(eventRef, progress);
      return created;
    });

    return json({ ok: true, newPhotos });
  });
}
