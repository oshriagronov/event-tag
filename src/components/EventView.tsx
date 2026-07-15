import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Face } from '../db';
import { useScanner } from '../contexts/ScannerContext';
import { mergeClusters } from '../clustering';
import { PhotoImage } from './PhotoImage';
import { 
  ArrowRight, ArrowLeft, FolderOpen, Image as ImageIcon, Users, Search, 
  Loader2, Check, AlertCircle, X, Maximize2,
  HelpCircle, CheckCircle2, Clock, Sparkles,
  Pause, Play, Download, Copy, QrCode, ExternalLink, RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getCloudEvent,
  getCloudPhotos,
  updateCloudEvent,
  addCloudPhotosBatch,
  type CloudEvent,
  type CloudPhoto,
} from '../services/firestore';
import { listPhotosInFolder, getPhotoBlob } from '../services/googleDrive';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '../services/translations';

interface EventViewProps {
  eventId: number | string;
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

interface CloudPhotoImageProps {
  driveFileId: string;
  accessToken: string;
  className?: string;
  alt?: string;
}

function CloudPhotoImage({ driveFileId, accessToken, className = '', alt = '' }: CloudPhotoImageProps) {
  const [src, setSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { clearGoogleToken } = useAuth();

  useEffect(() => {
    let active = true;
    let url = '';

    async function load() {
      if (!accessToken || !driveFileId) {
        setLoading(false);
        setError(true);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const blob = await getPhotoBlob(accessToken, driveFileId);
        if (active) {
          url = URL.createObjectURL(blob);
          setSrc(url);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load cloud photo blob:", err);
        if (err instanceof Error && err.message.includes('401')) {
          clearGoogleToken();
        }
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [driveFileId, accessToken]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-900 border border-slate-800 text-slate-500 p-2 text-center text-xs ${className}`}>
        <AlertCircle className="w-4 h-4 text-red-500" />
      </div>
    );
  }

  if (loading) {
    return <div className={`bg-slate-900 animate-pulse ${className}`} />;
  }

  return (
    <img
      src={src}
      className={className}
      alt={alt}
      loading="lazy"
    />
  );
}

// ---- Cloud Event View ----

interface CloudEventViewProps {
  eventId: string;
  onBack: () => void;
}

function CloudEventView({ eventId, onBack }: CloudEventViewProps) {
  const { googleAccessToken, signIn } = useAuth();
  const { t, isRtl, language } = useTranslation();
  const [event, setEvent] = useState<CloudEvent | null>(null);
  const [photos, setPhotos] = useState<CloudPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);

  const {
    isScanning,
    isPaused,
    scannedCount,
    totalToScan,
    etaSeconds,
    activeScanningEventId,
    startCloudScanning,
    togglePause,
  } = useScanner();

  const isThisEventScanning = activeScanningEventId === eventId;

  const loadEventDetails = async () => {
    setLoading(true);
    try {
      const evData = await getCloudEvent(eventId);
      if (evData) {
        setEvent(evData);
        if (evData.status === 'ready') {
          const phData = await getCloudPhotos(eventId);
          setPhotos(phData);
        }
      }
    } catch (err) {
      console.error('Failed to load cloud event details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  useEffect(() => {
    if (!isScanning && event?.status === 'scanning') {
      loadEventDetails();
    }
  }, [isScanning, event?.status]);

  const handleStartScan = async () => {
    if (!googleAccessToken || !event) return;
    try {
      await updateCloudEvent(eventId, { status: 'scanning' });
      setEvent(prev => prev ? { ...prev, status: 'scanning' } : null);

      let photosToScan: CloudPhoto[] = [];
      const existingPhotos = await getCloudPhotos(eventId);
      
      if (existingPhotos.length > 0) {
        photosToScan = existingPhotos;
      } else if (event.driveFolderId && event.driveFolderId !== 'selected_files') {
        const driveFiles = await listPhotosInFolder(googleAccessToken, event.driveFolderId);
        if (driveFiles.length > 0) {
          const basePhotos = driveFiles.map(file => ({
            driveFileId: file.id,
            fileName: file.name,
            width: 0,
            height: 0,
            processed: false
          }));
          const photoIds = await addCloudPhotosBatch(eventId, basePhotos);
          photosToScan = basePhotos.map((photo, index) => ({
            ...photo,
            id: photoIds[index]
          }));
        }
      }

      if (photosToScan.length === 0) {
        alert(language === 'he' ? 'לא נמצאו תמונות לסריקה.' : 'No photos found to scan.');
        await updateCloudEvent(eventId, { status: 'pending' });
        setEvent(prev => prev ? { ...prev, status: 'pending' } : null);
        return;
      }

      startCloudScanning(eventId, photosToScan, googleAccessToken);
    } catch (err) {
      console.error('Failed to start scanning:', err);
      alert((language === 'he' ? 'שגיאה בהתחלת הסריקה: ' : 'Error starting scan: ') + (err as Error).message);
      await updateCloudEvent(eventId, { status: 'pending' });
      setEvent(prev => prev ? { ...prev, status: 'pending' } : null);
    }
  };

  const handleCopyLink = async () => {
    if (!event) return;
    const link = `${window.location.origin}/event/${event.shareCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('העתק קישור:', link);
    }
  };

  const formatETA = (seconds: number | null) => {
    if (seconds === null) return 'מחשב זמן נותר...';
    if (seconds === 0) return 'מסתיים כעת...';
    if (seconds < 60) return `זמן נותר מוערך: כ-${seconds} שניות`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 65;
    return `זמן נותר מוערך: כ-${mins} דקות ו-${secs} שניות`;
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center items-center flex-grow text-start animate-pulse" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
          <span className="text-slate-500 dark:text-slate-400">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 flex flex-col items-center gap-4 flex-grow text-center" dir={isRtl ? 'rtl' : 'ltr'}>
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h3 className="text-xl font-bold m-0">{language === 'he' ? 'אירוע לא נמצא' : 'Event not found'}</h3>
        <button onClick={onBack} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all cursor-pointer">
          {t('eventView.backToDashboard')}
        </button>
      </div>
    );
  }

  const shareLink = `${window.location.origin}/event/${event.shareCode}`;

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-8 flex-grow flex flex-col gap-6 text-start transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer shadow-sm"
            title={t('eventView.backToDashboard')}
          >
            {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div className="flex flex-col text-start">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 m-0 leading-tight">
              {event.name}
            </h2>
            <p className="text-slate-500 text-sm m-0 mt-1">
              {language === 'he' ? `אירוע בענן | תיקייה: ${event.driveFolderName}` : `Cloud Event | Folder: ${event.driveFolderName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadEventDetails}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 transition-all cursor-pointer"
            title={language === 'he' ? 'רענן נתונים' : 'Refresh data'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {event.status === 'pending' && !isThisEventScanning && (
        <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-16 text-center flex flex-col items-center justify-center gap-6 bg-white/50 dark:bg-slate-900/10 flex-grow py-24 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <FolderOpen className="w-8 h-8" />
          </div>
          <div className="max-w-md">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 m-0">{language === 'he' ? 'האירוע מוכן לסריקה' : 'Event ready to scan'}</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-relaxed m-0">
              {t('eventView.localProcessingNotice')}
            </p>
          </div>
          <button
            onClick={handleStartScan}
            disabled={!googleAccessToken}
            className="px-8 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {t('eventView.startAIScan')}
          </button>
          {!googleAccessToken && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-red-500 text-xs m-0">יש להתחבר מחדש עם חשבון Google כדי לאפשר גישה לתיקייה.</p>
              <button
                onClick={signIn}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
              >
                {language === 'he' ? 'התחבר לחשבון Google' : 'Connect Google Account'}
              </button>
            </div>
          )}
        </div>
      )}

      {(event.status === 'scanning' || isThisEventScanning) && (
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 flex flex-col gap-6 shadow-xl max-w-2xl mx-auto w-full my-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm border-b border-slate-100 dark:border-slate-800/80 pb-5">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
              <span className="font-bold text-slate-800 dark:text-slate-200 text-base">{t('eventView.scanningPhotos')}</span>
            </div>
            <div className="flex items-center gap-3.5">
              <button
                onClick={togglePause}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                  isPaused
                    ? 'bg-amber-100 dark:bg-amber-500 text-amber-900 dark:text-slate-950 border border-amber-200 dark:border-transparent'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <div className="text-xs bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {isPaused ? t('dashboard.statusPaused') : formatETA(etaSeconds)}
              </div>
              <div className="font-mono bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs">
                {scannedCount} / {totalToScan || event.photoCount}
              </div>
            </div>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-slate-700">
            <div
              className="bg-amber-500 h-3 rounded-full transition-all duration-300 ease-out relative"
              style={{
                width: `${
                  (totalToScan || event.photoCount) > 0
                    ? (scannedCount / (totalToScan || event.photoCount)) * 100
                    : 0
                }%`,
              }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
            </div>
          </div>

          <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed text-center m-0">
            {language === 'he' ? 'אנא השאר את הדפדפן פתוח במהלך הסריקה. המערכת מעבדת את התמונות אחת אחרי השנייה. התמונות אינן מועלות לשרת, העיבוד נעשה כולו במכשיר שלך!' : 'Please keep the browser window open during scanning. The system is processing photos one by one. Photos are not uploaded to servers, the processing happens entirely on your device!'}
          </p>
        </div>
      )}

      {event.status === 'ready' && !isThisEventScanning && (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex flex-col gap-2">
                <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider m-0">{language === 'he' ? 'נתוני אירוע' : 'Event Data'}</h4>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-slate-800 dark:text-white">{event.photoCount}</span>
                  <span className="text-slate-500 text-sm">{language === 'he' ? 'תמונות נסרקו' : 'Photos Scanned'}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-amber-500">{event.faceCount}</span>
                  <span className="text-slate-500 text-sm">{language === 'he' ? 'פנים זוהו' : 'Faces Detected'}</span>
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-6 flex items-center justify-between text-xs text-slate-500">
                <span>{language === 'he' ? `תיקייה: ${event.driveFolderName}` : `Folder: ${event.driveFolderName}`}</span>
              </div>
            </div>

            <div className="md:col-span-2 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between text-start">
              <div className="flex flex-col gap-2 text-start">
                <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider m-0">{t('eventView.sharingWithGuests')}</h4>
                <p className="text-slate-500 text-xs mt-1 m-0">
                  {t('eventView.sharingDesc')}
                </p>

                <div className="flex gap-2 mt-4">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    className="flex-grow px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm font-mono focus:outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-5 py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm shadow-sm flex items-center gap-2 hover:bg-amber-400 transition-colors cursor-pointer active:scale-95"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? t('common.copied') : t('common.copy')}</span>
                  </button>
                  <button
                    onClick={() => setShowQr(true)}
                    className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title={language === 'he' ? 'הצג QR' : 'Show QR'}
                  >
                    <QrCode className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-6 flex items-center gap-2">
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-amber-500 hover:underline font-bold"
                >
                  {t('eventView.openGuestPage')} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 text-start">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 m-0">{language === 'he' ? 'גלריית תמונות אירוע' : 'Event Photo Gallery'}</h3>
            {!googleAccessToken ? (
              <div className="text-center py-12 px-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center gap-4 bg-slate-50 dark:bg-slate-900/10">
                <AlertCircle className="w-8 h-8 text-amber-500 animate-pulse" />
                <p className="text-slate-650 dark:text-slate-400 text-sm max-w-sm m-0 leading-relaxed text-center">
                  {language === 'he'
                    ? 'פג תוקף החיבור לחשבון Google. יש להתחבר מחדש כדי לצפות בתמונות שבתיקייה.'
                    : 'Google account connection expired. Please reconnect to view the folder photos.'}
                </p>
                <button
                  onClick={signIn}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-sm shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  {language === 'he' ? 'התחבר לחשבון Google' : 'Connect Google Account'}
                </button>
              </div>
            ) : photos.length === 0 ? (
              <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {photos.slice(0, visibleCount).map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-slate-100 dark:bg-slate-900/50"
                  >
                    <CloudPhotoImage
                      driveFileId={photo.driveFileId}
                      accessToken={googleAccessToken || ''}
                      alt={photo.fileName}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            )}
            {photos.length > 24 && (
              <div className="flex flex-col items-center gap-3 mt-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
                <p className="text-slate-500 dark:text-slate-400 text-xs text-center m-0">
                  {language === 'he'
                    ? `מציג ${Math.min(visibleCount, photos.length)} תמונות מתוך ${photos.length}.`
                    : `Showing ${Math.min(visibleCount, photos.length)} photos out of ${photos.length}.`}
                </p>
                <div className="flex items-center gap-3">
                  {visibleCount < photos.length && (
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 24)}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs transition-all cursor-pointer active:scale-95"
                    >
                      {language === 'he' ? 'הצג עוד' : 'Show More'}
                    </button>
                  )}
                  {visibleCount < photos.length && (
                    <button
                      onClick={() => setVisibleCount(photos.length)}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      {language === 'he' ? 'הצג הכל' : 'Show All'}
                    </button>
                  )}
                  {visibleCount > 24 && (
                    <button
                      onClick={() => setVisibleCount(24)}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs transition-all cursor-pointer active:scale-95"
                    >
                      {language === 'he' ? 'הצג פחות' : 'Show Less'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showQr && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowQr(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 m-0">{event.name}</h3>
            <div className="bg-white p-4 rounded-2xl shadow-inner">
              <QRCodeSVG
                value={shareLink}
                size={220}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center m-0">{language === 'he' ? 'האורחים יכולים לסרוק את הקישור כדי להעלות סלפי' : 'Guests can scan the link to upload a selfie'}</p>
            <button
              onClick={() => setShowQr(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm transition-colors cursor-pointer"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Local Event View ----

export function EventView({ eventId, onBack }: EventViewProps) {
  if (typeof eventId === 'string') {
    return <CloudEventView eventId={eventId} onBack={onBack} />;
  }
  const { t, isRtl, language } = useTranslation();
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
        alert(language === 'he' ? 'לא ניתן לקבל גישה לתיקייה ללא אישור דפדפן.' : 'Cannot access folder without browser permission.');
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
        alert(language === 'he' ? 'לא נמצאו תמונות תואמות (JPG, PNG, WEBP) בתיקייה שנבחרה.' : 'No matching images (JPG, PNG, WEBP) found in selected folder.');
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
        alert((language === 'he' ? 'שגיאה בבחירת התיקייה: ' : 'Error selecting folder: ') + err.message);
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
        filesToProcess.push({
          fallbackBlob: file,
          name: file.name,
        });
      }
    }

    if (filesToProcess.length === 0) {
      alert(language === 'he' ? 'לא נמצאו תמונות בפורמט תואם.' : 'No photos found in compatible format.');
      return;
    }

    await startScanning(eventId, filesToProcess);
  };

  const handleRenameCluster = async (clusterId: string, oldName: string, newName: string) => {
    const val = newName.trim();
    if (!val || val === oldName) return;

    const existing = clusters.find(c => c.name.toLowerCase() === val.toLowerCase() && c.id !== clusterId);
    if (existing) {
      const wantMerge = confirm(t('eventView.mergeConfirm', { val, oldName }));
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
    const displayName = cluster?.name || 'Guest';
    if (!confirm(t('eventView.removePhotoConfirm', { name: displayName }))) {
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
      alert(language === 'he' ? 'שגיאה בהסרת התמונה.' : 'Error removing photo.');
    }
  };

  const handleManualMergeSelected = async () => {
    if (selectedForMerge.size < 2) return;

    const ids = Array.from(selectedForMerge);
    const firstCluster = clusters.find(c => c.id === ids[0]);
    const defaultName = firstCluster?.name || '';

    const newName = prompt(
      language === 'he' 
        ? `אתה עומד למזג ${ids.length} דמויות.\nהכנס שם לדמות המאוחדת:` 
        : `You are merging ${ids.length} guests.\nEnter name for the merged guest:`, 
      defaultName
    );

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
      alert(language === 'he' ? 'שגיאה במיזוג הדמויות.' : 'Error merging guests.');
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
          name: language === 'he' ? `דמות ${count}` : `Guest ${count}`,
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
            if (dist > 0.85 && dist < 1.35) {
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
        alert(language === 'he' ? 'לא ניתן היה לקרוא את קובצי התמונות לייצוא.' : 'Could not read any photo files for export.');
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedCluster.name || (language === 'he' ? 'דמות_ללא_שם' : 'unnamed_guest')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate ZIP', err);
      alert(language === 'he' ? 'שגיאה במהלך יצירת קובץ ה-ZIP לייצוא.' : 'Error generating ZIP file for export.');
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
    if (seconds === null) return language === 'he' ? 'מחשב זמן נותר...' : 'Calculating time remaining...';
    if (seconds === 0) return language === 'he' ? 'מסתיים כעת...' : 'Finishing...';
    if (seconds < 60) return language === 'he' ? `זמן נותר מוערך: כ-${seconds} שניות` : `Estimated time remaining: about ${seconds} seconds`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return language === 'he' ? `זמן נותר מוערך: כ-${mins} דקות ו-${secs} שניות` : `Estimated time remaining: about ${mins}m ${secs}s`;
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-8 flex-grow flex flex-col gap-6 text-start transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="flex items-center gap-4 text-start">
          <button
            onClick={handleMainBackClick}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer shadow-sm"
            title={selectedClusterId ? t('eventView.backToGallery') : t('eventView.backToDashboard')}
          >
            {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div className="flex flex-col text-start">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 m-0 leading-tight">
              {event?.name || t('common.loading')}
            </h2>
            <p className="text-slate-500 text-sm m-0 mt-1">
              {t('eventView.photosCount', { count: photos.length })} | {t('eventView.recognizedGuestsCount', { count: clusters.length })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {event?.folderPath && !permissionGranted && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs px-4 py-2.5 rounded-xl shadow-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{language === 'he' ? 'נדרש אישור גישה לתיקיית המקור' : 'Folder access authorization required'}</span>
              <button
                onClick={handleRequestPermission}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                {language === 'he' ? 'אשר גישה' : 'Authorize'}
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
              <FolderOpen className="w-4 h-4" />
              <span>{isThisEventScanning ? t('common.loading') : (language === 'he' ? 'בחירת תיקיית תמונות' : 'Select Folder')}</span>
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
        <div className="bg-white/50 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-800 px-6 py-6 mb-6 flex flex-col gap-4 shadow-sm text-start">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-spin" />
              <span className="font-bold text-slate-800 dark:text-slate-200">{t('eventView.scanningPhotos')}</span>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <button
                onClick={() => togglePause()}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                  isPaused ? 'bg-amber-100 dark:bg-amber-500 text-amber-900 dark:text-slate-950 border border-amber-200 dark:border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
                title={isPaused ? t('eventView.isResumed') : t('eventView.isPaused')}
              >
                {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </button>
              <div className="flex items-center gap-1.5 text-xs bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-lg">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{isPaused ? t('dashboard.statusPaused') : formatETA(etaSeconds)}</span>
              </div>
              <span className="font-mono bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md">
                {scannedCount} / {totalToScan}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-300 dark:border-slate-700">
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
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-5 flex items-start justify-between gap-4 text-start shadow-sm animate-fade-in">
          <div className="flex items-start gap-3.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-base m-0">{t('common.success')}</h4>
              <p className="text-emerald-700/80 dark:text-emerald-400/80 text-sm mt-1 m-0">
                {t('eventView.scanComplete', { count: lastScannedCount })}
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
            {t('eventView.noPhotosDesc')}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {!isScanning && !showSuccessBanner && !selectedClusterId && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap bg-white dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 self-start gap-1 shadow-sm">
                <button
                  onClick={() => setActiveTab('faces')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'faces' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2"><Users className="w-4 h-4" /><span>{t('eventView.guestsDetected', { count: clusters.length })}</span></div>
                </button>
                <button
                  onClick={() => setActiveTab('merges')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'merges' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span>{language === 'he' ? `הצעות למיזוג (${mergeSuggestions.length})` : `Merge Suggestions (${mergeSuggestions.length})`}</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('unidentified')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'unidentified' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2"><HelpCircle className="w-4 h-4" /><span>{t('eventView.unidentifiedTab')} ({unidentifiedFaces.length})</span></div>
                </button>
                <button
                  onClick={() => setActiveTab('photos')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    activeTab === 'photos' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    <span>{language === 'he' ? `כל התמונות (${photos.length})` : `All Photos (${photos.length})`}</span>
                  </div>
                </button>
              </div>

              {activeTab === 'faces' && (
                <div className="flex items-center gap-3 w-full lg:w-auto">
                  <div className="relative w-full lg:w-72">
                    <Search className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-3.5 w-4 h-4 text-slate-400 dark:text-slate-500`} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('eventView.searchPlaceholder')}
                      className={`w-full ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-400 dark:focus:border-amber-500 focus:outline-none text-slate-800 dark:text-slate-200 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-650 transition-all shadow-sm`}
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
                    <span>{t('eventView.mergeGuestsBtn')}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {selectedClusterId && selectedCluster && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm text-start">
              <div className="flex items-center gap-4 text-start">
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
                    className="text-start text-xl font-bold bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-amber-400 dark:focus:border-amber-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-700 focus:outline-none pb-1 transition-all rounded-md max-w-[200px]"
                  />
                  <p className="text-slate-500 dark:text-slate-400 text-xs m-0">
                    {language === 'he' ? `סה"כ ${selectedClusterPhotoIds.length} תמונות שבהן מופיעה דמות זו` : `Total ${selectedClusterPhotoIds.length} photos containing this face`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleExportPersonPhotos}
                disabled={isExportingZip}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-300 dark:bg-amber-50 dark:hover:bg-amber-400 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow active:scale-95 disabled:pointer-events-none self-start sm:self-auto"
              >
                {isExportingZip ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>{language === 'he' ? 'מייצא...' : 'Exporting...'}</span></> : <><Download className="w-3.5 h-3.5" /><span>{language === 'he' ? 'ייצוא ל-ZIP' : 'Export to ZIP'}</span></>}
              </button>
            </div>
          )}

          {selectedClusterId ? (
            selectedClusterPhotoIds.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">{language === 'he' ? 'אין תמונות משויכות לדמות זו.' : 'No photos associated with this face.'}</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {selectedClusterPhotoIds.map(pId => {
                  const faceInPhoto = selectedClusterFaces.find(f => f.photoId === pId);
                  return (
                    <div key={pId} className="group relative aspect-square border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-all">
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveFaceFromPerson(pId, selectedClusterId); }} className={`absolute top-3 ${isRtl ? 'left-3' : 'right-3'} p-1.5 rounded-lg bg-red-500/90 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer`}>
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
              <div className="text-center py-20 text-slate-500 dark:text-slate-400">{t('eventView.noGuests')}</div>
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
                          <img src={firstFace.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" />
                        ) : (
                          <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                          </div>
                        )}
                        <span className={`absolute bottom-2 ${isRtl ? 'right-2' : 'left-2'} bg-white/90 dark:bg-slate-950/80 text-amber-700 dark:text-amber-400 text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-sm dark:shadow`}>{clusterFaces.length} {language === 'he' ? 'תמונות' : 'photos'}</span>
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
                {language === 'he' ? 'אין הצעות למאגרים דומים למיזוג כרגע.' : 'No merge suggestions available at this time.'}
              </div>
            ) : (
              <div className="flex flex-col gap-6 max-w-2xl mx-auto text-start">
                <div className="grid grid-cols-1 gap-8">
                  {mergeSuggestions.slice(0, 15).map((sug, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 flex flex-col gap-6 shadow-xl">
                      <div className="flex items-center justify-center gap-10">
                        <div className="flex flex-col items-center gap-3.5"><div onClick={() => setLightboxPhotoId(Number(sug.photoIdA))} className="w-32 h-32 rounded-2xl overflow-hidden ring-4 ring-white dark:ring-slate-800 shadow-md cursor-pointer"><img src={sug.thumbA} className="w-full h-full object-cover" alt="" /></div><span className="font-extrabold text-base text-slate-800 dark:text-slate-200">{sug.clusterA.name}</span></div>
                        <div className="flex flex-col items-center gap-1.5"><Sparkles className="w-6 h-6 text-amber-500 dark:text-amber-400" /><span className="text-sm bg-amber-100 dark:bg-amber-500/20 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-300 font-bold shadow-sm">{Math.max(0, Math.min(100, Math.round((1.35 - sug.distance) / 0.5 * 100)))}%</span></div>
                        <div className="flex flex-col items-center gap-3.5"><div onClick={() => setLightboxPhotoId(Number(sug.photoIdB))} className="w-32 h-32 rounded-2xl overflow-hidden ring-4 ring-white dark:ring-slate-800 shadow-md cursor-pointer"><img src={sug.thumbB} className="w-full h-full object-cover" alt="" /></div><span className="font-extrabold text-base text-slate-800 dark:text-slate-200">{sug.clusterB.name}</span></div>
                      </div>
                      <div className="flex gap-4 mt-2 border-t border-slate-100 dark:border-slate-800 pt-5">
                        <button onClick={() => handleMergeSuggestion(sug.clusterA.id, sug.clusterB.id, sug.clusterA.name, sug.clusterB.name)} className="flex-1 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-900 dark:text-slate-950 border border-amber-200 dark:border-transparent text-xs font-extrabold transition-all cursor-pointer shadow-sm">{t('eventView.mergeGuestsBtn')}</button>
                        <button onClick={() => handleDeclineSuggestion(sug.clusterA.id, sug.clusterB.id)} className="flex-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold transition-all cursor-pointer shadow-sm">{language === 'he' ? 'התעלם' : 'Ignore'}</button>
                      </div>
                    </div>
                  ))}
                </div>
                {mergeSuggestions.length > 15 && (
                  <div className="mt-4 p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 flex items-center justify-between gap-4 shadow-sm text-start" dir={isRtl ? 'rtl' : 'ltr'}>
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="text-start">
                        <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm m-0">{language === 'he' ? 'נמצאו הצעות מיזוג נוספות' : 'Additional merge suggestions found'}</h5>
                        <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5 m-0">
                          {language === 'he' ? `מציג את 15 ההצעות הדומות ביותר. סה"כ קיימות ${mergeSuggestions.length} הצעות מיזוג.` : `Showing 15 most similar suggestions. Total of ${mergeSuggestions.length} suggestions.`}
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
                    <div className="relative w-28 h-28 rounded-xl overflow-hidden ring-2 ring-slate-800"><img src={face.thumbnail} className="w-full h-full object-cover" alt="" /></div>
                    <div className="w-full flex flex-col gap-1.5 text-start">
                      <span className={`text-[10px] text-slate-500 font-semibold ${isRtl ? 'pr-1' : 'pl-1'}`}>{t('eventView.belongsToGuest')}</span>
                      <select onChange={(e) => face.id !== undefined && handleAssignFace(face.id, e.target.value)} defaultValue="" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer">
                        <option value="" disabled>{language === 'he' ? 'בחר אדם...' : 'Select person...'}</option>
                        {clusters.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        <option value="new" className="text-amber-400 font-semibold">{language === 'he' ? '+ פרופיל חדש' : '+ New Profile'}</option>
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
                      ? 'border-slate-200 dark:border-slate-850 cursor-pointer hover:border-amber-500/50' 
                      : 'border-slate-200/40 dark:border-slate-900 opacity-60 cursor-not-allowed'
                  }`}
                >
                  {photo.id && <PhotoImage photoId={photo.id} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                  
                  <div className={`absolute top-3.5 ${isRtl ? 'right-3.5' : 'left-3.5'} p-1 rounded bg-slate-950/80 border border-slate-800 z-10`}>
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
            className="absolute top-4 left-4 p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-6 h-6" />
          </button>

          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-4 relative">
            <div className="relative inline-block max-w-full max-h-[80vh] rounded-2xl overflow-hidden ring-1 ring-slate-800 shadow-2xl">
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
                  <div className={`absolute bottom-full ${isRtl ? 'right-0' : 'left-0'} mb-1.5 bg-amber-500/90 text-slate-950 text-[10px] font-semibold px-2 py-0.5 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/face:opacity-100 transition-opacity pointer-events-none`}>
                    {clusterNamesMap[face.clusterId || ''] || t('eventView.unknownGuest')}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className="text-slate-300 font-semibold text-sm m-0">{lightboxPhoto.fileName}</p>
              {lightboxFaces.length > 0 ? (
                <p className="text-amber-400 text-xs mt-1 m-0">
                  {language === 'he' ? `זוהו ${lightboxFaces.length} דמויות בתמונה זו (רחף מעל הריבועים כדי לראות שמות)` : `Detected ${lightboxFaces.length} characters in this photo (hover to see names)`}
                </p>
              ) : (
                <p className="text-slate-500 text-xs mt-1 m-0">{language === 'he' ? 'לא זוהו דמויות בתמונה זו' : 'No characters detected in this photo'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Merge Mode */}
      {isMergeMode && selectedForMerge.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 p-4 rounded-3xl shadow-2xl flex items-center gap-6">
          <div className="text-slate-800 dark:text-slate-200 font-bold">
            {t('eventView.selectedForMerge', { count: selectedForMerge.size })}
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
