import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { getPhotoBlob, checkTokenValidity, getOrCreateSharedLink, convertToRawUrl, type CloudProvider } from '../services/cloudProviders';
import { getONNXSession, extractEmbedding } from '../services/onnxModel';
import { alignFace } from '../services/faceAlignment';
import { uploadPhotoToGoogleDrive } from '../services/google';
import { uploadPhotoToDropbox } from '../services/dropbox';
import {
  addCloudPhoto,
  updateCloudPhoto,
  updateCloudPhotosBatch,
  appendFaceDescriptors,
  updateCloudEvent,
  type CloudFaceEntry,
  type CloudPhoto,
} from '../services/firestore';
import { useAuth } from './AuthContext';
import { useModal } from './ModalContext';

export interface EventScanState {
  eventId: string;
  isScanning: boolean;
  isPaused: boolean;
  scannedCount: number;
  totalToScan: number;
  etaSeconds: number | null;
  scanError: 'auth_expired' | 'network_error' | null;
}

interface ScannerContextType {
  isScanning: boolean;
  isPaused: boolean;
  scannedCount: number;
  totalToScan: number;
  etaSeconds: number | null;
  activeScanningEventId: string | null;
  activeScanningEventIds: string[];
  scanError: 'auth_expired' | 'network_error' | null;
  isEventScanning: (eventId: string) => boolean;
  getEventScanState: (eventId: string) => EventScanState | undefined;
  startCloudScanning: (
    eventId: string,
    photos: CloudPhoto[],
    accessToken: string,
    provider: CloudProvider
  ) => Promise<void>;
  startLocalGoogleUploadAndScan: (
    eventId: string,
    googleFolderId: string,
    files: File[],
    accessToken: string
  ) => Promise<void>;
  startLocalDropboxUploadAndScan: (
    eventId: string,
    dropboxFolderIdOrPath: string,
    files: File[],
    accessToken: string
  ) => Promise<void>;
  togglePause: (eventId?: string) => void;
  stopScanning: (eventId: string) => void;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

// Number of images to preload ahead of the current processing image
const PRELOAD_AHEAD = 2;

// Singleton model loading state
let modelsLoaded = false;
let modelsLoading = false;
let modelLoadPromise: Promise<void> | null = null;

async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading && modelLoadPromise) return modelLoadPromise;

  modelsLoading = true;
  modelLoadPromise = (async () => {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);
    // Initialize the SFace ONNX session
    await getONNXSession();
    modelsLoaded = true;
    modelsLoading = false;
    console.log('TFJS SSD/Landmarks and ONNX SFace initialized');
  })();

  return modelLoadPromise;
}

/**
 * Process a photo blob locally using face-api.js client-side
 */
