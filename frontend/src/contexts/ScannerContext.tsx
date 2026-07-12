import { createContext, useContext, useState, useRef, type ReactNode } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { db } from '../db';
import { IncrementalClusterer } from '../clustering';
import { getPhotoBlob, type DriveFile } from '../services/googleDrive';
import {
  addCloudPhoto,
  appendFaceDescriptors,
  updateCloudEvent,
  type CloudFaceEntry,
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
    driveFiles: DriveFile[],
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
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    modelsLoading = false;
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

  // Run face-api.js detection
  const detections = await faceapi
    .detectAllFaces(img)
    .withFaceLandmarks()
    .withFaceDescriptors();

  URL.revokeObjectURL(blobUrl);

  const results = [];
  for (const det of detections) {
    const box = det.detection.box;
    // Bounding box in relative percentages for overlay rendering
    const relBox = {
      x: box.x / width,
      y: box.y / height,
      width: box.width / width,
      height: box.height / height,
    };

    // Crop face and create a base64 thumbnail
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const padW = box.width * 0.15;
    const padH = box.height * 0.15;

    const sx = Math.max(0, box.x - padW);
    const sy = Math.max(0, box.y - padH);
    const sw = Math.min(width - sx, box.width + padW * 2);
    const sh = Math.min(height - sy, box.height + padH * 2);

    canvas.width = 120;
    canvas.height = 120;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 120, 120);
    const thumbnail = canvas.toDataURL('image/jpeg', 0.8);

    results.push({
      embedding: Array.from(det.descriptor),
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
    driveFiles: DriveFile[],
    googleAccessToken: string
  ) => {
    if (isScanning) {
      alert('סריקה כבר מתבצעת. אנא המתן לסיומה.');
      return;
    }

    setIsScanning(true);
    setTotalToScan(driveFiles.length);
    setScannedCount(0);
    setEtaSeconds(null);
    setActiveScanningEventId(eventId);
    setIsPaused(false);

    let progress = 0;
    let totalActiveTime = 0;
    let totalFacesFound = 0;

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

    for (let idx = 0; idx < driveFiles.length; idx++) {
      while (isPausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Preload future files
      for (let ahead = 1; ahead <= PRELOAD_AHEAD; ahead++) {
        const futureIdx = idx + ahead;
        if (futureIdx < driveFiles.length) {
          preloadDriveFile(driveFiles[futureIdx].id);
        }
      }

      const photoStart = Date.now();
      const file = driveFiles[idx];

      try {
        const fileBlob = await preloadDriveFile(file.id);
        preloadCache.delete(file.id);

        if (!fileBlob) continue;

        // Process locally via client-side face-api.js
        const { width, height, detections } = await processPhotoLocally(fileBlob);

        // Add photo metadata to Firestore
        const photoId = await addCloudPhoto(eventId, {
          driveFileId: file.id,
          fileName: file.name,
          width,
          height,
          processed: true,
        });

        // Add face descriptors to Firestore
        if (detections && detections.length > 0) {
          const facesToAdd: CloudFaceEntry[] = detections.map((det) => ({
            photoId,
            driveFileId: file.id,
            embedding: det.embedding,
            box: det.box,
            thumbnail: det.thumbnail,
          }));

          await appendFaceDescriptors(eventId, facesToAdd);
          totalFacesFound += detections.length;
        }
      } catch (err) {
        console.error(`Error scanning Google Drive photo ${file.name}:`, err);
      }

      const duration = (Date.now() - photoStart) / 1000;
      totalActiveTime += duration;

      progress++;
      setScannedCount(progress);

      const avgTime = totalActiveTime / progress;
      const remaining = driveFiles.length - progress;
      setEtaSeconds(Math.round(remaining * avgTime));

      // Update event progress in Firestore periodically
      if (progress % 10 === 0 || progress === driveFiles.length) {
        await updateCloudEvent(eventId, {
          photoCount: progress,
          faceCount: totalFacesFound,
        });
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
