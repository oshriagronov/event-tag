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
  Check,
  CheckSquare,
  Download,
  DownloadCloud,
  Loader2,
  RotateCcw,
  Search,
  AlertCircle,
  PartyPopper,
  Frown,
  Lock,
  X,
  Sparkles,
} from 'lucide-react';
import { getCloudEvent, type CloudEvent } from '../services/firestore';
import { convertToRawUrl, type CloudProvider } from '../services/cloudProviders';
import { matchSelfieToEvent, type MatchResult } from '../services/faceMatching';
import { SelfieCapture } from './SelfieCapture';
import { ensureModelsLoaded } from '../services/modelLoader';
import { warmUpONNX } from '../services/onnxModel';


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

  // ---- Download photos one by one ----
  const handleDownload = async () => {
    const targets = isSelectionMode ? selectedMatches : downloadableMatches;
    if (targets.length === 0) return;

    setDownloadingAll(true);
    setDownloadProgress(0);

    try {
      const total = targets.length;
      let downloadedCount = 0;

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
          const baseName = match.fileName || `photo_${i + 1}.${ext}`;
          const finalFileName = baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = finalFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          downloadedCount++;
        } else if (match.publicUrl) {
          const rawUrl = convertToRawUrl(provider, match.publicUrl, 'full');
          const downloadUrl = rawUrl.includes('dropbox') ? rawUrl.replace('raw=1', 'dl=1') : rawUrl;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = match.fileName || `photo_${i + 1}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          downloadedCount++;
        } else {
          console.warn(`Could not retrieve photo ${match.driveFileId || match.fileName}`);
        }

        setDownloadProgress(Math.round(((i + 1) / total) * 100));

        // Small 250ms pacing delay between photo downloads
        await new Promise((r) => setTimeout(r, 250));
      }

      if (downloadedCount === 0) {
        throw new Error(
          language === 'he'
            ? 'לא ניתן היה להוריד את התמונות. וודא שהתיקייה או הקבצים מוגדרים כציבוריים לצפייה.'
            : 'Could not download photos. Ensure the folder or photos are set to public viewing.'
        );
      }
    } catch (err: unknown) {
      console.error('Download error:', err);
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

    let blob: Blob | null = null;
    if (provider === 'google') {
      const id = match?.driveFileId || driveFileId;
      blob = await fetchGoogleDriveBlob(id);
    }
    if (!blob && match?.publicUrl) {
      const rawUrl = convertToRawUrl(provider, match.publicUrl, 'full');
      blob = await fetchImageBlobFromUrl(rawUrl);
    }

    if (blob && blob.size > 0) {
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const baseName = match?.fileName || `photo_${driveFileId}.${ext}`;
      const finalFileName = baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }

    if (match?.publicUrl) {
      const rawUrl = convertToRawUrl(provider, match.publicUrl, 'full');
      const downloadUrl = rawUrl.includes('dropbox') ? rawUrl.replace('raw=1', 'dl=1') : rawUrl;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = match?.fileName || `photo_${driveFileId}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // ---- Render helpers ----

  const renderHeader = () => (
    <header className="w-full top-0 z-50 py-6 border-b border-sage-muted/10">
      <div className="flex justify-between items-center w-full px-4 sm:px-8 max-w-7xl mx-auto">
        <div className="flex items-center">
          <span className="font-display-lg text-3xl md:text-4xl font-bold text-on-surface tracking-tight">
            EventTag
          </span>
        </div>
      </div>
    </header>
  );

  // ---- Loading event state ----
  if (viewState === 'loading-event') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start pattern-dots" dir={isRtl ? 'rtl' : 'ltr'}>
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
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start pattern-dots" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-sage-muted/20 flex items-center justify-center text-red-400 shadow">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display-lg text-2xl sm:text-3xl text-on-surface font-medium m-0">{t('common.error')}</h2>
            <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-surface-container-high border border-sage-muted/20 text-on-surface hover:border-copper-accent/40 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95"
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
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start selection:bg-copper-accent/20 selection:text-deep-forest pattern-dots" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        
        <main className="flex-grow flex flex-col items-center justify-center px-4 sm:px-8 py-8 sm:py-16 max-w-3xl mx-auto w-full gap-8">
          {/* Event Header */}
          <div className="w-full text-center space-y-3">
            <h1 className="font-display-lg text-3xl sm:text-4xl md:text-5xl text-on-surface font-medium m-0 leading-tight">
              {event?.name}
            </h1>
            {/* Note: NO photo count mention as explicitly requested */}
          </div>

          {/* Prompt Badge - Dark Refined Style */}
          <div className="inline-flex items-center justify-center gap-2.5 bg-surface-container-high px-6 py-3 rounded-full border border-sage-muted/10 shadow-sm">
            <Sparkles className="w-4 h-4 text-copper-accent shrink-0" />
            <p className="font-label-sm text-xs sm:text-sm text-on-surface uppercase tracking-wider font-semibold m-0">
              {t('guestView.selfieInstruction')}
            </p>
          </div>

          {/* Selfie capture */}
          <SelfieCapture onCapture={handleSelfieCapture} />
        </main>

        {/* Footer / Privacy Banner */}
        <footer className="w-full mt-auto py-10 border-t border-sage-muted/10">
          <div className="w-full px-4 max-w-xl mx-auto flex flex-col items-center text-center gap-3">
            <div className="bg-surface-container-high/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-sage-muted/10 flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-copper-accent shrink-0" />
              <span className="font-label-sm text-xs uppercase tracking-widest font-bold text-on-surface">
                {language === 'he' ? 'פרטיות מובטחת' : 'Privacy First'}
              </span>
            </div>
            <p className="text-sage-muted font-body-md text-xs sm:text-sm max-w-md leading-relaxed m-0">
              {language === 'he' 
                ? 'תמונת הסלפי שלך מעובדת מקומית במכשירך בלבד כדי ליצור זיהוי ביומטרי מאובטח ואינה נשמרת בשרתים כלל.' 
                : 'Your photo is processed locally on your device to create a secure biometric match and is never saved on our servers.'}
            </p>
            <div className="w-32 h-px bg-gradient-to-r from-transparent via-sage-muted/30 to-transparent my-1" />
            <div className="flex items-center justify-center gap-3 text-xs text-sage-muted font-body-md flex-wrap">
              <Link to="/accessibility" className="hover:text-copper-accent transition-colors no-underline">
                {t('legal.accessibilityTitle')}
              </Link>
              <span>•</span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-a11y-menu'))}
                className="hover:text-copper-accent transition-colors cursor-pointer bg-transparent border-none p-0 text-xs text-sage-muted font-body-md inline-block"
                aria-label={t('a11y.widgetTriggerLabel')}
              >
                {t('a11y.widgetTitle')}
              </button>
            </div>
            <p className="text-on-surface-variant font-label-sm text-[10px] uppercase tracking-widest m-0">
              © {new Date().getFullYear()} EventTag.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // ---- Matching state ----
  if (viewState === 'matching') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start pattern-dots" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 max-w-md mx-auto text-center">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-copper-accent/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-2xl bg-surface-container-high border border-sage-muted/20 flex items-center justify-center text-copper-accent shadow-lg">
              <Search className="w-8 h-8" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="font-display-lg text-2xl sm:text-3xl text-on-surface font-medium m-0">{t('guestView.searchingTitle')}</h2>
            <p className="font-body-md text-sage-muted text-sm m-0 leading-relaxed">
              {language === 'he' ? 'סורק ומאתר את התמונות שלך באירוע...' : 'Scanning and matching your event photos...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- No matches state ----
  if (viewState === 'no-matches') {
    return (
      <div className="min-h-screen bg-background text-on-background flex flex-col text-start pattern-dots" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-sage-muted/20 flex items-center justify-center text-sage-muted shadow">
            <Frown className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display-lg text-2xl sm:text-3xl text-on-surface font-medium m-0">{t('guestView.noPhotosTitle')}</h2>
            <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">
              {t('guestView.noPhotosDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetake}
            className="mt-2 flex items-center gap-2 px-6 py-3.5 rounded-xl bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer border-none active:scale-95"
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
    <div className="min-h-screen bg-background text-on-background flex flex-col text-start pattern-dots" dir={isRtl ? 'rtl' : 'ltr'}>
      {renderHeader()}

      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col p-4 sm:p-8 max-w-5xl mx-auto w-full gap-8 focus:outline-none">
        {/* Results Banner */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high border border-sage-muted/10 shadow-sm">
            <PartyPopper className="w-4 h-4 text-copper-accent shrink-0" />
            <span className="font-label-sm text-xs uppercase tracking-wider font-semibold text-on-surface">
              {t('guestView.foundMatches', { count: matchCount })}
            </span>
          </div>

          <h1 className="font-display-lg text-3xl sm:text-4xl md:text-5xl text-on-surface font-medium m-0">
            {language === 'he' ? 'התמונות שלך מהאירוע' : 'Your Event Photos'}
          </h1>

          <p className="font-body-md text-xs sm:text-sm text-sage-muted max-w-lg m-0 leading-relaxed">
            {language === 'he'
              ? '💡 חסרות תמונות? מומלץ ללחוץ "החלף סלפי" ולנסות 2-3 תמונות מזוויות ותאורות שונות.'
              : '💡 Missing photos? Tap "Change Selfie" and try 2-3 photos with different angles or lighting.'}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-xl bg-surface-container border border-sage-muted/20 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Download Button */}
            {downloadableMatches.length > 0 && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadingAll || (isSelectionMode && selectedPhotoIds.length === 0)}
                className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none active:scale-95"
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

            {/* Select Mode Toggle */}
            {downloadableMatches.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectionMode}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                  isSelectionMode
                    ? 'bg-copper-accent text-background border-copper-accent'
                    : 'bg-surface-container-high border-sage-muted/20 text-on-surface hover:border-copper-accent/40'
                }`}
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                <span>
                  {isSelectionMode ? t('guestView.cancelSelection') : t('guestView.selectPhotos')}
                </span>
              </button>
            )}

            {/* Select All / Deselect All */}
            {isSelectionMode && (
              <button
                type="button"
                onClick={selectedPhotoIds.length === downloadableMatches.length ? handleDeselectAll : handleSelectAll}
                className="flex items-center gap-1.5 px-3.5 py-3 rounded-xl bg-surface-container-high border border-sage-muted/20 text-sage-muted hover:text-on-surface text-xs font-semibold transition-all cursor-pointer"
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
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-container-high border border-sage-muted/20 text-on-surface hover:border-copper-accent/40 text-xs font-semibold transition-all cursor-pointer"
              >
                <span>{t('guestView.restoreRemoved', { count: hiddenPhotoIds.length })}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRetake}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-container-high border border-sage-muted/20 text-copper-accent hover:border-copper-accent/40 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>{t('guestView.changeSelfie')}</span>
            </button>
          </div>
        </div>

        {/* Access warnings */}
        {hasLoadError && (
          <div className="bg-surface-container border border-sage-muted/20 rounded-xl p-5 flex gap-4 text-start shadow-sm">
            <Lock className="w-5 h-5 text-copper-accent shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 font-body-md">
              <span className="font-bold text-on-surface text-sm">{t('guestView.blockedNoticeTitle')}</span>
              <span className="text-xs text-sage-muted leading-relaxed">
                {t('guestView.blockedNoticeDesc')}
              </span>
            </div>
          </div>
        )}

        <div className="botanical-divider" />

        {/* Matches Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
          {displayedMatches.map((match) => {
            const isSelected = selectedPhotoIds.includes(match.driveFileId);
            return (
              <div
                key={match.driveFileId}
                onClick={() => {
                  if (isSelectionMode) {
                    togglePhotoSelection(match.driveFileId);
                  } else {
                    setSelectedPhotoId(match.driveFileId);
                  }
                }}
                className={`group relative aspect-square rounded-xl overflow-hidden border cursor-pointer bg-surface-container shadow-sm hover:shadow-xl transition-all duration-300 ${
                  isSelectionMode && isSelected
                    ? 'ring-2 ring-copper-accent border-copper-accent scale-[0.98]'
                    : 'border-sage-muted/20 hover:border-copper-accent/40 hover:scale-[1.02]'
                }`}
              >
                <GuestPhotoImage
                  provider={event?.provider || 'google'}
                  driveFileId={match.driveFileId}
                  publicUrl={match.publicUrl}
                  alt={match.fileName}
                  size="thumb"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
                  onError={() => {
                    setFailedPhotoIds((prev) => ({ ...prev, [match.driveFileId]: true }));
                    setHasLoadError(true);
                  }}
                />

                {/* Selection Mode Badge */}
                {isSelectionMode && (
                  <div className="absolute top-3 inset-s-3 z-10 pointer-events-none">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all ${
                        isSelected
                          ? 'bg-copper-accent text-background scale-110'
                          : 'bg-surface-container-high/80 backdrop-blur-md border border-sage-muted/20 text-sage-muted'
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
        {selectedPhotoId && (
          <div
            className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto"
            onClick={() => setSelectedPhotoId(null)}
          >
            <div
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col gap-4 my-auto bg-surface-container-high/95 backdrop-blur-xl border border-sage-muted/20 rounded-2xl p-5 sm:p-6 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar with title and close button */}
              <div className="flex items-center justify-between pb-3 border-b border-sage-muted/15 shrink-0">
                <span className="text-xs font-bold text-sage-muted uppercase tracking-wider font-label-sm">
                  {language === 'he' ? 'תצוגה מקדימה' : 'Photo Preview'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoId(null)}
                  className="p-2 rounded-xl bg-surface-container border border-sage-muted/20 text-on-surface hover:border-copper-accent/40 hover:text-copper-accent transition-all cursor-pointer"
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5 shrink-0" />
                </button>
              </div>

              {/* Image Container */}
              <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
                <GuestPhotoImage
                  provider={event?.provider || 'google'}
                  driveFileId={selectedPhotoId}
                  publicUrl={selectedPhoto?.publicUrl}
                  alt={selectedPhoto?.fileName}
                  size="full"
                  className="w-full max-h-[58vh] sm:max-h-[65vh] object-contain rounded-xl border border-sage-muted/20 shadow-lg"
                />
              </div>

              {/* Footer bar */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sage-muted/15 shrink-0">
                <button
                  type="button"
                  onClick={() => togglePhotoSelection(selectedPhotoId)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    selectedPhotoIds.includes(selectedPhotoId)
                      ? 'bg-copper-accent text-background border-copper-accent'
                      : 'bg-surface-container border border-sage-muted/20 text-on-surface hover:border-copper-accent/40'
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
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-copper-accent hover:bg-copper-accent/90 text-background text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer border-none active:scale-95"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {t('guestView.downloadBtn')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Privacy Banner */}
      <footer className="w-full mt-auto py-10 border-t border-sage-muted/10">
        <div className="w-full px-4 max-w-xl mx-auto flex flex-col items-center text-center gap-3">
          <div className="bg-surface-container-high/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-sage-muted/10 flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-copper-accent shrink-0" />
            <span className="font-label-sm text-xs uppercase tracking-widest font-bold text-on-surface">
              {language === 'he' ? 'פרטיות מובטחת' : 'Privacy First'}
            </span>
          </div>
          <p className="text-sage-muted font-body-md text-xs sm:text-sm max-w-md leading-relaxed m-0">
            {language === 'he' 
              ? 'תמונת הסלפי שלך מעובדת מקומית במכשירך בלבד כדי ליצור זיהוי ביומטרי מאובטח ואינה נשמרת בשרתים כלל.' 
              : 'Your photo is processed locally on your device to create a secure biometric match and is never saved on our servers.'}
          </p>
          <div className="w-32 h-px bg-gradient-to-r from-transparent via-sage-muted/30 to-transparent my-1" />
          <div className="flex items-center justify-center gap-3 text-xs text-sage-muted font-body-md flex-wrap">
            <Link to="/accessibility" className="hover:text-copper-accent transition-colors no-underline">
              {t('legal.accessibilityTitle')}
            </Link>
            <span>•</span>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('toggle-a11y-menu'))}
              className="hover:text-copper-accent transition-colors cursor-pointer bg-transparent border-none p-0 text-xs text-sage-muted font-body-md inline-block"
              aria-label={t('a11y.widgetTriggerLabel')}
            >
              {t('a11y.widgetTitle')}
            </button>
          </div>
          <p className="text-on-surface-variant font-label-sm text-[10px] uppercase tracking-widest m-0">
            © {new Date().getFullYear()} EventTag.
          </p>
        </div>
      </footer>
    </div>
  );
}
