/**
 * Guest-facing services
 * Guests cannot read event documents, photos or face data from Firestore.
 * They load public event info from /api/event-info, and send the selfie's
 * face descriptor (never the selfie image) to /api/match, which compares it
 * with the event's stored descriptors and returns only their own photos.
 */

import { postApi, ServerApiError } from './serverApi';
import type { CloudProvider } from './cloudProviders';

/** The only event fields guests receive. */
export interface PublicEventInfo {
  id: string;
  name: string;
  status: 'pending' | 'scanning' | 'ready';
  provider: CloudProvider;
}

/** Load public event info, or null when the event does not exist. */
export async function getPublicEventInfo(eventId: string): Promise<PublicEventInfo | null> {
  try {
    return await postApi<PublicEventInfo>('/api/event-info', { eventId });
  } catch (error) {
    if (error instanceof ServerApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

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
