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
import { matchSelfieToEvent, type MatchResult } from '../services/faceMatching';
import { SelfieCapture } from './SelfieCapture';

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
        // Fetch using the stricter threshold of 0.55 directly to improve guest accuracy
        const results = await matchSelfieToEvent(descriptor, event.id, 0.55);
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
          const response = await fetch(
            `https://lh3.googleusercontent.com/d/${match.driveFileId}=s1600`,
            { mode: 'cors' }
          );
          if (response.ok) {
            const blob = await response.blob();
            const extension = blob.type.includes('png') ? 'png' : 'jpg';
            zip.file(`photo_${i + 1}.${extension}`, blob);
          }
        } catch {
          // Skip failed downloads silently
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
    window.open(
      `https://drive.google.com/uc?export=download&id=${driveFileId}`,
      '_blank',
      'noopener,noreferrer'
    );
  }, []);

  // ---- Render helpers ----

  const renderHeader = () => (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/50 dark:border-slate-800/50">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-200 to-amber-400 dark:from-amber-500 dark:to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 dark:shadow-amber-600/30 shrink-0">
          <Users className="w-5 h-5 text-amber-900 dark:text-white" />
        </div>
        <div className="min-w-0 text-start">
          <h1 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white m-0 leading-tight">
            EventTag
          </h1>
          {event && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate m-0">{event.name}</p>
          )}
        </div>
      </div>
    </header>
  );

  // ---- Loading event state ----
  if (viewState === 'loading-event') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium m-0">{t('guestView.loadingEvent')}</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2 m-0">{t('common.error')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed m-0">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/30 cursor-pointer active:scale-[0.98]"
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
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
          {/* Event info card */}
          <div className="mb-6 p-5 rounded-2xl bg-white/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1 m-0">{event?.name}</h2>
            <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" />
                {t('guestView.photosCount', { count: event?.photoCount || 0 })}
              </span>
            </div>
          </div>

          {/* Instruction */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm font-medium border border-amber-200/50 dark:border-amber-500/20">
              <Camera className="w-4 h-4" />
              <span>{t('guestView.selfieInstruction')}</span>
            </div>
          </div>

          {/* Selfie capture */}
          <SelfieCapture onCapture={handleSelfieCapture} />

          {/* Privacy note */}
          <p className="mt-6 text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed m-0">
            {language === 'he' 
              ? 'התמונה שלך מעובדת על המכשיר בלבד ואינה נשמרת בשרתים. פרטיותך חשובה לנו.' 
              : 'Your photo is processed locally and never saved on servers. We value your privacy.'}
          </p>
        </div>
      </div>
    );
  }

  // ---- Matching state ----
  if (viewState === 'matching') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-2xl bg-amber-500/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
              <Search className="w-10 h-10 text-amber-500" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1 m-0">{t('guestView.searchingTitle')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 m-0">{t('guestView.scanningCount', { count: event?.photoCount || 0 })}</p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-amber-400"
                style={{
                  animation: 'pulse 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- No matches state ----
  if (viewState === 'no-matches') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center">
            <Frown className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2 m-0">{t('guestView.noPhotosTitle')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed m-0">
              {t('guestView.noPhotosDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetake}
            className="mt-2 flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/30 cursor-pointer active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" />
            {language === 'he' ? 'נסה שוב עם סלפי אחר' : 'Try again with another selfie'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Results state ----
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {renderHeader()}

      <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full">
        {/* Results header */}
        <div className="mb-5 flex flex-col gap-3">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-amber-50 to-amber-100/50 dark:from-amber-500/10 dark:to-amber-500/5 border border-amber-200/40 dark:border-amber-500/20">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <PartyPopper className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white m-0">
                {t('guestView.foundMatches', { count: matchCount })}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center justify-between">
            {downloadableMatches.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={downloadingAll}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-md shadow-amber-500/20 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {language === 'he' ? `מוריד... (${downloadProgress}%)` : `Downloading... (${downloadProgress}%)`}
                    </span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    <span>{t('guestView.downloadZipBtn', { count: downloadableMatches.length })}</span>
                  </>
                )}
              </button>
            )}

            {hiddenPhotoIds.length > 0 && (
              <button
                type="button"
                onClick={handleRestoreHidden}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold transition-all cursor-pointer"
              >
                <span>{t('guestView.restoreRemoved', { count: hiddenPhotoIds.length })}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRetake}
              className={`flex items-center gap-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm transition-colors cursor-pointer font-medium ${downloadableMatches.length > 0 ? '' : (isRtl ? 'mr-auto' : 'ml-auto')}`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('guestView.changeSelfie')}</span>
            </button>
          </div>
        </div>

        {/* Warning if there are photo loading failures */}
        {hasLoadError && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3 text-start">
            <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1.5">
              <span className="font-bold text-slate-800 dark:text-amber-300 text-sm">{t('guestView.blockedNoticeTitle')}</span>
              <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('guestView.blockedNoticeDesc')}
              </span>
            </div>
          </div>
        )}

        {/* Matches Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {displayedMatches.map((match) => (
            <div
              key={match.driveFileId}
              onClick={() => setSelectedPhotoId(match.driveFileId)}
              className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800/80 cursor-pointer bg-slate-100 dark:bg-slate-900 shadow-sm hover:shadow-lg transition-all hover:scale-[1.02]"
            >
              <img
                src={`https://lh3.googleusercontent.com/d/${match.driveFileId}=s400`}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => {
                  setFailedPhotoIds((prev) => ({ ...prev, [match.driveFileId]: true }));
                  setHasLoadError(true);
                }}
              />

              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadSingle(match.driveFileId);
                  }}
                  className="p-2 rounded-xl bg-white text-slate-800 hover:bg-amber-500 hover:text-white transition-all shadow-md cursor-pointer"
                  title={t('guestView.downloadBtn')}
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHidePhoto(match.driveFileId);
                  }}
                  className="p-2 rounded-xl bg-white text-slate-800 hover:bg-red-550 hover:text-white transition-all shadow-md cursor-pointer"
                  title={t('guestView.removeBtn')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Photo Modal */}
        {selectedPhotoId && (
          <div
            className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPhotoId(null)}
          >
            <div
              className="relative max-w-3xl w-full flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedPhotoId(null)}
                className="absolute -top-12 right-0 p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <img
                src={`https://lh3.googleusercontent.com/d/${selectedPhotoId}=s1600`}
                alt=""
                className="w-full max-h-[75vh] object-contain rounded-2xl border border-slate-800 shadow-2xl"
                referrerPolicy="no-referrer"
              />

              <div className="flex justify-between items-center gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800 p-4 rounded-2xl">
                <button
                  type="button"
                  onClick={() => handleHidePhoto(selectedPhotoId)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-semibold border border-red-500/20 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  {t('guestView.removeBtn')}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSingle(selectedPhotoId)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold transition-colors shadow-lg cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {t('guestView.downloadBtn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 mb-6 text-center flex flex-col items-center gap-2">
          <p className="text-xs text-slate-400 dark:text-slate-500 m-0">
            {t('guestView.poweredBy')}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <Link to="/privacy" className="hover:text-amber-500 transition-colors cursor-pointer">{t('legal.privacyTitle')}</Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link to="/terms" className="hover:text-amber-500 transition-colors cursor-pointer">{t('legal.termsTitle')}</Link>
          </div>
        </div>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
