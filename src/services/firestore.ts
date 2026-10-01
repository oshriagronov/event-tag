/**
 * Firestore data layer for EventTag
 * Stores event metadata, photo references, and face descriptors in the cloud
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import type { CloudProvider } from './cloudProviders';
import { postApi } from './serverApi';

// ---- Types ----

export interface CloudEvent {
  id?: string;
  ownerId: string;
  name: string;
  driveFolderId: string;
  driveFolderName: string;
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>;
  status: 'pending' | 'scanning' | 'ready';
  photoCount: number;
  faceCount: number;
  provider?: CloudProvider;
}

export interface CloudPhoto {
  id?: string;
  driveFileId: string;
  fileName: string;
  width: number;
  height: number;
  processed: boolean;
  publicUrl?: string;
}

export interface CloudFaceBatch {
  id?: string;
  batchIndex: number;
  faces: CloudFaceEntry[];
}

export interface CloudFaceEntry {
  photoId: string;
  driveFileId: string;
  embedding: number[];
  box: { x: number; y: number; width: number; height: number };
}

// ---- Event CRUD ----

export async function createCloudEvent(
  ownerId: string,
  name: string,
  driveFolderId: string,
  driveFolderName: string,
  provider?: CloudProvider
): Promise<string> {
  const eventData: Omit<CloudEvent, 'id'> = {
    ownerId,
    name,
    driveFolderId,
    driveFolderName,
    createdAt: serverTimestamp(),
    status: 'pending',
    photoCount: 0,
    faceCount: 0,
    provider: provider || 'dropbox',
  };

  const docRef = await addDoc(collection(firestore, 'events'), eventData);
  return docRef.id;
}

export async function getCloudEvent(eventId: string): Promise<CloudEvent | null> {
  const docSnap = await getDoc(doc(firestore, 'events', eventId));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as CloudEvent;
}

function createdAtMillis(event: CloudEvent): number {
  // Pending serverTimestamps have no seconds yet; treat them as "now".
  return event.createdAt && typeof event.createdAt === 'object' && 'seconds' in event.createdAt
    ? event.createdAt.seconds * 1000
    : Date.now();
}

export function subscribeOwnerEvents(
  ownerId: string,
  onUpdate: (events: CloudEvent[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    collection(firestore, 'events'),
    where('ownerId', '==', ownerId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CloudEvent));
      // Sort in memory (newest first) to avoid a composite index requirement
      events.sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
      onUpdate(events);
    },
    onError
  );
}

export async function updateCloudEvent(
  eventId: string,
  updates: Partial<Pick<CloudEvent, 'name' | 'status' | 'photoCount' | 'faceCount'>>
): Promise<void> {
  await updateDoc(doc(firestore, 'events', eventId), updates);
}

// Firestore allows at most 500 writes per batch.
const WRITE_BATCH_LIMIT = 400;

/** Delete every document in a subcollection. Returns how many were removed. */
async function deleteSubcollection(eventId: string, name: 'photos' | 'faceBatches'): Promise<number> {
  const snap = await getDocs(collection(firestore, 'events', eventId, name));
  for (let i = 0; i < snap.docs.length; i += WRITE_BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    snap.docs.slice(i, i + WRITE_BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.docs.length;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Permanently delete an event and its `photos` / `faceBatches` subcollections.
 * Cloud provider files are never touched.
 *
 * A scan that was just stopped may still commit an in-flight batch, which would
 * leave orphaned subcollection documents behind once the event document is gone
 * (the security rules only allow writes while the event exists). So the
 * subcollections are swept repeatedly until a pass finds nothing, and the event
 * document is removed last. `settleMs` gives a just-stopped scan time to finish.
 */
export async function deleteCloudEvent(eventId: string, options: { settleMs?: number } = {}): Promise<void> {
  if (options.settleMs) await delay(options.settleMs);
  for (let pass = 0; pass < 5; pass++) {
    const removed =
      (await deleteSubcollection(eventId, 'photos')) + (await deleteSubcollection(eventId, 'faceBatches'));
    if (removed === 0) break;
    await delay(500);
  }
  await deleteDoc(doc(firestore, 'events', eventId));
}

// ---- Photo CRUD ----

/**
 * Register photo references for an event. New photos count toward the owner's
 * rolling photo quota, which `/api/commit-scan` enforces server-side.
 */
export async function addCloudPhotosBatch(
  eventId: string,
  photos: Omit<CloudPhoto, 'id'>[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < photos.length; i += WRITE_BATCH_LIMIT) {
    const chunk = photos.slice(i, i + WRITE_BATCH_LIMIT).map((data) => ({ id: newCloudPhotoId(eventId), data }));
    await commitScanResults(eventId, chunk, []);
    ids.push(...chunk.map((p) => p.id));
  }
  return ids;
}

export async function getCloudPhotos(eventId: string): Promise<CloudPhoto[]> {
  const snapshot = await getDocs(
    collection(firestore, 'events', eventId, 'photos')
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CloudPhoto));
}

// ---- Face Descriptor Storage (Batched) ----
// Faces are stored ~100 per document (written by /api/commit-scan).

/** Allocate a photo document ID locally (no network) so writes can be batched. */
export function newCloudPhotoId(eventId: string): string {
  return doc(collection(firestore, 'events', eventId, 'photos')).id;
}

/**
 * Atomically persist a chunk of scan results: photo documents (created or
 * merged), their face descriptors, and the event progress counters. Either
 * everything in the chunk is stored or nothing is, so a photo is never marked
 * processed without its faces. Runs through `/api/commit-scan`, which also
 * counts new photos against the owner's quota (rejecting with
 * `photo_limit_reached` when the cycle limit would be exceeded).
 */
export async function commitScanResults(
  eventId: string,
  photos: { id: string; data: Partial<Omit<CloudPhoto, 'id'>> }[],
  faces: CloudFaceEntry[],
  progress?: Pick<CloudEvent, 'photoCount' | 'faceCount'>
): Promise<void> {
  if (photos.length === 0 && faces.length === 0 && !progress) return;
  await postApi('/api/commit-scan', { eventId, photos, faces, progress: progress ?? null }, { authenticated: true });
}

export async function getAllFaceDescriptors(
  eventId: string
): Promise<CloudFaceEntry[]> {
  const snapshot = await getDocs(
    collection(firestore, 'events', eventId, 'faceBatches')
  );
  const allFaces: CloudFaceEntry[] = [];
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as CloudFaceBatch;
    allFaces.push(...(data.faces || []));
  }
  return allFaces;
}

export async function resetCloudEventForScanning(eventId: string): Promise<void> {
  // 1. Reset event status and progress counts
  await updateCloudEvent(eventId, {
    status: 'scanning',
    photoCount: 0,
    faceCount: 0,
  });

  // 2. Get all photos of the event
  const photosSnap = await getDocs(collection(firestore, 'events', eventId, 'photos'));

  // 3. Reset photos processed status in chunks below the batch limit
  let batch = writeBatch(firestore);
  let opCount = 0;

  for (const docSnap of photosSnap.docs) {
    batch.update(docSnap.ref, {
      processed: false,
      width: 0,
      height: 0,
    });
    opCount++;

    if (opCount >= WRITE_BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(firestore);
      opCount = 0;
    }
  }
  if (opCount > 0) {
    await batch.commit();
  }

  // 4. Delete all existing face batches
  const facesSnap = await getDocs(collection(firestore, 'events', eventId, 'faceBatches'));
  batch = writeBatch(firestore);
  opCount = 0;

  for (const docSnap of facesSnap.docs) {
    batch.delete(docSnap.ref);
    opCount++;

    if (opCount >= WRITE_BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(firestore);
      opCount = 0;
    }
  }
  if (opCount > 0) {
    await batch.commit();
  }
}

// ---- User Photo Usage & Rolling Quota ----

export interface UserUsage {
  cycleStart?: Timestamp | Date;
  cycleReset?: Timestamp | Date;
  photosThisCycle: number;
  updatedAt?: unknown;
}

/**
 * Subscribe to current 30-day rolling photo usage for a user. The usage
 * document is maintained server-side by /api/commit-scan.
 */
export function subscribeUserUsage(
  userId: string,
  onUpdate: (usage: UserUsage | null) => void
): () => void {
  const docRef = doc(firestore, 'users', userId, 'usage', 'current');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as UserUsage);
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.error('Error subscribing to user usage:', err);
      onUpdate(null);
    }
  );
}

/**
 * Remove the user's profile and usage documents (account deletion). Both go in
 * one batch: the security rules only let owners delete usage together with the profile.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, 'users', userId, 'usage', 'current'));
  batch.delete(doc(firestore, 'users', userId));
  await batch.commit();
}
