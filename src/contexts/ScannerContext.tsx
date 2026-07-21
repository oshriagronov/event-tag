import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { getPhotoBlob, checkTokenValidity, getOrCreateSharedLink, convertToRawUrl, type CloudProvider } from '../services/cloudProviders';
import { getONNXSession, extractEmbedding } from '../services/onnxModel';
import { alignFace } from '../services/faceAlignment';
import {
  updateCloudPhoto,
  updateCloudPhotosBatch,
  appendFaceDescriptors,
  updateCloudEvent,
  type CloudFaceEntry,
  type CloudPhoto,
} from '../services/firestore';
import { useAuth } from './AuthContext';
import { useModal } from './ModalContext';

interface ScannerContextType {
  isScanning: boolean;
  isPaused: boolean;
  scannedCount: number;
  totalToScan: number;
  etaSeconds: number | null;
  activeScanningEventId: string | null;
  scanError: 'auth_expired' | 'network_error' | null;
  startCloudScanning: (
    eventId: string,
    photos: CloudPhoto[],
    accessToken: string,
    provider: CloudProvider
  ) => Promise<void>;
  togglePause: () => void;
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
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [activeScanningEventId, setActiveScanningEventId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<'auth_expired' | 'network_error' | null>(null);

  const { googleAccessToken, onedriveAccessToken, dropboxAccessToken, markProviderExpired } = useAuth();
  const { alert } = useModal();

  useEffect(() => {
    const hasAnyToken = Boolean(googleAccessToken || onedriveAccessToken || dropboxAccessToken);
    if (hasAnyToken && scanError === 'auth_expired') {
      setScanError(null);
      setIsPaused(false);
      isPausedRef.current = false;
    }
  }, [googleAccessToken, onedriveAccessToken, dropboxAccessToken, scanError]);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const togglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      isPausedRef.current = next;
      if (!next) {
        setScanError(null);
      }
      return next;
    });
  };

  /**
   * Cloud Google Drive scanning flow using client-side face-api.js and Firestore
   */
  const startCloudScanning = async (
    eventId: string,
    photos: CloudPhoto[],
    accessToken: string,
    provider: CloudProvider
  ) => {
    if (isScanning) {
      await alert({
        title: 'סריקה פעילה',
        message: 'סריקה כבר מתבצעת. אנא המתן לסיומה.',
        variant: 'info',
      });
      return;
    }

    setIsScanning(true);
    setTotalToScan(photos.length);

    const alreadyProcessed = photos.filter((p) => p.processed && p.publicUrl).length;
    setScannedCount(alreadyProcessed);

    const initialRemaining = photos.length - alreadyProcessed;
    setEtaSeconds(initialRemaining > 0 ? Math.round(initialRemaining * 2.5) : 0);

    setActiveScanningEventId(eventId);
    setIsPaused(false);
    setScanError(null);

    let progress = 0;
    let activeProcessedCount = 0;
    let activeActiveTime = 0;
    let totalFacesFound = 0;

    // Buffer to batch Firestore face descriptor updates
    let facesBuffer: CloudFaceEntry[] = [];

    // Buffer to batch Firestore photo updates
    let photosBuffer: { id: string; updates: Partial<CloudPhoto> }[] = [];

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

    try {
      for (let idx = 0; idx < photos.length; idx++) {
        while (isPausedRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        const photoStart = Date.now();
        const photo = photos[idx];

        // If the photo was already processed in a previous scan
        if (photo.processed) {
          // If it already has a publicUrl, skip it entirely!
          if (photo.publicUrl) {
            progress++;
            if (progress > scannedCount) {
              setScannedCount(progress);
            }
            continue;
          }

          // If it is processed but lacks publicUrl, we generate publicUrl and update Firestore
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
          } catch (sharedLinkErr: any) {
            console.error(`Failed to generate publicUrl for processed photo ${photo.fileName}:`, sharedLinkErr);
            const errStr = sharedLinkErr instanceof Error ? sharedLinkErr.message : String(sharedLinkErr);
            
            if (errStr.includes('401')) {
              setScanError('auth_expired');
              setIsPaused(true);
              isPausedRef.current = true;
              preloadCache.clear();
              idx--;
              continue;
            } else if (errStr.includes('timed out') || errStr.includes('Failed to fetch') || errStr.includes('NetworkError') || errStr.includes('timeout') || errStr.includes('aborted')) {
              setScanError('network_error');
              setIsPaused(true);
              isPausedRef.current = true;
              preloadCache.clear();
              idx--;
              continue;
            }
          }

          progress++;
          setScannedCount(progress);
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
        } catch (err: any) {
          console.error(`Error scanning photo ${photo.fileName}:`, err);
          const errStr = err instanceof Error ? err.message : String(err);
          
          if (errStr.includes('401')) {
            markProviderExpired(provider);
            setScanError('auth_expired');
            setIsPaused(true);
            isPausedRef.current = true;
            preloadCache.clear();
            idx--;
            continue;
          }

          try {
            const isValid = await checkTokenValidity(provider, accessToken);
            if (!isValid) {
              markProviderExpired(provider);
              setScanError('auth_expired');
              setIsPaused(true);
              isPausedRef.current = true;
              preloadCache.clear();
              idx--;
              continue;
            } else {
              if (errStr.includes('timed out') || errStr.includes('Failed to fetch') || errStr.includes('NetworkError') || errStr.includes('timeout') || errStr.includes('aborted')) {
                setScanError('network_error');
                setIsPaused(true);
                isPausedRef.current = true;
                preloadCache.clear();
                idx--;
                continue;
              } else {
                await updateCloudPhoto(eventId, photo.id!, {
                  processed: true,
                });
              }
            }
          } catch (innerErr) {
            console.error('Fatal error in scanner loop recovery:', innerErr);
            setScanError('network_error');
            setIsPaused(true);
            isPausedRef.current = true;
            preloadCache.clear();
            idx--;
            continue;
          }
        }

        const duration = (Date.now() - photoStart) / 1000;
        activeActiveTime += duration;
        activeProcessedCount++;

        progress++;
        setScannedCount(progress);

        const avgTime = activeActiveTime / activeProcessedCount;
        const remaining = photos.length - progress;
        setEtaSeconds(Math.round(remaining * avgTime));

        // Update event progress in Firestore periodically
        if (progress % 10 === 0 || progress === photos.length) {
          await updateCloudEvent(eventId, {
            photoCount: progress,
            faceCount: totalFacesFound,
          });
        }
      }

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
    } finally {
      setIsScanning(false);
      setActiveScanningEventId(null);
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
        scanError,
        startCloudScanning,
        togglePause,
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
