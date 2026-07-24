/**
 * GuestView — Full guest-facing page for finding photos at an event.
 *
 * Flow: Load event → Selfie capture → Face matching → Results grid
 * No login required. Designed for mobile-first.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../services/translations';
import { useModal } from '../contexts/ModalContext';
import {
  Camera,
  Check,
  CheckSquare,
  Download,
  DownloadCloud,
  Loader2,
  RotateCcw,
  Search,
  Users,
  AlertCircle,
  PartyPopper,
  Frown,
  Lock,
  X,
  ExternalLink,
} from 'lucide-react';
import JSZip from 'jszip';
import { getCloudEvent, type CloudEvent } from '../services/firestore';
import { convertToRawUrl, type CloudProvider } from '../services/cloudProviders';
import { matchSelfieToEvent, type MatchResult } from '../services/faceMatching';
import { SelfieCapture } from './SelfieCapture';
import { ensureModelsLoaded } from '../services/modelLoader';
import { warmUpONNX } from '../services/onnxModel';
import { useConsent } from '../contexts/ConsentContext';
import { BoxIcon } from './BoxIcon';

interface GuestViewProps {
  eventId: string;
}

type ViewState =
  | 'loading-event'
  | 'selfie-input'
  | 'matching'
  | 'results'
  | 'no-matches'
  | 'error';

interface GuestPhotoImageProps {
  provider?: string;
  driveFileId: string;
  publicUrl?: string;
  alt?: string;
  className?: string;
  size?: 'thumb' | 'full';
  onError?: () => void;
}

function GuestPhotoImage({
  provider = 'google',
  driveFileId,
  publicUrl,
  alt = '',
  className = '',
  size = 'thumb',
  onError,
}: GuestPhotoImageProps) {
  const cleanId = (driveFileId || (publicUrl ? publicUrl.match(/(?:id=|d\/)([^/&?]+)/)?.[1] : '') || '').replace(/=s\d+$/, '');
  const cloudProvider: CloudProvider = (provider as CloudProvider) || 'google';
  const primaryUrl = publicUrl
    ? convertToRawUrl(cloudProvider, publicUrl, size)
    : convertToRawUrl(cloudProvider, cleanId, size);

  const [src, setSrc] = useState(primaryUrl);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setSrc(primaryUrl);
    setStage(0);
  }, [primaryUrl]);

  if (provider === 'box') {
    const boxTargetUrl = publicUrl || (driveFileId ? `https://app.box.com/file/${driveFileId}` : '');
    return (
      <div className={`flex flex-col items-center justify-center p-3 bg-surface-container-low border border-[#0061D5]/30 rounded-lg text-center gap-2 group hover:border-[#0061D5] transition-all h-full w-full ${className}`}>
        <BoxIcon className="w-8 h-8 text-[#0061D5] shrink-0" />
        <span className="text-xs font-bold text-on-background truncate max-w-full unicode-isolate">
          {alt || 'תמונה מ-Box'}
        </span>
        {boxTargetUrl && (
          <a
            href={boxTargetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#0061D5] hover:bg-[#0061D5]/90 text-white text-xs font-bold transition-all no-underline shadow-sm cursor-pointer"
          >
            <span>פתח ב-Box</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
        )}
      </div>
    );
  }

  const handleError = () => {
    if (provider === 'google' && cleanId) {
      if (stage === 0) {
        setStage(1);
        setSrc(`https://lh3.googleusercontent.com/d/${cleanId}`);
        return;
      }
    }
    if (onError) onError();
  };

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy={provider === 'google' ? 'no-referrer' : undefined}
      onError={handleError}
    />
  );
}

export function GuestView({ eventId }: GuestViewProps) {
  const { t, isRtl, language } = useTranslation();
  const { alert } = useModal();
  const { reopen } = useConsent();
  
  const [viewState, setViewState] = useState<ViewState>('loading-event');
  const [event, setEvent] = useState<CloudEvent | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Record<string, boolean>>({});
  const [hiddenPhotoIds, setHiddenPhotoIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  // Derived state
  const displayedMatches = matches.filter(m => !hiddenPhotoIds.includes(m.driveFileId));
  const downloadableMatches = displayedMatches.filter(m => !failedPhotoIds[m.driveFileId]);
  const selectedMatches = downloadableMatches.filter(m => selectedPhotoIds.includes(m.driveFileId));
  const matchCount = displayedMatches.length;
  const selectedPhoto = displayedMatches.find(m => m.driveFileId === selectedPhotoId);

  // Warm up AI models eagerly on mount so guest capture flow is instantaneous
  useEffect(() => {
    ensureModelsLoaded().catch(() => {});
    warmUpONNX();
  }, []);

  // ---- Load event data ----
  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      try {
        const eventData = await getCloudEvent(eventId);

        if (cancelled) return;

        if (!eventData) {
          setErrorMessage(t('guestView.errorLoadingDesc'));
          setViewState('error');
          return;
        }

        if (eventData.status !== 'ready') {
          setErrorMessage(language === 'he' ? 'האירוע עדיין בתהליך עיבוד. נסה/י שוב מאוחר יותר.' : 'The event is still processing. Please try again later.');
          setViewState('error');
          return;
        }

        setEvent(eventData);
        setViewState('selfie-input');
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading event:', err);
        setErrorMessage(language === 'he' ? 'שגיאה בטעינת האירוע. בדוק/י את החיבור לאינטרנט ונסה/י שוב.' : 'Error loading event. Please check your internet connection and try again.');
        setViewState('error');
      }
    }

    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [eventId, t, language]);

  // ---- Selfie captured → match ----
  const handleSelfieCapture = useCallback(
    async (descriptor: number[]) => {
      if (!event?.id) return;

      setViewState('matching');
      setHasLoadError(false);
      setFailedPhotoIds({});
      setHiddenPhotoIds([]);
      setIsSelectionMode(false);
      setSelectedPhotoIds([]);

      try {
        // Fetch using a calibrated SFace L2 distance threshold of 0.85 to prevent false matches
        const results = await matchSelfieToEvent(descriptor, event.id, 0.85);
        setMatches(results);

        if (results.length > 0) {
          setViewState('results');
        } else {
          setViewState('no-matches');
        }
      } catch (err) {
        console.error('Matching error:', err);
        setErrorMessage(t('guestView.errorSearching'));
        setViewState('error');
      }
    },
    [event, t]
  );

  // ---- Retake selfie ----
  const handleRetake = useCallback(() => {
    setMatches([]);
    setSelectedPhotoId(null);
    setHasLoadError(false);
    setFailedPhotoIds({});
    setHiddenPhotoIds([]);
    setIsSelectionMode(false);
    setSelectedPhotoIds([]);
    setViewState('selfie-input');
  }, []);



  // ---- Restore hidden photos ----
  const handleRestoreHidden = useCallback(() => {
    setHiddenPhotoIds([]);
  }, []);

  // ---- Selection helpers ----
  const togglePhotoSelection = useCallback((driveFileId: string) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(driveFileId)
        ? prev.filter((id) => id !== driveFileId)
        : [...prev, driveFileId]
    );
  }, []);

  const handleSelectAll = () => {
    setSelectedPhotoIds(downloadableMatches.map((m) => m.driveFileId));
  };

  const handleDeselectAll = () => {
    setSelectedPhotoIds([]);
  };

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedPhotoIds([]);
      }
      return next;
    });
  }, []);

  // Helper to load generic image URLs into Blobs (direct fetch or canvas fallback)
  const fetchImageBlobFromUrl = (url: string, timeoutMs = 12000): Promise<Blob | null> => {
    return new Promise((resolve) => {
      let isResolved = false;
      const safeResolve = (val: Blob | null) => {
        if (!isResolved) {
          isResolved = true;
          resolve(val);
        }
      };

      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), timeoutMs);

      fetch(url, { signal: controller.signal })
        .then(async (res) => {
          clearTimeout(fetchTimer);
          if (res.ok) {
            const blob = await res.blob();
            if (blob && blob.size > 200) {
              safeResolve(blob);
              return;
            }
          }
          tryCanvasFallback();
        })
        .catch(() => {
          clearTimeout(fetchTimer);
          tryCanvasFallback();
        });

      function tryCanvasFallback() {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.crossOrigin = 'anonymous';
        const imgTimer = setTimeout(() => safeResolve(null), timeoutMs);

        img.onload = () => {
          clearTimeout(imgTimer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 1600;
            canvas.height = img.naturalHeight || img.height || 1200;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              canvas.toBlob(
                (blob) => {
                  if (blob && blob.size > 200) {
                    safeResolve(blob);
                  } else {
                    safeResolve(null);
                  }
                },
                'image/jpeg',
                0.95
              );
            } else {
              safeResolve(null);
            }
          } catch {
            safeResolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(imgTimer);
          safeResolve(null);
        };

        img.src = url;
      }
    });
  };

  // Helper to load Google Drive images into Blobs with multi-endpoint fallback
  const fetchGoogleDriveBlob = async (fileId: string): Promise<Blob | null> => {
    const cleanId = fileId.replace(/=s\d+$/, '');
    let blob = await fetchImageBlobFromUrl(`https://drive.google.com/thumbnail?id=${cleanId}&sz=w1600`);
    if (!blob) {
      blob = await fetchImageBlobFromUrl(`https://lh3.googleusercontent.com/d/${cleanId}`);
    }
    return blob;
  };

  // ---- Download photos as ZIP ----
  const handleDownload = async () => {
    const targets = isSelectionMode ? selectedMatches : downloadableMatches;
    if (targets.length === 0) return;

    setDownloadingAll(true);
    setDownloadProgress(0);

    try {
      const zip = new JSZip();
      const total = targets.length;
      let addedCount = 0;

      for (let i = 0; i < targets.length; i++) {
        const match = targets[i];
        let blob: Blob | null = null;

        const provider = event?.provider || (match.publicUrl?.includes('dropbox') ? 'dropbox' : 'google');

        if (provider === 'google') {
          const fileId = match.driveFileId || (match.publicUrl ? match.publicUrl.match(/(?:id=|d\/)([^/&?]+)/)?.[1] : null);
          if (fileId) {
            blob = await fetchGoogleDriveBlob(fileId);
          }
        }

        if (!blob && match.publicUrl) {
          const rawUrl = convertToRawUrl(provider, match.publicUrl, 'full');
          blob = await fetchImageBlobFromUrl(rawUrl);
        }

        if (blob && blob.size > 0) {
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const fileName = match.fileName || `photo_${i + 1}.${ext}`;
          zip.file(fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`, blob);
          addedCount++;
        } else {
          console.warn(`Could not retrieve blob for photo ${match.driveFileId || match.fileName}`);
        }

        setDownloadProgress(Math.round(((i + 1) / total) * 100));

        // Small 100ms pacing delay between photo fetches
        await new Promise((r) => setTimeout(r, 100));
      }

      if (addedCount === 0) {
        throw new Error(
          language === 'he'
            ? 'לא ניתן היה לשלוף את התמונות כקובץ ZIP. וודא שהתיקייה או הקבצים מוגדרים כציבוריים לצפייה.'
            : 'Could not fetch photos into ZIP package. Ensure the folder or photos are set to public viewing.'
        );
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event?.name ?? 'event'}_photos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      console.error('ZIP download error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      await alert({
        title: language === 'he' ? 'שגיאה בהורדה' : 'Download Error',
        message: errMsg || t('guestView.errorDownloading'),
        variant: 'danger',
      });
    } finally {
      setDownloadingAll(false);
      setDownloadProgress(0);
    }
  };

  // ---- Download single photo ----
  const handleDownloadSingle = async (driveFileId: string) => {
    const match = downloadableMatches.find((m) => m.driveFileId === driveFileId);
    const provider = event?.provider || (match?.publicUrl?.includes('dropbox') ? 'dropbox' : 'google');

    if (provider === 'google') {
      const id = match?.driveFileId || driveFileId;
      const blob = await fetchGoogleDriveBlob(id);
      if (blob && blob.size > 0) {
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = match?.fileName || `photo_${id}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      window.open(`https://lh3.googleusercontent.com/d/${id}`, '_blank', 'noopener,noreferrer');
    } else if (match?.publicUrl) {
      const rawUrl = convertToRawUrl(provider, match.publicUrl, 'full');
      const downloadUrl = rawUrl.includes('dropbox') ? rawUrl.replace('raw=1', 'dl=1') : rawUrl;
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // ---- Render helpers ----

  const renderHeader = () => (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-surface-border/40">
      <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-surface-container border border-surface-border flex items-center justify-center shadow shrink-0">
          <Users className="w-4 h-4 text-copper-accent" />
        </div>
        <div className="min-w-0 text-start">
          <h1 className="font-display-lg text-lg text-on-background m-0 leading-tight">
            EventTag
          </h1>
          {event && (
            <p className="font-body-md text-[10px] text-sage-muted truncate m-0 uppercase tracking-wider">{event.name}</p>
          )}
        </div>
      </div>
    </header>
  );

  // ---- Loading event state ----
  if (viewState === 'loading-event') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <Loader2 className="w-8 h-8 text-copper-accent animate-spin" />
          <p className="font-body-md text-sage-muted text-sm m-0">{t('guestView.loadingEvent')}</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="w-14 h-14 rounded bg-surface-container border border-surface-border flex items-center justify-center text-red-400">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="font-title-md text-base font-bold text-on-background mb-2 m-0">{t('common.error')}</h2>
            <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded bg-surface-container border border-surface-border text-on-background hover:bg-surface-container-high font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            {language === 'he' ? 'נסה שוב' : 'Try again'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Selfie input state ----
  if (viewState === 'selfie-input') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
          {/* Event info card */}
          <div className="mb-6 p-5 rounded bg-surface-container border border-surface-border text-start">
            <h2 className="font-display-lg text-xl text-on-background m-0">{event?.name}</h2>
          </div>

          {/* Instruction */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider">
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>{t('guestView.selfieInstruction')}</span>
            </div>
          </div>

          {/* Selfie capture */}
          <SelfieCapture onCapture={handleSelfieCapture} />

          {/* Privacy note */}
          <p className="mt-6 font-body-md text-[11px] text-sage-muted text-center leading-relaxed m-0 bg-surface-container/20 p-3 rounded border border-surface-border/50">
            {language === 'he' 
              ? 'פרטיות מובטחת: תמונת הסלפי שלך מעובדת מקומית בדפדפן ואינה נשמרת בשרתים כלל.' 
              : 'Privacy assured: your selfie is processed locally and never stored on any server.'}
          </p>
        </div>
      </div>
    );
  }

  // ---- Matching state ----
  if (viewState === 'matching') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full bg-copper-accent/25 animate-ping" />
            <div className="relative w-16 h-16 rounded bg-surface-container border border-surface-border flex items-center justify-center text-copper-accent shadow">
              <Search className="w-7 h-7" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="font-title-md text-base font-bold text-on-background mb-1 m-0">{t('guestView.searchingTitle')}</h2>
          </div>
        </div>
      </div>
    );
  }

  // ---- No matches state ----
  if (viewState === 'no-matches') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="w-14 h-14 rounded bg-surface-container border border-surface-border flex items-center justify-center text-sage-muted shadow">
            <Frown className="w-7 h-7" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="font-title-md text-base font-bold text-on-background mb-2 m-0">{t('guestView.noPhotosTitle')}</h2>
            <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">
              {t('guestView.noPhotosDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetake}
            className="mt-2 flex items-center gap-2 px-6 py-3 rounded bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs uppercase tracking-wider shadow transition-all cursor-pointer border-none"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            {language === 'he' ? 'צלם סלפי אחר' : 'Try Another Selfie'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Results state ----
  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {renderHeader()}

      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full gap-6 focus:outline-none">
        {/* Results banner */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 p-4 rounded bg-surface-container border border-surface-border text-start">
            <div className="w-9 h-9 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <PartyPopper className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-title-md text-base font-bold text-on-background m-0">
                {t('guestView.foundMatches', { count: matchCount })}
              </h2>
              <p className="font-body-md text-xs text-sage-muted m-0 mt-0.5">
                {language === 'he'
                  ? '💡 חסרות תמונות? מומלץ ללחוץ "החלף סלפי" ולנסות 2-3 תמונות מזוויות ותאורות שונות.'
                  : '💡 Missing photos? Tap "Change Selfie" and try 2-3 photos with different angles or lighting.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Primary Download Button */}
              {downloadableMatches.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloadingAll || (isSelectionMode && selectedPhotoIds.length === 0)}
                  className="flex items-center gap-2 px-5 py-3 rounded bg-deep-forest hover:bg-primary text-background font-bold text-xs uppercase tracking-wider transition-all shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
                >
                  {downloadingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>
                        {language === 'he' ? `מוריד... (${downloadProgress}%)` : `Downloading... (${downloadProgress}%)`}
                      </span>
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-4 h-4 shrink-0" />
                      <span>
                        {isSelectionMode
                          ? t('guestView.downloadSelectedBtn', { count: selectedPhotoIds.length })
                          : t('guestView.downloadZipBtn', { count: downloadableMatches.length })}
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Select Photos Toggle Button */}
              {downloadableMatches.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectionMode}
                  className={`flex items-center gap-2 px-4 py-3 rounded text-xs font-bold uppercase tracking-wider transition-all shadow cursor-pointer border ${
                    isSelectionMode
                      ? 'bg-copper-accent text-background border-copper-accent'
                      : 'bg-surface-container border-surface-border text-on-background hover:bg-surface-container-high'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 shrink-0" />
                  <span>
                    {isSelectionMode ? t('guestView.cancelSelection') : t('guestView.selectPhotos')}
                  </span>
                </button>
              )}

              {/* Quick Select All / Clear Selection */}
              {isSelectionMode && (
                <button
                  type="button"
                  onClick={selectedPhotoIds.length === downloadableMatches.length ? handleDeselectAll : handleSelectAll}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded bg-surface-container/60 hover:bg-surface-container border border-surface-border text-sage-muted hover:text-on-background text-xs font-semibold transition-all cursor-pointer"
                >
                  <span>
                    {selectedPhotoIds.length === downloadableMatches.length
                      ? t('guestView.deselectAll')
                      : t('guestView.selectAll')}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 ms-auto">
              {hiddenPhotoIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreHidden}
                  className="flex items-center gap-2 px-4 py-2.5 rounded bg-surface-container border border-surface-border text-on-background hover:bg-surface-container-high text-xs font-semibold transition-all cursor-pointer"
                >
                  <span>{t('guestView.restoreRemoved', { count: hiddenPhotoIds.length })}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleRetake}
                className="flex items-center gap-1.5 text-copper-accent hover:underline text-xs uppercase tracking-wider cursor-pointer font-bold border-none bg-transparent outline-none"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>{t('guestView.changeSelfie')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Access warnings */}
        {hasLoadError && (
          <div className="bg-primary-container/10 border border-surface-border rounded p-5 flex gap-4 text-start">
            <Lock className="w-5 h-5 text-copper-accent shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 font-body-md">
              <span className="font-bold text-on-background text-sm">{t('guestView.blockedNoticeTitle')}</span>
              <span className="text-xs text-sage-muted leading-relaxed">
                {t('guestView.blockedNoticeDesc')}
              </span>
            </div>
          </div>
        )}

        <div className="botanical-divider" />

        {/* Matches Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {displayedMatches.map((match) => {
            const isSelected = selectedPhotoIds.includes(match.driveFileId);
            return (
              <div
                key={match.driveFileId}
                onClick={() => {
                  if (isSelectionMode) {
                    togglePhotoSelection(match.driveFileId);
                  } else if (event?.provider === 'box') {
                    const targetUrl = match.publicUrl || `https://app.box.com/file/${match.driveFileId}`;
                    if (targetUrl) {
                      window.open(targetUrl, '_blank', 'noopener,noreferrer');
                    }
                  } else {
                    setSelectedPhotoId(match.driveFileId);
                  }
                }}
                className={`group relative aspect-square rounded-lg overflow-hidden border cursor-pointer bg-surface-container-low shadow hover:shadow-2xl transition-all ${
                  isSelectionMode && isSelected
                    ? 'ring-2 ring-copper-accent border-copper-accent scale-[0.98]'
                    : 'border-surface-border hover:scale-[1.01]'
                }`}
              >
                <GuestPhotoImage
                  provider={event?.provider || 'google'}
                  driveFileId={match.driveFileId}
                  publicUrl={match.publicUrl}
                  alt={match.fileName}
                  size="thumb"
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300 pointer-events-none"
                  onError={() => {
                    setFailedPhotoIds((prev) => ({ ...prev, [match.driveFileId]: true }));
                    setHasLoadError(true);
                  }}
                />

                {/* Selection Mode Badge */}
                {isSelectionMode && (
                  <div className="absolute top-2.5 inset-s-2.5 z-10 pointer-events-none">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all ${
                        isSelected
                          ? 'bg-copper-accent text-background scale-110'
                          : 'bg-background/80 backdrop-blur-md border border-surface-border text-sage-muted'
                      }`}
                    >
                      <Check className={`w-4 h-4 transition-transform ${isSelected ? 'scale-100' : 'scale-0'}`} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Zoom Lightbox Modal */}
        {selectedPhotoId && event?.provider !== 'box' && (
          <div
            className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto"
            onClick={() => setSelectedPhotoId(null)}
          >
            <div
              className="relative max-w-3xl w-full max-h-[90vh] flex flex-col gap-3 sm:gap-4 my-auto bg-surface-container-low/95 backdrop-blur-xl border border-surface-border rounded-xl p-4 sm:p-5 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar with title and close button */}
              <div className="flex items-center justify-between pb-2 border-b border-surface-border/50 shrink-0">
                <span className="text-xs font-bold text-sage-muted uppercase tracking-wider">
                  {language === 'he' ? 'תצוגה מקדימה' : 'Photo Preview'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoId(null)}
                  className="p-2 rounded-lg bg-surface-container border border-surface-border text-on-background hover:bg-surface-container-high hover:text-copper-accent transition-all cursor-pointer"
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5 shrink-0" />
                </button>
              </div>

              {/* Image Container */}
              <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                <GuestPhotoImage
                  provider={event?.provider || 'google'}
                  driveFileId={selectedPhotoId}
                  publicUrl={selectedPhoto?.publicUrl}
                  alt={selectedPhoto?.fileName}
                  size="full"
                  className="w-full max-h-[58vh] sm:max-h-[65vh] object-contain rounded border border-surface-border shadow-md"
                />
              </div>

              {/* Footer bar */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-border/50 shrink-0">
                <button
                  type="button"
                  onClick={() => togglePhotoSelection(selectedPhotoId)}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-bold transition-all cursor-pointer border ${
                    selectedPhotoIds.includes(selectedPhotoId)
                      ? 'bg-copper-accent text-background border-copper-accent'
                      : 'bg-surface-container border-surface-border text-on-background hover:bg-surface-container-high'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 shrink-0" />
                  <span>
                    {selectedPhotoIds.includes(selectedPhotoId)
                      ? (language === 'he' ? 'נבחרה' : 'Selected')
                      : (language === 'he' ? 'בחר תמונה' : 'Select')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSingle(selectedPhotoId)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded bg-copper-accent hover:bg-copper-accent/90 text-background text-sm font-bold transition-colors shadow cursor-pointer border-none"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {t('guestView.downloadBtn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-surface-border/30 text-sage-muted w-full">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-sage-muted">
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-start">
              <span className="font-display-lg text-lg text-on-background tracking-tight">EventTag</span>
              <p className="m-0 font-body-md text-[11px] md:text-xs">© {new Date().getFullYear()} EventTag — {language === 'he' ? 'כל הזכויות שמורות' : 'All rights reserved'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 font-label-sm uppercase tracking-wider text-[10px] md:text-xs">
              <Link to="/privacy-policy" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('legal.privacyTitle')}</Link>
              <span className="text-surface-border">•</span>
              <Link to="/terms" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('legal.termsTitle')}</Link>
              <span className="text-surface-border">•</span>
              <Link to="/accessibility" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('a11y.accessibilityStatement')}</Link>
              <span className="text-surface-border">•</span>
              <button
                onClick={reopen}
                className="hover:text-copper-accent transition-colors cursor-pointer bg-transparent border-none p-0 outline-none font-bold text-sage-muted font-label-sm uppercase tracking-wider text-[10px] md:text-xs"
              >
                {t('consent.managePreferences')}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
