/**
 * Firestore data layer for EventTag
 * Stores event metadata, photo references, and face descriptors in the cloud
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
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

async function deleteSubcollection(eventId: string, name: 'photos' | 'faceBatches'): Promise<void> {
  const snap = await getDocs(collection(firestore, 'events', eventId, name));
  for (let i = 0; i < snap.docs.length; i += WRITE_BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    snap.docs.slice(i, i + WRITE_BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function deleteCloudEvent(eventId: string): Promise<void> {
  await deleteSubcollection(eventId, 'photos');
  await deleteSubcollection(eventId, 'faceBatches');
  await deleteDoc(doc(firestore, 'events', eventId));
}

// ---- Photo CRUD ----

export async function addCloudPhotosBatch(
  eventId: string,
  photos: Omit<CloudPhoto, 'id'>[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < photos.length; i += WRITE_BATCH_LIMIT) {
    const chunk = photos.slice(i, i + WRITE_BATCH_LIMIT);
    const batch = writeBatch(firestore);
    const chunkIds: string[] = [];
    for (const photo of chunk) {
      const docRef = doc(collection(firestore, 'events', eventId, 'photos'));
      batch.set(docRef, photo);
      chunkIds.push(docRef.id);
    }
    await batch.commit();
    ids.push(...chunkIds);
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
// Faces are stored ~100 per document to minimize guest-side reads.

const FACES_PER_BATCH = 100;

/** Allocate a photo document ID locally (no network) so writes can be batched. */
export function newCloudPhotoId(eventId: string): string {
  return doc(collection(firestore, 'events', eventId, 'photos')).id;
}

/**
 * Atomically persist a chunk of scan results: photo documents (created or
 * merged), their face descriptors, and the event progress counters. Either
 * everything in the chunk is stored or nothing is, so a photo is never marked
 * processed without its faces.
 */
export async function commitScanResults(
  eventId: string,
  photos: { id: string; data: Partial<Omit<CloudPhoto, 'id'>> }[],
  faces: CloudFaceEntry[],
  progress?: Pick<CloudEvent, 'photoCount' | 'faceCount'>
): Promise<void> {
  if (photos.length === 0 && faces.length === 0 && !progress) return;
  const batch = writeBatch(firestore);
  for (const photo of photos) {
    batch.set(doc(firestore, 'events', eventId, 'photos', photo.id), photo.data, { merge: true });
  }
  for (let i = 0; i < faces.length; i += FACES_PER_BATCH) {
    batch.set(doc(collection(firestore, 'events', eventId, 'faceBatches')), {
      batchIndex: Date.now() + i,
      faces: faces.slice(i, i + FACES_PER_BATCH),
    });
  }
  if (progress) batch.update(doc(firestore, 'events', eventId), progress);
  await batch.commit();
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
 * Subscribe to current 30-day rolling photo usage for a user
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
 * Record photo usage for a user, initiating a 30-day cycle on first upload or after cycle expiry
 */
export async function recordUserPhotoUsage(userId: string, addedPhotos: number): Promise<void> {
  if (addedPhotos <= 0) return;
  const docRef = doc(firestore, 'users', userId, 'usage', 'current');
  const snap = await getDoc(docRef);
  const now = new Date();

  if (!snap.exists()) {
    // First upload ever: start 30-day cycle
    const cycleReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await setDoc(docRef, {
      cycleStart: serverTimestamp(),
      cycleReset,
      photosThisCycle: addedPhotos,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const data = snap.data() as UserUsage;
  const resetDate = data.cycleReset
    ? (data.cycleReset as { toDate?: () => Date }).toDate
      ? (data.cycleReset as { toDate: () => Date }).toDate()
      : new Date(data.cycleReset as unknown as string)
    : null;

  if (!resetDate || now.getTime() >= resetDate.getTime()) {
    // Previous cycle expired: start fresh 30-day cycle
    const newReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await setDoc(docRef, {
      cycleStart: serverTimestamp(),
      cycleReset: newReset,
      photosThisCycle: addedPhotos,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Within active 30-day cycle: accumulate photo count
    await updateDoc(docRef, {
      photosThisCycle: (data.photosThisCycle || 0) + addedPhotos,
      updatedAt: serverTimestamp(),
    });
  }
}

