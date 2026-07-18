import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeOwnerEvents,
  createCloudEvent,
  deleteCloudEvent,
  addCloudPhotosBatch,
  type CloudEvent,
} from '../services/firestore';
import { FolderPicker } from './FolderPicker';
import { QRCodeSVG } from 'qrcode.react';
import {
  Calendar, Image as ImageIcon, Users, Trash2,
  ArrowLeft, LogOut, Cloud, Link2, QrCode,
  CheckCircle2, Loader2, Clock, Copy, Check, X,
  Plus, Play, Pause, FolderOpen, Search, Menu, BarChart2, Settings
} from 'lucide-react';
import { useScanner } from '../contexts/ScannerContext';
import { useTranslation } from '../services/translations';

export function Dashboard() {
  const navigate = useNavigate();
  const { t, isRtl, language } = useTranslation();
  const { user, dropboxAccessToken, signOut, connectDropbox } = useAuth();
  const [showFolderPicker, setShowFolderPicker] = useState(false);
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
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const formatETA = (seconds: number | null) => {
    if (seconds === null) return language === 'he' ? 'מחשב זמן...' : 'Calculating...';
    if (seconds === 0) return language === 'he' ? 'מסתיים...' : 'Finishing...';
    if (seconds < 60) return language === 'he' ? `כ-${seconds} שניות` : `~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return language === 'he' ? `כ-${mins} דקות` : `~${mins}m`;
  };

  // Cloud event creation flow
  const [newEventName, setNewEventName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<any[]>([]);
  const [pendingFolder, setPendingFolder] = useState<{ id: string; name: string } | null>(null);

  // QR code modal
  const [qrEvent, setQrEvent] = useState<CloudEvent | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

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


  const handleFolderSelected = (folder: { id: string; name: string }) => {
    setPendingFolder(folder);
    setPendingPhotos([]);
    setShowCreateModal(true);
    setNewEventName(folder.name);
  };

  const handleCreateEvent = async () => {
    if (!user || (!pendingFolder && pendingPhotos.length === 0) || !newEventName.trim()) return;
    setCreating(true);
    try {
      let eventId: string;

      if (pendingFolder) {
        // Folder selection
        eventId = await createCloudEvent(
          user.uid,
          newEventName.trim(),
          pendingFolder.id,
          pendingFolder.name
        );
      } else {
        // Individual files selection
        eventId = await createCloudEvent(
          user.uid,
          newEventName.trim(),
          "selected_files",
          language === 'he' ? `${pendingPhotos.length} תמונות` : `${pendingPhotos.length} photos`
        );

        const basePhotos = pendingPhotos.map(file => ({
          driveFileId: file.id,
          fileName: file.name,
          width: 0,
          height: 0,
          processed: false
        }));

        await addCloudPhotosBatch(eventId, basePhotos);
      }

      setShowCreateModal(false);
      setNewEventName('');
      setPendingPhotos([]);
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
      prompt(language === 'he' ? 'העתק את הקישור:' : 'Copy link:', link);
    }
  };

  const getStatusBadge = (status: CloudEvent['status']) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> {language === 'he' ? 'מוכן' : 'Ready'}
          </span>
        );
      case 'scanning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-copper-accent/15 text-copper-accent border border-copper-accent/20 animate-pulse">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> {language === 'he' ? 'סורק' : 'Scanning'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-border text-sage-muted border border-surface-border/50">
            <Clock className="w-2.5 h-2.5" /> {language === 'he' ? 'ממתין' : 'Pending'}
          </span>
        );
    }
  };

  const filteredEvents = cloudEvents.filter(event => 
    event.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sidebarContent = (
    <div className="flex flex-col h-full py-8 gap-y-6 text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Brand */}
      <div className="px-6 mb-4 flex flex-col justify-center items-start mt-4">
        <h1 className="font-display-lg text-2xl text-on-background tracking-tight m-0">EventTag</h1>
        <p className="font-label-sm text-[10px] text-sage-muted mt-1 uppercase tracking-widest">
          {language === 'he' ? `${cloudEvents.length} אירועים פעילים` : `${cloudEvents.length} Active Events`}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-3">
        <button 
          onClick={() => { setMobileMenuOpen(false); }}
          className={`flex items-center gap-3 font-bold py-3 px-4 rounded-lg transition-all text-start cursor-pointer border-none bg-transparent outline-none w-full ${
            isRtl ? 'border-r-4 border-copper-accent pr-3 text-on-background bg-surface-container' : 'border-l-4 border-copper-accent pl-3 text-on-background bg-surface-container'
          }`}
        >
          <Calendar className="w-4 h-4 text-copper-accent" />
          <span className="font-label-sm text-xs uppercase tracking-wider">{t('dashboard.myEvents')}</span>
        </button>

        <button className="flex items-center gap-3 text-sage-muted hover:text-on-background py-3 px-4 rounded-lg transition-all text-start cursor-not-allowed border-none bg-transparent outline-none w-full group">
          <BarChart2 className="w-4 h-4 group-hover:text-on-background transition-colors" />
          <span className="font-label-sm text-xs uppercase tracking-wider group-hover:text-on-background transition-colors">{language === 'he' ? 'אנליטיקה' : 'Analytics'}</span>
        </button>


        <button className="flex items-center gap-3 text-sage-muted hover:text-on-background py-3 px-4 rounded-lg transition-all text-start cursor-not-allowed border-none bg-transparent outline-none w-full group">
          <Settings className="w-4 h-4 group-hover:text-on-background transition-colors" />
          <span className="font-label-sm text-xs uppercase tracking-wider group-hover:text-on-background transition-colors">{t('settings.title')}</span>
        </button>
      </nav>

      {/* CTA bottom */}
      <div className="px-5 mt-auto flex flex-col gap-2">
        <button
          onClick={() => {
            if (!dropboxAccessToken) {
              connectDropbox();
            } else {
              setNewEventName('');
              setPendingPhotos([]);
              setPendingFolder(null);
              setShowFolderPicker(true);
            }
          }}
          className="w-full bg-deep-forest hover:bg-primary text-background font-label-sm text-xs uppercase tracking-widest py-3.5 rounded flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" />
          <span>
            {!dropboxAccessToken
              ? (language === 'he' ? 'חבר את Dropbox' : 'Connect Dropbox')
              : (language === 'he' ? 'אירוע מתיקייה' : 'Event from Folder')}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background text-on-background selection:bg-copper-accent/25 selection:text-deep-forest antialiased relative" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Sidebar (Desktop) */}
      <aside className={`fixed top-0 bottom-0 w-64 bg-surface-container-low border-r border-surface-border/30 flex-col z-40 hidden md:flex ${
        isRtl ? 'right-0 border-l border-r-0' : 'left-0 border-r border-l-0'
      }`}>
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className={`relative w-64 bg-surface-container-low h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 animate-in slide-in-from-left`}>
            <button 
              onClick={() => setMobileMenuOpen(false)} 
              className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-2 text-sage-muted hover:text-on-background`}
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 bg-background relative min-h-screen pb-20 flex flex-col ${
        isRtl ? 'md:mr-64' : 'md:ml-64'
      }`}>
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-6 md:px-12 py-5 flex items-center justify-between border-b border-surface-border/30 w-full">
          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden text-on-background p-2 rounded hover:bg-surface-container transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search bar */}
          <div className="hidden sm:flex items-center bg-surface-container rounded-full px-4 py-2 border border-surface-border focus-within:border-sage-muted/50 transition-colors w-64 lg:w-96 text-start">
            <Search className="text-sage-muted mr-2 shrink-0 w-4 h-4" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'he' ? 'חפש אירועים...' : 'Search events...'}
              className="bg-transparent border-none focus:ring-0 text-sm text-on-background w-full placeholder-sage-muted outline-none"
            />
          </div>

          {/* User Profile */}
          <div className={`flex items-center gap-4 ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
            {user && (
              <div className="flex items-center gap-3 text-start bg-surface-container-low px-4 py-2 rounded-xl border border-surface-border/50">
                {user.photoURL && (
                  <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-surface-border shadow" />
                )}
                <div className="flex flex-col text-start">
                  <p className="font-title-md text-xs font-bold text-on-background m-0 line-clamp-1">{user.displayName}</p>
                  <p className="font-label-sm text-[9px] text-sage-muted uppercase tracking-wider m-0 line-clamp-1">{language === 'he' ? 'מנהל אירוע' : 'Event Manager'}</p>
                </div>
                <button
                  onClick={signOut}
                  className="p-1.5 rounded-lg hover:bg-surface-container text-sage-muted hover:text-red-400 transition-all cursor-pointer border-none bg-transparent"
                  title={language === 'he' ? 'התנתק' : 'Sign Out'}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Canvas Area */}
        <div className="px-6 md:px-12 py-10 max-w-7xl mx-auto w-full flex-grow flex flex-col gap-8 text-start">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="font-display-lg text-3xl md:text-4xl text-on-background m-0 mb-2">{language === 'he' ? 'האירועים שלי' : 'My Events'}</h2>
              <p className="font-body-md text-sage-muted m-0">{language === 'he' ? 'נהל את גלריות התמונות וסנכרון הפנים שלך.' : 'Manage your photography galleries and face synchronization.'}</p>
            </div>
            
            {/* Choose photos backup button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (!dropboxAccessToken) {
                    connectDropbox();
                  } else {
                    setNewEventName('');
                    setPendingPhotos([]);
                    setPendingFolder(null);
                    setShowFolderPicker(true);
                  }
                }}
                className="px-5 py-2.5 rounded border border-surface-border text-on-background hover:bg-surface-container font-label-sm text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {!dropboxAccessToken
                    ? (language === 'he' ? 'חבר את Dropbox' : 'Connect Dropbox')
                    : (language === 'he' ? 'יצירת אירוע מתיקייה' : 'Create Event from Folder')}
                </span>
              </button>
            </div>
          </div>

          <div className="botanical-divider" />

          {/* Grid list of events */}
          {loadingEvents ? (
            <div className="text-center py-20 text-sage-muted flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-copper-accent" />
              <span className="font-body-md">{language === 'he' ? 'טוען אירועים...' : 'Loading events...'}</span>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="border border-dashed border-surface-border rounded-xl p-16 text-center flex flex-col items-center justify-center gap-6 bg-surface-container/20">
              <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border flex items-center justify-center text-sage-muted shadow">
                <Cloud className="w-6 h-6" />
              </div>
              <div className="max-w-md">
                <h3 className="font-title-md text-lg font-bold text-on-background m-0">{language === 'he' ? 'אין אירועים פעילים' : 'No Active Events'}</h3>
                <p className="font-body-md text-sage-muted text-sm mt-2 leading-relaxed">
                  {language === 'he' ? 'חבר תיקיית תמונות מ-Dropbox כדי להתחיל את הסריקה המקומית והזיהוי.' : 'Connect a folder from Dropbox to initialize on-device facial scanning.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((event) => {
                const isThisEventScanning = isScanning && activeScanningEventId === event.id;
                return (
                  <div
                    key={event.id}
                    onClick={() => navigate(`/dashboard/event/${event.id}`)}
                    className="group relative border border-surface-border/60 hover:border-copper-accent/35 bg-surface-container rounded-xl p-6 cursor-pointer transition-all duration-300 flex flex-col gap-6 shadow hover:shadow-2xl hover:-translate-y-0.5 text-start"
                  >
                    {/* Action overlays */}
                    <div className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10`}>
                      <button
                        onClick={(e) => handleCopyShareLink(event, e)}
                        title={language === 'he' ? 'העתק קישור שיתוף' : 'Copy share link'}
                        className="p-2 rounded bg-surface-container-high border border-surface-border text-sage-muted hover:text-copper-accent transition-all cursor-pointer"
                      >
                        {copiedId === event.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setQrEvent(event); }}
                        title={language === 'he' ? 'הצג QR קוד' : 'Show QR code'}
                        className="p-2 rounded bg-surface-container-high border border-surface-border text-sage-muted hover:text-copper-accent transition-all cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCloudEvent(event, e)}
                        title={language === 'he' ? 'מחק אירוע' : 'Delete event'}
                        className="p-2 rounded bg-surface-container-high border border-surface-border text-sage-muted hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 text-start">
                      <div className="flex items-center">
                        {isThisEventScanning ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-copper-accent/15 text-copper-accent border border-copper-accent/20 animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> {language === 'he' ? 'סורק כעת' : 'Scanning now'}
                          </span>
                        ) : (
                          getStatusBadge(event.status)
                        )}
                      </div>
                      <h3 className="font-display-lg text-xl text-on-background group-hover:text-copper-accent transition-colors line-clamp-1 m-0 mt-1">
                        {event.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-sage-muted">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>{event.createdAt && typeof event.createdAt === 'object' && 'toDate' in event.createdAt ? event.createdAt.toDate().toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US') : (language === 'he' ? 'ממתין' : 'Pending')}</span>
                      </div>
                    </div>

                    {isThisEventScanning && (
                      <div className="flex flex-col gap-2 w-full text-start" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-sage-muted font-medium truncate">
                            {isPaused ? t('dashboard.statusPaused') : formatETA(etaSeconds)}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  togglePause();
                                }}
                              className={`p-1.5 rounded transition-all cursor-pointer border bg-transparent ${
                                  isPaused
                                    ? 'border-copper-accent/30 text-copper-accent bg-copper-accent/10'
                                    : 'border-surface-border text-sage-muted hover:bg-surface-container-high'
                                }`}
                              title={isPaused ? t('eventView.isResumed') : t('eventView.isPaused')}
                            >
                              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                            <span className="font-mono font-bold text-on-background">
                              {scannedCount} / {totalToScan || event.photoCount || 0}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-surface-container-low rounded-full h-1.5 overflow-hidden border border-surface-border">
                          <div
                            className="bg-copper-accent h-1.5 rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${(totalToScan || event.photoCount) > 0 ? (scannedCount / (totalToScan || event.photoCount)) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 border-t border-surface-border pt-4 mt-auto">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded bg-surface-container-low text-sage-muted border border-surface-border/50">
                          <ImageIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col text-start">
                          <span className="text-[10px] text-sage-muted uppercase tracking-wider">{language === 'he' ? 'תמונות' : 'Photos'}</span>
                          <span className="text-sm font-bold text-on-background">
                            {isThisEventScanning ? scannedCount : event.photoCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded bg-surface-container-low text-sage-muted border border-surface-border/50">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col text-start">
                          <span className="text-[10px] text-sage-muted uppercase tracking-wider">{language === 'he' ? 'אורחים' : 'Guests'}</span>
                          <span className="text-sm font-bold text-on-background">{event.faceCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-copper-accent mt-1 self-start group-hover:underline">
                      <span>{language === 'he' ? 'פתח אירוע' : 'Open Event'}</span>
                      <ArrowLeft className={`w-3.5 h-3.5 transform group-hover:-translate-x-1 transition-transform ${isRtl ? '' : 'rotate-180'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create Event Modal */}
      {showCreateModal && (pendingPhotos.length > 0 || pendingFolder) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-container border border-surface-border rounded-xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between">
              <h3 className="font-display-lg text-xl text-on-background m-0">{language === 'he' ? 'אירוע חדש' : 'New Event'}</h3>
              <button
                onClick={() => { setShowCreateModal(false); setPendingPhotos([]); setPendingFolder(null); }}
                className="p-1.5 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2 text-start">
              <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">
                {pendingFolder
                  ? (language === 'he' ? 'תיקייה שנבחרה:' : 'Selected Folder:')
                  : (language === 'he' ? 'תמונות שנבחרו:' : 'Selected Photos:')}
              </label>
              <div className="flex items-center gap-2.5 bg-surface-container-low rounded px-4 py-3 border border-surface-border">
                {pendingFolder ? (
                  <FolderOpen className="w-4 h-4 text-copper-accent shrink-0" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-copper-accent shrink-0" />
                )}
                <span className="text-sm text-on-background truncate">
                  {pendingFolder
                    ? pendingFolder.name
                    : (language === 'he' ? `נבחרו ${pendingPhotos.length} תמונות` : `${pendingPhotos.length} photos selected`)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-start">
              <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">{language === 'he' ? 'שם האירוע:' : 'Event Name:'}</label>
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder={language === 'he' ? 'למשל: חתונת יוסי ודנה 2026' : 'e.g., Yossi & Dana Wedding 2026'}
                className="px-4 py-3 rounded bg-surface-container-low border border-surface-border focus:border-copper-accent focus:outline-none text-on-background text-sm placeholder:text-sage-muted transition-colors w-full"
                autoFocus
              />
            </div>

            <div className="flex gap-3 mt-2">
              <button
                onClick={handleCreateEvent}
                disabled={creating || !newEventName.trim()}
                className="flex-1 py-3 rounded bg-deep-forest hover:bg-primary text-background font-bold text-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {language === 'he' ? 'יוצר...' : 'Creating...'}</>
                ) : (
                  <><Plus className="w-4 h-4" /> {language === 'he' ? 'צור אירוע' : 'Create Event'}</>
                )}
              </button>
              <button
                onClick={() => { setShowCreateModal(false); setPendingPhotos([]); setPendingFolder(null); }}
                className="px-6 py-3 rounded bg-surface-container-high hover:bg-surface-border text-on-background font-medium text-sm transition-all cursor-pointer border-none"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setQrEvent(null)}>
          <div className="bg-surface-container border border-surface-border rounded-xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <h3 className="font-display-lg text-lg text-on-background m-0">{qrEvent.name}</h3>
            <div className="bg-white p-4 rounded-xl shadow-inner border border-surface-border">
              <QRCodeSVG
                value={`${window.location.origin}/event/${qrEvent.shareCode}`}
                size={220}
                level="M"
                bgColor="#ffffff"
                fgColor="#111413"
              />
            </div>
            <div className="flex flex-col items-center gap-3 w-full">
              <p className="text-xs text-sage-muted text-center m-0 leading-relaxed">{language === 'he' ? 'סרוק את הקוד כדי לפתוח את עמוד האירוע' : 'Scan the code to open the event page'}</p>
              <button
                onClick={(e) => handleCopyShareLink(qrEvent, e)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded bg-copper-accent/10 border border-copper-accent/30 text-copper-accent hover:bg-copper-accent/20 text-sm font-bold transition-all cursor-pointer"
              >
                {copiedId === qrEvent.id ? <><Check className="w-3.5 h-3.5" /> {t('common.copied')}</> : <><Copy className="w-3.5 h-3.5" /> {language === 'he' ? 'העתק קישור' : 'Copy Link'}</>}
              </button>
            </div>
            <button
              onClick={() => setQrEvent(null)}
              className="text-sage-muted hover:text-on-background text-sm transition-colors cursor-pointer border-none bg-transparent outline-none"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
      {showFolderPicker && dropboxAccessToken && (
        <FolderPicker
          accessToken={dropboxAccessToken}
          onSelect={(folderId, folderName) => {
            handleFolderSelected({ id: folderId, name: folderName });
            setShowFolderPicker(false);
          }}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}
    </div>
  );
}
