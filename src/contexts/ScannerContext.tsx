import { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { db } from '../db';
import { fileToImage, detectFacesInImage } from '../ml';
import { assignFaceToCluster } from '../clustering';

interface ScannerContextType {
  isScanning: boolean;
  isPaused: boolean;
  scannedCount: number;
  totalToScan: number;
  etaSeconds: number | null;
  activeScanningEventId: number | null;
  startScanning: (eventId: number, filesList: any[]) => Promise<void>;
  togglePause: () => void;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [activeScanningEventId, setActiveScanningEventId] = useState<number | null>(null);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const togglePause = () => {
    setIsPaused(prev => !prev);
  };

  const startScanning = async (eventId: number, filesList: Array<{ fileHandle?: FileSystemFileHandle; fallbackBlob?: Blob; name: string }>) => {
    if (isScanning) {
        alert("סריקה כבר מתבצעת. אנא המתן לסיומה.");
        return;
    }
    
    setIsScanning(true);
    setTotalToScan(filesList.length);
    setScannedCount(0);
    setEtaSeconds(null);
    setActiveScanningEventId(eventId);
    setIsPaused(false);

    const photosToProcessIds = [];

    // 1. Save metadata first
    for (const item of filesList) {
      const existing = await db.photos.where({ eventId, fileName: item.name }).first();
      if (existing) {
        if (!existing.processed) {
          photosToProcessIds.push(existing.id!);
        }
        continue;
      }

      let width = 0;
      let height = 0;
      try {
        let imageObj;
        if (item.fileHandle) {
          const fileObj = await item.fileHandle.getFile();
          imageObj = await fileToImage(fileObj);
        } else if (item.fallbackBlob) {
          imageObj = await fileToImage(item.fallbackBlob);
        }
        if (imageObj) {
          width = imageObj.naturalWidth;
          height = imageObj.naturalHeight;
        }
      } catch (e) {
        console.error('Error fetching image dimensions', item.name, e);
      }

      const photoId = await db.photos.add({
        eventId,
        fileName: item.name,
        fileHandle: item.fileHandle,
        fallbackBlob: item.fallbackBlob,
        width,
        height,
        processed: false,
      });

      photosToProcessIds.push(photoId);
    }

    setTotalToScan(photosToProcessIds.length);
    
    if (photosToProcessIds.length === 0) {
      setIsScanning(false);
      setActiveScanningEventId(null);
      return;
    }

    // 2. Sequential processing loop
    let progress = 0;
    let totalActiveTime = 0;
    
    for (const photoId of photosToProcessIds) {
      while (isPausedRef.current) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const photoStart = Date.now();

      try {
        const photo = await db.photos.get(photoId);
        if (!photo) continue;

        let imageObj;
        if (photo.fileHandle) {
          const fileObj = await photo.fileHandle.getFile();
          imageObj = await fileToImage(fileObj);
        } else if (photo.fallbackBlob) {
          imageObj = await fileToImage(photo.fallbackBlob);
        }

        if (!imageObj) continue;

        const detections = await detectFacesInImage(imageObj);

        for (const det of detections) {
          const clusterId = await assignFaceToCluster(eventId, det.embedding);
          await db.faces.add({
            eventId,
            photoId,
            clusterId,
            box: det.box,
            embedding: det.embedding,
            thumbnail: det.thumbnail,
          });
        }

        await db.photos.update(photoId, { processed: true });
      } catch (err) {
        console.error(`Error processing photo ID: ${photoId}`, err);
      }
      
      const photoDuration = (Date.now() - photoStart) / 1000;
      totalActiveTime += photoDuration;

      progress++;
      setScannedCount(progress);

      const avgTimePerPhoto = totalActiveTime / progress;
      const remainingPhotos = photosToProcessIds.length - progress;
      const eta = Math.round(remainingPhotos * avgTimePerPhoto);
      setEtaSeconds(eta);
    }

    setIsScanning(false);
    setActiveScanningEventId(null);
  };

  return (
    <ScannerContext.Provider value={{ isScanning, isPaused, scannedCount, totalToScan, etaSeconds, activeScanningEventId, startScanning, togglePause }}>
      {children}
    </ScannerContext.Provider>
  );
}

export function useScanner() {
  const context = useContext(ScannerContext);
  if (!context) throw new Error('useScanner must be used within ScannerProvider');
  return context;
}
