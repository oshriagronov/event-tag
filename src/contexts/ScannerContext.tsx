import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import {
  getPhotoBlob,
  getOrCreateSharedLink,
  convertToRawUrl,
  isAuthorizationError,
  isTokenInvalidError,
  isTransientError,
  type CloudProvider,
} from '../services/cloudProviders';
import { extractEmbedding } from '../services/onnxModel';
import { ensureModelsLoaded } from '../services/modelLoader';
import { alignFace } from '../services/faceAlignment';
import { detectFacesTiled } from '../services/faceDetection';
import { uploadPhotoToGoogleDrive } from '../services/google';
import { uploadPhotoToDropbox } from '../services/dropbox';
import {
  commitScanResults,
  newCloudPhotoId,
  updateCloudEvent,
  type CloudFaceEntry,
  type CloudPhoto,
} from '../services/firestore';
import { useAuth } from './AuthContext';
import { useModal } from './ModalContext';
import { isFirebaseQuotaOrDemandError } from '../services/quotaService';

type ScanError = 'auth_expired' | 'network_error' | 'demand_limit';

export interface EventScanState {
  eventId: string;
  provider: CloudProvider;
  isScanning: boolean;
  isPaused: boolean;
  scannedCount: number;
  totalToScan: number;
  etaSeconds: number | null;
  scanError: ScanError | null;
}