async function processPhotoLocally(fileBlob: Blob): Promise<{
  width: number;
  height: number;
  detections: Array<{
    embedding: number[];
    box: { x: number; y: number; width: number; height: number };
  }>;
}> {
  await ensureModelsLoaded();

  const blobUrl = URL.createObjectURL(fileBlob);
  const img = new Image();
  img.src = blobUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
  });

  const width = img.naturalWidth;
  const height = img.naturalHeight;

  // Conditionally downscale to a maximum dimension of 1600px for speed while maintaining high detection quality
  const MAX_DIM = 1600;
  let detectionSource: HTMLImageElement | HTMLCanvasElement = img;

  if (Math.max(width, height) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    const canvasWidth = Math.round(width * scale);
    const canvasHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      detectionSource = canvas;
    }
  }

  const srcWidth = detectionSource instanceof HTMLCanvasElement ? detectionSource.width : width;
  const srcHeight = detectionSource instanceof HTMLCanvasElement ? detectionSource.height : height;

  // Run face-api.js detection with optimized confidence threshold to capture more faces at angles/shadows
  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 });
  const detections = await faceapi
    .detectAllFaces(detectionSource, options)
    .withFaceLandmarks();

  URL.revokeObjectURL(blobUrl);

  const results = [];
  for (const det of detections) {
    const box = det.detection.box;
    // Bounding box in relative percentages for overlay rendering
    const relBox = {
      x: box.x / srcWidth,
      y: box.y / srcHeight,
      width: box.width / srcWidth,
      height: box.height / srcHeight,
    };

    // Align and crop the face using landmarks to 112x112
    const alignedCanvas = alignFace(detectionSource, det.landmarks);

    // Extract embedding using SFace ONNX model
    const embedding = await extractEmbedding(alignedCanvas);

    results.push({
      embedding,
      box: relBox,
    });
  }

  return { width, height, detections: results };
}

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [scanStates, setScanStates] = useState<Record<string, EventScanState>>({});

  const pausedEventsRef = useRef<Map<string, boolean>>(new Map());
  const cancelledEventsRef = useRef<Map<string, boolean>>(new Map());

  const { googleAccessToken, onedriveAccessToken, dropboxAccessToken, markProviderExpired, refreshGoogleTokenSilently } = useAuth();
  const { alert } = useModal();

  useEffect(() => {
    const hasAnyToken = Boolean(googleAccessToken || onedriveAccessToken || dropboxAccessToken);
    if (hasAnyToken) {
      setScanStates((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [id, state] of Object.entries(next)) {
          if (state.scanError === 'auth_expired') {
            next[id] = { ...state, scanError: null, isPaused: false };
            pausedEventsRef.current.set(id, false);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [googleAccessToken, onedriveAccessToken, dropboxAccessToken]);

  const activeScanningEventIds = Object.keys(scanStates).filter(
    (id) => scanStates[id]?.isScanning
  );
  const isScanning = activeScanningEventIds.length > 0;
  const activeScanningEventId =
    activeScanningEventIds.length > 0
      ? activeScanningEventIds[activeScanningEventIds.length - 1]
      : null;

  const primaryState = activeScanningEventId ? scanStates[activeScanningEventId] : undefined;
  const isPaused = primaryState?.isPaused ?? false;
  const scannedCount = primaryState?.scannedCount ?? 0;
  const totalToScan = primaryState?.totalToScan ?? 0;
  const etaSeconds = primaryState?.etaSeconds ?? null;
  const scanError = primaryState?.scanError ?? null;

  const isEventScanning = (eventId: string) => Boolean(scanStates[eventId]?.isScanning);
  const getEventScanState = (eventId: string) => scanStates[eventId];

  const togglePause = (eventId?: string) => {
    const targetId = eventId || activeScanningEventId;
    if (!targetId) return;

    const currentPaused = pausedEventsRef.current.get(targetId) ?? false;
    const nextPaused = !currentPaused;

    pausedEventsRef.current.set(targetId, nextPaused);

    setScanStates((prev) => {
      const state = prev[targetId];
      if (!state) return prev;
      return {
        ...prev,
        [targetId]: {
          ...state,
          isPaused: nextPaused,
          scanError: nextPaused ? state.scanError : null,
        },
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

  /**
   * Cloud scanning flow using client-side face-api.js and Firestore
   */
  const startCloudScanning = async (
    eventId: string,
    photos: CloudPhoto[],
    accessToken: string,
    provider: CloudProvider
  ) => {
    if (isEventScanning(eventId)) {
      await alert({
        title: 'סריקה פעילה',
        message: 'סריקה עבור אירוע זה כבר מתבצעת ברקע.',
        variant: 'info',
      });
      return;
    }

    cancelledEventsRef.current.set(eventId, false);
    pausedEventsRef.current.set(eventId, false);

    const isPhotoValid = (p: CloudPhoto) =>
      Boolean(
        p.publicUrl &&
          !p.publicUrl.includes('/2.0/files/')
      );

    const alreadyProcessed = photos.filter((p) => p.processed && isPhotoValid(p)).length;
    const initialRemaining = photos.length - alreadyProcessed;

    const initialState: EventScanState = {
      eventId,
      isScanning: true,
      isPaused: false,
      scannedCount: alreadyProcessed,
      totalToScan: photos.length,
      etaSeconds: initialRemaining > 0 ? Math.round(initialRemaining * 2.5) : 0,
      scanError: null,
    };

    setScanStates((prev) => ({
      ...prev,
      [eventId]: initialState,
    }));

    let progress = 0;
    let activeProcessedCount = 0;
    let activeActiveTime = 0;
    let totalFacesFound = 0;

    // Buffer to batch Firestore face descriptor updates
    let facesBuffer: CloudFaceEntry[] = [];

    // Buffer to batch Firestore photo updates
    let photosBuffer: { id: string; updates: Partial<CloudPhoto> }[] = [];

    // Track retries per photo ID to avoid pausing the loop on transient timeouts
    const photoRetryMap = new Map<string, number>();

    // Cache preloaded blobs for downloads
    const preloadCache = new Map<string, Promise<Blob>>();

    function preloadDriveFile(fileId: string): Promise<Blob> {
      if (preloadCache.has(fileId)) return preloadCache.get(fileId)!;

      const promise = (async () => {
        return await getPhotoBlob(provider, accessToken, fileId);
      })();

      preloadCache.set(fileId, promise);
      return promise;
    }

    const updateEventState = (updates: Partial<EventScanState>) => {
      setScanStates((prev) => {
        const current = prev[eventId];
        if (!current) return prev;
        return {
          ...prev,
          [eventId]: { ...current, ...updates },
        };
      });
    };

    try {
      for (let idx = 0; idx < photos.length; idx++) {
        if (cancelledEventsRef.current.get(eventId)) {
          console.log(`Scan cancelled for event ${eventId}`);
          break;
        }

        while (pausedEventsRef.current.get(eventId)) {
          if (cancelledEventsRef.current.get(eventId)) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (cancelledEventsRef.current.get(eventId)) break;

        const photoStart = Date.now();
        const photo = photos[idx];

        // If the photo was already processed in a previous scan
        if (photo.processed) {
          const isValidPublicUrl = Boolean(
            photo.publicUrl &&
              !photo.publicUrl.includes('/2.0/files/')
          );

          if (isValidPublicUrl) {
            progress++;
            if (progress > alreadyProcessed) {
              updateEventState({ scannedCount: progress });
            }
            continue;
          }

          // If it is processed but lacks a valid publicUrl, generate publicUrl and update Firestore
          try {
            const sharedLink = await getOrCreateSharedLink(provider, accessToken, photo.driveFileId);
            const publicUrl = convertToRawUrl(provider, sharedLink);

            photosBuffer.push({
              id: photo.id!,
              updates: {
                publicUrl,
              },
            });

            // Flush periodically
            if (photosBuffer.length >= 15) {
              await updateCloudPhotosBatch(eventId, photosBuffer);
              for (const p of photosBuffer) {
                const localPhoto = photos.find((lp) => lp.id === p.id);
                if (localPhoto) localPhoto.publicUrl = p.updates.publicUrl;
              }
              photosBuffer = [];
            }
          } catch (sharedLinkErr: unknown) {
            console.error(`Failed to generate publicUrl for processed photo ${photo.fileName}:`, sharedLinkErr);
            const errStr = sharedLinkErr instanceof Error ? sharedLinkErr.message : String(sharedLinkErr);
            
            if (errStr.includes('401') || errStr.includes('403') || errStr.includes('PERMISSION_DENIED') || errStr.includes('unregistered callers')) {
              if (provider === 'google') {
                const refreshed = await refreshGoogleTokenSilently();
                if (refreshed) {
                  accessToken = refreshed;
                  preloadCache.clear();
                  idx--;
                  continue;
                }
              }
              markProviderExpired(provider);
              pausedEventsRef.current.set(eventId, true);
              updateEventState({ scanError: 'auth_expired', isPaused: true });
              preloadCache.clear();
              idx--;
              continue;
            } else if (errStr.includes('timed out') || errStr.includes('Failed to fetch') || errStr.includes('NetworkError') || errStr.includes('timeout') || errStr.includes('aborted')) {
              pausedEventsRef.current.set(eventId, true);
              updateEventState({ scanError: 'network_error', isPaused: true });
              preloadCache.clear();
              idx--;
              continue;
            }
          }

          progress++;
          updateEventState({ scannedCount: progress });
          continue;
        }

        // Preload future files (only if they aren't processed already)
        for (let ahead = 1; ahead <= PRELOAD_AHEAD; ahead++) {
          const futureIdx = idx + ahead;
          if (futureIdx < photos.length && !photos[futureIdx].processed) {
            preloadDriveFile(photos[futureIdx].driveFileId).catch(() => {});
          }
        }

        try {
          const fileBlob = await preloadDriveFile(photo.driveFileId);
          preloadCache.delete(photo.driveFileId);

          // Process locally via client-side face-api.js
          const { width, height, detections } = await processPhotoLocally(fileBlob);

          // Get or create public shared link for the photo
          const sharedLink = await getOrCreateSharedLink(provider, accessToken, photo.driveFileId);
          const publicUrl = convertToRawUrl(provider, sharedLink);

          // Add photo updates to buffer
          photosBuffer.push({
            id: photo.id!,
            updates: {
              width,
              height,
              processed: true,
              publicUrl,
            },
          });

          // Add face descriptors to the buffer
          if (detections && detections.length > 0) {
            const facesToAdd: CloudFaceEntry[] = detections.map((det) => ({
              photoId: photo.id!,
              driveFileId: photo.driveFileId,
              embedding: det.embedding,
              box: det.box,
            }));

            facesBuffer.push(...facesToAdd);
            totalFacesFound += detections.length;
          }

          // Flush face descriptors and photo buffers periodically to Firestore
          if (facesBuffer.length >= 50 || photosBuffer.length >= 15) {
            if (facesBuffer.length > 0) {
              await appendFaceDescriptors(eventId, facesBuffer);
              facesBuffer = [];
            }
            if (photosBuffer.length > 0) {
              await updateCloudPhotosBatch(eventId, photosBuffer);
              for (const p of photosBuffer) {
                const localPhoto = photos.find((lp) => lp.id === p.id);
                if (localPhoto) {
                  localPhoto.processed = true;
                  localPhoto.publicUrl = p.updates.publicUrl;
                }
              }
              photosBuffer = [];
            }
          }
        } catch (err: unknown) {
          console.error(`Error scanning photo ${photo.fileName}:`, err);
          const errStr = err instanceof Error ? err.message : String(err);
          const photoId = photo.id || photo.driveFileId;
          const currentRetries = (photoRetryMap.get(photoId) || 0) + 1;
          photoRetryMap.set(photoId, currentRetries);

          if (errStr.includes('401') || errStr.includes('403') || errStr.includes('PERMISSION_DENIED') || errStr.includes('unregistered callers')) {
            if (provider === 'google') {
              const refreshed = await refreshGoogleTokenSilently();
              if (refreshed) {
                accessToken = refreshed;
                preloadCache.clear();
                idx--;
                continue;
              }
            }
            markProviderExpired(provider);
            pausedEventsRef.current.set(eventId, true);
            updateEventState({ scanError: 'auth_expired', isPaused: true });
            preloadCache.clear();
            idx--;
            continue;
          }

          try {
            const isValid = await checkTokenValidity(provider, accessToken);
            if (!isValid) {
              markProviderExpired(provider);
              pausedEventsRef.current.set(eventId, true);
              updateEventState({ scanError: 'auth_expired', isPaused: true });
              preloadCache.clear();
              idx--;
              continue;
            }

            if (currentRetries <= 2) {
              console.warn(`Retry attempt ${currentRetries}/2 for photo ${photo.fileName}...`);
              preloadCache.delete(photo.driveFileId);
              await new Promise((r) => setTimeout(r, 1500));
              idx--;
              continue;
            }

            console.warn(`Skipping photo ${photo.fileName} after ${currentRetries} failed attempts.`);
            await updateCloudPhoto(eventId, photo.id!, {
              processed: true,
            });
            preloadCache.delete(photo.driveFileId);
          } catch (innerErr) {
            console.error('Error in scanner loop photo recovery:', innerErr);
            if (currentRetries <= 2) {
              preloadCache.delete(photo.driveFileId);
              await new Promise((r) => setTimeout(r, 1500));
              idx--;
              continue;
            }
            await updateCloudPhoto(eventId, photo.id!, {
              processed: true,
            });
          }
        }

        const duration = (Date.now() - photoStart) / 1000;
        activeActiveTime += duration;
        activeProcessedCount++;

        progress++;

        const avgTime = activeActiveTime / activeProcessedCount;
        const remaining = photos.length - progress;
        const calculatedEta = Math.round(remaining * avgTime);

        updateEventState({
          scannedCount: progress,
          etaSeconds: calculatedEta,
        });

        // Update event progress in Firestore periodically
        if (progress % 10 === 0 || progress === photos.length) {
          await updateCloudEvent(eventId, {
            photoCount: progress,
            faceCount: totalFacesFound,
          });
        }
      }

      if (!cancelledEventsRef.current.get(eventId)) {
        // Flush remaining buffered faces
        if (facesBuffer.length > 0) {
          try {
            await appendFaceDescriptors(eventId, facesBuffer);
          } catch (err) {
            console.error('Error flushing face descriptors buffer at end of scan:', err);
          }
        }

        // Flush remaining buffered photos
        if (photosBuffer.length > 0) {
          try {
            await updateCloudPhotosBatch(eventId, photosBuffer);
            for (const p of photosBuffer) {
              const localPhoto = photos.find((lp) => lp.id === p.id);
              if (localPhoto) {
                localPhoto.processed = true;
                localPhoto.publicUrl = p.updates.publicUrl;
              }
            }
          } catch (err) {
            console.error('Error flushing photos buffer at end of scan:', err);
          }
        }

        // Set final event state to ready
        await updateCloudEvent(eventId, {
          status: 'ready',
          photoCount: progress,
          faceCount: totalFacesFound,
        });
      }
    } finally {
      setScanStates((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      pausedEventsRef.current.delete(eventId);
      cancelledEventsRef.current.delete(eventId);
    }
  };

  /**
   * Local upload & scanning flow for Google Drive events using drive.file scope
   * Processes files in parallel workers (CONCURRENCY = 2)
   */
  const startLocalGoogleUploadAndScan = async (
    eventId: string,
    googleFolderId: string,
    files: File[],
    accessToken: string
  ) => {
    if (isEventScanning(eventId)) {
      await alert({
        title: 'סריקה פעילה',
        message: 'סריקה עבור אירוע זה כבר מתבצעת ברקע.',
        variant: 'info',
      });
      return;
    }

    cancelledEventsRef.current.set(eventId, false);
    pausedEventsRef.current.set(eventId, false);

    const totalToScan = files.length;
    const initialState: EventScanState = {
      eventId,
      isScanning: true,
      isPaused: false,
      scannedCount: 0,
      totalToScan,
      etaSeconds: totalToScan * 3,
      scanError: null,
    };

    setScanStates((prev) => ({
      ...prev,
      [eventId]: initialState,
    }));

    await updateCloudEvent(eventId, { status: 'scanning' });

    let scannedCount = 0;
    let totalFacesFound = 0;
    let nextFileIndex = 0;
    let activeTime = 0;
    let currentToken = accessToken;

    const updateEventState = (updates: Partial<EventScanState>) => {
      setScanStates((prev) => {
        const current = prev[eventId];
        if (!current) return prev;
        return {
          ...prev,
          [eventId]: { ...current, ...updates },
        };
      });
    };

    const worker = async () => {
      while (nextFileIndex < files.length) {
        if (cancelledEventsRef.current.get(eventId)) break;

        while (pausedEventsRef.current.get(eventId)) {
          if (cancelledEventsRef.current.get(eventId)) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (cancelledEventsRef.current.get(eventId)) break;

        const idx = nextFileIndex++;
        if (idx >= files.length) break;

        const file = files[idx];
        const photoStart = Date.now();

        try {
          // 1. Client-side ML face detection in memory
          const { width, height, detections } = await processPhotoLocally(file);

          if (cancelledEventsRef.current.get(eventId)) break;

          // 2. Direct upload to Google Drive target folder
          const googleFile = await uploadPhotoToGoogleDrive(currentToken, googleFolderId, file);

          if (cancelledEventsRef.current.get(eventId)) break;

          // 3. Construct public CDN/thumbnail URL
          const publicUrl = convertToRawUrl('google', googleFile.id, 'thumb');

          // 4. Write photo document to Firestore
          const photoId = await addCloudPhoto(eventId, {
            driveFileId: googleFile.id,
            fileName: file.name,
            width,
            height,
            processed: true,
            publicUrl,
          });

          // 5. Save face descriptors
          if (detections.length > 0) {
            const faces: CloudFaceEntry[] = detections.map((det) => ({
              photoId,
              driveFileId: googleFile.id,
              embedding: det.embedding,
              box: det.box,
            }));
            await appendFaceDescriptors(eventId, faces);
            totalFacesFound += detections.length;
          }

          scannedCount++;
          const duration = (Date.now() - photoStart) / 1000;
          activeTime += duration;
          const avgPerPhoto = activeTime / scannedCount;
          const remaining = totalToScan - scannedCount;
          const remainingWorkers = Math.min(2, remaining);
          const etaSeconds = remainingWorkers > 0 ? Math.round((remaining * avgPerPhoto) / remainingWorkers) : 0;

          updateEventState({
            scannedCount,
            etaSeconds,
          });
        } catch (err: unknown) {
          console.error(`Failed to process & upload file ${file.name}:`, err);
          const errStr = err instanceof Error ? err.message : String(err);
          if (
            errStr.includes('401') ||
            errStr.includes('403') ||
            errStr.includes('expired_access_token') ||
            errStr.includes('invalid_token') ||
            errStr.includes('PERMISSION_DENIED')
          ) {
            markProviderExpired('google');
            updateEventState({ scanError: 'auth_expired', isPaused: true });
            pausedEventsRef.current.set(eventId, true);
            const refreshedToken = await refreshGoogleTokenSilently();
            if (refreshedToken) {
              currentToken = refreshedToken;
              nextFileIndex--;
              updateEventState({ scanError: null, isPaused: false });
              pausedEventsRef.current.set(eventId, false);
            }
          }
        }
      }
    };

    try {
      // Run 2 parallel workers for upload & face scanning
      const CONCURRENCY = 2;
      const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
      await Promise.all(workers);

      if (!cancelledEventsRef.current.get(eventId)) {
        await updateCloudEvent(eventId, {
          status: 'ready',
          photoCount: scannedCount,
          faceCount: totalFacesFound,
        });
      }
    } catch (err) {
      console.error(`Scanning error for local Google upload event ${eventId}:`, err);
    } finally {
      setScanStates((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      pausedEventsRef.current.delete(eventId);
      cancelledEventsRef.current.delete(eventId);
    }
  };

  /**
   * Local upload & scanning flow for Dropbox events
   * Processes files in parallel workers (CONCURRENCY = 2)
   */
  const startLocalDropboxUploadAndScan = async (
    eventId: string,
    dropboxFolderIdOrPath: string,
    files: File[],
    accessToken: string
  ) => {
    if (isEventScanning(eventId)) {
      await alert({
        title: 'סריקה פעילה',
        message: 'סריקה עבור אירוע זה כבר מתבצעת ברקע.',
        variant: 'info',
      });
      return;
    }

    cancelledEventsRef.current.set(eventId, false);
    pausedEventsRef.current.set(eventId, false);

    const totalToScan = files.length;
    const initialState: EventScanState = {
      eventId,
      isScanning: true,
      isPaused: false,
      scannedCount: 0,
      totalToScan,
      etaSeconds: totalToScan * 3,
      scanError: null,
    };

    setScanStates((prev) => ({
      ...prev,
      [eventId]: initialState,
    }));

    await updateCloudEvent(eventId, { status: 'scanning' });

    let scannedCount = 0;
    let totalFacesFound = 0;
    let nextFileIndex = 0;
    let activeTime = 0;
    const currentToken = accessToken;

    const updateEventState = (updates: Partial<EventScanState>) => {
      setScanStates((prev) => {
        const current = prev[eventId];
        if (!current) return prev;
        return {
          ...prev,
          [eventId]: { ...current, ...updates },
        };
      });
    };

    const worker = async () => {
      while (nextFileIndex < files.length) {
        if (cancelledEventsRef.current.get(eventId)) break;

        while (pausedEventsRef.current.get(eventId)) {
          if (cancelledEventsRef.current.get(eventId)) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (cancelledEventsRef.current.get(eventId)) break;

        const idx = nextFileIndex++;
        if (idx >= files.length) break;

        const file = files[idx];
        const photoStart = Date.now();

        try {
          // 1. Client-side ML face detection in memory
          const { width, height, detections } = await processPhotoLocally(file);

          if (cancelledEventsRef.current.get(eventId)) break;

          // 2. Direct upload to Dropbox target folder
          const dropboxFile = await uploadPhotoToDropbox(currentToken, dropboxFolderIdOrPath, file);

          if (cancelledEventsRef.current.get(eventId)) break;

          // 3. Construct public shared link / raw CDN URL
          let publicUrl = '';
          try {
            const sharedLink = await getOrCreateSharedLink('dropbox', currentToken, dropboxFile.id);
            publicUrl = convertToRawUrl('dropbox', sharedLink);
          } catch (linkErr) {
            console.warn(`Failed to create shared link for uploaded Dropbox file ${file.name}:`, linkErr);
          }

          // 4. Write photo document to Firestore
          const photoId = await addCloudPhoto(eventId, {
            driveFileId: dropboxFile.id,
            fileName: file.name,
            width,
            height,
            processed: true,
            publicUrl,
          });

          // 5. Save face descriptors
          if (detections.length > 0) {
            const faces: CloudFaceEntry[] = detections.map((det) => ({
              photoId,
              driveFileId: dropboxFile.id,
              embedding: det.embedding,
              box: det.box,
            }));
            await appendFaceDescriptors(eventId, faces);
            totalFacesFound += detections.length;
          }

          scannedCount++;
          const duration = (Date.now() - photoStart) / 1000;
          activeTime += duration;
          const avgPerPhoto = activeTime / scannedCount;
          const remaining = totalToScan - scannedCount;
          const remainingWorkers = Math.min(2, remaining);
          const etaSeconds = remainingWorkers > 0 ? Math.round((remaining * avgPerPhoto) / remainingWorkers) : 0;

          updateEventState({
            scannedCount,
            etaSeconds,
          });
        } catch (err: unknown) {
          console.error(`Failed to process & upload file ${file.name} to Dropbox:`, err);
          const errStr = err instanceof Error ? err.message : String(err);

          if (
            errStr.includes('401') ||
            errStr.includes('403') ||
            errStr.includes('expired_access_token') ||
            errStr.includes('invalid_token') ||
            errStr.includes('PERMISSION_DENIED')
          ) {
            markProviderExpired('dropbox');
            updateEventState({ scanError: 'auth_expired', isPaused: true });
            pausedEventsRef.current.set(eventId, true);
            break;
          }
        }
      }
    };

    try {
      // Run 2 parallel workers for upload & face scanning
      const CONCURRENCY = 2;
      const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
      await Promise.all(workers);

      if (!cancelledEventsRef.current.get(eventId)) {
        await updateCloudEvent(eventId, {
          status: 'ready',
          photoCount: scannedCount,
          faceCount: totalFacesFound,
        });
      }
    } catch (err) {
      console.error(`Scanning error for local Dropbox upload event ${eventId}:`, err);
    } finally {
      setScanStates((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      pausedEventsRef.current.delete(eventId);
      cancelledEventsRef.current.delete(eventId);
    }
  };

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
