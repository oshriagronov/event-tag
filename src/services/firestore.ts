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



export async function getOwnerEvents(ownerId: string): Promise<CloudEvent[]> {
  const q = query(
    collection(firestore, 'events'),
    where('ownerId', '==', ownerId)
  );
  const snapshot = await getDocs(q);
  const events = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CloudEvent));
  
  // Sort in-memory descending by createdAt to avoid composite index requirements
  events.sort((a, b) => {
    const timeA = a.createdAt && typeof a.createdAt === 'object' && 'seconds' in a.createdAt 
      ? a.createdAt.seconds * 1000 
      : Date.now();
    const timeB = b.createdAt && typeof b.createdAt === 'object' && 'seconds' in b.createdAt 
      ? b.createdAt.seconds * 1000 
      : Date.now();
    return timeB - timeA;
  });
  return events;
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
      // Sort in-memory descending by createdAt to handle pending serverTimestamps smoothly
      events.sort((a, b) => {
        const timeA = a.createdAt && typeof a.createdAt === 'object' && 'seconds' in a.createdAt 
          ? a.createdAt.seconds * 1000 
          : Date.now();
        const timeB = b.createdAt && typeof b.createdAt === 'object' && 'seconds' in b.createdAt 
          ? b.createdAt.seconds * 1000 
          : Date.now();
        return timeB - timeA;
      });
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

export async function deleteCloudEvent(eventId: string): Promise<void> {
  // Delete photos subcollection
  const photosSnap = await getDocs(collection(firestore, 'events', eventId, 'photos'));
  const batch1 = writeBatch(firestore);
  photosSnap.docs.forEach((d) => batch1.delete(d.ref));
  if (photosSnap.docs.length > 0) await batch1.commit();

  // Delete face batches subcollection
  const facesSnap = await getDocs(collection(firestore, 'events', eventId, 'faceBatches'));
  const batch2 = writeBatch(firestore);
  facesSnap.docs.forEach((d) => batch2.delete(d.ref));
  if (facesSnap.docs.length > 0) await batch2.commit();

  // Delete the event document itself
  await deleteDoc(doc(firestore, 'events', eventId));
}

// ---- Photo CRUD ----

export async function addCloudPhoto(
  eventId: string,
  photo: Omit<CloudPhoto, 'id'>
): Promise<string> {
  const docRef = await addDoc(
    collection(firestore, 'events', eventId, 'photos'),
    photo
  );
  return docRef.id;
}

export async function addCloudPhotosBatch(
  eventId: string,
  photos: Omit<CloudPhoto, 'id'>[]
): Promise<string[]> {
  const ids: string[] = [];
  // Firestore batch limit is 500
  const BATCH_SIZE = 400;
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const chunk = photos.slice(i, i + BATCH_SIZE);
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

export async function updateCloudPhoto(
  eventId: string,
  photoId: string,
  updates: Partial<CloudPhoto>
): Promise<void> {
  await updateDoc(doc(firestore, 'events', eventId, 'photos', photoId), updates);
}

export async function updateCloudPhotosBatch(
  eventId: string,
  photoUpdates: { id: string; updates: Partial<CloudPhoto> }[]
): Promise<void> {
  const batch = writeBatch(firestore);
  for (const update of photoUpdates) {
    const docRef = doc(firestore, 'events', eventId, 'photos', update.id);
    batch.update(docRef, update.updates);
  }
  await batch.commit();
}

// ---- Face Descriptor Storage (Batched) ----
// Store faces in batches of ~100 per document to minimize Firestore reads

const FACES_PER_BATCH = 100;

export async function addFaceDescriptors(
  eventId: string,
  faces: CloudFaceEntry[]
): Promise<void> {
  // Get current batches to determine next batch index
  const existingBatches = await getDocs(
    collection(firestore, 'events', eventId, 'faceBatches')
  );
  let nextBatchIndex = existingBatches.size;

  for (let i = 0; i < faces.length; i += FACES_PER_BATCH) {
    const chunk = faces.slice(i, i + FACES_PER_BATCH);
    await addDoc(collection(firestore, 'events', eventId, 'faceBatches'), {
      batchIndex: nextBatchIndex++,
      faces: chunk,
    });
  }
}

export async function appendFaceDescriptors(
  eventId: string,
  newFaces: CloudFaceEntry[]
): Promise<void> {
  // Get existing batches
  const existingSnap = await getDocs(
    collection(firestore, 'events', eventId, 'faceBatches')
  );
  const batches = existingSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as CloudFaceBatch),
  }));
  
  // Find the last batch — if it has room, append to it first
  batches.sort((a, b) => a.batchIndex - b.batchIndex);
  const remaining = [...newFaces];
  
  if (batches.length > 0) {
    const lastBatch = batches[batches.length - 1];
    const lastBatchFaces = lastBatch.faces || [];
    const spaceInLast = FACES_PER_BATCH - lastBatchFaces.length;
    
    if (spaceInLast > 0) {
      const toAppend = remaining.splice(0, spaceInLast);
      await updateDoc(
        doc(firestore, 'events', eventId, 'faceBatches', lastBatch.id!),
        { faces: [...lastBatchFaces, ...toAppend] }
      );
    }
  }
  
  // Create new batches for remaining faces
  if (remaining.length > 0) {
    await addFaceDescriptors(eventId, remaining);
  }
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

  // 3. Reset photos processed status in batches of 400
  const BATCH_SIZE = 400;
  let batch = writeBatch(firestore);
  let opCount = 0;

  for (const docSnap of photosSnap.docs) {
    batch.update(docSnap.ref, {
      processed: false,
      width: 0,
      height: 0,
    });
    opCount++;

    if (opCount >= BATCH_SIZE) {
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

    if (opCount >= BATCH_SIZE) {
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
 * Fetch current 30-day rolling photo usage for a user
 */
export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  try {
    const docRef = doc(firestore, 'users', userId, 'usage', 'current');
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as UserUsage;
  } catch (err) {
    console.error('Error fetching user usage:', err);
    return null;
  }
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

