import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Face } from '../db';
import { fileToImage } from '../ml';
import { useScanner } from '../contexts/ScannerContext';
import { assignFaceToCluster, mergeClusters } from '../clustering';
import { PhotoImage } from './PhotoImage';
import { 
  ArrowRight, FolderOpen, Image as ImageIcon, Users, Search, 
  Loader2, Check, AlertCircle, X, Maximize2,
  HelpCircle, CheckCircle2, Clock, Sparkles,
  Pause, Play, Download
} from 'lucide-react';

interface EventViewProps {
  eventId: number;
  onBack: () => void;
}

interface MergeSuggestion {
  clusterA: { id: string; name: string };
  clusterB: { id: string; name: string };
  distance: number;
  thumbA: string;
  thumbB: string;
  photoIdA: number;
  photoIdB: number;
}

export function EventView({ eventId, onBack }: EventViewProps) {
  const [activeTab, setActiveTab] = useState<'faces' | 'merges' | 'photos' | 'unidentified'>('faces');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [lightboxPhotoId, setLightboxPhotoId] = useState<number | null>(null);

  // Global Scanning state
  const { isScanning, isPaused, scannedCount, totalToScan, etaSeconds, activeScanningEventId, startScanning, togglePause } = useScanner();
  const isThisEventScanning = activeScanningEventId === eventId;
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [lastScannedCount, setLastScannedCount] = useState(0);

  useEffect(() => {
    if (!isScanning && lastScannedCount > 0) {
      setShowSuccessBanner(true);
      setTimeout(() => setShowSuccessBanner(false), 5000);
      setLastScannedCount(0);
    }
    if (isThisEventScanning) {
      setLastScannedCount(scannedCount);
    }
  }, [isScanning, scannedCount, isThisEventScanning, lastScannedCount]);

  const [isUnsupportedBrowser, setIsUnsupportedBrowser] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [revealedPhotos, setRevealedPhotos] = useState<Set<number>>(new Set());

  // Manual Merge mode state
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());

  const toggleRevealPhoto = (pId: number) => {
    setRevealedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(pId)) {
        next.delete(pId);
      } else {
        next.add(pId);
      }
      return next;
    });
  };

  useEffect(() => {
    setRevealedPhotos(new Set());
  }, [selectedClusterId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const event = useLiveQuery(() => db.events.get(eventId), [eventId]);
  const photos = useLiveQuery(() => db.photos.where({ eventId }).toArray(), [eventId]) || [];
  const clusters = useLiveQuery(() => db.clusters.where({ eventId }).toArray(), [eventId]) || [];
  const faces = useLiveQuery(() => db.faces.where({ eventId }).toArray(), [eventId]) || [];

  useEffect(() => {
    if (typeof (window as any).showDirectoryPicker !== 'function') {
      setIsUnsupportedBrowser(true);
    }
  }, []);

  useEffect(() => {
    async function checkPermission() {
      if (event?.directoryHandle) {
        try {
          const opts = { mode: 'read' as const };
          const status = await (event.directoryHandle as any).queryPermission(opts);
          setPermissionGranted(status === 'granted');
        } catch (err) {
          console.error('Error querying folder permission', err);
          setPermissionGranted(false);
        }
      }
    }
    if (event) checkPermission();
  }, [event]);

  const handleRequestPermission = async () => {
    if (event?.directoryHandle) {
      try {
        const opts = { mode: 'read' as const };
        const status = await (event.directoryHandle as any).requestPermission(opts);
        setPermissionGranted(status === 'granted');
      } catch (err) {
        console.error('Failed to grant folder permission', err);
        alert('לא ניתן לקבל גישה לתיקייה ללא אישור דפדפן.');
      }
    }
  };

  const handleSelectFolder = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      await db.events.update(eventId, {
        directoryHandle: dirHandle,
        folderPath: dirHandle.name,
      });
      setPermissionGranted(true);

      const fileHandles: FileSystemFileHandle[] = [];
      async function scanDirectory(handle: FileSystemDirectoryHandle) {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const ext = entry.name.split('.').pop()?.toLowerCase();
            if (ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
              fileHandles.push(entry);
            }
          } else if (entry.kind === 'directory') {
            await scanDirectory(entry);
          }
        }
      }
      await scanDirectory(dirHandle);

      if (fileHandles.length === 0) {
        alert('לא נמצאו תמונות תואמות (JPG, PNG, WEBP) בתיקייה שנבחרה.');
        return;
      }

      const filesToProcess = fileHandles.map(handle => ({
        fileHandle: handle,
        name: handle.name,
      }));

      await startScanning(eventId, filesToProcess);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Folder selection error', err);
        alert('שגיאה בבחירת התיקייה: ' + err.message);
      }
    }
  };

  const handleFallbackFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    const filesToProcess = [];
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext && allowedExtensions.includes(ext)) {
        filesToProcess.push(file);
      }
    }

    if (filesToProcess.length === 0) {
      alert('לא נמצאו תמונות בפורמט תואם.');
      return;
    }

    const processedList = [];
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      try {
        const imgObj = await fileToImage(file);
        const compressedBlob = await new Promise<Blob>((resolve) => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          let width = imgObj.width;
          let height = imgObj.height;
          const maxDim = 1200;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width *= ratio;
            height *= ratio;
          }
          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(imgObj, 0, 0, width, height);
          
          canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85);
        });
        processedList.push({
          fallbackBlob: compressedBlob,
          name: file.name,
        });
      } catch (err) {
        console.error('Failed to compress fallback file', file.name, err);
      }
    }

    await startScanning(eventId, processedList);
  };

  const handleRenameCluster = async (clusterId: string, oldName: string, newName: string) => {
    const val = newName.trim();
    if (!val || val === oldName) return;

    const existing = clusters.find(c => c.name.toLowerCase() === val.toLowerCase() && c.id !== clusterId);
    if (existing) {
      const wantMerge = confirm(`כבר קיים אורח בשם "${val}".\nהאם ברצונך למזג את "${oldName}" עם "${val}"?`);
      if (wantMerge) {
        try {
          await mergeClusters(existing.id, clusterId);
          setSelectedClusterId(null);
        } catch (err) {
          console.error('Merge failed during rename', err);
        }
      } else {
        setSearchQuery(prev => prev + ' ');
        setTimeout(() => setSearchQuery(prev => prev.trim()), 50);
      }
    } else {
      await db.clusters.update(clusterId, { name: val });
    }
  };

  const handleRemoveFaceFromPerson = async (photoId: number, clusterId: string) => {
    const cluster = clusters.find(c => c.id === clusterId);
    const displayName = cluster?.name || 'דמות זו';
    if (!confirm(`האם ברצונך להסיר תמונה זו מהפרופיל של "${displayName}"?\nהתמונה לא תימחק, והפנים יועברו ללשונית "לא מזוהים".`)) {
      return;
    }

    try {
      const faceRecords = await db.faces.where({ photoId, clusterId }).toArray();
      for (const face of faceRecords) {
        if (face.id) {
          await db.faces.update(face.id, { clusterId: undefined });
        }
      }
    } catch (err) {
      console.error('Failed to remove face', err);
      alert('שגיאה בהסרת התמונה.');
    }
  };

  const handleManualMergeSelected = async () => {
    if (selectedForMerge.size < 2) return;
    
    const ids = Array.from(selectedForMerge);
    const firstCluster = clusters.find(c => c.id === ids[0]);
    const defaultName = firstCluster?.name || '';
    
    const newName = prompt(`אתה עומד למזג ${ids.length} דמויות.\nהכנס שם לדמות המאוחדת:`, defaultName);
    
    if (newName === null) return; // User cancelled
    
    try {
      // Keep the first ID as the primary, merge all others into it
      const primaryId = ids[0];
      
      for (let i = 1; i < ids.length; i++) {
        await mergeClusters(ids[i], primaryId);
      }
      
      // Rename the primary cluster if a new name was provided
      if (newName.trim()) {
        await db.clusters.update(primaryId, { name: newName.trim() });
      }
      
      // Exit merge mode
      setIsMergeMode(false);
      setSelectedForMerge(new Set());
      
    } catch (err) {
      console.error('Manual merge failed', err);
      alert('שגיאה במיזוג הדמויות.');
    }
  };

  const handleAssignFace = async (faceId: number, targetClusterId: string) => {
    try {
      if (targetClusterId === 'new') {
        const newClusterId = `c_${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const count = clusters.length + 1;
        await db.clusters.add({
          id: newClusterId,
          eventId,
          name: `דמות ${count}`,
        });
        await db.faces.update(faceId, { clusterId: newClusterId });
      } else if (targetClusterId) {
        await db.faces.update(faceId, { clusterId: targetClusterId });
      }
    } catch (err) {
      console.error('Failed to manually assign face', err);
    }
  };

  useEffect(() => {
    function getEuclideanDistance(v1: number[], v2: number[]): number {
      let sum = 0;
      for (let i = 0; i < v1.length; i++) {
        const diff = v1[i] - v2[i];
        sum += diff * diff;
      }
      return Math.sqrt(sum);
    }

    function getClusterCenter(clusterFaces: Face[]): number[] {
      if (clusterFaces.length === 0) return [];
      const dim = clusterFaces[0].embedding.length;
      const sum = new Array(dim).fill(0);
      for (const f of clusterFaces) {
        for (let i = 0; i < dim; i++) {
          sum[i] += f.embedding[i];
        }
      }
      return sum.map(s => s / clusterFaces.length);
    }

    async function computeMergeSuggestions() {
      if (clusters.length === 0 || faces.length === 0) {
        setMergeSuggestions([]);
        return;
      }

      const list: MergeSuggestion[] = [];
      const centers: Record<string, number[]> = {};
      const thumbs: Record<string, string> = {};

      const facesByCluster: Record<string, Face[]> = {};
      for (const f of faces) {
        if (f.clusterId) {
          if (!facesByCluster[f.clusterId]) facesByCluster[f.clusterId] = [];
          facesByCluster[f.clusterId].push(f);
        }
      }

      const clusterPhotoIds: Record<string, number> = {};

      for (const c of clusters) {
        const cFaces = facesByCluster[c.id] || [];
        if (cFaces.length > 0) {
          centers[c.id] = getClusterCenter(cFaces);
          thumbs[c.id] = cFaces[0].thumbnail;
          clusterPhotoIds[c.id] = cFaces[0].photoId;
        }
      }

      const declined = event?.declinedMerges || [];

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const cA = clusters[i];
          const cB = clusters[j];

          const key = [cA.id, cB.id].sort().join('-');
          if (declined.includes(key)) continue;

          const centerA = centers[cA.id];
          const centerB = centers[cB.id];

          if (centerA && centerB) {
            const dist = getEuclideanDistance(centerA, centerB);
            if (dist > 0.1 && dist < 0.45) {
              list.push({
                clusterA: { id: cA.id, name: cA.name },
                clusterB: { id: cB.id, name: cB.name },
                distance: dist,
                thumbA: thumbs[cA.id] || '',
                thumbB: thumbs[cB.id] || '',
                photoIdA: clusterPhotoIds[cA.id],
                photoIdB: clusterPhotoIds[cB.id],
              });
            }
          }
        }
      }

      list.sort((a, b) => a.distance - b.distance);
      setMergeSuggestions(list);
    }

    computeMergeSuggestions();
  }, [eventId, clusters, faces, event?.declinedMerges]);

  const handleMergeSuggestion = async (idA: string, idB: string, nameA: string, nameB: string) => {
    if (confirm(`האם ברצונך למזג את "${nameA}" ואת "${nameB}" לפרופיל אחד?`)) {
      try {
        await mergeClusters(idA, idB);
      } catch (err) {
        console.error('Merge failed', err);
      }
    }
  };

  const handleDeclineSuggestion = async (idA: string, idB: string) => {
    if (!event) return;
    const key = [idA, idB].sort().join('-');
    const currentDeclined = event.declinedMerges || [];
    if (!currentDeclined.includes(key)) {
      try {
        await db.events.update(eventId, {
          declinedMerges: [...currentDeclined, key],
        });
      } catch (err) {
        console.error('Failed to decline merge suggestion', err);
      }
    }
  };

  const [isExportingZip, setIsExportingZip] = useState(false);

  const handleExportPersonPhotos = async () => {
    if (!selectedCluster || selectedClusterPhotoIds.length === 0) return;
    setIsExportingZip(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      let successCount = 0;
      for (const pId of selectedClusterPhotoIds) {
        const photo = await db.photos.get(pId);
        if (!photo) continue;

        let blob: Blob | null = null;
        if (photo.fileHandle) {
          try {
            blob = await photo.fileHandle.getFile();
          } catch (err) {
            console.warn(`Could not read file via fileHandle for ${photo.fileName}`, err);
          }
        }
        
        if (!blob && photo.fallbackBlob) {
          blob = photo.fallbackBlob;
        }

        if (blob) {
          zip.file(photo.fileName, blob);
          successCount++;
        }
      }

      if (successCount === 0) {
        alert('לא ניתן היה לקרוא את קובצי התמונות לייצוא.');
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedCluster.name || 'דמות_ללא_שם'}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate ZIP', err);
      alert('שגיאה במהלך יצירת קובץ ה-ZIP לייצוא.');
    } finally {
      setIsExportingZip(false);
    }
  };

  const facesByCluster: Record<string, Face[]> = {};
  for (const f of faces) {
    if (f.clusterId) {
      if (!facesByCluster[f.clusterId]) facesByCluster[f.clusterId] = [];
      facesByCluster[f.clusterId].push(f);
    }
  }

  const filteredClusters = clusters.filter(c => {
    return c.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectedClusterFaces = selectedClusterId ? facesByCluster[selectedClusterId] || [] : [];
  const selectedClusterPhotoIds = Array.from(new Set(selectedClusterFaces.map(f => f.photoId)));
  const selectedCluster = clusters.find(c => c.id === selectedClusterId);
  const unidentifiedFaces = faces.filter(f => !f.clusterId);
  const lightboxPhoto = lightboxPhotoId ? photos.find(p => p.id === lightboxPhotoId) : null;
  const lightboxFaces = lightboxPhotoId ? faces.filter(f => f.photoId === lightboxPhotoId) : [];

  const clusterNamesMap: Record<string, string> = {};
  for (const c of clusters) {
    clusterNamesMap[c.id] = c.name;
  }

  const handleMainBackClick = () => {
    if (selectedClusterId) {
      setSelectedClusterId(null);
    } else {
      onBack();
    }
  };

  const formatETA = (seconds: number | null) => {
    if (seconds === null) return 'מחשב זמן נותר...';
    if (seconds === 0) return 'מסתיים כעת...';
    if (seconds < 60) return `זמן נותר מוערך: כ-${seconds} שניות`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `זמן נותר מוערך: כ-${mins} דקות ו-${secs} שניות`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex-grow flex flex-col gap-6 text-right transition-colors duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleMainBackClick}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer shadow-sm"
            title={selectedClusterId ? "חזרה לגלריית האורחים" : "חזרה ללוח האירועים"}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 m-0 leading-tight">
              {event?.name || 'טוען אירוע...'}
            </h2>
            <p className="text-slate-500 text-sm">
              {photos.length} תמונות | {clusters.length} אורחים מזוהים
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {event?.folderPath && !permissionGranted && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs px-4 py-2.5 rounded-xl shadow-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>נדרש אישור גישה מחדש לתיקיית המקור</span>
              <button
                onClick={handleRequestPermission}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                אשר גישה
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => isUnsupportedBrowser ? fileInputRef.current?.click() : handleSelectFolder()}
              disabled={isThisEventScanning}
              className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95 border ${
                isThisEventScanning
                  ? 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50'
                  : 'bg-amber-100 dark:bg-amber-500 border-amber-200 dark:border-amber-600/30 text-amber-900 dark:text-slate-950 hover:bg-amber-200 dark:hover:bg-amber-400 cursor-pointer'
              }`}
            >
              {isUnsupportedBrowser ? <FolderOpen className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
              <span>{isThisEventScanning ? 'סורק...' : 'בחירת תיקיית תמונות'}</span>
            </button>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFallbackFiles}
              className="hidden"
              {...{ webkitdirectory: "true", directory: "" } as any}
            />
          </div>
        </div>
      </div>

      {isThisEventScanning && (
        <div className="bg-white/50 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-800 px-6 py-6 mb-6 flex flex-col gap-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-spin" />
              <span className="font-bold text-slate-800 dark:text-slate-200">סורק תמונות ומאתר פנים...</span>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <button
                onClick={() => togglePause()}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                  isPaused ? 'bg-amber-100 dark:bg-amber-500 text-amber-900 dark:text-slate-950 border border-amber-200 dark:border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
                title={isPaused ? 'המשך סריקה' : 'השהה סריקה'}
              >
                {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </button>
              <div className="flex items-center gap-1.5 text-xs bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-750 px-3 py-1 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{isPaused ? 'סריקה הושהתה' : formatETA(etaSeconds)}</span>
              </div>
              <span className="font-mono bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-750 px-2 py-0.5 rounded-md">
                {scannedCount} / {totalToScan}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-300 dark:border-slate-750">
            <div 
              className="bg-amber-400 dark:bg-amber-500 h-2.5 rounded-full transition-all duration-300 ease-out relative"
              style={{ width: `${totalToScan > 0 ? (scannedCount / totalToScan) * 100 : 0}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            </div>
          </div>
        </div>
      )}

      {showSuccessBanner && !isThisEventScanning && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-5 flex items-start justify-between gap-4 text-right shadow-sm animate-fade-in">
          <div className="flex items-start gap-3.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-base">תהליך הסריקה והזיהוי הושלם!</h4>
              <p className="text-emerald-700/80 dark:text-emerald-400/80 text-sm mt-1">
                סרקנו בהצלחה {lastScannedCount} תמונות. המערכת זיהתה וסידרה את כל הפנים שנמצאו לקבוצות אורחים.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowSuccessBanner(false)}
            className="p-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-16 text-center flex flex-col items-center justify-center gap-4 bg-white/50 dark:bg-slate-900/10 flex-grow py-24 shadow-sm">
          <ImageIcon className="w-16 h-16 text-slate-300 dark:text-slate-700" />
          <div className="text-slate-500 max-w-sm">
            לא נטענו תמונות. בחר תיקייה עם תמונות כדי להתחיל למיין ולזהות פנים באמצעות ה-AI.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {!isScanning && !showSuccessBanner && !selectedClusterId && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap bg-white dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-850 self-start gap-1 shadow-sm">
                <button
                  onClick={() => setActiveTab('faces')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'faces' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2"><Users className="w-4 h-4" /><span>אורחים זוהו ({clusters.length})</span></div>
                </button>
                <button
                  onClick={() => setActiveTab('merges')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'merges' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2"><Sparkles className="w-4 h-4" /><span>הצעות למיזוג ({mergeSuggestions.length})</span></div>
                </button>
                <button
                  onClick={() => setActiveTab('unidentified')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'unidentified' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2"><HelpCircle className="w-4 h-4" /><span>לא מזוהים ({unidentifiedFaces.length})</span></div>
                </button>
                <button
                  onClick={() => setActiveTab('photos')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'photos' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /><span>כל התמונות ({photos.length})</span></div>
                </button>
              </div>

              {activeTab === 'faces' && (
                <div className="flex items-center gap-3 w-full lg:w-auto">
                  <div className="relative w-full lg:w-72">
                    <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="חפש אורחים לפי שם..."
                      className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-400 dark:focus:border-amber-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all shadow-sm"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsMergeMode(!isMergeMode);
                      setSelectedForMerge(new Set());
                    }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer border shadow-sm ${
                      isMergeMode 
                        ? 'bg-amber-100 dark:bg-amber-500/20 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-400 shadow-lg shadow-amber-900/10 dark:shadow-amber-500/20' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>מיזוג</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {selectedClusterId && selectedCluster && (
            <div className="flex items-center justify-between bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-4">
                {selectedClusterFaces[0] && (
                  <img 
                    src={selectedClusterFaces[0].thumbnail} 
                    alt={selectedCluster.name}
                    className="w-16 h-16 rounded-xl object-cover ring-2 ring-amber-400 dark:ring-amber-500/40 shadow-md shrink-0"
                  />
                )}
                <div className="flex flex-col gap-1 items-start">
                  <input
                    type="text"
                    key={selectedCluster.id}
                    defaultValue={selectedCluster.name}
                    onBlur={(e) => handleRenameCluster(selectedCluster.id, selectedCluster.name, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="text-right text-xl font-bold bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-amber-400 dark:focus:border-amber-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-700 focus:outline-none pb-1 transition-all rounded-md max-w-[200px]"
                  />
                  <p className="text-slate-500 dark:text-slate-400 text-xs">סה"כ {selectedClusterPhotoIds.length} תמונות שבהן מופיעה דמות זו</p>
                </div>
              </div>
              <button
                onClick={handleExportPersonPhotos}
                disabled={isExportingZip}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-300 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow active:scale-95 disabled:pointer-events-none"
              >
                {isExportingZip ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>מייצא...</span></> : <><Download className="w-3.5 h-3.5" /><span>ייצוא ל-ZIP</span></>}
              </button>
            </div>
          )}

          {selectedClusterId ? (
            selectedClusterPhotoIds.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">אין תמונות משויכות לדמות זו.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {selectedClusterPhotoIds.map(pId => {
                  const faceInPhoto = selectedClusterFaces.find(f => f.photoId === pId);
                  return (
                    <div key={pId} className="group relative aspect-square border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-all">
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveFaceFromPerson(pId, selectedClusterId); }} className="absolute top-3 left-3 p-1.5 rounded-lg bg-red-500/90 hover:bg-red-650 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                      <div onClick={() => toggleRevealPhoto(pId)} className="w-full h-full cursor-pointer relative">
                        {revealedPhotos.has(pId) || !faceInPhoto ? (
                          <PhotoImage photoId={pId} className="w-full h-full object-cover" />
                        ) : (
                          <img src={faceInPhoto.thumbnail} className="w-full h-full object-cover" alt="" />
                        )}
                        <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setLightboxPhotoId(pId); }} className="p-2 rounded-xl bg-slate-950/95 border border-slate-800 text-amber-400 dark:text-amber-400"><Maximize2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'faces' ? (
            filteredClusters.length === 0 ? (
              <div className="text-center py-20 text-slate-500 dark:text-slate-400">אין אורחים מזוהים.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
                {filteredClusters.map((cluster) => {
                  const clusterFaces = facesByCluster[cluster.id] || [];
                  const firstFace = clusterFaces[0];
                  const isSelectedForMerge = selectedForMerge.has(cluster.id);
                  
                  return (
                    <div 
                      key={cluster.id} 
                      onClick={() => {
                        if (isMergeMode) {
                          setSelectedForMerge(prev => {
                            const next = new Set(prev);
                            if (next.has(cluster.id)) next.delete(cluster.id);
                            else next.add(cluster.id);
                            return next;
                          });
                        } else {
                          setSelectedClusterId(cluster.id);
                        }
                      }} 
                      className={`group border rounded-3xl p-5 flex flex-col items-center gap-5 cursor-pointer transition-all ${
                        isSelectedForMerge 
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-500 shadow-lg shadow-amber-400/20 dark:shadow-amber-500/20'
                          : 'bg-white dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-500/40 hover:shadow-xl dark:hover:shadow-amber-500/5 hover:-translate-y-1'
                      }`}
                    >
                      <div className={`relative w-36 h-36 shrink-0 rounded-2xl overflow-hidden ring-4 transition-all shadow-xl ${
                        isSelectedForMerge ? 'ring-amber-400 dark:ring-amber-500' : 'ring-white dark:ring-slate-800/80 group-hover:ring-amber-200 dark:group-hover:ring-amber-500/40'
                      }`}>
                        {firstFace ? (
                          <img src={firstFace.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                          </div>
                        )}
                        <span className="absolute bottom-2 right-2 bg-white/90 dark:bg-slate-950/80 text-amber-700 dark:text-amber-400 text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-sm dark:shadow">{clusterFaces.length} תמונות</span>
                      </div>
                      <input type="text" defaultValue={cluster.name} onBlur={(e) => handleRenameCluster(cluster.id, cluster.name, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-full text-center text-base font-bold bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-amber-400 dark:focus:border-amber-500 text-slate-800 dark:text-slate-100 focus:outline-none py-1.5" />
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'merges' ? (
            mergeSuggestions.length === 0 ? (
              <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-16 text-center text-slate-500 max-w-lg mx-auto bg-white/50 dark:bg-transparent shadow-sm">
                אין הצעות למאגרים דומים למיזוג כרגע.
              </div>
            ) : (
             <div className="flex flex-col gap-6 max-w-2xl mx-auto">
                <div className="grid grid-cols-1 gap-8">
                  {mergeSuggestions.slice(0, 15).map((sug, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 flex flex-col gap-6 shadow-xl">
                      <div className="flex items-center justify-center gap-10">
                        <div className="flex flex-col items-center gap-3.5"><div onClick={() => setLightboxPhotoId(sug.photoIdA)} className="w-32 h-32 rounded-2xl overflow-hidden ring-4 ring-white dark:ring-slate-800 shadow-md cursor-pointer"><img src={sug.thumbA} className="w-full h-full object-cover" /></div><span className="font-extrabold text-base text-slate-800 dark:text-slate-200">{sug.clusterA.name}</span></div>
                        <div className="flex flex-col items-center gap-1.5"><Sparkles className="w-6 h-6 text-amber-500 dark:text-amber-400" /><span className="text-sm bg-amber-100 dark:bg-amber-500/20 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-300 font-bold shadow-sm">{Math.round((1.0 - (sug.distance - 0.1) / 0.38) * 100)}%</span></div>
                        <div className="flex flex-col items-center gap-3.5"><div onClick={() => setLightboxPhotoId(sug.photoIdB)} className="w-32 h-32 rounded-2xl overflow-hidden ring-4 ring-white dark:ring-slate-800 shadow-md cursor-pointer"><img src={sug.thumbB} className="w-full h-full object-cover" /></div><span className="font-extrabold text-base text-slate-800 dark:text-slate-200">{sug.clusterB.name}</span></div>
                      </div>
                      <div className="flex gap-4 mt-2 border-t border-slate-100 dark:border-slate-850 pt-5">
                        <button onClick={() => handleMergeSuggestion(sug.clusterA.id, sug.clusterB.id, sug.clusterA.name, sug.clusterB.name)} className="flex-1 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-900 dark:text-slate-950 border border-amber-200 dark:border-transparent text-xs font-extrabold transition-all cursor-pointer shadow-sm">מזג אורחים</button>
                        <button onClick={() => handleDeclineSuggestion(sug.clusterA.id, sug.clusterB.id)} className="flex-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold transition-all cursor-pointer shadow-sm">התעלם</button>
                      </div>
                    </div>
                  ))}
                </div>
                {mergeSuggestions.length > 15 && (
                  <div className="mt-4 p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 flex items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="text-right">
                        <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm">נמצאו הצעות מיזוג נוספות</h5>
                        <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">
                          מציג את 15 ההצעות הדומות ביותר. סה"כ קיימות {mergeSuggestions.length} הצעות מיזוג.
                        </p>
                      </div>
                    </div>
                    <span className="text-base font-black text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3.5 py-1.5 rounded-xl border border-amber-300/40 dark:border-amber-800/40 shadow-inner">
                      15+
                    </span>
                  </div>
                )}
             </div>
            )
          ) : activeTab === 'unidentified' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {unidentifiedFaces.map((face) => (
                  <div key={face.id} className="bg-slate-900/30 border border-slate-800/85 rounded-2xl p-4 flex flex-col items-center gap-3.5 shadow">
                    <div className="relative w-28 h-28 rounded-xl overflow-hidden ring-2 ring-slate-800"><img src={face.thumbnail} className="w-full h-full object-cover" /></div>
                    <div className="w-full flex flex-col gap-1.5 text-right">
                      <span className="text-[10px] text-slate-500 font-semibold pr-1">שייך לאורח:</span>
                      <select onChange={(e) => face.id !== undefined && handleAssignFace(face.id, e.target.value)} defaultValue="" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer">
                        <option value="" disabled>בחר אדם...</option>
                        {clusters.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        <option value="new" className="text-amber-400 font-semibold">+ פרופיל חדש</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
          ) : (
            // All Photos Grid
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => photo.processed && photo.id && setLightboxPhotoId(photo.id)}
                  className={`group relative aspect-square border rounded-2xl overflow-hidden transition-all ${
                    photo.processed 
                      ? 'border-slate-800 cursor-pointer hover:border-amber-500/50' 
                      : 'border-slate-900 opacity-60 cursor-not-allowed'
                  }`}
                >
                  {photo.id && <PhotoImage photoId={photo.id} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                  
                  <div className="absolute top-3.5 right-3.5 p-1 rounded bg-slate-950/80 border border-slate-850 z-10">
                    {photo.processed ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                    )}
                  </div>

                  {photo.processed && (
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Maximize2 className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxPhotoId && lightboxPhoto && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center z-50 p-4 transition-all duration-300">
          <button
            onClick={() => setLightboxPhotoId(null)}
            className="absolute top-4 left-4 p-2.5 rounded-full bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-4 relative">
            <div className="relative inline-block max-w-full max-h-[80vh] rounded-2xl overflow-hidden ring-1 ring-slate-850 shadow-2xl">
              {lightboxPhoto.id && (
                <PhotoImage 
                  photoId={lightboxPhoto.id} 
                  className="max-w-full max-h-[80vh] object-contain rounded-2xl" 
                />
              )}

              {/* Bounding box overlays */}
              {lightboxFaces.map((face) => (
                <div
                  key={face.id}
                  className="absolute border-2 border-amber-500 hover:border-amber-400 hover:bg-amber-500/10 group/face transition-all duration-200"
                  style={{
                    left: `${face.box.x * 100}%`,
                    top: `${face.box.y * 100}%`,
                    width: `${face.box.width * 100}%`,
                    height: `${face.box.height * 100}%`,
                  }}
                >
                  <div className="absolute bottom-full right-0 mb-1.5 bg-amber-500/90 text-slate-950 text-[10px] font-semibold px-2 py-0.5 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/face:opacity-100 transition-opacity pointer-events-none">
                    {clusterNamesMap[face.clusterId || ''] || 'דמות ללא שם'}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className="text-slate-300 font-semibold text-sm">{lightboxPhoto.fileName}</p>
              {lightboxFaces.length > 0 ? (
                <p className="text-amber-400 text-xs mt-1">
                  זוהו {lightboxFaces.length} דמויות בתמונה זו (רחף מעל הריבועים כדי לראות שמות)
                </p>
              ) : (
                <p className="text-slate-500 text-xs mt-1">לא זוהו דמויות בתמונה זו</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Merge Mode */}
      {isMergeMode && selectedForMerge.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 p-4 rounded-3xl shadow-2xl flex items-center gap-6">
          <div className="text-slate-800 dark:text-slate-200 font-bold">
            {selectedForMerge.size} אורחים נבחרו
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setIsMergeMode(false);
                setSelectedForMerge(new Set());
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-sm"
            >
              ביטול
            </button>
            <button
              onClick={handleManualMergeSelected}
              disabled={selectedForMerge.size < 2}
              className={`px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer border ${
                selectedForMerge.size < 2 
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 border-transparent cursor-not-allowed opacity-50'
                  : 'bg-amber-100 dark:bg-amber-500 hover:bg-amber-200 dark:hover:bg-amber-400 text-amber-900 dark:text-slate-950 border-amber-200 dark:border-transparent shadow-lg shadow-amber-900/10 dark:shadow-amber-500/20 active:scale-95'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>מזג אורחים שנבחרו</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