interface ScannerContextType {
  isScanning: boolean;
  isPaused: boolean;
  scannedCount: number;
  totalToScan: number;
  etaSeconds: number | null;
  activeScanningEventId: string | null;
  activeScanningEventIds: string[];
  scanError: ScanError | null;
  isEventScanning: (eventId: string) => boolean;
  getEventScanState: (eventId: string) => EventScanState | undefined;
  startCloudScanning: (eventId: string, photos: CloudPhoto[], provider: CloudProvider) => Promise<void>;
  startLocalGoogleUploadAndScan: (eventId: string, googleFolderId: string, files: File[]) => Promise<void>;
  startLocalDropboxUploadAndScan: (eventId: string, dropboxFolderPath: string, files: File[]) => Promise<void>;
  togglePause: (eventId?: string) => void;
  stopScanning: (eventId: string) => void;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

// Number of images (and share links) to fetch ahead of the one being processed.
// Downloads, not inference, dominate cloud scans, so keep several in flight.
const PRELOAD_AHEAD = 4;
// Parallel workers for local upload + scan. Face detection is serialized by
// withComputeLock, so extra workers only add uploads in flight. Dropbox
// throttles concurrent writes to one folder, so it gets fewer.
const UPLOAD_CONCURRENCY: Record<'google' | 'dropbox', number> = { google: 4, dropbox: 3 };
// Flush buffered results to Firestore every N photos or M faces
const FLUSH_PHOTO_THRESHOLD = 15;
const FLUSH_FACE_THRESHOLD = 50;
// Quick automatic retries for transient failures before showing a network error
const MAX_QUICK_RETRIES = 4;
// While in the network-error state, retry automatically after this delay
const NETWORK_AUTO_RESUME_MS = 60_000;
const MAX_DETECTION_DIM = 1600;
// Log a timing summary every N local uploads (diagnoses slow scans).
const STATS_LOG_INTERVAL = 25;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Thrown when the provider can only be re-authorized by the user. */
class ReconnectRequiredError extends Error {}

class UnreadableImageError extends Error {}

interface LocalScanResult {
  width: number;
  height: number;
  detections: Array<{
    embedding: number[];
    box: { x: number; y: number; width: number; height: number };
  }>;
}

let computeQueue: Promise<unknown> = Promise.resolve();

/**
 * Run face processing one photo at a time across all workers and events:
 * the GPU/WASM runtimes serialize the work anyway, and it keeps only one
 * decoded full-resolution image in memory.
 */
function withComputeLock<T>(task: () => Promise<T>): Promise<T> {
  const result = computeQueue.then(task);
  computeQueue = result.catch(() => undefined);
  return result;
}

/**
 * Detect faces and extract embeddings entirely in the browser.
 */
function processPhotoLocally(fileBlob: Blob, onComputed?: (ms: number) => void): Promise<LocalScanResult> {
  return withComputeLock(async () => {
    const start = performance.now();
    try {
      return await processPhotoUnlocked(fileBlob);
    } finally {
      onComputed?.(performance.now() - start);
    }
  });
}

/**
 * Tracks where local upload + scan time goes and periodically logs it, so a
 * slow event can be attributed to detection, upload bandwidth or a hidden tab.
 */
function createUploadStats(total: number, concurrency: number) {
  const startedAt = performance.now();
  let detectMs = 0;
  let detectCount = 0;
  let uploadMs = 0;
  let uploadBytes = 0;
  let uploadCount = 0;
  let completed = 0;
  let completedWhileHidden = 0;

  return {
    detected(ms: number) {
      detectMs += ms;
      detectCount++;
    },
    uploaded(ms: number, bytes: number) {
      uploadMs += ms;
      uploadBytes += bytes;
      uploadCount++;
    },
    completed() {
      completed++;
      if (document.visibilityState === 'hidden') completedWhileHidden++;
      if (completed % STATS_LOG_INTERVAL !== 0 && completed !== total) return;
      const elapsedSec = (performance.now() - startedAt) / 1000;
      const avgDetectMs = detectCount ? detectMs / detectCount : 0;
      const avgUploadMs = uploadCount ? uploadMs / uploadCount : 0;
      const bottleneck = avgUploadMs / concurrency > avgDetectMs ? 'upload' : 'detection';
      console.info(
        `[EventTag scan] ${completed}/${total} photos in ${Math.round(elapsedSec)}s ` +
          `(${(elapsedSec / completed).toFixed(2)}s/photo) | detection ${Math.round(avgDetectMs)}ms/photo | ` +
          `upload ${(avgUploadMs / 1000).toFixed(1)}s/photo, ${(uploadBytes / 1e6 / Math.max(uploadCount, 1)).toFixed(1)}MB avg, ` +
          `${((uploadBytes * 8) / 1e6 / elapsedSec).toFixed(1)}Mbps total over ${concurrency} parallel uploads | ` +
          `tab hidden for ${Math.round((completedWhileHidden / completed) * 100)}% | likely bottleneck: ${bottleneck}`
      );
    },
  };
}

async function processPhotoUnlocked(fileBlob: Blob): Promise<LocalScanResult> {
  await ensureModelsLoaded();

  const blobUrl = URL.createObjectURL(fileBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new UnreadableImageError('Image could not be decoded'));
      img.src = blobUrl;
    });

    const width = img.naturalWidth;
    const height = img.naturalHeight;

    // Downscale large images to keep WebGL memory bounded and inference fast
    let detectionSource: HTMLImageElement | HTMLCanvasElement = img;
    if (Math.max(width, height) > MAX_DETECTION_DIM) {
      const scale = MAX_DETECTION_DIM / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        detectionSource = canvas;
      }
    }

    const srcWidth = detectionSource instanceof HTMLCanvasElement ? detectionSource.width : width;
    const srcHeight = detectionSource instanceof HTMLCanvasElement ? detectionSource.height : height;

    const detections = await detectFacesTiled(detectionSource, 0.45);

    const results: LocalScanResult['detections'] = [];
    for (const det of detections) {
      const box = det.detection.box;
      const alignedCanvas = alignFace(detectionSource, det.landmarks);
      results.push({
        embedding: await extractEmbedding(alignedCanvas),
        // Relative box for overlay rendering
        box: {
          x: box.x / srcWidth,
          y: box.y / srcHeight,
          width: box.width / srcWidth,
          height: box.height / srcHeight,
        },
      });
    }

    return { width, height, detections: results };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

const hasValidPublicUrl = (photo: CloudPhoto) =>
  Boolean(photo.publicUrl && !photo.publicUrl.includes('/2.0/files/'));

type FailureKind = 'auth' | 'authorization' | 'demand' | 'transient' | 'permanent';

function classifyFailure(err: unknown): FailureKind {
  if (err instanceof ReconnectRequiredError) return 'auth';
  if (isFirebaseQuotaOrDemandError(err)) return 'demand';
  if (isTokenInvalidError(err)) return 'auth';
  if (isTransientError(err)) return 'transient';
  if (isAuthorizationError(err)) return 'authorization';
  return 'permanent';
}

type RecoveryOutcome = 'retry' | 'skip' | 'cancelled';

