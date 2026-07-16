import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { db } from '../db';
import { IncrementalClusterer } from '../clustering';
import { getPhotoBlob } from '../services/googleDrive';
import { getONNXSession, extractEmbedding } from '../services/onnxModel';
import { alignFace } from '../services/faceAlignment';
import {
  updateCloudPhoto,
  appendFaceDescriptors,
  updateCloudEvent,
  type CloudFaceEntry,
  type CloudPhoto,
} from '../services/firestore';

interface ScannerContextType {
  isScanning: boolean;
  isPaused: boolean;
  scannedCount: number;
  totalToScan: number;
  etaSeconds: number | null;
  activeScanningEventId: number | string | null;
  startScanning: (eventId: number, filesList: any[]) => Promise<void>;
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
    thumbnail: string;
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

    // Generate base64 thumbnail from the aligned face
    const thumbnail = alignedCanvas.toDataURL('image/jpeg', 0.85);

    results.push({
      embedding,
      box: relBox,
      thumbnail,
    });
  }

  return { width, height, detections: results };
}

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  // Clear local DB tables if shifting from face-api.js to SFace model.
  useEffect(() => {
    const checkDatabaseMigration = async () => {
      const CURRENT_MODEL_VERSION = 'sface_v3';
      const storedVersion = localStorage.getItem('eventtag_face_model_version');
      if (storedVersion !== CURRENT_MODEL_VERSION) {
        console.log('Detected face recognition model change. Resetting database caches...');
        try {
          await db.transaction('rw', [db.faces, db.photos, db.clusters], async () => {
            await db.faces.clear();
            await db.photos.clear();
            await db.clusters.clear();
          });
          localStorage.setItem('eventtag_face_model_version', CURRENT_MODEL_VERSION);
          console.log('Database successfully reset for new model.');
        } catch (err) {
          console.error('Failed to reset database for new model:', err);
        }
      }
    };
    checkDatabaseMigration();
  }, []);
  const [totalToScan, setTotalToScan] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [activeScanningEventId, setActiveScanningEventId] = useState<number | string | null>(null);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  /**
   * Local scanning flow using client-side face-api.js
   */
  const startScanning = async (
    eventId: number,
    filesList: Array<{ fileHandle?: FileSystemFileHandle; fallbackBlob?: Blob; name: string }>
  ) => {
    if (isScanning) {
      alert('סריקה כבר מתבצעת. אנא המתן לסיומה.');
      return;
    }

    setIsScanning(true);
    setTotalToScan(filesList.length);
    setScannedCount(0);
    setEtaSeconds(null);
    setActiveScanningEventId(eventId);
    setIsPaused(false);

    // Save metadata first
    const photosToProcess: Array<{ id: number; item: typeof filesList[0] }> = [];

    for (const item of filesList) {
      const existing = await db.photos.where({ eventId, fileName: item.name }).first();
      if (existing) {
        if (!existing.processed) {
          photosToProcess.push({ id: existing.id!, item });
        }
        continue;
      }

      const photoId = await db.photos.add({
        eventId,
        fileName: item.name,
        fileHandle: item.fileHandle,
        fallbackBlob: item.fallbackBlob,
        width: 0,
        height: 0,
        processed: false,
      });

      photosToProcess.push({ id: photoId, item });
    }

    setTotalToScan(photosToProcess.length);

    if (photosToProcess.length === 0) {
      setIsScanning(false);
      setActiveScanningEventId(null);
      return;
    }

    const clusterer = new IncrementalClusterer(eventId);
    await clusterer.init();

    // Cache preloaded blobs
    const preloadCache = new Map<number, Promise<Blob | null>>();

    function preloadFile(entry: typeof photosToProcess[0]): Promise<Blob | null> {
      if (preloadCache.has(entry.id)) return preloadCache.get(entry.id)!;

      const promise = (async () => {
        try {
          if (entry.item.fileHandle) {
            return await entry.item.fileHandle.getFile();
          } else if (entry.item.fallbackBlob) {
            return entry.item.fallbackBlob;
          }
          return null;
        } catch {
          return null;
        }
      })();

      preloadCache.set(entry.id, promise);
      return promise;
    }

    let progress = 0;
    let totalActiveTime = 0;

    for (let idx = 0; idx < photosToProcess.length; idx++) {
      while (isPausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Preload future files
      for (let ahead = 1; ahead <= PRELOAD_AHEAD; ahead++) {
        const futureIdx = idx + ahead;
        if (futureIdx < photosToProcess.length) {
          preloadFile(photosToProcess[futureIdx]);
        }
      }

      const photoStart = Date.now();
      const entry = photosToProcess[idx];

      try {
        const fileBlob = await preloadFile(entry);
        preloadCache.delete(entry.id);

        if (!fileBlob) continue;

        // Process locally via client-side face-api.js
        const { width, height, detections } = await processPhotoLocally(fileBlob);

        if (detections && detections.length > 0) {
          const facesToAdd = [];
          for (const det of detections) {
            const clusterId = await clusterer.assign(det.embedding);
            facesToAdd.push({
              eventId,
              photoId: entry.id,
              clusterId,
              box: det.box,
              embedding: det.embedding,
              thumbnail: det.thumbnail,
            });
          }
          await db.faces.bulkAdd(facesToAdd);
        }

        await db.photos.update(entry.id, {
          processed: true,
          width,
          height,
        });
      } catch (err) {
        console.error(`Error scanning photo ID: ${entry.id}`, err);
      }

      const duration = (Date.now() - photoStart) / 1000;
      totalActiveTime += duration;

      progress++;
      setScannedCount(progress);

      const avgTime = totalActiveTime / progress;
      const remaining = photosToProcess.length - progress;
      setEtaSeconds(Math.round(remaining * avgTime));
    }

    setIsScanning(false);
    setActiveScanningEventId(null);
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

    let progress = 0;
    let totalActiveTime = 0;
    let totalFacesFound = 0;

    // Buffer to batch Firestore face descriptor updates
    let facesBuffer: CloudFaceEntry[] = [];

    // Cache preloaded blobs for Google Drive downloads
    const preloadCache = new Map<string, Promise<Blob | null>>();

    function preloadDriveFile(fileId: string): Promise<Blob | null> {
      if (preloadCache.has(fileId)) return preloadCache.get(fileId)!;

      const promise = (async () => {
        try {
          return await getPhotoBlob(googleAccessToken, fileId);
        } catch (err) {
          console.error(`Failed to pre-download file ${fileId}:`, err);
          return null;
        }
      })();

      preloadCache.set(fileId, promise);
      return promise;
    }

    for (let idx = 0; idx < photos.length; idx++) {
      while (isPausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Preload future files
      for (let ahead = 1; ahead <= PRELOAD_AHEAD; ahead++) {
        const futureIdx = idx + ahead;
        if (futureIdx < photos.length) {
          preloadDriveFile(photos[futureIdx].driveFileId);
        }
      }

      const photoStart = Date.now();
      const photo = photos[idx];

      try {
        const fileBlob = await preloadDriveFile(photo.driveFileId);
        preloadCache.delete(photo.driveFileId);

        if (!fileBlob) continue;

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
            thumbnail: det.thumbnail,
          }));

          facesBuffer.push(...facesToAdd);
          totalFacesFound += detections.length;
        }

        // Flush face descriptors buffer periodically to Firestore (every 15 photos or if buffer > 50 faces)
        if (facesBuffer.length >= 50 || (progress > 0 && progress % 15 === 0)) {
          await appendFaceDescriptors(eventId, facesBuffer);
          facesBuffer = [];
        }
      } catch (err) {
        console.error(`Error scanning Google Drive photo ${photo.fileName}:`, err);
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
        startScanning,
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
