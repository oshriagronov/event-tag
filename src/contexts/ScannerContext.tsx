import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { getPhotoBlob, checkTokenValidity } from '../services/googleDrive';
import { getONNXSession, extractEmbedding } from '../services/onnxModel';
import { alignFace } from '../services/faceAlignment';
import {
  updateCloudPhoto,
  appendFaceDescriptors,
  updateCloudEvent,
  type CloudFaceEntry,
  type CloudPhoto,
} from '../services/firestore';
import { useAuth } from './AuthContext';

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
    googleAccessToken: string
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

  const { googleAccessToken } = useAuth();
  const tokenRef = useRef(googleAccessToken);

  useEffect(() => {
    tokenRef.current = googleAccessToken;
    if (googleAccessToken && scanError === 'auth_expired') {
      setScanError(null);
      setIsPaused(false);
      isPausedRef.current = false;
    }
  }, [googleAccessToken, scanError]);

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
    googleAccessToken: string
  ) => {
    if (isScanning) {
      alert('סריקה כבר מתבצעת. אנא המתן לסיומה.');
      return;
    }

    setIsScanning(true);
    setTotalToScan(photos.length);
    setScannedCount(0);
    setEtaSeconds(null);
    setActiveScanningEventId(eventId);
    setIsPaused(false);
    setScanError(null);

    let progress = 0;
    let totalActiveTime = 0;
    let totalFacesFound = 0;

    // Buffer to batch Firestore face descriptor updates
    let facesBuffer: CloudFaceEntry[] = [];

    // Cache preloaded blobs for Google Drive downloads
    const preloadCache = new Map<string, Promise<Blob>>();

    function preloadDriveFile(fileId: string): Promise<Blob> {
      if (preloadCache.has(fileId)) return preloadCache.get(fileId)!;

      const promise = (async () => {
        const token = tokenRef.current || googleAccessToken;
        return await getPhotoBlob(token || '', fileId);
      })();

      preloadCache.set(fileId, promise);
      return promise;
    }

    for (let idx = 0; idx < photos.length; idx++) {
      while (isPausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const photoStart = Date.now();
      const photo = photos[idx];

      // If the photo was already processed in a previous scan, skip it immediately!
      if (photo.processed) {
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

        // Update photo metadata in Firestore
        await updateCloudPhoto(eventId, photo.id!, {
          width,
          height,
          processed: true,
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

        // Flush face descriptors buffer periodically to Firestore (every 15 photos or if buffer > 50 faces)
        if (facesBuffer.length >= 50 || (progress > 0 && progress % 15 === 0)) {
          await appendFaceDescriptors(eventId, facesBuffer);
          facesBuffer = [];
        }
      } catch (err: any) {
        console.error(`Error scanning Google Drive photo ${photo.fileName}:`, err);
        try {
          // Check if the token is expired/invalid
          const token = tokenRef.current || googleAccessToken;
          const isValid = await checkTokenValidity(token || '');
          if (!isValid) {
            // Token is invalid/expired! Pause scanner, set scanError, clear cache
            setScanError('auth_expired');
            setIsPaused(true);
            isPausedRef.current = true;
            preloadCache.clear();
            // Decrement idx so we retry this photo when resumed
            idx--;
            continue;
          } else {
            const errStr = err instanceof Error ? err.message : String(err);
            if (errStr.includes('timed out') || errStr.includes('Failed to fetch') || errStr.includes('NetworkError') || errStr.includes('timeout') || errStr.includes('aborted')) {
              // This is a network timeout or connection error!
              // Pause scanner and prompt network error in UI
              setScanError('network_error');
              setIsPaused(true);
              isPausedRef.current = true;
              preloadCache.clear();
              // Decrement idx so we retry this photo when resumed
              idx--;
              continue;
            } else {
              // Token is valid but this file failed (e.g. 404 because file was deleted)
              // We mark it as processed in Firestore so it's skipped next time.
              await updateCloudPhoto(eventId, photo.id!, {
                processed: true,
              });
            }
          }
        } catch (innerErr) {
          console.error('Fatal error in scanner loop recovery:', innerErr);
          // If we had a network/database error during recovery, pause and retry
          setScanError('network_error');
          setIsPaused(true);
          isPausedRef.current = true;
          preloadCache.clear();
          idx--;
          continue;
        }
      }

      const duration = (Date.now() - photoStart) / 1000;
      totalActiveTime += duration;

      progress++;
      setScannedCount(progress);

      const avgTime = totalActiveTime / progress;
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

    // Flush any remaining buffered faces at the end of the scan
    if (facesBuffer.length > 0) {
      try {
        await appendFaceDescriptors(eventId, facesBuffer);
      } catch (err) {
        console.error('Error flushing face descriptors buffer at end of scan:', err);
      }
    }

    // Set final event state to ready
    await updateCloudEvent(eventId, {
      status: 'ready',
      photoCount: progress,
      faceCount: totalFacesFound,
    });

    setIsScanning(false);
    setActiveScanningEventId(null);
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
