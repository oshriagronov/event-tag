import { useState, useEffect } from 'react';
import { useScanner } from '../contexts/ScannerContext';
import { 
  ArrowRight, ArrowLeft, FolderOpen, Loader2, Check, AlertCircle,
  Pause, Play, Copy, QrCode, ExternalLink, RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getCloudEvent,
  getCloudPhotos,
  updateCloudEvent,
  addCloudPhotosBatch,
  resetCloudEventForScanning,
  type CloudEvent,
  type CloudPhoto,
} from '../services/firestore';
import { listPhotosInFolder, getPhotoBlob, checkTokenValidity } from '../services/googleDrive';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '../services/translations';

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
      } catch (err: any) {
        console.error("Failed to load cloud photo blob:", err);
        const errStr = err instanceof Error ? err.message : String(err);
        if (errStr.includes('401') || errStr.includes('404')) {
          checkTokenValidity(accessToken).then((isValid) => {
            if (!isValid) {
              clearGoogleToken();
            }
          }).catch(() => {});
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

interface EventViewProps {
  eventId: string;
  onBack: () => void;
}

export function EventView({ eventId, onBack }: EventViewProps) {
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
    scanError,
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

  const handleRescanAll = async () => {
    if (!googleAccessToken || !event) return;
    const confirmMessage = language === 'he'
      ? 'האם אתה בטוח שברצונך למחוק את תוצאות הזיהוי הקודמות ולסרוק מחדש את כל התמונות?'
      : 'Are you sure you want to clear previous face recognition results and rescan all photos?';
    if (!confirm(confirmMessage)) return;

    try {
      setLoading(true);
      
      // 1. Reset event state in DB
      await resetCloudEventForScanning(eventId);
      
      // 2. Fetch the photos again and reset local status
      const existingPhotos = await getCloudPhotos(eventId);
      const resetPhotos = existingPhotos.map(p => ({
        ...p,
        processed: false,
        width: 0,
        height: 0
      }));
      
      setPhotos(resetPhotos);
      setEvent(prev => prev ? {
        ...prev,
        status: 'scanning',
        photoCount: 0,
        faceCount: 0
      } : null);
      
      setLoading(false);
      
      // 3. Start scanning
      startCloudScanning(eventId, resetPhotos, googleAccessToken);
    } catch (err) {
      console.error('Failed to reset and rescan:', err);
      alert((language === 'he' ? 'שגיאה באתחול הסריקה מחדש: ' : 'Error resetting and rescanning: ') + (err as Error).message);
      setLoading(false);
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
    const secs = seconds % 60;
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
          {scanError === 'auth_expired' && (
            <div className="flex flex-col items-center gap-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center mt-2">
              <AlertCircle className="w-8 h-8 text-red-550" />
              <div className="flex flex-col gap-1">
                <h4 className="font-bold text-red-500 text-sm">חיבור ה-Google פג תוקף</h4>
                <p className="text-slate-400 text-xs">כדי להמשיך בסריקה, יש להתחבר מחדש לחשבון ה-Google שלך.</p>
              </div>
              <button
                onClick={signIn}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
              >
                התחבר מחדש ל-Google
              </button>
            </div>
          )}
          {scanError === 'network_error' && (
            <div className="flex flex-col items-center gap-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center mt-2">
              <AlertCircle className="w-8 h-8 text-red-550" />
              <div className="flex flex-col gap-1">
                <h4 className="font-bold text-red-500 text-sm">שגיאת תקשורת או חיבור איטי</h4>
                <p className="text-slate-400 text-xs">אנא ודא שחיבור האינטרנט שלך יציב ולחץ על כפתור הנגן למעלה כדי להמשיך בסריקה.</p>
              </div>
            </div>
          )}
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
              {photos.some(p => !p.processed) && (
                <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-800 flex flex-col gap-2">
                  <p className="text-[11px] text-red-500 m-0 leading-normal">
                    {language === 'he'
                      ? `שים לב: רק ${photos.filter(p => p.processed).length} מתוך ${photos.length} תמונות נסרקו.`
                      : `Note: Only ${photos.filter(p => p.processed).length} out of ${photos.length} photos scanned.`}
                  </p>
                  <button
                    onClick={handleStartScan}
                    disabled={!googleAccessToken}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{language === 'he' ? 'המשך סריקה' : 'Resume Scan'}</span>
                  </button>
                </div>
              )}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-6 flex items-center justify-between text-xs text-slate-550">
                <span>{language === 'he' ? `תיקייה: ${event.driveFolderName}` : `Folder: ${event.driveFolderName}`}</span>
                <button
                  onClick={handleRescanAll}
                  disabled={!googleAccessToken}
                  className="flex items-center gap-1 text-slate-550 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-500 transition-colors font-bold cursor-pointer disabled:opacity-50"
                  title={language === 'he' ? 'איפוס וסריקה מחדש של כל התמונות' : 'Reset and rescan all photos'}
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-none" />
                  <span>{language === 'he' ? 'סרוק מחדש' : 'Rescan'}</span>
                </button>
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
                    className="flex-grow px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 text-sm font-mono focus:outline-none"
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
