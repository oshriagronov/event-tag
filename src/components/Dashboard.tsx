import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeOwnerEvents,
  createCloudEvent,
  deleteCloudEvent,
  type CloudEvent,
} from '../services/firestore';
import { FolderPicker } from './FolderPicker';
import { QRCodeSVG } from 'qrcode.react';
import {
  FolderPlus, Calendar, Image as ImageIcon, Users, Trash2,
  ArrowLeft, LogOut, Cloud, HardDrive, Link2, QrCode,
  CheckCircle2, Loader2, Clock, Copy, Check, X,
  Plus, Sparkles, Play, Pause,
} from 'lucide-react';
import { useScanner } from '../contexts/ScannerContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../services/translations';

export function Dashboard() {
  const navigate = useNavigate();
  const { t, isRtl, language } = useTranslation();
  const { user, googleAccessToken, signOut } = useAuth();
  const {
    isScanning,
    isPaused,
    scannedCount,
    totalToScan,
    etaSeconds,
    activeScanningEventId,
    togglePause,
  } = useScanner();

  const [cloudEvents, setCloudEvents] = useState<CloudEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');

  const formatETA = (seconds: number | null) => {
    if (seconds === null) return language === 'he' ? 'מחשב זמן...' : 'Calculating time...';
    if (seconds === 0) return language === 'he' ? 'מסתיים כעת...' : 'Finishing...';
    if (seconds < 60) return language === 'he' ? `זמן נותר: כ-${seconds} שניות` : `Time remaining: about ${seconds} seconds`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return language === 'he' ? `זמן נותר: כ-${mins} דקות ו-${secs} שניות` : `Time remaining: about ${mins}m and ${secs}s`;
  };

  // Cloud event creation flow
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingFolder, setPendingFolder] = useState<{ id: string; name: string } | null>(null);

  // QR code modal
  const [qrEvent, setQrEvent] = useState<CloudEvent | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Local events (for testing mode)
  const localEvents = useLiveQuery(async () => {
    const list = await db.events.reverse().toArray();
    const withStats = [];
    for (const item of list) {
      if (item.id === undefined) continue;
      const photoCount = await db.photos.where({ eventId: item.id }).count();
      const clusterCount = await db.clusters.where({ eventId: item.id }).count();
      withStats.push({ ...item, photoCount, clusterCount });
    }
    return withStats;
  });

  // Subscribe to cloud events in real-time
  useEffect(() => {
    if (!user) {
      setCloudEvents([]);
      setLoadingEvents(false);
      return;
    }

    setLoadingEvents(true);
    const unsubscribe = subscribeOwnerEvents(
      user.uid,
      (events) => {
        setCloudEvents(events);
        setLoadingEvents(false);
      },
      (err) => {
        console.error('Failed to load events:', err);
        setLoadingEvents(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleFolderSelected = (folderId: string, folderName: string) => {
    setPendingFolder({ id: folderId, name: folderName });
    setShowFolderPicker(false);
    setShowCreateModal(true);
    if (!newEventName) {
      setNewEventName(folderName);
    }
  };

  const handleCreateEvent = async () => {
    if (!user || !pendingFolder || !newEventName.trim()) return;
    setCreating(true);
    try {
      const eventId = await createCloudEvent(
        user.uid,
        newEventName.trim(),
        pendingFolder.id,
        pendingFolder.name
      );
      setShowCreateModal(false);
      setNewEventName('');
      setPendingFolder(null);
      navigate(`/dashboard/event/${eventId}`);
    } catch (err) {
      console.error('Failed to create event:', err);
      alert(language === 'he' ? 'שגיאה ביצירת האירוע. נסה שוב.' : 'Error creating event. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCloudEvent = async (event: CloudEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(language === 'he' ? `האם אתה בטוח שברצונך למחוק את האירוע "${event.name}"?\nפעולה זו תמחק את כל הנתונים לצמיתות.` : `Are you sure you want to delete the event "${event.name}"?\nThis action will delete all data permanently.`)) {
      return;
    }
    try {
      await deleteCloudEvent(event.id!);
      setCloudEvents((prev) => prev.filter((ev) => ev.id !== event.id));
    } catch (err) {
      console.error('Failed to delete event:', err);
      alert(language === 'he' ? 'שגיאה במחיקת האירוע.' : 'Error deleting event.');
    }
  };

  const handleCopyShareLink = async (event: CloudEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/event/${event.shareCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(event.id!);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for HTTP
      prompt(language === 'he' ? 'העתק את הקישור:' : 'Copy link:', link);
    }
  };

  const handleDeleteLocalEvent = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(language === 'he' ? `האם אתה בטוח שברצונך למחוק את האירוע "${name}"?` : `Are you sure you want to delete the event "${name}"?`)) return;
    await db.transaction('rw', [db.events, db.photos, db.faces, db.clusters], async () => {
      await db.events.delete(id);
      await db.photos.where({ eventId: id }).delete();
      await db.faces.where({ eventId: id }).delete();
      await db.clusters.where({ eventId: id }).delete();
    });
  };

  const getStatusBadge = (status: CloudEvent['status']) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> {language === 'he' ? 'מוכן' : 'Ready'}
          </span>
        );
      case 'scanning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> {language === 'he' ? 'סורק' : 'Scanning'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            <Clock className="w-3 h-3" /> {language === 'he' ? 'ממתין' : 'Pending'}
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-8 flex-grow flex flex-col gap-8 transition-colors duration-300 text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-8">
        <div className="flex items-center gap-4 text-start">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-400 dark:from-amber-500 dark:to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 dark:shadow-amber-600/30">
            <Sparkles className="w-6 h-6 text-amber-900 dark:text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white m-0">EventTag</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{t('dashboard.myDashboard')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* User info */}
          {user && (
            <div className="flex items-center gap-3 bg-white/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5">
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full ring-2 ring-amber-400/30" />
              )}
              <div className="flex flex-col text-start">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{user.displayName}</span>
                <span className="text-[10px] text-slate-500">{user.email}</span>
              </div>
              <button
                onClick={signOut}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-all cursor-pointer"
                title={language === 'he' ? 'התנתק' : 'Sign Out'}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex bg-white dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 shadow-sm self-start">
          <button
            onClick={() => setMode('cloud')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center gap-2 ${
              mode === 'cloud'
                ? 'bg-amber-100 dark:bg-amber-50/20 text-amber-900 dark:text-amber-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>{language === 'he' ? 'אירועים בענן' : 'Cloud Events'}</span>
          </button>
          <button
            onClick={() => setMode('local')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center gap-2 ${
              mode === 'local'
                ? 'bg-amber-100 dark:bg-amber-50/20 text-amber-900 dark:text-amber-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>{language === 'he' ? 'מצב מקומי (בדיקות)' : 'Local Mode (Testing)'}</span>
          </button>
        </div>

        {mode === 'cloud' && (
          <button
            onClick={() => {
              setNewEventName('');
              setPendingFolder(null);
              setShowFolderPicker(true);
            }}
            disabled={!googleAccessToken}
            className="px-5 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-900/5 dark:shadow-amber-500/20 active:scale-95 border border-amber-200 dark:border-amber-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'he' ? 'אירוע חדש' : 'New Event'}</span>
          </button>
        )}
      </div>

      {/* Cloud Events */}
      {mode === 'cloud' && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 m-0">{language === 'he' ? 'האירועים שלי בענן' : 'My Cloud Events'}</h2>

          {loadingEvents ? (
            <div className="text-center py-12 text-slate-500 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span>{language === 'he' ? 'טוען אירועים...' : 'Loading events...'}</span>
            </div>
          ) : cloudEvents.length === 0 ? (
            <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4 bg-white/50 dark:bg-slate-900/20 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <Cloud className="w-6 h-6" />
              </div>
              <div className="max-w-md">
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-lg">{language === 'he' ? 'אין אירועים בענן' : 'No Cloud Events'}</h3>
                <p className="text-slate-500 text-sm mt-1">
                  {language === 'he' ? 'לחץ על "אירוע חדש" כדי לבחור תיקיית תמונות מ-Google Drive ולהתחיל.' : 'Click "New Event" to choose a folder from Google Drive and start.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cloudEvents.map((event) => {
                const isThisEventScanning = isScanning && activeScanningEventId === event.id;
                return (
                  <div
                    key={event.id}
                    onClick={() => navigate(`/dashboard/event/${event.id}`)}
                    className="group relative border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-500/40 bg-white dark:bg-slate-900/60 rounded-2xl p-6 cursor-pointer transition-all duration-300 flex flex-col gap-5 shadow-sm hover:shadow-xl dark:shadow-none hover:-translate-y-1"
                  >
                    {/* Actions */}
                    <div className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10`}>
                      <button
                        onClick={(e) => handleCopyShareLink(event, e)}
                        title={language === 'he' ? 'העתק קישור שיתוף' : 'Copy share link'}
                        className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 hover:bg-amber-50 dark:hover:bg-amber-500/20 border border-slate-200 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-500/30 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-all cursor-pointer shadow-sm"
                      >
                        {copiedId === event.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setQrEvent(event); }}
                        title={language === 'he' ? 'הצג QR קוד' : 'Show QR code'}
                        className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 hover:bg-amber-50 dark:hover:bg-amber-500/20 border border-slate-200 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-500/30 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-all cursor-pointer shadow-sm"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCloudEvent(event, e)}
                        title={language === 'he' ? 'מחק אירוע' : 'Delete event'}
                        className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 hover:bg-red-50 dark:hover:bg-red-500/20 border border-slate-200 dark:border-slate-800 hover:border-red-200 dark:hover:border-red-500/30 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-all cursor-pointer shadow-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5 pr-1 text-start">
                      <div className="flex items-center gap-2.5">
                        {isThisEventScanning ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> {language === 'he' ? 'סורק כעת' : 'Scanning now'}
                          </span>
                        ) : (
                          getStatusBadge(event.status)
                        )}
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-1 mt-2 m-0 text-start">
                        {event.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{event.createdAt && typeof event.createdAt === 'object' && 'toDate' in event.createdAt ? event.createdAt.toDate().toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US') : (language === 'he' ? 'ממתין' : 'Pending')}</span>
                      </div>
                    </div>

                    {isThisEventScanning && (
                      <div className="flex flex-col gap-2 mt-2 w-full text-start" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="text-slate-500 dark:text-slate-400 font-medium truncate text-start">
                            {isPaused ? t('dashboard.statusPaused') : formatETA(etaSeconds)}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  togglePause();
                                }}
                              className={`p-1 rounded-lg transition-all cursor-pointer ${
                                  isPaused
                                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                                }`}
                              title={isPaused ? t('eventView.isResumed') : t('eventView.isPaused')}
                            >
                              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                              {scannedCount} / {totalToScan || event.photoCount || 0}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                          <div
                            className="bg-amber-500 h-2 rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${(totalToScan || event.photoCount) > 0 ? (scannedCount / (totalToScan || event.photoCount)) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-auto">
                      <div className="flex items-center gap-2 text-start">
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col text-start">
                          <span className="text-xs text-slate-500">{language === 'he' ? 'תמונות' : 'Photos'}</span>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {isThisEventScanning ? scannedCount : event.photoCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-start">
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col text-start">
                          <span className="text-xs text-slate-500">{language === 'he' ? 'פנים מזוהות' : 'Detected Faces'}</span>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{event.faceCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 mt-1 self-start hover:underline">
                      <span>{language === 'he' ? 'פתח אירוע' : 'Open Event'}</span>
                      <ArrowLeft className={`w-3.5 h-3.5 transform group-hover:-translate-x-1 transition-transform ${isRtl ? '' : 'rotate-180'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Local Events (testing mode) */}
      {mode === 'local' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 m-0">{language === 'he' ? 'אירועים מקומיים (בדיקות)' : 'Local Events (Testing)'}</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder={language === 'he' ? 'שם האירוע...' : 'Event name...'}
                className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-amber-400 dark:focus:border-amber-500 focus:outline-none text-slate-800 dark:text-slate-100 text-sm w-64 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors shadow-sm"
              />
              <button
                onClick={async () => {
                  const name = newEventName.trim();
                  if (!name) return;
                  const eventId = await db.events.add({ name, createdAt: Date.now() });
                  setNewEventName('');
                  navigate(`/dashboard/event/${eventId}`);
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 font-medium text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 border border-amber-200 dark:border-amber-600/30"
              >
                <FolderPlus className="w-4 h-4" />
                <span>{language === 'he' ? 'אירוע חדש' : 'New Event'}</span>
              </button>
            </div>
          </div>

          {!localEvents ? (
            <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
          ) : localEvents.length === 0 ? (
            <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4 bg-white/50 dark:bg-slate-900/20 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <HardDrive className="w-6 h-6" />
              </div>
              <p className="text-slate-500 text-sm">{language === 'he' ? 'אין אירועים מקומיים. צור אירוע חדש למעלה.' : 'No local events. Create a new event above.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {localEvents.map((event) => {
                const isThisEventScanning = isScanning && activeScanningEventId === event.id;
                return (
                  <div
                    key={event.id}
                    onClick={() => event.id !== undefined && navigate(`/dashboard/event/${event.id}`)}
                    className="group relative border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-500/40 bg-white dark:bg-slate-900/60 rounded-2xl p-6 cursor-pointer transition-all duration-300 flex flex-col gap-6 shadow-sm hover:shadow-xl hover:-translate-y-1 text-start"
                  >
                    <button
                      onClick={(e) => event.id !== undefined && handleDeleteLocalEvent(event.id, event.name, e)}
                      title={language === 'he' ? 'מחק אירוע' : 'Delete event'}
                      className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 hover:bg-red-50 dark:hover:bg-red-500/20 border border-slate-200 dark:border-slate-800 hover:border-red-200 dark:hover:border-red-500/30 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all z-10 cursor-pointer shadow-sm`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex flex-col gap-1.5 pr-1 text-start">
                      {isThisEventScanning && (
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> {language === 'he' ? 'סורק כעת' : 'Scanning now'}
                          </span>
                        </div>
                      )}
                      <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-1 m-0 text-start">
                        {event.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(event.createdAt).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US')}</span>
                      </div>
                    </div>

                    {isThisEventScanning && (
                      <div className="flex flex-col gap-2 mt-2 w-full text-start" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="text-slate-500 dark:text-slate-400 font-medium truncate text-start">
                            {isPaused ? t('dashboard.statusPaused') : formatETA(etaSeconds)}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  togglePause();
                                }}
                              className={`p-1 rounded-lg transition-all cursor-pointer ${
                                  isPaused
                                    ? 'bg-amber-100 dark:bg-amber-500/25 text-amber-900 dark:text-amber-400'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                              title={isPaused ? t('eventView.isResumed') : t('eventView.isPaused')}
                            >
                              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                              {scannedCount} / {totalToScan || event.photoCount || 0}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                          <div
                            className="bg-amber-500 h-2 rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${(totalToScan || event.photoCount) > 0 ? (scannedCount / (totalToScan || event.photoCount)) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-auto">
                      <div className="flex items-center gap-2 text-start">
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col text-start">
                          <span className="text-xs text-slate-500">{language === 'he' ? 'תמונות' : 'Photos'}</span>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {isThisEventScanning ? scannedCount : event.photoCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-start">
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col text-start">
                          <span className="text-xs text-slate-500">{language === 'he' ? 'אורחים' : 'Guests'}</span>
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{event.clusterCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 mt-2 self-start hover:underline">
                      <span>{language === 'he' ? 'פתח אירוע' : 'Open Event'}</span>
                      <ArrowLeft className={`w-3.5 h-3.5 transform group-hover:-translate-x-1 transition-transform ${isRtl ? '' : 'rotate-180'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Folder Picker Modal */}
      {showFolderPicker && googleAccessToken && (
        <FolderPicker
          accessToken={googleAccessToken}
          onSelect={handleFolderSelected}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}

      {/* Create Event Modal (after folder selection) */}
      {showCreateModal && pendingFolder && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 m-0">{language === 'he' ? 'אירוע חדש' : 'New Event'}</h3>
              <button
                onClick={() => { setShowCreateModal(false); setPendingFolder(null); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2 text-start">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">{language === 'he' ? 'תיקיית Google Drive:' : 'Google Drive Folder:'}</label>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-800">
                <FolderPlus className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{pendingFolder.name}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-start">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">{language === 'he' ? 'שם האירוע:' : 'Event Name:'}</label>
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder={language === 'he' ? 'למשל: חתונת יוסי ודנה 2026' : 'e.g., Yossi & Dana Wedding 2026'}
                className="px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-amber-400 dark:focus:border-amber-500 focus:outline-none text-slate-800 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
                autoFocus
              />
            </div>

            <div className="flex gap-3 mt-2">
              <button
                onClick={handleCreateEvent}
                disabled={creating || !newEventName.trim()}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-sm transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {language === 'he' ? 'יוצר...' : 'Creating...'}</>
                ) : (
                  <><Plus className="w-4 h-4" /> {language === 'he' ? 'צור אירוע' : 'Create Event'}</>
                )}
              </button>
              <button
                onClick={() => { setShowCreateModal(false); setPendingFolder(null); }}
                className="px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-sm transition-all cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrEvent && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setQrEvent(null)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 m-0">{qrEvent.name}</h3>
            <div className="bg-white p-4 rounded-2xl shadow-inner">
              <QRCodeSVG
                value={`${window.location.origin}/event/${qrEvent.shareCode}`}
                size={220}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center m-0">{language === 'he' ? 'סרוק את הקוד כדי לפתוח את עמוד האירוע' : 'Scan the code to open the event page'}</p>
              <button
                onClick={(e) => handleCopyShareLink(qrEvent, e)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 text-sm font-bold border border-amber-200 dark:border-amber-500/30 hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-all cursor-pointer"
              >
                {copiedId === qrEvent.id ? <><Check className="w-3.5 h-3.5" /> {t('common.copied')}</> : <><Copy className="w-3.5 h-3.5" /> {language === 'he' ? 'העתק קישור' : 'Copy Link'}</>}
              </button>
            </div>
            <button
              onClick={() => setQrEvent(null)}
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
