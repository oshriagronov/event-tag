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
      <div className={`flex flex-col items-center justify-center bg-surface-container-low border border-surface-border text-sage-muted p-2 text-center text-xs ${className}`}>
        <AlertCircle className="w-4 h-4 text-red-400" />
      </div>
    );
  }

  if (loading) {
    return <div className={`bg-surface-container-low animate-pulse ${className}`} />;
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
      await resetCloudEventForScanning(eventId);
      
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
      prompt(language === 'he' ? 'העתק קישור:' : 'Copy link:', link);
    }
  };

  const formatETA = (seconds: number | null) => {
    if (seconds === null) return language === 'he' ? 'מחשב זמן נותר...' : 'Calculating...';
    if (seconds === 0) return language === 'he' ? 'מסתיים כעת...' : 'Finishing...';
    if (seconds < 60) return language === 'he' ? `זמן נותר: כ-${seconds} שניות` : `Remaining: ~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return language === 'he' ? `זמן נותר: כ-${mins} דקות ו-${secs} שניות` : `Remaining: ~${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div className="max-w-6xl w-full mx-auto px-6 py-16 flex justify-center items-center flex-grow text-start" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex flex-col items-center gap-4 py-20">
          <Loader2 className="w-8 h-8 animate-spin text-copper-accent" />
          <span className="text-sage-muted font-body-md text-sm">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-6xl w-full mx-auto px-6 py-16 flex flex-col items-center gap-6 flex-grow text-center" dir={isRtl ? 'rtl' : 'ltr'}>
        <AlertCircle className="w-12 h-12 text-red-400" />
        <h3 className="font-display-lg text-2xl text-on-background m-0">{language === 'he' ? 'האירוע לא נמצא' : 'Event not found'}</h3>
        <button 
          onClick={onBack} 
          className="px-6 py-3 bg-surface-container hover:bg-surface-container-high border border-surface-border text-on-background rounded font-bold text-sm transition-all cursor-pointer"
        >
          {t('eventView.backToDashboard')}
        </button>
      </div>
    );
  }

  const shareLink = `${window.location.origin}/event/${event.shareCode}`;

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-10 flex-grow flex flex-col gap-8 text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border/30 pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded bg-surface-container border border-surface-border hover:bg-surface-container-high hover:border-copper-accent/40 text-sage-muted hover:text-on-background transition-all cursor-pointer"
            title={t('eventView.backToDashboard')}
          >
            {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          </button>
          <div className="flex flex-col text-start">
            <h2 className="font-display-lg text-2xl md:text-3xl text-on-background m-0 leading-tight">
              {event.name}
            </h2>
            <p className="font-body-md text-sage-muted text-xs md:text-sm m-0 mt-1">
              {language === 'he' ? `אירוע בענן | תיקייה ב-Drive: ${event.driveFolderName}` : `Cloud Event | Drive Folder: ${event.driveFolderName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadEventDetails}
            className="p-2.5 rounded bg-surface-container border border-surface-border hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-all cursor-pointer"
            title={language === 'he' ? 'רענן נתונים' : 'Refresh data'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pending Scan View */}
      {event.status === 'pending' && !isThisEventScanning && (
        <div className="border border-dashed border-surface-border rounded-xl p-16 text-center flex flex-col items-center justify-center gap-6 bg-surface-container/20 py-24">
          <div className="w-14 h-14 rounded-xl bg-surface-container border border-surface-border flex items-center justify-center text-copper-accent shadow">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div className="max-w-md">
            <h3 className="font-title-md text-lg font-bold text-on-background m-0">{language === 'he' ? 'האירוע מוכן לסריקה' : 'Event Ready to Scan'}</h3>
            <p className="font-body-md text-sage-muted text-sm mt-2 leading-relaxed m-0">
              {t('eventView.localProcessingNotice')}
            </p>
          </div>
          <button
            onClick={handleStartScan}
            disabled={!googleAccessToken}
            className="px-8 py-3.5 rounded bg-deep-forest hover:bg-primary text-background font-bold text-sm shadow transition-all cursor-pointer disabled:opacity-50 border-none"
          >
            {t('eventView.startAIScan')}
          </button>
          {!googleAccessToken && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-red-400 text-xs m-0 font-bold">{language === 'he' ? 'יש להתחבר מחדש עם חשבון Google כדי לאפשר גישה לתיקייה.' : 'Reconnect to Google to allow folders authorization.'}</p>
              <button
                onClick={signIn}
                className="px-5 py-2.5 rounded bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs shadow transition-all cursor-pointer"
              >
                {language === 'he' ? 'התחבר לחשבון Google' : 'Connect Google Account'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active Scanning Progress Panel */}
      {(event.status === 'scanning' || isThisEventScanning) && (
        <div className="bg-surface-container border border-surface-border rounded-xl p-8 flex flex-col gap-6 shadow-2xl max-w-xl mx-auto w-full my-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm border-b border-surface-border pb-5">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-copper-accent animate-spin" />
              <span className="font-bold text-on-background text-base">{t('eventView.scanningPhotos')}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={togglePause}
                className={`w-9 h-9 rounded flex items-center justify-center transition-all cursor-pointer border ${
                  isPaused
                    ? 'border-copper-accent text-copper-accent bg-copper-accent/10'
                    : 'border-surface-border text-sage-muted hover:bg-surface-container-high hover:text-on-background bg-surface-container-low'
                }`}
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <div className="text-xs bg-surface-container-low px-3 py-1.5 rounded border border-surface-border text-sage-muted">
                {isPaused ? t('dashboard.statusPaused') : formatETA(etaSeconds)}
              </div>
              <div className="font-mono bg-surface-container-low px-2.5 py-1 rounded border border-surface-border text-xs text-on-background font-bold">
                {scannedCount} / {totalToScan || event.photoCount}
              </div>
            </div>
          </div>

          <div className="w-full bg-surface-container-low rounded-full h-2 overflow-hidden border border-surface-border">
            <div
              className="bg-copper-accent h-2 rounded-full transition-all duration-300 ease-out relative"
              style={{
                width: `${
                  (totalToScan || event.photoCount) > 0
                    ? (scannedCount / (totalToScan || event.photoCount)) * 100
                    : 0
                }%`,
              }}
            >
              <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
            </div>
          </div>

          <p className="font-body-md text-sage-muted text-xs leading-relaxed text-center m-0">
            {language === 'he' 
              ? 'אנא השאר את הדפדפן פתוח במהלך הסריקה. המערכת מעבדת את התמונות מקומית במכשיר שלך ואינה מעלה אותן לשרת.' 
              : 'Please keep the browser open. Processing is entirely local on your device; images are not sent to any servers.'}
          </p>
          {scanError === 'auth_expired' && (
            <div className="flex flex-col items-center gap-4 bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center mt-2">
              <AlertCircle className="w-7 h-7 text-red-400" />
              <div className="flex flex-col gap-1 text-center">
                <h4 className="font-bold text-red-400 text-sm m-0">{language === 'he' ? 'חיבור ה-Google פג תוקף' : 'Google Authentication Expired'}</h4>
                <p className="text-sage-muted text-xs m-0">{language === 'he' ? 'כדי להמשיך בסריקה, יש להתחבר מחדש לחשבון ה-Google שלך.' : 'Please reconnect your Google account to proceed with scanning.'}</p>
              </div>
              <button
                onClick={signIn}
                className="px-5 py-2.5 rounded bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs shadow transition-all cursor-pointer border-none"
              >
                {language === 'he' ? 'התחבר מחדש ל-Google' : 'Reconnect Google'}
              </button>
            </div>
          )}
          {scanError === 'network_error' && (
            <div className="flex flex-col items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center mt-2">
              <AlertCircle className="w-7 h-7 text-red-400" />
              <div className="flex flex-col gap-1">
                <h4 className="font-bold text-red-400 text-sm m-0">{language === 'he' ? 'שגיאת תקשורת' : 'Network Error'}</h4>
                <p className="text-sage-muted text-xs m-0">{language === 'he' ? 'אנא ודא שחיבור האינטרנט שלך יציב ולחץ על כפתור ההמשך למעלה.' : 'Please check your connection and click the resume button to retry.'}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ready View */}
      {event.status === 'ready' && !isThisEventScanning && (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Event Stats Card */}
            <div className="bg-surface-container border border-surface-border rounded-xl p-6 shadow-sm flex flex-col justify-between text-start">
              <div className="flex flex-col gap-1.5 text-start">
                <h4 className="font-label-sm text-[10px] text-sage-muted uppercase tracking-wider m-0">{language === 'he' ? 'נתוני אירוע' : 'Event Statistics'}</h4>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="font-display-lg text-3xl text-on-background">{event.photoCount}</span>
                  <span className="text-sage-muted text-xs font-body-md">{language === 'he' ? 'תמונות נסרקו' : 'Photos Scanned'}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display-lg text-3xl text-copper-accent">{event.faceCount}</span>
                  <span className="text-sage-muted text-xs font-body-md">{language === 'he' ? 'פנים מזוהות' : 'Detected Faces'}</span>
                </div>
              </div>
              {photos.some(p => !p.processed) && (
                <div className="mt-4 pt-4 border-t border-surface-border flex flex-col gap-2">
                  <p className="text-[11px] text-red-400 m-0 leading-normal font-semibold">
                    {language === 'he'
                      ? `רק ${photos.filter(p => p.processed).length} מתוך ${photos.length} תמונות נסרקו בהצלחה.`
                      : `Only ${photos.filter(p => p.processed).length} of ${photos.length} photos were processed.`}
                  </p>
                  <button
                    onClick={handleStartScan}
                    disabled={!googleAccessToken}
                    className="w-full py-2 rounded bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs shadow flex items-center justify-center gap-1.5 cursor-pointer border-none"
                  >
                    <RefreshCw className="w-3 h-3 shrink-0" />
                    <span>{language === 'he' ? 'המשך סריקה' : 'Resume Scanning'}</span>
                  </button>
                </div>
              )}
              <div className="border-t border-surface-border pt-4 mt-6 flex items-center justify-between text-[11px] text-sage-muted">
                <span className="truncate max-w-[140px]">{language === 'he' ? `תיקייה: ${event.driveFolderName}` : `Folder: ${event.driveFolderName}`}</span>
                <button
                  onClick={handleRescanAll}
                  disabled={!googleAccessToken}
                  className="flex items-center gap-1 text-sage-muted hover:text-copper-accent transition-colors font-bold cursor-pointer bg-transparent border-none outline-none text-[11px]"
                  title={language === 'he' ? 'איפוס וסריקה מחדש של כל התמונות' : 'Reset and rescan all photos'}
                >
                  <RefreshCw className="w-3 h-3 shrink-0" />
                  <span>{language === 'he' ? 'סרוק מחדש' : 'Rescan'}</span>
                </button>
              </div>
            </div>

            {/* Sharing link card */}
            <div className="md:col-span-2 bg-surface-container border border-surface-border rounded-xl p-6 shadow-sm flex flex-col justify-between text-start">
              <div className="flex flex-col gap-2 text-start">
                <h4 className="font-label-sm text-[10px] text-sage-muted uppercase tracking-wider m-0">{t('eventView.sharingWithGuests')}</h4>
                <p className="font-body-md text-sage-muted text-xs leading-normal m-0 mt-1">
                  {t('eventView.sharingDesc')}
                </p>

                <div className="flex gap-2 mt-4">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    className="flex-grow px-4 py-3 rounded bg-surface-container-low border border-surface-border text-sage-muted text-sm font-mono focus:outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-5 py-3 rounded bg-deep-forest hover:bg-primary text-background font-bold text-sm shadow flex items-center gap-2 transition-colors cursor-pointer border-none"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? t('common.copied') : t('common.copy')}</span>
                  </button>
                  <button
                    onClick={() => setShowQr(true)}
                    className="p-3 rounded bg-surface-container-low border border-surface-border text-sage-muted hover:text-on-background transition-colors cursor-pointer"
                    title={language === 'he' ? 'הצג QR' : 'Show QR'}
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="border-t border-surface-border pt-4 mt-6 flex items-center gap-2">
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-copper-accent hover:underline font-bold no-underline uppercase tracking-wider"
                >
                  {t('eventView.openGuestPage')} <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            </div>
          </div>

          {/* Photo Gallery Grid */}
          <div className="flex flex-col gap-4 text-start">
            <h3 className="font-display-lg text-2xl text-on-background m-0">{language === 'he' ? 'גלריית תמונות' : 'Photo Gallery'}</h3>
            <div className="botanical-divider w-full" />
            
            {!googleAccessToken ? (
              <div className="text-center py-16 px-6 border border-dashed border-surface-border rounded-xl flex flex-col items-center gap-4 bg-surface-container/20">
                <AlertCircle className="w-8 h-8 text-copper-accent" />
                <p className="font-body-md text-sage-muted text-sm max-w-sm m-0 leading-relaxed text-center">
                  {language === 'he'
                    ? 'פג תוקף החיבור לחשבון Google. יש להתחבר מחדש כדי לצפות בתמונות שבתיקייה.'
                    : 'Google session expired. Re-authenticate to access drive contents.'}
                </p>
                <button
                  onClick={signIn}
                  className="px-6 py-2.5 rounded bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-sm shadow transition-all cursor-pointer border-none"
                >
                  {language === 'he' ? 'התחבר לחשבון Google' : 'Connect Google Account'}
                </button>
              </div>
            ) : photos.length === 0 ? (
              <div className="text-center py-16 text-sage-muted font-body-md">{t('common.loading')}</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {photos.slice(0, visibleCount).map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square border border-surface-border rounded overflow-hidden shadow bg-surface-container-low group"
                  >
                    <CloudPhotoImage
                      driveFileId={photo.driveFileId}
                      accessToken={googleAccessToken || ''}
                      alt={photo.fileName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            )}

            {photos.length > 24 && (
              <div className="flex flex-col items-center gap-3 mt-6 border-t border-surface-border pt-6">
                <p className="font-body-md text-sage-muted text-xs text-center m-0">
                  {language === 'he'
                    ? `מציג ${Math.min(visibleCount, photos.length)} תמונות מתוך ${photos.length}.`
                    : `Showing ${Math.min(visibleCount, photos.length)} of ${photos.length} photos.`}
                </p>
                <div className="flex items-center gap-3">
                  {visibleCount < photos.length && (
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 24)}
                      className="px-5 py-2.5 rounded bg-surface-container border border-surface-border hover:bg-surface-container-high text-on-background font-bold text-xs transition-all cursor-pointer border-none"
                    >
                      {language === 'he' ? 'הצג עוד' : 'Show More'}
                    </button>
                  )}
                  {visibleCount < photos.length && (
                    <button
                      onClick={() => setVisibleCount(photos.length)}
                      className="px-5 py-2.5 rounded bg-deep-forest hover:bg-primary text-background font-bold text-xs shadow transition-all cursor-pointer border-none"
                    >
                      {language === 'he' ? 'הצג הכל' : 'Show All'}
                    </button>
                  )}
                  {visibleCount > 24 && (
                    <button
                      onClick={() => setVisibleCount(24)}
                      className="px-5 py-2.5 rounded bg-surface-container border border-surface-border hover:bg-surface-container-high text-on-background font-bold text-xs transition-all cursor-pointer border-none"
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

      {/* QR Share Modal */}
      {showQr && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowQr(false)}>
          <div className="bg-surface-container border border-surface-border rounded-xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <h3 className="font-display-lg text-lg text-on-background m-0">{event.name}</h3>
            <div className="bg-white p-4 rounded-xl shadow-inner border border-surface-border">
              <QRCodeSVG
                value={shareLink}
                size={220}
                level="M"
                bgColor="#ffffff"
                fgColor="#111413"
              />
            </div>
            <p className="text-xs text-sage-muted text-center m-0 leading-relaxed">{language === 'he' ? 'האורחים יכולים לסרוק את הקישור כדי להעלות סלפי' : 'Guests can scan the code to load photo lookup.'}</p>
            <button
              onClick={() => setShowQr(false)}
              className="text-sage-muted hover:text-on-background text-sm transition-colors cursor-pointer border-none bg-transparent outline-none"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