interface RecoveryOptions {
  /** 'pause' keeps retrying instead of skipping the item (used for saves). */
  onPermanent?: 'skip' | 'pause';
  /**
   * Treat a 403 as "reconnect with the right permissions" instead of a
   * per-file problem. Used for uploads, where every file would fail alike.
   */
  pauseOnAuthorization?: boolean;
}

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [scanStates, setScanStates] = useState<Record<string, EventScanState>>({});

  const pausedEventsRef = useRef<Map<string, boolean>>(new Map());
  const cancelledEventsRef = useRef<Map<string, boolean>>(new Map());
  // Events whose scan loop is still winding down (a stopped scan exits after its current step)
  const activeLoopsRef = useRef<Set<string>>(new Set());

  const { googleAccessToken, onedriveAccessToken, dropboxAccessToken, markProviderExpired, getFreshAccessToken } = useAuth();
  const { alert } = useModal();

  // Resume scans that were paused for re-authorization once a token is back.
  useEffect(() => {
    const tokens: Record<CloudProvider, string | null> = {
      google: googleAccessToken,
      dropbox: dropboxAccessToken,
      onedrive: onedriveAccessToken,
    };
    setScanStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, state] of Object.entries(next)) {
        if (state.scanError === 'auth_expired' && tokens[state.provider]) {
          next[id] = { ...state, scanError: null, isPaused: false };
          pausedEventsRef.current.set(id, false);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [googleAccessToken, onedriveAccessToken, dropboxAccessToken]);

  const activeScanningEventIds = Object.keys(scanStates).filter((id) => scanStates[id]?.isScanning);
  const isScanning = activeScanningEventIds.length > 0;
  const activeScanningEventId = activeScanningEventIds.length > 0
    ? activeScanningEventIds[activeScanningEventIds.length - 1]
    : null;

  // Long uploads must survive the device idling: keep the screen awake and
  // warn before the tab is closed (local files cannot be recovered after that).
  useEffect(() => {
    if (!isScanning) return;
    let wakeLock: WakeLockSentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        // Wake lock is best effort (denied by battery saver, unsupported, ...)
      }
    };
    const onVisibility = () => { if (!wakeLock || wakeLock.released) void acquire(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void wakeLock?.release().catch(() => undefined);
    };
  }, [isScanning]);

  const primaryState = activeScanningEventId ? scanStates[activeScanningEventId] : undefined;
  const isPaused = primaryState?.isPaused ?? false;
  const scannedCount = primaryState?.scannedCount ?? 0;
  const totalToScan = primaryState?.totalToScan ?? 0;
  const etaSeconds = primaryState?.etaSeconds ?? null;
  const scanError = primaryState?.scanError ?? null;

  const isEventScanning = (eventId: string) => Boolean(scanStates[eventId]?.isScanning);
  const getEventScanState = (eventId: string) => scanStates[eventId];

  const updateEventState = (eventId: string, updates: Partial<EventScanState>) => {
    setScanStates((prev) => {
      const current = prev[eventId];
      if (!current) return prev;
      return { ...prev, [eventId]: { ...current, ...updates } };
    });
  };

  const setPaused = (eventId: string, paused: boolean, error: ScanError | null = null) => {
    pausedEventsRef.current.set(eventId, paused);
    updateEventState(eventId, { isPaused: paused, scanError: error });
  };

  const togglePause = (eventId?: string) => {
    const targetId = eventId || activeScanningEventId;
    if (!targetId) return;
    const nextPaused = !(pausedEventsRef.current.get(targetId) ?? false);
    pausedEventsRef.current.set(targetId, nextPaused);
    setScanStates((prev) => {
      const state = prev[targetId];
      if (!state) return prev;
      return {
        ...prev,
        [targetId]: { ...state, isPaused: nextPaused, scanError: nextPaused ? state.scanError : null },
      };
    });
  };

  const stopScanning = (eventId: string) => {
    if (!eventId) return;
    cancelledEventsRef.current.set(eventId, true);
    pausedEventsRef.current.set(eventId, false);
    setScanStates((prev) => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
    updateCloudEvent(eventId, { status: 'pending' }).catch((err) =>
      console.error(`Failed to update status for stopped event ${eventId}:`, err)
    );
  };

  const isCancelled = (eventId: string) => Boolean(cancelledEventsRef.current.get(eventId));

  /** Wait while the event is paused. Resolves to false if the scan was cancelled. */
  const waitWhilePaused = async (eventId: string): Promise<boolean> => {
    while (pausedEventsRef.current.get(eventId)) {
      if (isCancelled(eventId)) return false;
      await sleep(300);
    }
    return !isCancelled(eventId);
  };

  /**
   * Run a provider request with a token that is renewed when close to expiry.
   * A 401 triggers one renewal and a retry before giving up.
   */
  const withProviderToken = async <T,>(provider: CloudProvider, request: (token: string) => Promise<T>): Promise<T> => {
    const token = await getFreshAccessToken(provider);
    if (!token) throw new ReconnectRequiredError(`${provider} requires reconnection`);
    try {
      return await request(token);
    } catch (err) {
      if (!isTokenInvalidError(err)) throw err;
      const renewed = await getFreshAccessToken(provider, { rejectedToken: token });
      if (!renewed) throw new ReconnectRequiredError(`${provider} requires reconnection`);
      return request(renewed);
    }
  };

  /**
   * Decide how to continue after a failed step. Auth and quota problems pause
   * the scan (keeping every pending file in memory) until the user reconnects
   * or resumes; transient failures back off and retry automatically.
   */
  const recoverFromFailure = async (
    eventId: string,
    provider: CloudProvider,
    err: unknown,
    attempt: number,
    { onPermanent = 'skip', pauseOnAuthorization = false }: RecoveryOptions = {}
  ): Promise<RecoveryOutcome> => {
    if (isCancelled(eventId)) return 'cancelled';
    let kind = classifyFailure(err);
    if (kind === 'authorization' && !pauseOnAuthorization) kind = 'permanent';

    if (kind === 'auth' || kind === 'authorization') {
      // Only a rejected token clears the connection; a permission problem keeps
      // it, and reconnecting (granting access) resumes the scan either way.
      if (kind === 'auth') markProviderExpired(provider);
      setPaused(eventId, true, 'auth_expired');
      return (await waitWhilePaused(eventId)) ? 'retry' : 'cancelled';
    }
    if (kind === 'demand') {
      setPaused(eventId, true, 'demand_limit');
      return (await waitWhilePaused(eventId)) ? 'retry' : 'cancelled';
    }
    if (kind === 'permanent' && onPermanent === 'skip') return 'skip';

    if (kind === 'transient' && attempt <= MAX_QUICK_RETRIES) {
      await sleep(Math.min(1000 * 2 ** attempt, 20_000));
      return isCancelled(eventId) ? 'cancelled' : 'retry';
    }

    // Persistent network trouble: surface it, but keep retrying on our own so
    // an unattended upload recovers when connectivity returns.
    setPaused(eventId, true, 'network_error');
    const resumeAt = Date.now() + NETWORK_AUTO_RESUME_MS;
    while (pausedEventsRef.current.get(eventId)) {
      if (isCancelled(eventId)) return 'cancelled';
      if (Date.now() >= resumeAt && navigator.onLine) {
        setPaused(eventId, false);
        break;
      }
      await sleep(500);
    }
    return isCancelled(eventId) ? 'cancelled' : 'retry';
  };

  /**
   * Buffer of scan results that are committed atomically in chunks.
   */
  const createResultBuffer = (eventId: string, provider: CloudProvider) => {
    let photos: { id: string; data: Partial<CloudPhoto> }[] = [];
    let faces: CloudFaceEntry[] = [];

    const commit = async (progress?: { photoCount: number; faceCount: number }) => {
      const photoChunk = photos;
      const faceChunk = faces;
      photos = [];
      faces = [];
      try {
        await commitScanResults(eventId, photoChunk, faceChunk, progress);
      } catch (err) {
        // Put the chunk back so nothing is lost when the write is retried
        photos = [...photoChunk, ...photos];
        faces = [...faceChunk, ...faces];
        throw err;
      }
    };

    return {
      add(photo: { id: string; data: Partial<CloudPhoto> }, newFaces: CloudFaceEntry[]) {
        photos.push(photo);
        faces.push(...newFaces);
      },
      get shouldFlush() {
        return photos.length >= FLUSH_PHOTO_THRESHOLD || faces.length >= FLUSH_FACE_THRESHOLD;
      },
      /** Commit buffered results, pausing/retrying on failure. */
      async flush(progress: () => { photoCount: number; faceCount: number }): Promise<boolean> {
        for (let attempt = 1; photos.length > 0 || faces.length > 0; attempt++) {
          try {
            await commit(progress());
          } catch (err) {
            console.error('Failed to save scan results:', err);
            const outcome = await recoverFromFailure(eventId, provider, err, attempt, { onPermanent: 'pause' });
            if (outcome !== 'retry') return false;
          }
        }
        return true;
      },
    };
  };

  const alertAlreadyScanning = () =>
    alert({
      title: 'סריקה פעילה',
      message: 'סריקה עבור אירוע זה כבר מתבצעת ברקע.',
      variant: 'info',
    });

  /** Wait for a stopped scan of this event to finish exiting so it cannot be revived by a new one. */
  const waitForLoopExit = async (eventId: string) => {
    while (activeLoopsRef.current.has(eventId)) await sleep(50);
  };

  const beginScan = (eventId: string, provider: CloudProvider, scannedCount: number, total: number, etaSeconds: number) => {
    activeLoopsRef.current.add(eventId);
    cancelledEventsRef.current.set(eventId, false);
    pausedEventsRef.current.set(eventId, false);
    setScanStates((prev) => ({
      ...prev,
      [eventId]: {
        eventId,
        provider,
        isScanning: true,
        isPaused: false,
        scannedCount,
        totalToScan: total,
        etaSeconds,
        scanError: null,
      },
    }));
  };

  const endScan = (eventId: string) => {
    setScanStates((prev) => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
    pausedEventsRef.current.delete(eventId);
    cancelledEventsRef.current.delete(eventId);
    activeLoopsRef.current.delete(eventId);
  };

  /** Mark the event ready, retrying through transient/quota failures. */
  const finalizeEvent = async (eventId: string, provider: CloudProvider, photoCount: number, faceCount: number) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await updateCloudEvent(eventId, { status: 'ready', photoCount, faceCount });
        return;
      } catch (err) {
        console.error(`Failed to finalize event ${eventId}:`, err);
        if ((await recoverFromFailure(eventId, provider, err, attempt, { onPermanent: 'pause' })) !== 'retry') return;
      }
    }
  };

  /**
   * Scan photos that already live in cloud storage.
   */
  const startCloudScanning = async (eventId: string, photos: CloudPhoto[], provider: CloudProvider) => {
    if (isEventScanning(eventId)) {
      await alertAlreadyScanning();
      return;
    }

    await waitForLoopExit(eventId);
    const alreadyDone = photos.filter((p) => p.processed && hasValidPublicUrl(p)).length;
    beginScan(eventId, provider, alreadyDone, photos.length, Math.round((photos.length - alreadyDone) * 2.5));

    const results = createResultBuffer(eventId, provider);
    const preloadCache = new Map<string, Promise<Blob>>();
    const linkCache = new Map<string, Promise<string>>();
    let progress = 0;
    let totalFacesFound = 0;
    let activeSeconds = 0;
    let activeProcessed = 0;
    const progressCounts = () => ({ photoCount: progress, faceCount: totalFacesFound });

    const preload = (fileId: string): Promise<Blob> => {
      let promise = preloadCache.get(fileId);
      if (!promise) {
        promise = withProviderToken(provider, (token) => getPhotoBlob(provider, token, fileId));
        promise.catch(() => undefined);
        preloadCache.set(fileId, promise);
      }
      return promise;
    };

    // Share links are separate provider calls (two round trips on Dropbox), so
    // they are fetched ahead too instead of after each photo's inference.
    const shareLink = (fileId: string): Promise<string> => {
      let promise = linkCache.get(fileId);
      if (!promise) {
        promise = withProviderToken(provider, (token) => getOrCreateSharedLink(provider, token, fileId));
        promise.catch(() => undefined);
        linkCache.set(fileId, promise);
      }
      return promise;
    };

    try {
      for (let idx = 0; idx < photos.length; idx++) {
        if (!(await waitWhilePaused(eventId))) break;

        const photo = photos[idx];
        if (photo.processed && hasValidPublicUrl(photo)) {
          progress++;
          continue;
        }

        for (let ahead = 1; ahead <= PRELOAD_AHEAD; ahead++) {
          const future = photos[idx + ahead];
          if (!future || (future.processed && hasValidPublicUrl(future))) continue;
          if (!future.processed) preload(future.driveFileId);
          shareLink(future.driveFileId);
        }

        const photoStart = Date.now();
        let cancelled = false;
        // Kept across retries so a failed link request does not redo inference.
        let scan: LocalScanResult | null = null;
        for (let attempt = 1; ; attempt++) {
          try {
            if (photo.processed) {
              // Processed earlier but missing a usable public URL: backfill it only.
              const publicUrl = convertToRawUrl(provider, await shareLink(photo.driveFileId));
              results.add({ id: photo.id!, data: { publicUrl } }, []);
            } else {
              const link = shareLink(photo.driveFileId);
              if (!scan) {
                const blob = await preload(photo.driveFileId);
                preloadCache.delete(photo.driveFileId);
                scan = await processPhotoLocally(blob);
              }
              if (isCancelled(eventId)) {
                cancelled = true;
                break;
              }
              const { width, height, detections } = scan;
              const publicUrl = convertToRawUrl(provider, await link);
              results.add(
                { id: photo.id!, data: { width, height, processed: true, publicUrl } },
                detections.map((det) => ({
                  photoId: photo.id!,
                  driveFileId: photo.driveFileId,
                  embedding: det.embedding,
                  box: det.box,
                }))
              );
              totalFacesFound += detections.length;
            }
            photo.processed = true;
            break;
          } catch (err) {
            console.error(`Error scanning photo ${photo.fileName}:`, err);
            preloadCache.delete(photo.driveFileId);
            linkCache.delete(photo.driveFileId);
            const outcome = await recoverFromFailure(eventId, provider, err, attempt);
            if (outcome === 'retry') continue;
            if (outcome === 'cancelled') {
              cancelled = true;
              break;
            }
            // Unrecoverable for this file (corrupt, missing, no access): skip it
            console.warn(`Skipping photo ${photo.fileName}.`);
            results.add({ id: photo.id!, data: { processed: true } }, []);
            break;
          }
        }
        if (cancelled) break;

        progress++;
        activeSeconds += (Date.now() - photoStart) / 1000;
        activeProcessed++;
        updateEventState(eventId, {
          scannedCount: progress,
          etaSeconds: Math.round((photos.length - progress) * (activeSeconds / activeProcessed)),
        });

        if (results.shouldFlush && !(await results.flush(progressCounts))) break;
      }

      if (isCancelled(eventId)) {
        // Keep work that is already done; ignore failures (e.g. event deleted).
        await results.flush(progressCounts).catch(() => undefined);
      } else if (await results.flush(progressCounts)) {
        await finalizeEvent(eventId, provider, progress, totalFacesFound);
      }
    } finally {
      preloadCache.clear();
      linkCache.clear();
      endScan(eventId);
    }
  };

  /**
   * Upload local files to the event's cloud folder and scan them in parallel.
   * Files stay in memory until each one is stored, so pauses for
   * re-authorization, quota or network problems never lose photos.
   */
  const startLocalUploadAndScan = async (
    eventId: string,
    provider: 'google' | 'dropbox',
    folderId: string,
    files: File[]
  ) => {
    if (isEventScanning(eventId)) {
      await alertAlreadyScanning();
      return;
    }

    await waitForLoopExit(eventId);
    beginScan(eventId, provider, 0, files.length, files.length * 3);

    const results = createResultBuffer(eventId, provider);
    let nextFileIndex = 0;
    let completedCount = 0;
    let uploadedCount = 0;
    let totalFacesFound = 0;
    let activeSeconds = 0;
    const progressCounts = () => ({ photoCount: uploadedCount, faceCount: totalFacesFound });
    const stats = createUploadStats(files.length, UPLOAD_CONCURRENCY[provider]);

    const uploadFile = async (file: File): Promise<{ id: string; publicUrl: string }> => {
      if (provider === 'google') {
        const googleFile = await withProviderToken('google', (token) => uploadPhotoToGoogleDrive(token, folderId, file));
        return { id: googleFile.id, publicUrl: convertToRawUrl('google', googleFile.id, 'thumb') };
      }
      const dropboxFile = await withProviderToken('dropbox', (token) => uploadPhotoToDropbox(token, folderId, file));
      let publicUrl = '';
      try {
        const link = await withProviderToken('dropbox', (token) => getOrCreateSharedLink('dropbox', token, dropboxFile.id));
        publicUrl = convertToRawUrl('dropbox', link);
      } catch (linkErr) {
        // Not fatal: the scanner backfills missing links on the next scan
        console.warn(`Failed to create shared link for uploaded Dropbox file ${file.name}:`, linkErr);
      }
      return { id: dropboxFile.id, publicUrl };
    };

    const worker = async () => {
      while (await waitWhilePaused(eventId)) {
        const idx = nextFileIndex++;
        if (idx >= files.length) return;

        const file = files[idx];
        const photoStart = Date.now();
        let detection: LocalScanResult | null = null;
        let uploaded: { id: string; publicUrl: string } | null = null;

        for (let attempt = 1; ; attempt++) {
          try {
            // Each step runs once; a retry resumes from the step that failed.
            detection ??= await processPhotoLocally(file, stats.detected);
            if (isCancelled(eventId)) return;
            if (!uploaded) {
              const uploadStart = performance.now();
              uploaded = await uploadFile(file);
              stats.uploaded(performance.now() - uploadStart, file.size);
            }
            break;
          } catch (err) {
            console.error(`Failed to process & upload file ${file.name}:`, err);
            const outcome = await recoverFromFailure(eventId, provider, err, attempt, { pauseOnAuthorization: true });
            if (outcome === 'retry') continue;
            if (outcome === 'cancelled') return;
            console.warn(`Skipping file ${file.name}.`);
            break;
          }
        }
        if (isCancelled(eventId)) return;

        if (detection && uploaded) {
          const photoId = newCloudPhotoId(eventId);
          results.add(
            {
              id: photoId,
              data: {
                driveFileId: uploaded.id,
                fileName: file.name,
                width: detection.width,
                height: detection.height,
                processed: true,
                publicUrl: uploaded.publicUrl,
              },
            },
            detection.detections.map((det) => ({
              photoId,
              driveFileId: uploaded.id,
              embedding: det.embedding,
              box: det.box,
            }))
          );
          uploadedCount++;
          totalFacesFound += detection.detections.length;
        }

        completedCount++;
        stats.completed();
        activeSeconds += (Date.now() - photoStart) / 1000;
        const remaining = files.length - completedCount;
        updateEventState(eventId, {
          scannedCount: completedCount,
          etaSeconds: Math.round((remaining * (activeSeconds / completedCount)) / UPLOAD_CONCURRENCY[provider]),
        });

        if (results.shouldFlush && !(await results.flush(progressCounts))) return;
      }
    };

    try {
      await updateCloudEvent(eventId, { status: 'scanning' }).catch((err) =>
        console.warn(`Failed to mark event ${eventId} as scanning:`, err)
      );
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY[provider], files.length) }, () => worker())
      );

      if (isCancelled(eventId)) {
        await results.flush(progressCounts).catch(() => undefined);
      } else if (await results.flush(progressCounts)) {
        await finalizeEvent(eventId, provider, uploadedCount, totalFacesFound);
      }
    } catch (err) {
      console.error(`Upload & scan failed for event ${eventId}:`, err);
    } finally {
      endScan(eventId);
    }
  };

  const startLocalGoogleUploadAndScan = (eventId: string, googleFolderId: string, files: File[]) =>
    startLocalUploadAndScan(eventId, 'google', googleFolderId, files);

  const startLocalDropboxUploadAndScan = (eventId: string, dropboxFolderPath: string, files: File[]) =>
    startLocalUploadAndScan(eventId, 'dropbox', dropboxFolderPath, files);

  return (
    <ScannerContext.Provider
      value={{
        isScanning,
        isPaused,
        scannedCount,
        totalToScan,
        etaSeconds,
        activeScanningEventId,
        activeScanningEventIds,
        scanError,
        isEventScanning,
        getEventScanState,
        startCloudScanning,
        startLocalGoogleUploadAndScan,
        startLocalDropboxUploadAndScan,
        togglePause,
        stopScanning,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}

export function useScanner() {
  const context = useContext(ScannerContext);
  if (!context) throw new Error('useScanner must be used within ScannerProvider');
  return context;
}
