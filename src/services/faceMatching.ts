/**
 * Face matching service
 * Sends the selfie's face descriptor (never the selfie image) to /api/match,
 * which compares it with the event's stored descriptors and returns only the
 * guest's own matching photos. Event face data is not readable by guests.
 */

import { postApi } from './serverApi';

export interface MatchResult {
  driveFileId: string;
  photoId: string;
  distance: number;
  box: { x: number; y: number; width: number; height: number };
  publicUrl?: string;
  fileName?: string;
}

/**
 * Match a selfie descriptor against all faces in an event.
 * Returns matching photos sorted by similarity (closest first), one per photo.
 * The match threshold is fixed server-side.
 *
 * @param selfieDescriptor - The 128-dim L2-normalized SFace descriptor from the selfie
 * @param eventId - The Firestore event ID
 */
export async function matchSelfieToEvent(selfieDescriptor: number[], eventId: string): Promise<MatchResult[]> {
  const { matches } = await postApi<{ matches: MatchResult[] }>('/api/match', { eventId, descriptor: selfieDescriptor });
  return matches;
}
