/**
 * GuestView — Full guest-facing page for finding photos at an event.
 *
 * Flow: Load event → Selfie capture → Face matching → Results grid
 * No login required. Designed for mobile-first.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../services/translations';
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
import { getEventByShareCode, type CloudEvent } from '../services/firestore';
import { convertToRawDropboxUrl } from '../services/dropbox';
import { matchSelfieToEvent, type MatchResult } from '../services/faceMatching';
import { SelfieCapture } from './SelfieCapture';
import { useConsent } from '../contexts/ConsentContext';

interface GuestViewProps {
  shareCode: string;
}

type ViewState =
  | 'loading-event'
  | 'selfie-input'
  | 'matching'
  | 'results'
  | 'no-matches'
  | 'error';

export function GuestView({ shareCode }: GuestViewProps) {
  const { t, isRtl, language } = useTranslation();
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

  // ---- Load event data ----
  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      try {
        const eventData = await getEventByShareCode(shareCode);

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
  }, [shareCode, t, language]);

  // ---- Selfie captured → match ----
  const handleSelfieCapture = useCallback(
    async (descriptor: number[], _thumbnail: string) => {
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

  // ---- Download all as ZIP ----
  const handleDownloadAll = useCallback(async () => {
    if (downloadableMatches.length === 0) return;

    setDownloadingAll(true);
    setDownloadProgress(0);

    try {
      const zip = new JSZip();
      const total = downloadableMatches.length;

      for (let i = 0; i < downloadableMatches.length; i++) {
        const match = downloadableMatches[i];
        try {
          const imageUrl = match.publicUrl ? convertToRawDropboxUrl(match.publicUrl) : `https://lh3.googleusercontent.com/d/${match.driveFileId}=s1600`;
          const response = await fetch(imageUrl, { mode: 'cors' });
          if (response.ok) {
            const blob = await response.blob();
            const extension = blob.type.includes('png') ? 'png' : 'jpg';
            zip.file(`photo_${i + 1}.${extension}`, blob);
          }
        } catch {
          console.warn(`Failed to download photo ${match.driveFileId}`);
        }
        setDownloadProgress(Math.round(((i + 1) / total) * 100));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event?.name ?? 'event'}_photos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP download error:', err);
      alert(t('guestView.errorDownloading'));
    } finally {
      setDownloadingAll(false);
      setDownloadProgress(0);
    }
  }, [downloadableMatches, event?.name, t]);

  // ---- Download single photo ----
  const handleDownloadSingle = useCallback((driveFileId: string) => {
    const match = downloadableMatches.find((m) => m.driveFileId === driveFileId);
    if (match?.publicUrl) {
      const rawUrl = convertToRawDropboxUrl(match.publicUrl);
      const downloadUrl = rawUrl.replace('raw=1', 'dl=1');
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.open(
        `https://drive.google.com/uc?export=download&id=${driveFileId}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  }, [downloadableMatches]);

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
              <img
                src={match.publicUrl ? convertToRawDropboxUrl(match.publicUrl) : `https://lh3.googleusercontent.com/d/${match.driveFileId}=s400`}
                alt=""
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                referrerPolicy="no-referrer"
                onError={() => {
                  setFailedPhotoIds((prev) => ({ ...prev, [match.driveFileId]: true }));
                  setHasLoadError(true);
                }}
              />

              <div className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadSingle(match.driveFileId);
                  }}
                  className="p-2 rounded bg-surface-container text-on-background border border-surface-border hover:text-copper-accent hover:border-copper-accent transition-all shadow cursor-pointer"
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
                  className="p-2 rounded bg-surface-container text-on-background border border-surface-border hover:text-red-400 hover:border-red-500/30 transition-all shadow cursor-pointer"
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

              <img
                src={selectedPhoto?.publicUrl ? convertToRawDropboxUrl(selectedPhoto.publicUrl) : `https://lh3.googleusercontent.com/d/${selectedPhotoId}=s1600`}
                alt=""
                className="w-full max-h-[70vh] object-contain rounded border border-surface-border shadow-2xl"
                referrerPolicy="no-referrer"
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
