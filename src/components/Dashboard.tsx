import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import {
  subscribeOwnerEvents,
  createCloudEvent,
  deleteCloudEvent,
  addCloudPhotosBatch,
  type CloudEvent,
} from '../services/firestore';
import { FolderPicker } from './FolderPicker';
import { GoogleIcon } from './GoogleIcon';
import { DropboxIcon } from './DropboxIcon';
import { QRCodeSVG } from 'qrcode.react';
import {
  Calendar, Image as ImageIcon, Trash2,
  ArrowLeft, LogOut, Cloud, Link2, QrCode,
  CheckCircle2, Loader2, Clock, Copy, Check, X,
  Plus, Play, Pause, FolderOpen, Search, Menu, BarChart2, Settings,
  Sun, Moon, AlertTriangle
} from 'lucide-react';
import { useScanner } from '../contexts/ScannerContext';
import { useTranslation } from '../services/translations';
import { useModal } from '../contexts/ModalContext';
import { useConsent } from '../contexts/ConsentContext';

export function Dashboard() {
  const navigate = useNavigate();
  const { t, isRtl, language } = useTranslation();
  const { confirm, alert } = useModal();
  const {
    user,
    dropboxAccessToken,
    googleAccessToken,
    onedriveAccessToken,
    isDropboxConnected,
    isGoogleConnected,
    isOneDriveConnected,
    expiredProviders,
    signOut,
    connectDropbox,
    disconnectDropbox,
    connectGoogle,
    disconnectGoogle,
    connectOneDrive,
    disconnectOneDrive,
    dismissExpiredProviderNotice,
  } = useAuth();
  const { theme, setTheme, setLanguage } = useSettings();
  const { resetConsent } = useConsent();
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const {
    isScanning,
    isEventScanning,
    getEventScanState,
    togglePause,
    stopScanning,
  } = useScanner();

  const [activeTab, setActiveTab] = useState<'events' | 'settings'>('events');
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'dropbox' | 'google' | 'onedrive'>('dropbox');

  const [cloudEvents, setCloudEvents] = useState<CloudEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [deletingEventIds, setDeletingEventIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showMobileSearch && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [showMobileSearch]);

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
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ id: string; name: string }>>([]);
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

  const checkParallelScanWarning = async () => {
    if (isScanning) {
      const confirmed = await confirm({
        title: t('dashboard.parallelScanWarningTitle'),
        message: t('dashboard.parallelScanWarningMessage'),
        confirmText: t('dashboard.parallelScanProceed'),
        cancelText: t('dashboard.parallelScanCancel'),
        variant: 'warning',
      });
      return confirmed;
    }
    return true;
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
          pendingFolder.name,
          selectedProvider
        );
      } else {
        // Individual files selection
        eventId = await createCloudEvent(
          user.uid,
          newEventName.trim(),
          "selected_files",
          language === 'he' ? `${pendingPhotos.length} תמונות` : `${pendingPhotos.length} photos`,
          selectedProvider
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
      await alert({
        title: language === 'he' ? 'שגיאה ביצירת אירוע' : 'Error Creating Event',
        message: language === 'he' ? 'שגיאה ביצירת האירוע. נסה שוב.' : 'Error creating event. Please try again.',
        variant: 'danger',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDisconnectProvider = async (provider: 'dropbox' | 'google' | 'onedrive') => {
    const providerName = provider === 'dropbox' ? 'Dropbox' : provider === 'google' ? 'Google Drive' : 'Microsoft OneDrive';
    const confirmed = await confirm({
      title: language === 'he' ? `ניתוק ספק ${providerName}` : `Disconnect ${providerName}`,
      message: language === 'he'
        ? `אזהרה: ניתוק ספק הענן ${providerName} ימחק לצמיתות את כל האירועים המשתמשים בספק זה ואת כל נתוני הפנים שנסרקו בהם.\nהאם ברצונך להמשיך?`
        : `Warning: Disconnecting ${providerName} will permanently delete all events that use this provider and their face descriptors.\nDo you want to proceed?`,
      confirmText: language === 'he' ? 'נתק ספק' : 'Disconnect Provider',
      cancelText: language === 'he' ? 'ביטול' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      setLoadingEvents(true);
      const eventsToDelete = cloudEvents.filter(e => (e.provider || 'dropbox') === provider);
      for (const ev of eventsToDelete) {
        await deleteCloudEvent(ev.id!);
      }

      if (provider === 'dropbox') {
        disconnectDropbox();
      } else if (provider === 'google') {
        disconnectGoogle();
      } else if (provider === 'onedrive') {
        disconnectOneDrive();
      }
      await alert({
        title: language === 'he' ? 'הספק נותק' : 'Provider Disconnected',
        message: language === 'he' ? 'הספק נותק בהצלחה והאירועים המשויכים נמחקו.' : 'Provider disconnected and associated events deleted successfully.',
        variant: 'success',
      });
    } catch (err) {
      console.error('Failed to disconnect provider:', err);
      await alert({
        title: language === 'he' ? 'שגיאה' : 'Error',
        message: language === 'he' ? 'שגיאה בניתוק ספק הענן.' : 'Error disconnecting cloud provider.',
        variant: 'danger',
      });
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = await confirm({
      title: language === 'he' ? 'מחיקת חשבון לצמיתות' : 'Permanently Delete Account',
      message: language === 'he'
        ? 'אזהרה חמורה!\nפעולה זו תמחוק לצמיתות את החשבון שלך ואת כל האירועים, התמונות והפנים שנסרקו. לא ניתן לשחזר פעולה זו!\n\nהאם אתה בטוח לחלוטין שברצונך להמשיך?'
        : 'CRITICAL WARNING!\nThis will permanently delete your account and all associated events, photos, and scanned faces. This action CANNOT be undone!\n\nAre you absolutely sure you want to proceed?',
      confirmText: language === 'he' ? 'מחק חשבון' : 'Delete Account',
      cancelText: language === 'he' ? 'ביטול' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      setLoadingEvents(true);
      const userEvents = [...cloudEvents];

      // 1. Stop all active scanning tasks for user events
      for (const ev of userEvents) {
        if (ev.id) {
          try {
            stopScanning(ev.id);
          } catch {
            // ignore scanner errors
          }
        }
      }

      // 2. Delete all user events and subcollections from Firestore
      for (const ev of userEvents) {
        if (ev.id) {
          await deleteCloudEvent(ev.id);
        }
      }

      // 3. Disconnect Cloud Providers
      disconnectDropbox();
      disconnectGoogle();
      disconnectOneDrive();

      // 4. Delete Firebase user account
      await user.delete();

      // 5. Reset Privacy Consent state & cookies
      resetConsent();

      // 6. Clear local storage, session storage, and IndexedDB databases
      try {
        localStorage.clear();
        sessionStorage.clear();
        if (typeof window !== 'undefined' && window.indexedDB && window.indexedDB.databases) {
          const dbs = await window.indexedDB.databases();
          for (const dbInfo of dbs) {
            if (dbInfo.name) {
              window.indexedDB.deleteDatabase(dbInfo.name);
            }
          }
        }
      } catch (e) {
        console.warn('Error clearing local storage/databases:', e);
      }

      await alert({
        title: language === 'he' ? 'החשבון נמחק' : 'Account Deleted',
        message: language === 'he' ? 'החשבון והנתונים נמחקו בהצלחה.' : 'Account and data successfully deleted.',
        variant: 'success',
      });
      signOut();
      navigate('/');
    } catch (err: unknown) {
      console.error('Failed to delete account:', err);
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'auth/requires-recent-login') {
        await alert({
          title: language === 'he' ? 'אימות מחדש נדרש' : 'Re-authentication Required',
          message: language === 'he'
            ? 'לשם אבטחה, עליך להתחבר מחדש לחשבון לפני מחיקתו. אנא התנתק, התחבר שוב ונסה שנית.'
            : 'For security reasons, you must re-authenticate before deleting your account. Please sign out, sign in again, and retry.',
          variant: 'warning',
        });
      } else {
        await alert({
          title: language === 'he' ? 'שגיאה במחיקת החשבון' : 'Error Deleting Account',
          message: language === 'he'
            ? 'שגיאה במחיקת החשבון. אנא נסה שוב או פנה לתמיכה.'
            : 'Error deleting account. Please try again or contact support.',
          variant: 'danger',
        });
      }
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleDeleteCloudEvent = async (event: CloudEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!event.id || deletingEventIds.has(event.id)) return;

    const confirmed = await confirm({
      title: language === 'he' ? 'מחיקת אירוע' : 'Delete Event',
      message: language === 'he'
        ? `האם אתה בטוח שברצונך למחוק את האירוע "${event.name}"?\nפעולה זו תמחק את כל הנתונים לצמיתות.`
        : `Are you sure you want to delete the event "${event.name}"?\nThis action will delete all data permanently.`,
      confirmText: language === 'he' ? 'מחק אירוע' : 'Delete Event',
      cancelText: language === 'he' ? 'ביטול' : 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    if (isEventScanning(event.id)) {
      stopScanning(event.id);
    }

    setDeletingEventIds((prev) => new Set(prev).add(event.id!));

    try {
      await deleteCloudEvent(event.id);
      setCloudEvents((prev) => prev.filter((ev) => ev.id !== event.id));
    } catch (err) {
      console.error('Failed to delete event:', err);
      await alert({
        title: language === 'he' ? 'שגיאה במחיקה' : 'Error Deleting',
        message: language === 'he' ? 'שגיאה במחיקת האירוע. אנא נסה שוב.' : 'Error deleting event. Please try again.',
        variant: 'danger',
      });
    } finally {
      setDeletingEventIds((prev) => {
        const next = new Set(prev);
        next.delete(event.id!);
        return next;
      });
    }
  };

  const handleCopyShareLink = async (event: CloudEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/event/${event.id}`;
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

  const filteredEvents = cloudEvents.filter(event => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    
    const nameMatches = event.name?.toLowerCase().includes(query);
    const folderMatches = event.driveFolderName?.toLowerCase().includes(query);
    const codeMatches = event.id?.toLowerCase().includes(query);
    const providerMatches = event.provider?.toLowerCase().includes(query);
    
    return nameMatches || folderMatches || codeMatches || providerMatches;
  });

  const sidebarContent = (
    <div className="flex flex-col h-full py-8 gap-y-6 text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Brand */}
      <div className="px-6 mb-4 flex flex-col justify-center items-start mt-4">
        <h1 className="font-display-lg text-3xl font-bold text-on-background tracking-tight m-0">EventTag</h1>
        <p className="font-label-sm text-[10px] text-sage-muted mt-1 uppercase tracking-widest">
          {language === 'he' ? `${cloudEvents.length} אירועים פעילים` : `${cloudEvents.length} Active Events`}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-3">
        <button 
          onClick={() => { setActiveTab('events'); setMobileMenuOpen(false); }}
          className={`flex items-center gap-3 font-bold py-3 px-4 rounded-lg transition-all text-start cursor-pointer border-none bg-transparent outline-none w-full ${
            activeTab === 'events'
              ? (isRtl ? 'border-r-4 border-copper-accent pr-3 text-on-background bg-surface-container' : 'border-l-4 border-copper-accent pl-3 text-on-background bg-surface-container')
              : 'text-sage-muted hover:text-on-background'
          }`}
        >
          <Calendar className="w-4 h-4 text-copper-accent" />
          <span className="font-label-sm text-xs uppercase tracking-wider">{t('dashboard.myEvents')}</span>
        </button>

        <button className="flex items-center gap-3 text-sage-muted hover:text-on-background py-3 px-4 rounded-lg transition-all text-start cursor-not-allowed border-none bg-transparent outline-none w-full group">
          <BarChart2 className="w-4 h-4 group-hover:text-on-background transition-colors" />
          <span className="font-label-sm text-xs uppercase tracking-wider group-hover:text-on-background transition-colors">{language === 'he' ? 'אנליטיקה' : 'Analytics'}</span>
        </button>

        <button 
          onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}
          className={`flex items-center gap-3 font-bold py-3 px-4 rounded-lg transition-all text-start cursor-pointer border-none bg-transparent outline-none w-full ${
            activeTab === 'settings'
              ? (isRtl ? 'border-r-4 border-copper-accent pr-3 text-on-background bg-surface-container' : 'border-l-4 border-copper-accent pl-3 text-on-background bg-surface-container')
              : 'text-sage-muted hover:text-on-background'
          }`}
        >
          <Settings className="w-4 h-4 text-copper-accent" />
          <span className="font-label-sm text-xs uppercase tracking-wider">{t('settings.title')}</span>
        </button>
      </nav>
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

      {/* Mobile Drawer with Smooth Animation */}
      <div 
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
          mobileMenuOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
        {/* Backdrop Overlay */}
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
            mobileMenuOpen ? 'opacity-100' : 'opacity-0'
          }`} 
          onClick={() => setMobileMenuOpen(false)} 
        />
        {/* Drawer Panel */}
        <div 
          className={`absolute top-0 bottom-0 w-64 bg-[#171a19] h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 ease-out ${
            isRtl 
              ? `right-0 border-l border-surface-border/60 ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}` 
              : `left-0 border-r border-surface-border/60 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`
          }`}
        >
          <button 
            onClick={() => setMobileMenuOpen(false)} 
            className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-2 text-sage-muted hover:text-on-background cursor-pointer rounded-lg hover:bg-surface-container-high transition-colors`}
            title={language === 'he' ? 'סגור תפריט' : 'Close menu'}
          >
            <X className="w-5 h-5" />
          </button>
          {sidebarContent}
        </div>
      </div>

      {/* Main Content Area */}
      <main id="main-content" tabIndex={-1} className={`flex-1 bg-background relative min-h-screen pb-20 flex flex-col focus:outline-none ${
        isRtl ? 'md:mr-64' : 'md:ml-64'
      }`}>
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-6 md:px-12 py-5 flex items-center justify-between border-b border-surface-border/30 w-full min-h-[72px]">
          {activeTab === 'events' && showMobileSearch ? (
            /* Mobile Search Bar Overlay */
            <div className="flex items-center gap-2 w-full text-start animate-in fade-in duration-200" dir={isRtl ? 'rtl' : 'ltr'}>
              <button
                onClick={() => {
                  setShowMobileSearch(false);
                  setSearchQuery('');
                }}
                className="p-2 rounded text-sage-muted hover:text-on-background transition-colors cursor-pointer"
                title={language === 'he' ? 'חזור' : 'Back'}
              >
                <ArrowLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
              </button>
              <div className="flex-1 flex items-center bg-surface-container rounded-full px-4 py-2 border border-surface-border focus-within:border-sage-muted/50 transition-colors text-start relative">
                <Search className={`text-sage-muted shrink-0 w-4 h-4 ${isRtl ? 'ml-2' : 'mr-2'}`} />
                <input
                  ref={mobileSearchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('dashboard.searchPlaceholder')}
                  className="bg-transparent border-none focus:ring-0 text-sm text-on-background w-full placeholder-sage-muted outline-none pe-8"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={`absolute p-1 rounded-full text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-all cursor-pointer ${
                      isRtl ? 'left-3' : 'right-3'
                    }`}
                    title={language === 'he' ? 'נקה חיפוש' : 'Clear search'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Standard Header (with Search button on mobile & Desktop Search) */
            <>
              {/* Mobile Menu Toggle */}
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden text-on-background p-2 rounded hover:bg-surface-container transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Desktop Search bar */}
              {activeTab === 'events' ? (
                <div className="hidden sm:flex items-center bg-surface-container rounded-full px-4 py-2 border border-surface-border focus-within:border-sage-muted/50 transition-colors w-64 lg:w-96 text-start relative">
                  <Search className={`text-sage-muted shrink-0 w-4 h-4 ${isRtl ? 'ml-2' : 'mr-2'}`} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('dashboard.searchPlaceholder')}
                    className="bg-transparent border-none focus:ring-0 text-sm text-on-background w-full placeholder-sage-muted outline-none pe-8"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className={`absolute p-1 rounded-full text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-all cursor-pointer ${
                        isRtl ? 'left-3' : 'right-3'
                      }`}
                      title={language === 'he' ? 'נקה חיפוש' : 'Clear search'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                /* Spacer if not events tab and not on mobile */
                <div className="hidden sm:block w-64 lg:w-96" />
              )}

              {/* User Profile & Mobile Search Toggle */}
              <div className={`flex items-center gap-2 sm:gap-4 ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
                {/* Mobile Search Toggle (only on events tab, hidden on sm and larger) */}
                {activeTab === 'events' && (
                  <button
                    onClick={() => setShowMobileSearch(true)}
                    className="sm:hidden text-on-background p-2 rounded hover:bg-surface-container transition-colors cursor-pointer"
                    title={language === 'he' ? 'חיפוש' : 'Search'}
                  >
                    <Search className="w-5 h-5 text-sage-muted" />
                  </button>
                )}
                
                {user && (
                  <div className="flex items-center gap-3 text-start bg-surface-container-low px-4 py-2 rounded-xl border border-surface-border/50">
                    {user.photoURL && (
                      <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-surface-border shadow" />
                    )}
                    <div className="flex flex-col text-start">
                      <p className="font-title-md text-xs font-bold text-on-background m-0 line-clamp-1">{user.displayName}</p>
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
            </>
          )}
        </header>

        {/* Canvas Area */}
        <div className="px-6 md:px-12 py-10 max-w-7xl mx-auto w-full flex-grow flex flex-col gap-8 text-start">
          {/* Expired Cloud Provider Connection Banners */}
          {expiredProviders.map((provider) => {
            const providerName = provider === 'dropbox' ? 'Dropbox' : provider === 'google' ? 'Google Drive' : 'OneDrive';
            const handleReconnect = () => {
              if (provider === 'dropbox') connectDropbox();
              else if (provider === 'google') connectGoogle();
              else if (provider === 'onedrive') connectOneDrive();
            };

            return (
              <div
                key={provider}
                role="alert"
                className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300"
              >
                <div className="flex items-start sm:items-center gap-3 text-start">
                  <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 shrink-0 mt-0.5 sm:mt-0">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex flex-col gap-1 text-start">
                    <h4 className="font-bold text-red-400 text-sm m-0">
                      {t('dashboard.expiredTokenAlertTitle')}: <span style={{ unicodeBidi: 'isolate' }}>{providerName}</span>
                    </h4>
                    <p className="text-sage-muted text-xs m-0 leading-relaxed">
                      {t('dashboard.expiredTokenAlertDesc', { provider: providerName })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    onClick={handleReconnect}
                    className="px-4 py-2 rounded-lg bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs shadow transition-all cursor-pointer border-none"
                  >
                    {t('dashboard.reconnectProvider', { provider: providerName })}
                  </button>
                  <button
                    onClick={() => dismissExpiredProviderNotice(provider)}
                    className="p-2 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-colors cursor-pointer border-none bg-transparent"
                    title={language === 'he' ? 'סגור התראה' : 'Dismiss notice'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {activeTab === 'events' ? (
            <>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="font-display-lg text-3xl md:text-4xl text-on-background m-0 mb-2">{language === 'he' ? 'האירועים שלי' : 'My Events'}</h2>
                  <p className="font-body-md text-sage-muted m-0">{language === 'he' ? 'נהל את גלריות התמונות וסנכרון הפנים שלך.' : 'Manage your photography galleries and face synchronization.'}</p>
                </div>
                
                {/* Choose photos backup button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      const canProceed = await checkParallelScanWarning();
                      if (!canProceed) return;
                      setNewEventName('');
                      setPendingPhotos([]);
                      setPendingFolder(null);
                      setShowProviderModal(true);
                    }}
                    className="px-5 py-2.5 rounded border border-surface-border text-on-background hover:bg-surface-container font-label-sm text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{language === 'he' ? 'צור אירוע' : 'Create Event'}</span>
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
              ) : cloudEvents.length === 0 ? (
                /* No Events At All */
                <div className="border border-dashed border-surface-border rounded-xl p-16 text-center flex flex-col items-center justify-center gap-6 bg-surface-container/20">
                  <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border flex items-center justify-center text-sage-muted shadow">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div className="max-w-md">
                    <h3 className="font-title-md text-lg font-bold text-on-background m-0">{language === 'he' ? 'אין אירועים פעילים' : 'No Active Events'}</h3>
                    <p className="font-body-md text-sage-muted text-sm mt-2 leading-relaxed">
                      {language === 'he' ? 'חבר תיקיית תמונות מספק ענן כדי להתחיל את הסריקה המקומית והזיהוי.' : 'Connect a folder from a Cloud Provider to initialize on-device facial scanning.'}
                    </p>
                  </div>
                </div>
              ) : filteredEvents.length === 0 ? (
                /* No Matches for Search */
                <div className="border border-dashed border-surface-border rounded-xl p-16 text-center flex flex-col items-center justify-center gap-6 bg-surface-container/20 animate-in fade-in duration-200">
                  <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border flex items-center justify-center text-sage-muted shadow">
                    <Search className="w-6 h-6 text-sage-muted" />
                  </div>
                  <div className="max-w-md flex flex-col items-center justify-center">
                    <h3 className="font-title-md text-lg font-bold text-on-background m-0">
                      {t('dashboard.noMatchingEvents')}
                    </h3>
                    <p className="font-body-md text-sage-muted text-sm mt-2 leading-relaxed">
                      {t('dashboard.noMatchingEventsDesc')}
                    </p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="mt-6 px-5 py-2 rounded-lg bg-surface-container-high border border-surface-border text-on-background hover:bg-surface-container transition-all cursor-pointer font-bold text-xs"
                    >
                      {t('dashboard.clearSearch')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredEvents.map((event) => {
                    const isThisEventScanning = isEventScanning(event.id!);
                    const eventScanState = getEventScanState(event.id!);
                    const isEventPaused = eventScanState?.isPaused ?? false;
                    const eventScannedCount = eventScanState?.scannedCount ?? 0;
                    const eventTotalToScan = eventScanState?.totalToScan || event.photoCount || 0;
                    const eventEta = eventScanState?.etaSeconds ?? null;
                    const isDeleting = event.id ? deletingEventIds.has(event.id) : false;

                    return (
                      <div
                        key={event.id}
                        onClick={isDeleting ? undefined : () => navigate(`/dashboard/event/${event.id}`)}
                        className={`group relative border border-surface-border/60 ${isDeleting ? 'opacity-75 overflow-hidden' : 'hover:border-copper-accent/35 cursor-pointer hover:shadow-2xl hover:-translate-y-0.5'} bg-surface-container rounded-xl p-6 transition-all duration-300 flex flex-col gap-6 shadow text-start`}
                      >
                        {/* Action buttons (always visible on mobile/touch, hover on desktop) */}
                        {!isDeleting && (
                          <div className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all z-10`}>
                            <button
                              onClick={(e) => handleCopyShareLink(event, e)}
                              title={language === 'he' ? 'העתק קישור שיתוף' : 'Copy share link'}
                              className="p-2.5 sm:p-2 rounded-lg bg-surface-container-high/90 sm:bg-surface-container-high border border-surface-border text-sage-muted hover:text-copper-accent active:scale-95 transition-all cursor-pointer shadow-sm"
                            >
                              {copiedId === event.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setQrEvent(event); }}
                              title={language === 'he' ? 'הצג QR קוד' : 'Show QR code'}
                              className="p-2.5 sm:p-2 rounded-lg bg-surface-container-high/90 sm:bg-surface-container-high border border-surface-border text-sage-muted hover:text-copper-accent active:scale-95 transition-all cursor-pointer shadow-sm"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteCloudEvent(event, e)}
                              title={language === 'he' ? 'מחק אירוע' : 'Delete event'}
                              className="p-2.5 sm:p-2 rounded-lg bg-surface-container-high/90 sm:bg-surface-container-high border border-surface-border text-sage-muted hover:text-red-400 active:scale-95 transition-all cursor-pointer shadow-sm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

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
                                {isEventPaused ? t('dashboard.statusPaused') : formatETA(eventEta)}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={async (e) => {
                                      e.stopPropagation();
                                      if (isEventPaused) {
                                        const canProceed = await checkParallelScanWarning();
                                        if (!canProceed) return;
                                      }
                                      togglePause(event.id!);
                                    }}
                                  className={`p-1.5 rounded transition-all cursor-pointer border bg-transparent ${
                                      isEventPaused
                                        ? 'border-copper-accent/30 text-copper-accent bg-copper-accent/10'
                                        : 'border-surface-border text-sage-muted hover:bg-surface-container-high'
                                    }`}
                                  title={isEventPaused ? t('eventView.isResumed') : t('eventView.isPaused')}
                                >
                                  {isEventPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      stopScanning(event.id!);
                                    }}
                                  className="p-1.5 rounded transition-all cursor-pointer border border-surface-border text-sage-muted hover:text-red-400 hover:bg-surface-container-high bg-transparent"
                                  title={t('dashboard.stopScanBtn')}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                <span className="font-mono font-bold text-on-background">
                                  {eventScannedCount} / {eventTotalToScan}
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-surface-container-low rounded-full h-1.5 overflow-hidden border border-surface-border">
                              <div
                                className="bg-copper-accent h-1.5 rounded-full transition-all duration-300 ease-out"
                                style={{
                                  width: `${eventTotalToScan > 0 ? (eventScannedCount / eventTotalToScan) * 100 : 0}%`,
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
                                {isThisEventScanning ? eventScannedCount : event.photoCount}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded bg-surface-container-low border border-surface-border/50 shrink-0 flex items-center justify-center">
                              {event.provider === 'google' ? (
                                <GoogleIcon className="w-3.5 h-3.5 shrink-0" alt="Google Drive" />
                              ) : event.provider === 'onedrive' ? (
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-blue-400 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19.33 11.5A5 5 0 0 0 10.08 9A6.5 6.5 0 0 0 4.67 19.5H19.33A4.5 4.5 0 0 0 19.33 11.5Z" />
                                    <path d="M16 11a4.5 4.5 0 0 0-8.33-2.17A5.5 5.5 0 0 0 2.5 17.5h13.83A3.5 3.5 0 0 0 16 11Z" opacity="0.8" />
                                  </svg>
                                ) : (
                                  <DropboxIcon className="w-3.5 h-3.5 shrink-0" />
                                )}
                              </div>
                            <div className="flex flex-col text-start">
                              <span className="text-[10px] text-sage-muted uppercase tracking-wider">{language === 'he' ? 'ספק ענן' : 'Cloud Provider'}</span>
                              <span className="text-sm font-bold text-on-background capitalize">
                                {event.provider === 'google' ? 'Google' : event.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-copper-accent mt-1 self-start group-hover:underline">
                          <span>{language === 'he' ? 'פתח אירוע' : 'Open Event'}</span>
                          <ArrowLeft className={`w-3.5 h-3.5 transform group-hover:-translate-x-1 transition-transform ${isRtl ? '' : 'rotate-180'}`} />
                        </div>

                        {isDeleting && (
                          <div className="absolute inset-0 bg-surface-container/90 backdrop-blur-sm rounded-xl z-20 flex flex-col items-center justify-center gap-3 p-4 text-center">
                            <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                              <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-bold text-on-background">
                                {language === 'he' ? 'מוחק אירוע...' : 'Deleting event...'}
                              </span>
                              <span className="text-xs text-sage-muted">
                                {language === 'he' ? 'מוחק נתונים ממסד הנתונים' : 'Removing data from database'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Settings & Accessibility Panel */
            <div className="flex flex-col gap-8 max-w-3xl">
              <div>
                <h2 className="font-display-lg text-3xl text-on-background m-0 mb-2">{t('settings.title')}</h2>
                <p className="font-body-md text-sage-muted m-0 text-start">
                  {language === 'he' 
                    ? 'נהל הגדרות אפליקציה, חיבורי ספקי ענן ופרטיות החשבון.' 
                    : 'Manage application settings, cloud provider links, and account privacy.'}
                </p>
              </div>

              <div className="botanical-divider" />

              {/* Accessibility Settings card */}
              <div className="bg-surface-container border border-surface-border rounded-xl p-6 flex flex-col gap-6">
                <h3 className="font-title-md text-lg font-bold text-on-background m-0 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-copper-accent" />
                  {t('settings.accessibility')}
                </h3>
                
                <div className="flex flex-col gap-5">
                  {/* Theme Toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border/40 pb-4">
                    <div className="text-start">
                      <p className="font-title-sm text-sm font-bold text-on-background m-0">{t('settings.theme')}</p>
                      <p className="text-xs text-sage-muted m-0">{language === 'he' ? 'בחר מראה בהיר או כהה לממשק.' : 'Choose light or dark appearance.'}</p>
                    </div>
                    <div className="flex gap-2 bg-surface-container-low p-1.5 rounded border border-surface-border w-full sm:w-auto shrink-0">
                      <button
                        onClick={() => setTheme('light')}
                        className={`flex-1 sm:flex-initial px-4 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border-none ${
                          theme === 'light' 
                            ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                            : 'bg-transparent text-sage-muted hover:text-on-background'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        {t('settings.light')}
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`flex-1 sm:flex-initial px-4 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border-none ${
                          theme === 'dark' 
                            ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                            : 'bg-transparent text-sage-muted hover:text-on-background'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        {t('settings.dark')}
                      </button>
                    </div>
                  </div>

                  {/* Language Toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-start">
                      <p className="font-title-sm text-sm font-bold text-on-background m-0">{t('settings.language')}</p>
                      <p className="text-xs text-sage-muted m-0">{language === 'he' ? 'בחר את שפת המערכת.' : 'Select system language.'}</p>
                    </div>
                    <div className="flex gap-2 bg-surface-container-low p-1.5 rounded border border-surface-border w-full sm:w-auto shrink-0">
                      <button
                        onClick={() => setLanguage('he')}
                        className={`flex-1 sm:flex-initial px-4 py-2 rounded text-xs font-bold transition-all cursor-pointer border-none ${
                          language === 'he' 
                            ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                            : 'bg-transparent text-sage-muted hover:text-on-background'
                        }`}
                      >
                        {t('settings.hebrew')}
                      </button>
                      <button
                        onClick={() => setLanguage('en')}
                        className={`flex-1 sm:flex-initial px-4 py-2 rounded text-xs font-bold transition-all cursor-pointer border-none ${
                          language === 'en' 
                            ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                            : 'bg-transparent text-sage-muted hover:text-on-background'
                        }`}
                      >
                        {t('settings.english')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cloud Providers card */}
              <div className="bg-surface-container border border-surface-border rounded-xl p-6 flex flex-col gap-6">
                <div>
                  <h3 className="font-title-md text-lg font-bold text-on-background m-0 flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-copper-accent" />
                    {t('settings.cloudProviders')}
                  </h3>
                  <p className="text-xs text-sage-muted mt-1 m-0 text-start">{t('settings.cloudProvidersDesc')}</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Dropbox */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-surface-border hover:border-[#0061FE]/40 transition-all">
                    <div className="flex items-center gap-3 text-start">
                      <div className="w-10 h-10 rounded-lg bg-[#0061FE]/10 flex items-center justify-center border border-[#0061FE]/30 shrink-0">
                        <DropboxIcon className="w-5 h-5 shrink-0" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-on-background m-0">Dropbox</p>
                        <p className="text-xs text-sage-muted m-0">
                          {isDropboxConnected || dropboxAccessToken ? (
                            <span className="text-emerald-400 font-semibold">{t('settings.connected')}</span>
                          ) : (
                            t('settings.notConnected')
                          )}
                        </p>
                      </div>
                    </div>
                    {isDropboxConnected || dropboxAccessToken ? (
                      <button
                        onClick={() => handleDisconnectProvider('dropbox')}
                        className="px-4 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/25 hover:border-red-500/50 text-xs font-bold transition-all cursor-pointer"
                      >
                        {t('settings.disconnect')}
                      </button>
                    ) : (
                      <button
                        onClick={connectDropbox}
                        className="px-4 py-2 rounded bg-deep-forest hover:bg-primary text-background text-xs font-bold transition-all cursor-pointer border-none"
                      >
                        {t('settings.connect')}
                      </button>
                    )}
                  </div>

                  {/* Google Drive - "Soon" */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low/40 border border-surface-border/40 opacity-70">
                    <div className="flex items-center gap-3 text-start">
                      <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center border border-surface-border shrink-0 opacity-60">
                        <GoogleIcon className="w-5 h-5 shrink-0" alt="Google Drive" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm text-on-background m-0">Google Drive</p>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-copper-accent/15 text-copper-accent border border-copper-accent/20 uppercase tracking-wide">
                            {t('settings.soon')}
                          </span>
                        </div>
                        <p className="text-xs text-sage-muted m-0">
                          {isGoogleConnected || googleAccessToken ? (
                            <span className="text-emerald-400 font-semibold">{t('settings.connected')}</span>
                          ) : (
                            t('settings.notConnected')
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      disabled
                      className="px-4 py-2 rounded bg-surface-container-high text-sage-muted text-xs font-bold border-none cursor-not-allowed"
                    >
                      {t('settings.connect')}
                    </button>
                  </div>

                  {/* OneDrive - "Soon" */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low/40 border border-surface-border/40 opacity-70">
                    <div className="flex items-center gap-3 text-start">
                      <div className="w-10 h-10 rounded-lg bg-blue-600/5 flex items-center justify-center border border-blue-600/10 shrink-0">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-500/60 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19.33 11.5A5 5 0 0 0 10.08 9A6.5 6.5 0 0 0 4.67 19.5H19.33A4.5 4.5 0 0 0 19.33 11.5Z" />
                          <path d="M16 11a4.5 4.5 0 0 0-8.33-2.17A5.5 5.5 0 0 0 2.5 17.5h13.83A3.5 3.5 0 0 0 16 11Z" opacity="0.5" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm text-on-background m-0">Microsoft OneDrive</p>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-copper-accent/15 text-copper-accent border border-copper-accent/20 uppercase tracking-wide">
                            {t('settings.soon')}
                          </span>
                        </div>
                        <p className="text-xs text-sage-muted m-0">
                          {isOneDriveConnected || onedriveAccessToken ? (
                            <span className="text-emerald-400 font-semibold">{t('settings.connected')}</span>
                          ) : (
                            t('settings.notConnected')
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      disabled
                      className="px-4 py-2 rounded bg-surface-container-high text-sage-muted text-xs font-bold border-none cursor-not-allowed"
                    >
                      {t('settings.connect')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-surface-container border border-red-500/20 rounded-xl p-6 flex flex-col gap-6">
                <div className="text-start">
                  <h3 className="font-title-md text-lg font-bold text-red-400 m-0 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    {t('settings.deleteAccount')}
                  </h3>
                  <p className="text-xs text-sage-muted mt-1 m-0">{t('settings.deleteAccountDesc')}</p>
                </div>
                
                <div className="flex justify-start">
                  <button
                    onClick={handleDeleteAccount}
                    className="px-5 py-3 rounded border border-red-500/40 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-all text-sm font-bold cursor-pointer animate-pulse"
                  >
                    {t('settings.deleteAccountBtn')}
                  </button>
                </div>
              </div>
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
                value={`${window.location.origin}/event/${qrEvent.id}`}
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
      {showFolderPicker && (
        <FolderPicker
          provider={selectedProvider}
          accessToken={selectedProvider === 'google' ? (googleAccessToken || '') : selectedProvider === 'onedrive' ? (onedriveAccessToken || '') : (dropboxAccessToken || '')}
          onSelect={(folderId, folderName) => {
            handleFolderSelected({ id: folderId, name: folderName });
            setShowFolderPicker(false);
          }}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}

      {/* Cloud Provider Select Modal */}
      {showProviderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowProviderModal(false)}>
          <div className="bg-surface-container border border-surface-border rounded-xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between">
              <h3 className="font-display-lg text-xl text-on-background m-0">{t('settings.selectProviderTitle')}</h3>
              <button
                onClick={() => setShowProviderModal(false)}
                className="p-1.5 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-sage-muted m-0 text-start">{t('settings.selectProviderDesc')}</p>

            <div className="flex flex-col gap-3">
              {/* Dropbox Button */}
              <button
                onClick={() => {
                  setSelectedProvider('dropbox');
                  setShowProviderModal(false);
                  if (!dropboxAccessToken) {
                    connectDropbox();
                  } else {
                    setNewEventName('');
                    setPendingPhotos([]);
                    setPendingFolder(null);
                    setShowFolderPicker(true);
                  }
                }}
                className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-surface-border hover:border-copper-accent/40 hover:bg-surface-container transition-all cursor-pointer text-start w-full text-on-background"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-[#0061FE]/10 flex items-center justify-center border border-[#0061FE]/30 shrink-0">
                    <DropboxIcon className="w-4 h-4 shrink-0" />
                  </div>
                  <div>
                    <span className="font-bold text-sm block">Dropbox</span>
                    <span className="text-[10px] text-sage-muted">
                      {isDropboxConnected || dropboxAccessToken ? t('settings.connected') : t('settings.notConnected')}
                    </span>
                  </div>
                </div>
                {(isDropboxConnected || dropboxAccessToken) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>

              {/* Google Drive Button - "Soon" */}
              <button
                disabled
                className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low/40 border border-surface-border/40 opacity-60 text-start w-full text-on-background cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center border border-surface-border shrink-0 opacity-60">
                    <GoogleIcon className="w-4 h-4 shrink-0" alt="Google Drive" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm block">Google Drive</span>
                      <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-copper-accent/15 text-copper-accent border border-copper-accent/20 uppercase tracking-wide">
                        {t('settings.soon')}
                      </span>
                    </div>
                    <span className="text-[10px] text-sage-muted">{t('settings.notConnected')}</span>
                  </div>
                </div>
              </button>

              {/* OneDrive Button - "Soon" */}
              <button
                disabled
                className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low/40 border border-surface-border/40 opacity-60 text-start w-full text-on-background cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-blue-600/5 flex items-center justify-center border border-blue-600/10 shrink-0">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-500/60 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.33 11.5A5 5 0 0 0 10.08 9A6.5 6.5 0 0 0 4.67 19.5H19.33A4.5 4.5 0 0 0 19.33 11.5Z" />
                      <path d="M16 11a4.5 4.5 0 0 0-8.33-2.17A5.5 5.5 0 0 0 2.5 17.5h13.83A3.5 3.5 0 0 0 16 11Z" opacity="0.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm block">Microsoft OneDrive</span>
                      <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-copper-accent/15 text-copper-accent border border-copper-accent/20 uppercase tracking-wide">
                        {t('settings.soon')}
                      </span>
                    </div>
                    <span className="text-[10px] text-sage-muted">{t('settings.notConnected')}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
