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
  Download,
  DownloadCloud,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Search,
  Users,
  AlertCircle,
  PartyPopper,
  Frown,
  Lock,
  X,
} from 'lucide-react';
import JSZip from 'jszip';
import { getCloudEvent, type CloudEvent } from '../services/firestore';
import { convertToRawUrl, type CloudProvider } from '../services/cloudProviders';
import { matchSelfieToEvent, type MatchResult } from '../services/faceMatching';
import { SelfieCapture } from './SelfieCapture';
import { ensureModelsLoaded } from '../services/modelLoader';
import { warmUpONNX } from '../services/onnxModel';
import { useConsent } from '../contexts/ConsentContext';

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
  const cloudProvider: CloudProvider = (provider === 'dropbox' || provider === 'onedrive') ? provider : 'google';
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
        setSrc(`https://drive.google.com/uc?export=view&id=${cleanId}`);
        return;
      }
      if (stage === 1) {
        setStage(2);
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
      referrerPolicy="no-referrer"
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

  // Derived state
  const displayedMatches = matches.filter(m => !hiddenPhotoIds.includes(m.driveFileId));
  const downloadableMatches = displayedMatches.filter(m => !failedPhotoIds[m.driveFileId]);
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
    setViewState('selfie-input');
  }, []);

  // ---- Hide photo (false recognition / not interested) ----
  const handleHidePhoto = useCallback((driveFileId: string) => {
    setHiddenPhotoIds((prev) => [...prev, driveFileId]);
  }, []);

  // ---- Restore hidden photos ----
  const handleRestoreHidden = useCallback(() => {
    setHiddenPhotoIds([]);
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
      blob = await fetchImageBlobFromUrl(`https://drive.google.com/uc?export=view&id=${cleanId}`);
    }
    if (!blob) {
      blob = await fetchImageBlobFromUrl(`https://lh3.googleusercontent.com/d/${cleanId}`);
    }
    return blob;
  };

  // ---- Download all as ZIP ----
  const handleDownloadAll = async () => {
    if (downloadableMatches.length === 0) return;

    setDownloadingAll(true);
    setDownloadProgress(0);

    try {
      const zip = new JSZip();
      const total = downloadableMatches.length;
      let addedCount = 0;

      for (let i = 0; i < downloadableMatches.length; i++) {
        const match = downloadableMatches[i];
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
  const handleDownloadSingle = (driveFileId: string) => {
    const match = downloadableMatches.find((m) => m.driveFileId === driveFileId);
    const provider = event?.provider || (match?.publicUrl?.includes('dropbox') ? 'dropbox' : 'google');

    if (provider === 'google') {
      const id = match?.driveFileId || driveFileId;
      window.open(`https://drive.google.com/uc?export=download&id=${id}`, '_blank', 'noopener,noreferrer');
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
            <div className="flex items-center gap-4 text-xs text-sage-muted mt-2">
              <span className="flex items-center gap-1.5 font-body-md">
                <ImageIcon className="w-3.5 h-3.5" />
                {t('guestView.photosCount', { count: event?.photoCount || 0 })}
              </span>
            </div>
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
            <p className="font-body-md text-sage-muted text-sm m-0">{t('guestView.scanningCount', { count: event?.photoCount || 0 })}</p>
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
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center justify-between">
            {downloadableMatches.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={downloadingAll}
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
                    <span>{t('guestView.downloadZipBtn', { count: downloadableMatches.length })}</span>
                  </>
                )}
              </button>
            )}

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
              className={`flex items-center gap-1.5 text-copper-accent hover:underline text-xs uppercase tracking-wider cursor-pointer font-bold border-none bg-transparent outline-none ${downloadableMatches.length > 0 ? '' : (isRtl ? 'mr-auto' : 'ml-auto')}`}
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{t('guestView.changeSelfie')}</span>
            </button>
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
          {displayedMatches.map((match) => (
            <div
              key={match.driveFileId}
              onClick={() => setSelectedPhotoId(match.driveFileId)}
              className="group relative aspect-square rounded overflow-hidden border border-surface-border cursor-pointer bg-surface-container-low shadow hover:shadow-2xl transition-all hover:scale-[1.01]"
            >
              <GuestPhotoImage
                provider={event?.provider || 'google'}
                driveFileId={match.driveFileId}
                publicUrl={match.publicUrl}
                size="thumb"
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                onError={() => {
                  setFailedPhotoIds((prev) => ({ ...prev, [match.driveFileId]: true }));
                  setHasLoadError(true);
                }}
              />

              <div className="absolute inset-0 bg-black/40 sm:bg-background/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadSingle(match.driveFileId);
                  }}
                  className="p-2.5 sm:p-2 rounded-lg bg-surface-container/90 text-on-background border border-surface-border hover:text-copper-accent hover:border-copper-accent active:scale-95 transition-all shadow cursor-pointer"
                  title={t('guestView.downloadBtn')}
                >
                  <Download className="w-4 h-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHidePhoto(match.driveFileId);
                  }}
                  className="p-2.5 sm:p-2 rounded-lg bg-surface-container/90 text-on-background border border-surface-border hover:text-red-400 hover:border-red-500/30 active:scale-95 transition-all shadow cursor-pointer"
                  title={t('guestView.removeBtn')}
                >
                  <X className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Zoom Lightbox Modal */}
        {selectedPhotoId && (
          <div
            className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPhotoId(null)}
          >
            <div
              className="relative max-w-3xl w-full flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedPhotoId(null)}
                className="absolute -top-12 right-0 p-2 rounded bg-surface-container border border-surface-border text-on-background hover:bg-surface-container-high hover:text-copper-accent transition-all cursor-pointer"
              >
                <X className="w-5 h-5 shrink-0" />
              </button>

              <GuestPhotoImage
                provider={event?.provider || 'google'}
                driveFileId={selectedPhotoId}
                publicUrl={selectedPhoto?.publicUrl}
                size="full"
                className="w-full max-h-[70vh] object-contain rounded border border-surface-border shadow-2xl"
              />

              <div className="flex justify-between items-center gap-4 bg-surface-container/85 backdrop-blur-md border border-surface-border p-4 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleHidePhoto(selectedPhotoId)}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-surface-container-low hover:bg-surface-container border border-red-500/20 text-red-400 text-sm font-semibold transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 shrink-0" />
                  {t('guestView.removeBtn')}
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
