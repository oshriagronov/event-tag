/**
 * Face matching service
 * Matches a selfie's face descriptor against all stored descriptors for an event
 * Runs entirely client-side — no server cost
 */

import { getAllFaceDescriptors, getCloudPhotos, type CloudFaceEntry } from './firestore';

export interface MatchResult {
  driveFileId: string;
  photoId: string;
  distance: number;
  box: { x: number; y: number; width: number; height: number };
  publicUrl?: string;
  fileName?: string;
}

/**
 * Compute Euclidean distance between two vectors
 */
function euclideanDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Match a selfie descriptor against all faces in an event.
 * Returns matching photos sorted by similarity (closest first).
 *
 * @param selfieDescriptor - The 512-dim face descriptor from the selfie
 * @param eventId - The Firestore event ID
 * @param threshold - Maximum Euclidean distance to consider a match (default: 0.55)
 */
export async function matchSelfieToEvent(
  selfieDescriptor: number[],
  eventId: string,
  threshold = 0.90
): Promise<MatchResult[]> {
  // Fetch all face descriptors for this event from Firestore
  const allFaces = await getAllFaceDescriptors(eventId);

  if (allFaces.length === 0) return [];

  // Fetch all photos to map photoId to publicUrl & fileName
  const photos = await getCloudPhotos(eventId);
  const photoMap = new Map<string, { publicUrl?: string; fileName?: string }>();
  for (const photo of photos) {
    if (photo.id) {
      photoMap.set(photo.id, { publicUrl: photo.publicUrl, fileName: photo.fileName });
    }
  }

  const matches: MatchResult[] = [];

  for (const face of allFaces) {
    const dist = euclideanDistance(selfieDescriptor, face.embedding);
    if (dist < threshold) {
      const info = photoMap.get(face.photoId);
      matches.push({
        driveFileId: face.driveFileId,
        photoId: face.photoId,
        distance: dist,
        box: face.box,
        publicUrl: info?.publicUrl,
        fileName: info?.fileName,
      });
    }
  }

  // Sort by distance (best match first)
  matches.sort((a, b) => a.distance - b.distance);

  // Deduplicate by photo — keep the best match per photo
  const seenPhotos = new Set<string>();
  const uniqueMatches: MatchResult[] = [];
  for (const match of matches) {
    if (!seenPhotos.has(match.driveFileId)) {
      seenPhotos.add(match.driveFileId);
      uniqueMatches.push(match);
    }
  }

  return uniqueMatches;
}

/**
 * Quick match with pre-fetched descriptors (avoids re-fetching from Firestore)
 */
export function matchSelfieAgainstFaces(
  selfieDescriptor: number[],
  allFaces: CloudFaceEntry[],
  threshold = 0.90
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const face of allFaces) {
    const dist = euclideanDistance(selfieDescriptor, face.embedding);
    if (dist < threshold) {
      matches.push({
        driveFileId: face.driveFileId,
        photoId: face.photoId,
        distance: dist,
        box: face.box,
      });
    }
  }

  matches.sort((a, b) => a.distance - b.distance);

  const seenPhotos = new Set<string>();
  const uniqueMatches: MatchResult[] = [];
  for (const match of matches) {
    if (!seenPhotos.has(match.driveFileId)) {
      seenPhotos.add(match.driveFileId);
      uniqueMatches.push(match);
    }
  }

  return uniqueMatches;
}
