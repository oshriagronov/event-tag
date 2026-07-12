/**
 * GuestView — Full guest-facing page for finding photos at an event.
 *
 * Flow: Load event → Selfie capture → Face matching → Results grid
 * No login required. Designed for mobile-first, Hebrew RTL.
 */

import { useState, useEffect, useCallback } from 'react';
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
  Sparkles,
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
          setErrorMessage('הקישור אינו תקף או שהאירוע לא נמצא.');
          setViewState('error');
          return;
        }

        if (eventData.status !== 'ready') {
          setErrorMessage('האירוע עדיין בתהליך עיבוד. נסה/י שוב מאוחר יותר.');
          setViewState('error');
          return;
        }

        setEvent(eventData);
        setViewState('selfie-input');
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading event:', err);
        setErrorMessage('שגיאה בטעינת האירוע. בדוק/י את החיבור לאינטרנט ונסה/י שוב.');
        setViewState('error');
      }
    }

    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  // ---- Selfie captured → match ----
  const handleSelfieCapture = useCallback(
    async (descriptor: number[], _thumbnail: string) => {
      if (!event?.id) return;

      setViewState('matching');
      setHasLoadError(false);
      setFailedPhotoIds({});
      setHiddenPhotoIds([]);

      try {
        // Fetch using the balanced threshold of 0.62 directly
        const results = await matchSelfieToEvent(descriptor, event.id, 0.62);
        setMatches(results);

        if (results.length > 0) {
          setViewState('results');
        } else {
          setViewState('no-matches');
        }
      } catch (err) {
        console.error('Matching error:', err);
        setErrorMessage('שגיאה בחיפוש התמונות. נסה/י שוב.');
        setViewState('error');
      }
    },
    [event]
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
      alert('שגיאה בהורדת התמונות. נסה/י שוב.');
    } finally {
      setDownloadingAll(false);
      setDownloadProgress(0);
    }
  }, [downloadableMatches, event?.name]);

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
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white m-0 leading-tight">
            EventTag
          </h1>
          {event && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{event.name}</p>
          )}
        </div>
      </div>
    </header>
  );

  // ---- Loading event state ----
  if (viewState === 'loading-event') {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">טוען את האירוע...</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (viewState === 'error') {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">אופס!</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{errorMessage}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/30 cursor-pointer active:scale-[0.98]"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  // ---- Selfie input state ----
  if (viewState === 'selfie-input') {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
          {/* Event info card */}
          <div className="mb-6 p-5 rounded-2xl bg-white/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{event?.name}</h2>
            <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" />
                {event?.photoCount} תמונות
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {event?.faceCount} פנים מזוהות
              </span>
            </div>
          </div>

          {/* Instruction */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm font-medium border border-amber-200/50 dark:border-amber-500/20">
              <Camera className="w-4 h-4" />
              <span>צלם/י סלפי ונמצא את התמונות שלך!</span>
            </div>
          </div>

          {/* Selfie capture */}
          <SelfieCapture onCapture={handleSelfieCapture} />

          {/* Privacy note */}
          <p className="mt-6 text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
            התמונה שלך מעובדת על המכשיר בלבד ואינה נשמרת בשרתים.
            <br />
            פרטיותך חשובה לנו.
          </p>
        </div>
      </div>
    );
  }

  // ---- Matching state ----
  if (viewState === 'matching') {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-2xl bg-amber-500/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
              <Search className="w-10 h-10 text-amber-500" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1">מחפש את התמונות שלך...</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">סורק {event?.photoCount} תמונות מהאירוע</p>
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
      <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center">
            <Frown className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">לא נמצאו תמונות</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              לא הצלחנו למצוא תמונות שלך באירוע. ייתכן שלא צולמת, או שכדאי לנסות סלפי עם תאורה טובה יותר.
            </p>
          </div>
          <button
            onClick={handleRetake}
            className="mt-2 flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/30 cursor-pointer active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" />
            נסה שוב עם סלפי אחר
          </button>
        </div>
      </div>
    );
  }

  // ---- Results state ----
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col">
      {renderHeader()}

      <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full">
        {/* Results header */}
        <div className="mb-5 flex flex-col gap-3">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-l from-amber-50 to-amber-100/50 dark:from-amber-500/10 dark:to-amber-500/5 border border-amber-200/40 dark:border-amber-500/20">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <PartyPopper className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white">
                מצאנו {matchCount} תמונות שלך!
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                מתוך {event?.name}
              </p>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={handleDownloadAll}
                disabled={downloadingAll || downloadableMatches.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/60 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/30 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {downloadingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>יוצר קובץ ZIP... {downloadProgress}%</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    <span>הורד את כל התמונות כקובץ ZIP ({downloadableMatches.length})</span>
                  </>
                )}
              </button>
              <button
                onClick={handleRetake}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm transition-all hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer active:scale-[0.98]"
              >
                <RotateCcw className="w-4 h-4" />
                סלפי חדש
              </button>
            </div>

            {hiddenPhotoIds.length > 0 && (
              <button
                onClick={handleRestoreHidden}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold text-xs transition-all cursor-pointer active:scale-[0.98] border border-dashed border-slate-250 dark:border-slate-700"
              >
                <span>שחזר תמונות שהוסרו ({hiddenPhotoIds.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Warning banner if there's any image loading failure */}
        {hasLoadError && (
          <div className="bg-amber-50/90 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-900/30 rounded-2xl p-4 flex gap-3 text-amber-900 dark:text-amber-400 text-sm mb-4 text-right animate-in fade-in slide-in-from-top-2 duration-350">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-bold text-slate-800 dark:text-amber-300">חלק מהתמונות אינן נטענות</span>
              <span>נראה שהגישה לתמונות ב-Google Drive חסומה. על בעל האירוע להגדיר את שיתוף התיקייה ב-Drive ל-<strong>"כל מי שקישור זה ברשותו" (Anyone with the link)</strong> כדי שהאורחים יוכלו לצפות בהן.</span>
            </div>
          </div>
        )}

        {/* Photo grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {displayedMatches.map((match, index) => (
            <div
              key={match.driveFileId}
              className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
              style={{
                animationName: 'fadeInUp',
                animationDuration: '0.4s',
                animationTimingFunction: 'ease-out',
                animationFillMode: 'both',
                animationDelay: `${Math.min(index * 0.06, 0.6)}s`,
              }}
              onClick={() =>
                !failedPhotoIds[match.driveFileId] &&
                setSelectedPhotoId(
                  selectedPhotoId === match.driveFileId ? null : match.driveFileId
                )
              }
            >
              {/* Hide / False Recognition Button */}
              {!failedPhotoIds[match.driveFileId] && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHidePhoto(match.driveFileId);
                  }}
                  className="absolute top-2 left-2 z-10 p-1.5 rounded-full bg-slate-950/80 hover:bg-red-650 dark:hover:bg-red-500/90 text-slate-300 hover:text-white backdrop-blur-sm shadow-md transition-all opacity-0 group-hover:opacity-100 cursor-pointer border border-slate-800"
                  title="זה לא אני / הסר תמונה"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {failedPhotoIds[match.driveFileId] ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-905/80 text-slate-500 dark:text-slate-405 p-4 text-center gap-2">
                  <Lock className="w-7 h-7 text-amber-500/80 animate-pulse" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-205">הגישה חסומה</span>
                  <span className="text-[10px] leading-normal text-slate-505 dark:text-slate-400">יש לבקש מבעל האירוע להגדיר שיתוף ציבורי ב-Drive</span>
                </div>
              ) : (
                <>
                  <img
                    src={`https://drive.google.com/thumbnail?id=${match.driveFileId}&sz=s400`}
                    alt={`תמונה ${index + 1}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={() => {
                      setFailedPhotoIds(prev => ({ ...prev, [match.driveFileId]: true }));
                      setHasLoadError(true);
                    }}
                  />

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadSingle(match.driveFileId);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-white text-xs font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      הורד
                    </button>
                  </div>
                </>
              )}

              {/* Match similarity badge */}
              {match.distance < 0.45 && (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-bold shadow-lg">
                  <Sparkles className="w-3 h-3" />
                  התאמה מעולה
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Expanded photo view */}
        {selectedPhotoId && (
          <div
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedPhotoId(null)}
          >
            <div
              className="relative max-w-3xl w-full max-h-[85vh] rounded-2xl overflow-hidden bg-black shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={`https://drive.google.com/thumbnail?id=${selectedPhotoId}&sz=s1600`}
                alt="תמונה מוגדלת"
                className="w-full h-full object-contain max-h-[75vh]"
              />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center">
                <button
                  onClick={() => setSelectedPhotoId(null)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  סגור
                </button>
                <button
                  onClick={() => handleDownloadSingle(selectedPhotoId)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold transition-colors shadow-lg cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  הורד
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 mb-6 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            מופעל ע&quot;י EventTag • כל העיבוד מתבצע על המכשיר שלך
          </p>
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
