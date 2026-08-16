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
import type { CloudProvider } from '../services/cloudProviders';
import { GoogleIcon } from './GoogleIcon';
import { DropboxIcon } from './DropboxIcon';
import { QRCodeSVG } from 'qrcode.react';
import {
  Calendar, Image as ImageIcon, Trash2,
  ArrowLeft, LogOut, Cloud, Link2, QrCode, Share2,
  CheckCircle2, Loader2, Clock, Copy, Check, X,
  Plus, Play, Pause, FolderOpen, Search, Menu, BarChart2, Settings, Shield,
  Sun, Moon, AlertTriangle, Upload, Sparkles, LayoutGrid, List, Filter, ChevronDown, MoreHorizontal,
  Crown, Info
} from 'lucide-react';
import { createGoogleFolder } from '../services/google';
import { createDropboxFolder } from '../services/dropbox';
import { ShareModal } from './ShareModal';
import { handleShareEvent } from '../utils/shareUtils';
import { useScanner } from '../contexts/ScannerContext';
import { useTranslation } from '../services/translations';
import { useModal } from '../contexts/ModalContext';
import { useConsent } from '../contexts/ConsentContext';
import { AdminManagement } from './AdminManagement';
import { AllowlistManagement } from './AllowlistManagement';
import {
  getUserQuotaStatus,
  isFirebaseQuotaOrDemandError,
  getFirestoreErrorMessage,
} from '../services/quotaService';

export function Dashboard() {
  const navigate = useNavigate();
  const { t, isRtl, language } = useTranslation();
  const { confirm, alert } = useModal();
  const {
    user,
    userProfile,
    systemSettings,
    isAdmin,
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
    markProviderExpired,
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
    startLocalGoogleUploadAndScan,
    startLocalDropboxUploadAndScan,
  } = useScanner();

  const [activeTab, setActiveTab] = useState<'events' | 'settings' | 'admin' | 'allowlist'>('events');
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>('google');
  const [showGoogleCreateModal, setShowGoogleCreateModal] = useState(false);
  const [showDropboxCreateModal, setShowDropboxCreateModal] = useState(false);
  const [selectedLocalFiles, setSelectedLocalFiles] = useState<File[]>([]);

  const [cloudEvents, setCloudEvents] = useState<CloudEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [deletingEventIds, setDeletingEventIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'scanning' | 'pending'>('all');
  const [providerFilter, setProviderFilter] = useState<'all' | 'google' | 'dropbox' | 'onedrive'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(6);
  const [openMenuEventId, setOpenMenuEventId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.photoURL]);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuEventId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

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

  // QR code & Share modals
  const [qrEvent, setQrEvent] = useState<CloudEvent | null>(null);
  const [shareModalEvent, setShareModalEvent] = useState<CloudEvent | null>(null);

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


  // Compute user quota status based on user role/profile and system settings
  const quotaStatus = getUserQuotaStatus(
    user,
    userProfile,
    systemSettings,
    language
  );

  // Highest photo count among user's events to show capacity utilization
  const peakEventPhotoCount = cloudEvents.reduce((max, ev) => Math.max(max, ev.photoCount || 0), 0);
  const photoUsagePercent = quotaStatus.isAdmin
    ? 0
    : Math.min(100, Math.round((peakEventPhotoCount / quotaStatus.maxPhotosPerEvent) * 100));

  const handleOpenNewEventFlow = async () => {
    setMobileMenuOpen(false);
    const canProceedParallel = await checkParallelScanWarning();
    if (!canProceedParallel) return;
    setNewEventName('');
    setPendingPhotos([]);
    setPendingFolder(null);
    setShowProviderModal(true);
  };

  const handleFolderSelected = async (folder: { id: string; name: string }) => {
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

    if (pendingPhotos.length > quotaStatus.maxPhotosPerEvent) {
      await alert({
        title: t('dashboard.photoLimitExceededTitle'),
        message: t('dashboard.photoLimitExceededMessage')
          .replace('{count}', pendingPhotos.length.toString())
          .replace('{tier}', quotaStatus.tierName)
          .replace('{max}', quotaStatus.maxPhotosPerEvent.toString()),
        variant: 'warning',
      });
      return;
    }

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
    } catch (err: unknown) {
      console.error('Failed to create event:', err);
      const errInfo = getFirestoreErrorMessage(err, language);
      await alert({
        title: errInfo.isHighDemand ? t('dashboard.firebaseHighDemandTitle') : errInfo.title,
        message: errInfo.isHighDemand ? t('dashboard.firebaseHighDemandMessage') : errInfo.message,
        variant: errInfo.isHighDemand ? 'warning' : 'danger',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateGoogleEvent = async () => {
    if (!user || !googleAccessToken || selectedLocalFiles.length === 0 || !newEventName.trim()) return;

    if (selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent) {
      await alert({
        title: t('dashboard.photoLimitExceededTitle'),
        message: t('dashboard.photoLimitExceededMessage')
          .replace('{count}', selectedLocalFiles.length.toString())
          .replace('{tier}', quotaStatus.tierName)
          .replace('{max}', quotaStatus.maxPhotosPerEvent.toString()),
        variant: 'warning',
      });
      return;
    }

    setCreating(true);
    try {
      // 1. Create a dedicated folder in user's Google Drive via API with drive.file scope
      const googleFolder = await createGoogleFolder(googleAccessToken, newEventName.trim());

      // 2. Create the Cloud Event document in Firestore
      const eventId = await createCloudEvent(
        user.uid,
        newEventName.trim(),
        googleFolder.id,
        googleFolder.name,
        'google'
      );

      // 3. Trigger 2-worker parallel face scanning & Google Drive upload task
      startLocalGoogleUploadAndScan(eventId, googleFolder.id, selectedLocalFiles, googleAccessToken);

      // 4. Reset modal state and navigate to event page
      setShowGoogleCreateModal(false);
      setNewEventName('');
      setSelectedLocalFiles([]);
      navigate(`/dashboard/event/${eventId}`);
    } catch (err: unknown) {
      console.error('Failed to create Google Drive event:', err);
      if (isFirebaseQuotaOrDemandError(err)) {
        await alert({
          title: t('dashboard.firebaseHighDemandTitle'),
          message: t('dashboard.firebaseHighDemandMessage'),
          variant: 'warning',
        });
        return;
      }
      const errStr = err instanceof Error ? err.message : String(err);
      if (
        errStr.includes('401') ||
        errStr.includes('403') ||
        errStr.includes('expired_access_token') ||
        errStr.includes('PERMISSION_DENIED') ||
        errStr.includes('insufficient')
      ) {
        markProviderExpired('google');
        const confirmed = await confirm({
          title: language === 'he' ? 'נדרשת הרשאת Google Drive' : 'Google Drive Permission Required',
          message: language === 'he'
            ? 'תוקף החיבור לחשבון Google Drive פג או שחסרות הרשאות ליצירת קבצים.\nהאם ברצונך להתחבר מחדש עכשיו לקבלת ההרשאות המעודכנות?'
            : 'Your Google Drive session has expired or lacks file creation permissions.\nWould you like to reconnect now to grant updated permissions?',
          confirmText: language === 'he' ? 'התחבר מחדש' : 'Reconnect',
          cancelText: language === 'he' ? 'ביטול' : 'Cancel',
          variant: 'warning',
        });
        if (confirmed) {
          connectGoogle();
        }
      } else {
        const errInfo = getFirestoreErrorMessage(err, language);
        await alert({
          title: errInfo.isHighDemand ? t('dashboard.firebaseHighDemandTitle') : errInfo.title,
          message: errInfo.isHighDemand ? t('dashboard.firebaseHighDemandMessage') : errInfo.message,
          variant: errInfo.isHighDemand ? 'warning' : 'danger',
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCreateDropboxEvent = async () => {
    if (!user || !dropboxAccessToken || selectedLocalFiles.length === 0 || !newEventName.trim()) return;

    if (selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent) {
      await alert({
        title: t('dashboard.photoLimitExceededTitle'),
        message: t('dashboard.photoLimitExceededMessage')
          .replace('{count}', selectedLocalFiles.length.toString())
          .replace('{tier}', quotaStatus.tierName)
          .replace('{max}', quotaStatus.maxPhotosPerEvent.toString()),
        variant: 'warning',
      });
      return;
    }

    setCreating(true);
    try {
      // 1. Create a dedicated folder in user's Dropbox via API
      const dropboxFolder = await createDropboxFolder(dropboxAccessToken, newEventName.trim());

      // 2. Create the Cloud Event document in Firestore
      const eventId = await createCloudEvent(
        user.uid,
        newEventName.trim(),
        dropboxFolder.path,
        dropboxFolder.name,
        'dropbox'
      );

      // 3. Trigger 2-worker parallel face scanning & Dropbox upload task
      startLocalDropboxUploadAndScan(eventId, dropboxFolder.path, selectedLocalFiles, dropboxAccessToken);

      // 4. Reset modal state and navigate to event page
      setShowDropboxCreateModal(false);
      setNewEventName('');
      setSelectedLocalFiles([]);
      navigate(`/dashboard/event/${eventId}`);
    } catch (err: unknown) {
      console.error('Failed to create Dropbox event:', err);
      if (isFirebaseQuotaOrDemandError(err)) {
        await alert({
          title: t('dashboard.firebaseHighDemandTitle'),
          message: t('dashboard.firebaseHighDemandMessage'),
          variant: 'warning',
        });
        return;
      }
      const errStr = err instanceof Error ? err.message : String(err);
      if (
        errStr.includes('401') ||
        errStr.includes('403') ||
        errStr.includes('expired_access_token') ||
        errStr.includes('PERMISSION_DENIED') ||
        errStr.includes('invalid_access_token')
      ) {
        markProviderExpired('dropbox');
        const confirmed = await confirm({
          title: language === 'he' ? 'נדרשת הרשאת Dropbox' : 'Dropbox Permission Required',
          message: language === 'he'
            ? 'תוקף החיבור לחשבון Dropbox פג או שחסרות הרשאות ליצירת קבצים.\nהאם ברצונך להתחבר מחדש עכשיו לקבלת ההרשאות המעודכנות?'
            : 'Your Dropbox session has expired or lacks file creation permissions.\nWould you like to reconnect now to grant updated permissions?',
          confirmText: language === 'he' ? 'התחבר מחדש' : 'Reconnect',
          cancelText: language === 'he' ? 'ביטול' : 'Cancel',
          variant: 'warning',
        });
        if (confirmed) {
          connectDropbox();
        }
      } else {
        const errInfo = getFirestoreErrorMessage(err, language);
        await alert({
          title: errInfo.isHighDemand ? t('dashboard.firebaseHighDemandTitle') : errInfo.title,
          message: errInfo.isHighDemand ? t('dashboard.firebaseHighDemandMessage') : errInfo.message,
          variant: errInfo.isHighDemand ? 'warning' : 'danger',
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDisconnectProvider = async (provider: CloudProvider) => {
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

  const handleShare = async (event: CloudEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!event.id) return;
    await handleShareEvent({
      eventId: event.id,
      eventName: event.name,
      language,
      onFallback: () => setShareModalEvent(event),
    });
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
    if (query) {
      const nameMatches = event.name?.toLowerCase().includes(query);
      const folderMatches = event.driveFolderName?.toLowerCase().includes(query);
      const codeMatches = event.id?.toLowerCase().includes(query);
      const providerMatches = event.provider?.toLowerCase().includes(query);
      if (!nameMatches && !folderMatches && !codeMatches && !providerMatches) {
        return false;
      }
    }

    if (statusFilter !== 'all') {
      const isThisEventScanning = isEventScanning(event.id!);
      const effectiveStatus = isThisEventScanning ? 'scanning' : (event.status || 'pending');
      if (effectiveStatus !== statusFilter) return false;
    }

    if (providerFilter !== 'all') {
      const prov = event.provider || 'dropbox';
      if (prov !== providerFilter) return false;
    }

    return true;
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

        {isAdmin && (
          <button
            onClick={() => { setActiveTab('admin'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 font-bold py-3 px-4 rounded-lg transition-all text-start cursor-pointer border-none bg-transparent outline-none w-full group ${
              activeTab === 'admin'
                ? (isRtl ? 'border-r-4 border-copper-accent pr-3 text-on-background bg-surface-container' : 'border-l-4 border-copper-accent pl-3 text-on-background bg-surface-container')
                : 'text-sage-muted hover:text-on-background'
            }`}
          >
            <Shield className="w-4 h-4 text-copper-accent" />
            <span className="font-label-sm text-xs uppercase tracking-wider">
              {t('admin.title')}
            </span>
          </button>
        )}
      </nav>

      {/* Quota & Plan Status Card in Sidebar */}
      <div className="px-5 mt-auto mb-3">
        <div className="p-3.5 rounded-xl bg-surface-container border border-surface-border flex flex-col gap-2.5 shadow-sm text-start">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {quotaStatus.isAdmin ? (
                <Shield className="w-3.5 h-3.5 text-copper-accent" />
              ) : quotaStatus.isPremium ? (
                <Crown className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-background">
                {quotaStatus.tierName}
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high border border-surface-border text-on-background font-mono font-semibold">
              {quotaStatus.isAdmin
                ? '∞'
                : `${photoUsagePercent}%`}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-surface-container-low rounded-full h-2 overflow-hidden border border-surface-border/40">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                quotaStatus.isAdmin
                  ? 'bg-gradient-to-r from-copper-accent to-emerald-400 w-full'
                  : photoUsagePercent >= 90
                  ? 'bg-red-400'
                  : photoUsagePercent >= 75
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{
                width: quotaStatus.isAdmin ? '100%' : `${Math.max(peakEventPhotoCount > 0 ? 5 : 0, photoUsagePercent)}%`,
              }}
            />
          </div>

          <div className="text-[11px] text-sage-muted font-mono leading-tight text-start">
            {quotaStatus.isAdmin
              ? (language === 'he' ? 'תמונות ללא הגבלה' : 'Unlimited photos')
              : (language === 'he'
                  ? `${peakEventPhotoCount} / ${quotaStatus.maxPhotosPerEvent.toLocaleString()} תמונות`
                  : `${peakEventPhotoCount} / ${quotaStatus.maxPhotosPerEvent.toLocaleString()} photos`)}
          </div>
        </div>
      </div>

      {/* CTA Button in Sidebar */}
      <div className="px-5 mb-5">
        <button
          onClick={handleOpenNewEventFlow}
          className="w-full bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary-container transition-colors shadow-sm cursor-pointer border-none active:scale-95 text-background"
        >
          <Plus className="w-4 h-4" />
          <span>{t('dashboard.newEventBtn')}</span>
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
          className={`absolute top-0 bottom-0 w-64 bg-surface-container-low h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 ease-out ${
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
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-6 md:px-12 py-6 flex items-center justify-between border-b border-sage-muted/10 w-full min-h-[72px] text-start">
          {activeTab === 'events' && showMobileSearch ? (
            /* Mobile Search Bar Overlay */
            <div className="flex items-center gap-2 w-full text-start animate-in fade-in duration-200" dir={isRtl ? 'rtl' : 'ltr'}>
              <button
                onClick={() => {
                  setShowMobileSearch(false);
                  setSearchQuery('');
                }}
                className="p-2 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container transition-colors cursor-pointer border-none bg-transparent"
                title={language === 'he' ? 'חזור' : 'Back'}
              >
                <ArrowLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
              </button>
              <div className="flex-1 flex items-center bg-surface-container rounded-full px-4 py-2 border border-surface-border focus-within:border-sage-muted/50 transition-colors text-start relative">
                <Search className={`text-sage-muted shrink-0 w-4.5 h-4.5 ${isRtl ? 'ml-2' : 'mr-2'}`} />
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
            /* Standard Header (Matching Stitch Assets) */
            <>
              {/* Mobile Menu Toggle */}
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden text-on-background p-2 rounded-lg hover:bg-surface-container transition-colors border-none bg-transparent cursor-pointer"
                title={language === 'he' ? 'תפריט' : 'Menu'}
              >
                <Menu className="w-5 h-5 text-on-background" />
              </button>

              {/* Desktop Search bar (Subtle) */}
              {activeTab === 'events' ? (
                <div className="hidden sm:flex items-center bg-surface-container rounded-full px-4 py-2 border border-surface-border focus-within:border-sage-muted/50 transition-colors w-64 lg:w-96 text-start relative shadow-sm">
                  <Search className={`text-sage-muted shrink-0 w-4.5 h-4.5 ${isRtl ? 'ml-2' : 'mr-2'}`} />
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
                      className={`absolute p-1 rounded-full text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-all cursor-pointer border-none bg-transparent ${
                        isRtl ? 'left-3' : 'right-3'
                      }`}
                      title={language === 'he' ? 'נקה חיפוש' : 'Clear search'}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                /* Spacer if not events tab and on desktop */
                <div className="hidden sm:block w-64 lg:w-96" />
              )}

              {/* User Profile & Actions */}
              <div className={`flex items-center gap-3 sm:gap-4 ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
                {/* Mobile Search Toggle (only on events tab on small screens) */}
                {activeTab === 'events' && (
                  <button
                    onClick={() => setShowMobileSearch(true)}
                    className="sm:hidden text-on-background p-2 rounded-lg hover:bg-surface-container transition-colors cursor-pointer border-none bg-transparent"
                    title={language === 'he' ? 'חיפוש' : 'Search'}
                  >
                    <Search className="w-5 h-5 text-sage-muted" />
                  </button>
                )}
                
                {user && (
                  <div className="flex items-center gap-3.5 text-start">
                    {/* Display name & Event Organizer role text */}
                    <div className="text-end hidden md:flex flex-col">
                      <p className="font-title-md text-sm font-bold text-on-background m-0">{user.displayName || 'Organizer'}</p>
                      <p className="font-label-sm text-[10px] text-sage-muted uppercase tracking-wider font-bold m-0">{language === 'he' ? 'מארגן האירוע' : 'Event Organizer'}</p>
                    </div>

                    {/* Avatar Badge */}
                    <div className="w-10 h-10 rounded-full border border-sage-muted/30 overflow-hidden shadow-sm flex items-center justify-center shrink-0 bg-surface-container-high">
                      {user.photoURL && !imgError ? (
                        <img 
                          src={user.photoURL} 
                          alt={user.displayName || 'User profile'} 
                          referrerPolicy="no-referrer"
                          onError={() => setImgError(true)}
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <span className="font-bold text-sm text-copper-accent">{(user.displayName || 'U')[0].toUpperCase()}</span>
                      )}
                    </div>

                    {/* Sign Out Button */}
                    <button
                      onClick={signOut}
                      className="p-2 rounded-lg hover:bg-surface-container text-sage-muted hover:text-red-400 transition-all cursor-pointer border-none bg-transparent ms-1"
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
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-2 gap-4">
                <div>
                  <h2 className="font-display-lg text-3xl md:text-4xl text-on-background m-0 mb-2 font-bold">{language === 'he' ? 'האירועים שלי' : 'My Events'}</h2>
                  <p className="font-body-md text-sage-muted m-0">{language === 'he' ? 'נהל את אוספי האירועים שלך' : 'Manage your events collections'}</p>
                </div>
                
                {/* Filters & View switcher */}
                <div className="flex items-center gap-3 self-start md:self-auto relative">
                  {/* Filter Dropdown Toggle */}
                  <div className="relative">
                    <button
                      onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                      className={`px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                        statusFilter !== 'all' || providerFilter !== 'all'
                          ? 'bg-copper-accent/15 border-copper-accent text-copper-accent shadow-sm'
                          : 'border-surface-border/70 text-on-background hover:bg-surface-container bg-surface-container-low'
                      }`}
                    >
                      <Filter className="w-4 h-4 text-copper-accent" />
                      <span>{t('dashboard.filterBtn')}</span>
                      {(statusFilter !== 'all' || providerFilter !== 'all') && (
                        <span className="w-2 h-2 rounded-full bg-copper-accent animate-pulse" />
                      )}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Filter Popover Dropdown */}
                    {showFilterDropdown && (
                      <div className={`absolute top-full mt-2 z-40 w-64 bg-surface-container border border-surface-border rounded-xl shadow-2xl p-4 flex flex-col gap-4 text-start animate-in fade-in duration-150 ${
                        isRtl ? 'right-0' : 'left-0 md:left-auto md:right-0'
                      }`}>
                        {/* Status Filter Section */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-bold text-sage-muted uppercase tracking-wider">{t('dashboard.filterByStatus')}</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(['all', 'ready', 'scanning', 'pending'] as const).map((st) => (
                              <button
                                key={st}
                                onClick={() => { setStatusFilter(st); setShowFilterDropdown(false); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all border-none ${
                                  statusFilter === st
                                    ? 'bg-copper-accent text-background font-bold shadow'
                                    : 'bg-surface-container-low text-sage-muted hover:text-on-background hover:bg-surface-container-high'
                                }`}
                              >
                                {st === 'all' ? t('dashboard.filterAll') : st === 'ready' ? (language === 'he' ? 'מוכן' : 'Ready') : st === 'scanning' ? (language === 'he' ? 'סורק' : 'Scanning') : (language === 'he' ? 'ממתין' : 'Pending')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Provider Filter Section */}
                        <div className="flex flex-col gap-1.5 border-t border-surface-border/40 pt-3">
                          <label className="text-[11px] font-bold text-sage-muted uppercase tracking-wider">{t('dashboard.filterByProvider')}</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(['all', 'google', 'dropbox', 'onedrive'] as const).map((pr) => (
                              <button
                                key={pr}
                                onClick={() => { setProviderFilter(pr); setShowFilterDropdown(false); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all border-none ${
                                  providerFilter === pr
                                    ? 'bg-copper-accent text-background font-bold shadow'
                                    : 'bg-surface-container-low text-sage-muted hover:text-on-background hover:bg-surface-container-high'
                                }`}
                              >
                                {pr === 'all' ? t('dashboard.filterAll') : pr === 'google' ? 'Google' : pr === 'dropbox' ? 'Dropbox' : 'OneDrive'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {(statusFilter !== 'all' || providerFilter !== 'all') && (
                          <button
                            onClick={() => { setStatusFilter('all'); setProviderFilter('all'); setShowFilterDropdown(false); }}
                            className="text-xs text-copper-accent hover:underline font-bold self-end border-none bg-transparent cursor-pointer pt-1"
                          >
                            {t('dashboard.clearSearch')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Grid / List view mode switcher */}
                  <div className="flex bg-surface-container-low rounded-full p-1 border border-surface-border/50">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded-full transition-all cursor-pointer border-none ${
                        viewMode === 'grid'
                          ? 'bg-surface-container-highest shadow text-on-background'
                          : 'text-sage-muted hover:text-on-background'
                      }`}
                      title={t('dashboard.gridView')}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded-full transition-all cursor-pointer border-none ${
                        viewMode === 'list'
                          ? 'bg-surface-container-highest shadow text-on-background'
                          : 'text-sage-muted hover:text-on-background'
                      }`}
                      title={t('dashboard.listView')}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Grid / List view of events */}
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
                    <button
                      onClick={handleOpenNewEventFlow}
                      className="mt-6 px-6 py-2.5 rounded-xl bg-deep-forest hover:bg-primary text-background font-bold text-xs transition-all cursor-pointer inline-flex items-center gap-2 shadow-sm border-none active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{t('dashboard.newEventBtn')}</span>
                    </button>
                  </div>
                </div>
              ) : filteredEvents.length === 0 ? (
                /* No Matches for Search or Filters */
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
                      onClick={() => { setSearchQuery(''); setStatusFilter('all'); setProviderFilter('all'); }}
                      className="mt-6 px-5 py-2 rounded-lg bg-surface-container-high border border-surface-border text-on-background hover:bg-surface-container transition-all cursor-pointer font-bold text-xs"
                    >
                      {t('dashboard.clearSearch')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Events Container (Grid View vs List View) */}
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredEvents.slice(0, visibleCount).map((event) => {
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
                            className={`group relative bg-surface-container rounded-2xl p-6 border border-surface-border hover:border-copper-accent/40 ${
                              isDeleting ? 'opacity-75 overflow-hidden' : 'cursor-pointer hover:shadow-2xl hover:-translate-y-0.5'
                            } transition-all duration-300 flex flex-col justify-between h-full text-start shadow-sm`}
                          >
                            {/* Top Row: Pill Badge + Three Dots Menu */}
                            <div className="flex items-center justify-between gap-2 mb-4">
                              <div className="bg-surface-container-high px-3 py-1 rounded-full border border-surface-border flex items-center gap-2">
                                {isThisEventScanning ? (
                                  <>
                                    <span className="w-2 h-2 rounded-full bg-copper-accent animate-pulse" />
                                    <span className="font-label-sm text-[10px] text-copper-accent font-bold uppercase tracking-wider">
                                      {language === 'he' ? 'סורק כעת' : 'ACTIVE PROCESSING'}
                                    </span>
                                  </>
                                ) : event.status === 'ready' ? (
                                  <>
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="font-label-sm text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                                      {language === 'he' ? 'מוכן' : 'READY'}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="w-2 h-2 rounded-full bg-sage-muted" />
                                    <span className="font-label-sm text-[10px] text-sage-muted font-bold uppercase tracking-wider">
                                      {language === 'he' ? 'ממתין' : 'PENDING'}
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Three Dots Button */}
                              {!isDeleting && (
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuEventId(openMenuEventId === event.id ? null : event.id!);
                                    }}
                                    className="p-1.5 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-colors cursor-pointer border-none bg-transparent"
                                    title={language === 'he' ? 'פעולות נוספות' : 'More options'}
                                  >
                                    <MoreHorizontal className="w-5 h-5" />
                                  </button>

                                  {/* Popover Dropdown for Three Dots */}
                                  {openMenuEventId === event.id && (
                                    <div
                                      className={`absolute top-10 ${isRtl ? 'left-0' : 'right-0'} z-30 w-52 bg-surface-container-high border border-surface-border rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 text-start animate-in fade-in duration-150`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        onClick={(e) => { setOpenMenuEventId(null); handleCopyShareLink(event, e); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-sage-muted hover:text-on-background hover:bg-surface-container transition-colors cursor-pointer border-none bg-transparent text-start font-medium"
                                      >
                                        {copiedId === event.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4 text-copper-accent" />}
                                        <span>{language === 'he' ? 'העתק קישור שיתוף' : 'Copy share link'}</span>
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setOpenMenuEventId(null); setQrEvent(event); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-sage-muted hover:text-on-background hover:bg-surface-container transition-colors cursor-pointer border-none bg-transparent text-start font-medium"
                                      >
                                        <QrCode className="w-4 h-4 text-copper-accent" />
                                        <span>{language === 'he' ? 'הצג QR קוד' : 'Show QR code'}</span>
                                      </button>
                                      <div className="my-1 border-t border-surface-border" />
                                      <button
                                        onClick={(e) => { setOpenMenuEventId(null); handleDeleteCloudEvent(event, e); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer border-none bg-transparent text-start font-medium"
                                      >
                                        <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
                                        <span>{language === 'he' ? 'מחק אירוע' : 'Delete event'}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Middle Section: Date & Title */}
                            <div className="flex flex-col text-start mb-4">
                              <p className="font-label-sm text-xs text-sage-muted font-bold tracking-wider mb-1 m-0">
                                {event.createdAt && typeof event.createdAt === 'object' && 'toDate' in event.createdAt
                                  ? event.createdAt.toDate().toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US').replace(/\//g, '.')
                                  : '17.07.2026'}
                              </p>
                              <h3 className="font-display-lg text-2xl font-bold text-on-background group-hover:text-copper-accent transition-colors line-clamp-1 m-0">
                                {event.name}
                              </h3>
                            </div>

                            {/* Active Scanning Bar if scanning */}
                            {isThisEventScanning && (
                              <div className="flex flex-col gap-2 w-full text-start mb-4" onClick={(e) => e.stopPropagation()}>
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

                            {/* Bento Grid: Photos Uploaded & Cloud Provider */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                              {/* Box 1: Photos */}
                              <div className="bg-surface-container-high/60 backdrop-blur-sm p-4 rounded-xl border border-surface-border flex flex-col text-start justify-between min-h-[96px]">
                                <ImageIcon className="w-5 h-5 text-sage-muted mb-2 shrink-0" />
                                <div className="flex flex-col text-start">
                                  <span className="font-title-md text-xl font-bold text-on-background leading-tight">
                                    {isThisEventScanning ? eventScannedCount : (event.photoCount || 0).toLocaleString()}
                                  </span>
                                  <span className="font-label-sm text-[10px] text-sage-muted font-bold uppercase tracking-wider mt-1">
                                    {language === 'he' ? 'תמונות שנטענו' : 'PHOTOS UPLOADED'}
                                  </span>
                                </div>
                              </div>

                              {/* Box 2: Cloud Provider */}
                              <div className="bg-surface-container-high/60 backdrop-blur-sm p-4 rounded-xl border border-surface-border flex flex-col text-start justify-between min-h-[96px] min-w-0">
                                <div className="mb-2 shrink-0 flex items-center">
                                  {event.provider === 'google' ? (
                                    <GoogleIcon className="w-5 h-5 shrink-0" alt="Google Drive" />
                                  ) : event.provider === 'onedrive' ? (
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-500 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M19.33 11.5A5 5 0 0 0 10.08 9A6.5 6.5 0 0 0 4.67 19.5H19.33A4.5 4.5 0 0 0 19.33 11.5Z" />
                                      <path d="M16 11a4.5 4.5 0 0 0-8.33-2.17A5.5 5.5 0 0 0 2.5 17.5h13.83A3.5 3.5 0 0 0 16 11Z" opacity="0.8" />
                                    </svg>
                                  ) : (
                                    <DropboxIcon className="w-5 h-5 shrink-0" />
                                  )}
                                </div>
                                <div className="flex flex-col text-start min-w-0">
                                  <span className="font-title-md text-base font-bold text-on-background capitalize truncate leading-tight">
                                    {event.provider === 'google' ? 'Google Drive' : event.provider === 'onedrive' ? 'OneDrive' : 'Dropbox'}
                                  </span>
                                  <span className="font-label-sm text-[10px] text-sage-muted font-bold uppercase tracking-wider mt-1 truncate">
                                    {language === 'he' ? 'ספק ענן' : 'CLOUD PROVIDER'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Bottom Row: OPEN EVENT Button + Dedicated Share Icon Button */}
                            <div className="flex items-center gap-3 mt-auto">
                              <button
                                onClick={() => navigate(`/dashboard/event/${event.id}`)}
                                className="flex-1 bg-deep-forest text-white dark:bg-[#e1e8e5] dark:text-[#111413] hover:opacity-90 font-label-sm text-xs font-bold uppercase tracking-wider py-3.5 px-4 rounded-xl flex items-center justify-center transition-all shadow-sm cursor-pointer border-none"
                              >
                                <span>{language === 'he' ? 'פתח אירוע' : 'OPEN EVENT'}</span>
                              </button>
                              <button
                                onClick={(e) => handleShare(event, e)}
                                title={t('common.share')}
                                className="p-3 rounded-xl border border-surface-border text-sage-muted hover:text-copper-accent hover:border-copper-accent/50 hover:bg-surface-container-high transition-colors shrink-0 bg-transparent flex items-center justify-center cursor-pointer shadow-sm"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Deleting overlay */}
                            {isDeleting && (
                              <div className="absolute inset-0 bg-surface-container/90 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center gap-3 p-4 text-center">
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
                  ) : (
                    /* List View Layout */
                    <div className="flex flex-col gap-3">
                      {filteredEvents.slice(0, visibleCount).map((event) => {
                        const isThisEventScanning = isEventScanning(event.id!);
                        const eventScanState = getEventScanState(event.id!);
                        const eventScannedCount = eventScanState?.scannedCount ?? 0;
                        const isDeleting = event.id ? deletingEventIds.has(event.id) : false;

                        return (
                          <div
                            key={event.id}
                            onClick={isDeleting ? undefined : () => navigate(`/dashboard/event/${event.id}`)}
                            className={`group relative border border-surface-border/60 ${isDeleting ? 'opacity-75 overflow-hidden' : 'hover:border-copper-accent/35 cursor-pointer hover:shadow-xl'} bg-surface-container rounded-xl p-5 transition-all duration-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow text-start`}
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="p-3 rounded-xl bg-surface-container-low border border-surface-border/50 shrink-0">
                                {event.provider === 'google' ? (
                                  <GoogleIcon className="w-5 h-5 shrink-0" alt="Google Drive" />
                                ) : event.provider === 'onedrive' ? (
                                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M19.33 11.5A5 5 0 0 0 10.08 9A6.5 6.5 0 0 0 4.67 19.5H19.33A4.5 4.5 0 0 0 19.33 11.5Z" />
                                    <path d="M16 11a4.5 4.5 0 0 0-8.33-2.17A5.5 5.5 0 0 0 2.5 17.5h13.83A3.5 3.5 0 0 0 16 11Z" opacity="0.8" />
                                  </svg>
                                ) : (
                                  <DropboxIcon className="w-5 h-5 shrink-0" />
                                )}
                              </div>
                              <div className="flex flex-col gap-1 min-w-0 flex-1 text-start">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-display-lg text-lg text-on-background group-hover:text-copper-accent transition-colors truncate m-0 font-bold">
                                    {event.name}
                                  </h3>
                                  {isThisEventScanning ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-copper-accent/15 text-copper-accent border border-copper-accent/20 animate-pulse shrink-0">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> {language === 'he' ? 'סורק' : 'Scanning'}
                                    </span>
                                  ) : (
                                    getStatusBadge(event.status)
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-sage-muted flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>{event.createdAt && typeof event.createdAt === 'object' && 'toDate' in event.createdAt ? event.createdAt.toDate().toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US').replace(/\//g, '.') : (language === 'he' ? 'ממתין' : 'Pending')}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    <span>{isThisEventScanning ? eventScannedCount : event.photoCount} {language === 'he' ? 'תמונות' : 'photos'}</span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Actions & Link in List View */}
                            <div className="flex items-center gap-2 self-end md:self-auto shrink-0 z-10" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => handleShare(event, e)}
                                title={t('common.share')}
                                className="p-2 rounded-lg bg-surface-container-high border border-surface-border text-sage-muted hover:text-copper-accent transition-all cursor-pointer shadow-sm"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleCopyShareLink(event, e)}
                                title={language === 'he' ? 'העתק קישור שיתוף' : 'Copy share link'}
                                className="p-2 rounded-lg bg-surface-container-high border border-surface-border text-sage-muted hover:text-copper-accent transition-all cursor-pointer shadow-sm"
                              >
                                {copiedId === event.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setQrEvent(event); }}
                                title={language === 'he' ? 'הצג QR קוד' : 'Show QR code'}
                                className="p-2 rounded-lg bg-surface-container-high border border-surface-border text-sage-muted hover:text-copper-accent transition-all cursor-pointer shadow-sm"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteCloudEvent(event, e)}
                                title={language === 'he' ? 'מחק אירוע' : 'Delete event'}
                                className="p-2 rounded-lg bg-surface-container-high border border-surface-border text-sage-muted hover:text-red-400 transition-all cursor-pointer shadow-sm"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => navigate(`/dashboard/event/${event.id}`)}
                                className="px-3 py-1.5 rounded-lg bg-surface-container-high border border-surface-border text-copper-accent hover:bg-surface-container-highest transition-all cursor-pointer font-bold text-xs flex items-center gap-1 ms-2"
                              >
                                <span>{language === 'he' ? 'פתח' : 'Open'}</span>
                                <ArrowLeft className={`w-3.5 h-3.5 ${isRtl ? '' : 'rotate-180'}`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Load More Button */}
                  {filteredEvents.length > visibleCount && (
                    <div className="flex flex-col items-center justify-center gap-3 pt-6">
                      <button
                        onClick={() => setVisibleCount((prev) => prev + 6)}
                        className="px-6 py-3 rounded-xl bg-surface-container-high hover:bg-surface-container border border-surface-border/80 text-on-background font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow hover:border-copper-accent/40 active:scale-95 flex items-center gap-2"
                      >
                        <span>{t('dashboard.loadMoreEvents')}</span>
                        <ChevronDown className="w-4 h-4 text-copper-accent" />
                      </button>
                      <span className="text-xs text-sage-muted">
                        {t('dashboard.showingEventsCount', { shown: Math.min(visibleCount, filteredEvents.length), total: filteredEvents.length })}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : activeTab === 'admin' && isAdmin ? (
            <AdminManagement embedded={true} />
          ) : activeTab === 'allowlist' && isAdmin ? (
            <AllowlistManagement embedded={true} />
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
                  {/* Google Drive */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-surface-border hover:border-copper-accent/40 transition-all">
                    <div className="flex items-center gap-3 text-start">
                      <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center border border-surface-border shrink-0">
                        <GoogleIcon className="w-5 h-5 shrink-0" alt="Google Drive" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-on-background m-0">Google Drive</p>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 tracking-wide">
                            {t('settings.recommended')}
                          </span>
                        </div>
                        <p className="text-xs text-sage-muted m-0">
                          {expiredProviders.includes('google') ? (
                            <span className="text-red-400 font-semibold">{t('settings.expired')}</span>
                          ) : isGoogleConnected || googleAccessToken ? (
                            <span className="text-emerald-400 font-semibold">{t('settings.connected')}</span>
                          ) : (
                            t('settings.notConnected')
                          )}
                        </p>
                      </div>
                    </div>
                    {expiredProviders.includes('google') ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={connectGoogle}
                          className="px-4 py-2 rounded bg-copper-accent hover:bg-copper-accent/90 text-background text-xs font-bold transition-all cursor-pointer border-none shadow"
                        >
                          {t('settings.reconnect')}
                        </button>
                        <button
                          onClick={() => handleDisconnectProvider('google')}
                          className="px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/25 hover:border-red-500/50 text-xs font-bold transition-all cursor-pointer"
                        >
                          {t('settings.disconnect')}
                        </button>
                      </div>
                    ) : isGoogleConnected || googleAccessToken ? (
                      <button
                        onClick={() => handleDisconnectProvider('google')}
                        className="px-4 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/25 hover:border-red-500/50 text-xs font-bold transition-all cursor-pointer"
                      >
                        {t('settings.disconnect')}
                      </button>
                    ) : (
                      <button
                        onClick={connectGoogle}
                        className="px-4 py-2 rounded bg-deep-forest hover:bg-primary text-background text-xs font-bold transition-all cursor-pointer border-none"
                      >
                        {t('settings.connect')}
                      </button>
                    )}
                  </div>

                  {/* Dropbox */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-surface-border hover:border-[#0061FE]/40 transition-all">
                    <div className="flex items-center gap-3 text-start">
                      <div className="w-10 h-10 rounded-lg bg-[#0061FE]/10 flex items-center justify-center border border-[#0061FE]/30 shrink-0">
                        <DropboxIcon className="w-5 h-5 shrink-0" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-on-background m-0">Dropbox</p>
                        <p className="text-xs text-sage-muted m-0">
                          {expiredProviders.includes('dropbox') ? (
                            <span className="text-red-400 font-semibold">{t('settings.expired')}</span>
                          ) : isDropboxConnected || dropboxAccessToken ? (
                            <span className="text-emerald-400 font-semibold">{t('settings.connected')}</span>
                          ) : (
                            t('settings.notConnected')
                          )}
                        </p>
                      </div>
                    </div>
                    {expiredProviders.includes('dropbox') ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={connectDropbox}
                          className="px-4 py-2 rounded bg-copper-accent hover:bg-copper-accent/90 text-background text-xs font-bold transition-all cursor-pointer border-none shadow"
                        >
                          {t('settings.reconnect')}
                        </button>
                        <button
                          onClick={() => handleDisconnectProvider('dropbox')}
                          className="px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/25 hover:border-red-500/50 text-xs font-bold transition-all cursor-pointer"
                        >
                          {t('settings.disconnect')}
                        </button>
                      </div>
                    ) : isDropboxConnected || dropboxAccessToken ? (
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
                          {expiredProviders.includes('onedrive') ? (
                            <span className="text-red-400 font-semibold">{t('settings.expired')}</span>
                          ) : isOneDriveConnected || onedriveAccessToken ? (
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

            {/* Quota limit helper badge & progress */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-surface-border flex flex-col gap-2 text-start">
              <div className="flex items-center justify-between text-xs text-sage-muted">
                <div className="flex items-center gap-1.5 font-medium text-on-background">
                  {quotaStatus.isAdmin ? (
                    <Shield className="w-3.5 h-3.5 text-copper-accent" />
                  ) : quotaStatus.isPremium ? (
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-copper-accent" />
                  )}
                  <span>{quotaStatus.tierName}</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-on-background">
                  {quotaStatus.isAdmin
                    ? t('dashboard.monthlyUsageUnlimited')
                    : `${pendingPhotos.length} / ${quotaStatus.maxPhotosPerEvent.toLocaleString()} (${Math.round((pendingPhotos.length / quotaStatus.maxPhotosPerEvent) * 100)}%)`}
                </span>
              </div>

              {!quotaStatus.isAdmin && (
                <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden border border-surface-border/40">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      pendingPhotos.length > quotaStatus.maxPhotosPerEvent
                        ? 'bg-red-400'
                        : pendingPhotos.length / quotaStatus.maxPhotosPerEvent >= 0.75
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(pendingPhotos.length > 0 ? 5 : 0, Math.round((pendingPhotos.length / quotaStatus.maxPhotosPerEvent) * 100)))}%`,
                    }}
                  />
                </div>
              )}
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

            {/* Photo count limit warning if exceeded */}
            {pendingPhotos.length > quotaStatus.maxPhotosPerEvent && (
              <div className="bg-red-500/15 border-2 border-red-500/50 rounded-xl p-3.5 text-start flex items-start gap-2.5 shadow-md">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-300 m-0 leading-relaxed">
                  {t('dashboard.photoLimitExceededMessage')
                    .replace('{count}', pendingPhotos.length.toString())
                    .replace('{tier}', quotaStatus.tierName)
                    .replace('{max}', quotaStatus.maxPhotosPerEvent.toString())}
                </p>
              </div>
            )}

            <div className="bg-amber-500/15 dark:bg-amber-500/20 border-2 border-amber-500/50 dark:border-amber-400/50 rounded-xl p-4 text-start flex items-start gap-3 shadow-md">
              <div className="p-2 rounded-lg bg-amber-500/25 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5 shadow-sm">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  {language === 'he' ? 'חשוב: הרשאת שיתוף תיקייה' : 'IMPORTANT: FOLDER SHARING PERMISSION'}
                </span>
                <p className="text-xs font-semibold text-amber-950 dark:text-amber-100 leading-relaxed m-0">
                  {language === 'he'
                    ? `לתשומת לבך: יש לוודא שהתיקייה ב-${selectedProvider === 'google' ? 'Google Drive' : selectedProvider === 'onedrive' ? 'OneDrive' : 'Dropbox'} מוגדרת כציבורית לצפייה ("כל מי שיש לו את הקישור"), כדי שהאורחים יוכלו לצפות בתמונות שלהם.`
                    : `Important: Please ensure this ${selectedProvider === 'google' ? 'Google Drive' : selectedProvider === 'onedrive' ? 'OneDrive' : 'Dropbox'} folder is set to public view ("Anyone with the link can view") so guests can access their photos.`}
                </p>
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
                disabled={creating || !newEventName.trim() || pendingPhotos.length > quotaStatus.maxPhotosPerEvent}
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

      {/* Google Drive Event Creation Modal */}
      {showGoogleCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGoogleCreateModal(false)}>
          <div className="bg-surface-container border border-surface-border rounded-xl p-8 max-w-lg w-full shadow-2xl flex flex-col gap-6" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-border flex items-center justify-center">
                  <GoogleIcon className="w-4 h-4 shrink-0" alt="Google Drive" />
                </div>
                <h3 className="font-display-lg text-xl text-on-background m-0">
                  {language === 'he' ? 'אירוע חדש ב-Google Drive' : 'New Google Drive Event'}
                </h3>
              </div>
              <button
                onClick={() => { setShowGoogleCreateModal(false); setSelectedLocalFiles([]); setNewEventName(''); }}
                className="p-1.5 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quota limit helper badge & progress */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-surface-border flex flex-col gap-2 text-start">
              <div className="flex items-center justify-between text-xs text-sage-muted">
                <div className="flex items-center gap-1.5 font-medium text-on-background">
                  {quotaStatus.isAdmin ? (
                    <Shield className="w-3.5 h-3.5 text-copper-accent" />
                  ) : quotaStatus.isPremium ? (
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-copper-accent" />
                  )}
                  <span>{quotaStatus.tierName}</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-on-background">
                  {quotaStatus.isAdmin
                    ? t('dashboard.monthlyUsageUnlimited')
                    : `${selectedLocalFiles.length} / ${quotaStatus.maxPhotosPerEvent.toLocaleString()} (${Math.round((selectedLocalFiles.length / quotaStatus.maxPhotosPerEvent) * 100)}%)`}
                </span>
              </div>

              {!quotaStatus.isAdmin && (
                <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden border border-surface-border/40">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent
                        ? 'bg-red-400'
                        : selectedLocalFiles.length / quotaStatus.maxPhotosPerEvent >= 0.75
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(selectedLocalFiles.length > 0 ? 5 : 0, Math.round((selectedLocalFiles.length / quotaStatus.maxPhotosPerEvent) * 100)))}%`,
                    }}
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-sage-muted m-0 text-start">
              {language === 'he'
                ? 'בחר תמונות או תיקייה מהמחשב. המערכת תקים תיקייה ב-Google Drive שלך, תעלה ותסרוק את התמונות מקומית בדפדפן.'
                : 'Select photos or a folder from your computer. The app will create a folder in your Google Drive, upload, and scan faces locally.'}
            </p>

            {/* Select Local Files / Folder Dropzone */}
            <div className="flex flex-col gap-2 text-start">
              <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">
                {language === 'he' ? 'בחירת תמונות מהמחשב:' : 'Select Photos from Computer:'}
              </label>
              <div className="relative border-2 border-dashed border-surface-border hover:border-copper-accent/50 rounded-xl p-6 bg-surface-container-low transition-all text-center flex flex-col items-center justify-center gap-3">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const filesArr = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
                      setSelectedLocalFiles(filesArr);
                      if (!newEventName && filesArr.length > 0) {
                        const folderPath = filesArr[0].webkitRelativePath;
                        const inferredName = folderPath ? folderPath.split('/')[0] : 'אירוע Google Drive';
                        setNewEventName(inferredName);
                      }
                    }
                  }}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                />
                <div className="w-12 h-12 rounded-full bg-copper-accent/10 border border-copper-accent/20 flex items-center justify-center text-copper-accent">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-on-background m-0">
                    {selectedLocalFiles.length > 0
                      ? (language === 'he' ? `נבחרו ${selectedLocalFiles.length} תמונות` : `${selectedLocalFiles.length} photos selected`)
                      : (language === 'he' ? 'לחץ לבחירת תמונות או גרור לכאן' : 'Click to select photos or drag & drop')}
                  </p>
                  <p className="text-[11px] text-sage-muted m-0 mt-1">
                    {selectedLocalFiles.length > 0
                      ? (language === 'he' ? 'לחץ שוב לבחירת קבצים אחרים' : 'Click to re-select files')
                      : (language === 'he' ? 'ניתן לבחור מספר רב של תמונות (JPG, PNG, WebP)' : 'Supports multiple image files (JPG, PNG, WebP)')}
                  </p>
                </div>
              </div>
            </div>

            {/* Photo count limit warning if exceeded */}
            {selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent && (
              <div className="bg-red-500/15 border-2 border-red-500/50 rounded-xl p-3.5 text-start flex items-start gap-2.5 shadow-md">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-300 m-0 leading-relaxed">
                  {t('dashboard.photoLimitExceededMessage')
                    .replace('{count}', selectedLocalFiles.length.toString())
                    .replace('{tier}', quotaStatus.tierName)
                    .replace('{max}', quotaStatus.maxPhotosPerEvent.toString())}
                </p>
              </div>
            )}

            {/* Event Name Input */}
            <div className="flex flex-col gap-2 text-start">
              <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">
                {language === 'he' ? 'שם האירוע (ושם התיקייה ב-Drive):' : 'Event Name (Google Drive Folder):'}
              </label>
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder={language === 'he' ? 'למשל: חתונת יוסי ודנה 2026' : 'e.g., Yossi & Dana Wedding 2026'}
                className="px-4 py-3 rounded bg-surface-container-low border border-surface-border focus:border-copper-accent focus:outline-none text-on-background text-sm placeholder:text-sage-muted transition-colors w-full"
              />
            </div>

            {/* Submit / Cancel buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCreateGoogleEvent}
                disabled={creating || selectedLocalFiles.length === 0 || !newEventName.trim() || selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent}
                className="flex-1 py-3 rounded bg-deep-forest hover:bg-primary text-background font-bold text-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none shadow-lg"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {language === 'he' ? 'מקים תיקייה ומתחיל...' : 'Creating folder & starting...'}</>
                ) : (
                  <><Plus className="w-4 h-4" /> {language === 'he' ? 'צור אירוע והעלה ל-Drive' : 'Create Event & Upload'}</>
                )}
              </button>
              <button
                onClick={() => { setShowGoogleCreateModal(false); setSelectedLocalFiles([]); setNewEventName(''); }}
                className="px-6 py-3 rounded bg-surface-container-high hover:bg-surface-border text-on-background font-medium text-sm transition-all cursor-pointer border-none"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dropbox Event Creation Modal */}
      {showDropboxCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDropboxCreateModal(false)}>
          <div className="bg-surface-container border border-surface-border rounded-xl p-8 max-w-lg w-full shadow-2xl flex flex-col gap-6" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0061FE]/10 border border-[#0061FE]/30 flex items-center justify-center">
                  <DropboxIcon className="w-4 h-4 shrink-0" />
                </div>
                <h3 className="font-display-lg text-xl text-on-background m-0">
                  {language === 'he' ? 'אירוע חדש ב-Dropbox' : 'New Dropbox Event'}
                </h3>
              </div>
              <button
                onClick={() => { setShowDropboxCreateModal(false); setSelectedLocalFiles([]); setNewEventName(''); }}
                className="p-1.5 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quota limit helper badge & progress */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-surface-border flex flex-col gap-2 text-start">
              <div className="flex items-center justify-between text-xs text-sage-muted">
                <div className="flex items-center gap-1.5 font-medium text-on-background">
                  {quotaStatus.isAdmin ? (
                    <Shield className="w-3.5 h-3.5 text-copper-accent" />
                  ) : quotaStatus.isPremium ? (
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-copper-accent" />
                  )}
                  <span>{quotaStatus.tierName}</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-on-background">
                  {quotaStatus.isAdmin
                    ? t('dashboard.monthlyUsageUnlimited')
                    : `${selectedLocalFiles.length} / ${quotaStatus.maxPhotosPerEvent.toLocaleString()} (${Math.round((selectedLocalFiles.length / quotaStatus.maxPhotosPerEvent) * 100)}%)`}
                </span>
              </div>

              {!quotaStatus.isAdmin && (
                <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden border border-surface-border/40">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent
                        ? 'bg-red-400'
                        : selectedLocalFiles.length / quotaStatus.maxPhotosPerEvent >= 0.75
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(selectedLocalFiles.length > 0 ? 5 : 0, Math.round((selectedLocalFiles.length / quotaStatus.maxPhotosPerEvent) * 100)))}%`,
                    }}
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-sage-muted m-0 text-start">
              {language === 'he'
                ? 'בחר תמונות או תיקייה מהמחשב. המערכת תקים תיקייה ב-Dropbox שלך, תעלה ותסרוק את התמונות מקומית בדפדפן.'
                : 'Select photos or a folder from your computer. The app will create a folder in your Dropbox, upload, and scan faces locally.'}
            </p>

            {/* Select Local Files / Folder Dropzone */}
            <div className="flex flex-col gap-2 text-start">
              <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">
                {language === 'he' ? 'בחירת תמונות מהמחשב:' : 'Select Photos from Computer:'}
              </label>
              <div className="relative border-2 border-dashed border-surface-border hover:border-copper-accent/50 rounded-xl p-6 bg-surface-container-low transition-all text-center flex flex-col items-center justify-center gap-3">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const filesArr = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
                      setSelectedLocalFiles(filesArr);
                      if (!newEventName && filesArr.length > 0) {
                        const folderPath = filesArr[0].webkitRelativePath;
                        const inferredName = folderPath ? folderPath.split('/')[0] : 'אירוע Dropbox';
                        setNewEventName(inferredName);
                      }
                    }
                  }}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                />
                <div className="w-12 h-12 rounded-full bg-copper-accent/10 border border-copper-accent/20 flex items-center justify-center text-copper-accent">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-on-background m-0">
                    {selectedLocalFiles.length > 0
                      ? (language === 'he' ? `נבחרו ${selectedLocalFiles.length} תמונות` : `${selectedLocalFiles.length} photos selected`)
                      : (language === 'he' ? 'לחץ לבחירת תמונות או גרור לכאן' : 'Click to select photos or drag & drop')}
                  </p>
                  <p className="text-[11px] text-sage-muted m-0 mt-1">
                    {selectedLocalFiles.length > 0
                      ? (language === 'he' ? 'לחץ שוב לבחירת קבצים אחרים' : 'Click to re-select files')
                      : (language === 'he' ? 'ניתן לבחור מספר רב של תמונות (JPG, PNG, WebP)' : 'Supports multiple image files (JPG, PNG, WebP)')}
                  </p>
                </div>
              </div>
            </div>

            {/* Photo count limit warning if exceeded */}
            {selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent && (
              <div className="bg-red-500/15 border-2 border-red-500/50 rounded-xl p-3.5 text-start flex items-start gap-2.5 shadow-md">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-300 m-0 leading-relaxed">
                  {t('dashboard.photoLimitExceededMessage')
                    .replace('{count}', selectedLocalFiles.length.toString())
                    .replace('{tier}', quotaStatus.tierName)
                    .replace('{max}', quotaStatus.maxPhotosPerEvent.toString())}
                </p>
              </div>
            )}

            {/* Event Name Input */}
            <div className="flex flex-col gap-2 text-start">
              <label className="text-xs font-bold uppercase tracking-wider text-sage-muted">
                {language === 'he' ? 'שם האירוע (ושם התיקייה ב-Dropbox):' : 'Event Name (Dropbox Folder):'}
              </label>
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder={language === 'he' ? 'למשל: חתונת יוסי ודנה 2026' : 'e.g., Yossi & Dana Wedding 2026'}
                className="px-4 py-3 rounded bg-surface-container-low border border-surface-border focus:border-copper-accent focus:outline-none text-on-background text-sm placeholder:text-sage-muted transition-colors w-full"
              />
            </div>

            {/* Option to pick existing Dropbox folder */}
            <div className="flex items-center justify-between text-xs text-sage-muted pt-2 border-t border-surface-border/40">
              <span>{language === 'he' ? 'רוצה לבחור תיקייה קיימת ב-Dropbox?' : 'Want to pick an existing Dropbox folder?'}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedProvider('dropbox');
                  setShowDropboxCreateModal(false);
                  setShowFolderPicker(true);
                }}
                className="text-copper-accent hover:underline font-bold bg-transparent border-none cursor-pointer"
              >
                {language === 'he' ? 'סייר התיקיות של Dropbox' : 'Open Dropbox Folder Picker'}
              </button>
            </div>

            {/* Submit / Cancel buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCreateDropboxEvent}
                disabled={creating || selectedLocalFiles.length === 0 || !newEventName.trim() || selectedLocalFiles.length > quotaStatus.maxPhotosPerEvent}
                className="flex-1 py-3 rounded bg-deep-forest hover:bg-primary text-background font-bold text-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none shadow-lg"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {language === 'he' ? 'מקים תיקייה ומתחיל...' : 'Creating folder & starting...'}</>
                ) : (
                  <><Plus className="w-4 h-4" /> {language === 'he' ? 'צור אירוע והעלה ל-Dropbox' : 'Create Event & Upload'}</>
                )}
              </button>
              <button
                onClick={() => { setShowDropboxCreateModal(false); setSelectedLocalFiles([]); setNewEventName(''); }}
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
              <div className="flex gap-2 w-full">
                <button
                  onClick={(e) => handleShare(qrEvent, e)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded bg-copper-accent hover:bg-copper-accent/90 text-background text-sm font-bold transition-all cursor-pointer shadow border-none"
                >
                  <Share2 className="w-3.5 h-3.5" /> {t('common.share')}
                </button>
                <button
                  onClick={(e) => handleCopyShareLink(qrEvent, e)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded bg-surface-container-high border border-surface-border text-on-background hover:text-copper-accent text-sm font-bold transition-all cursor-pointer"
                >
                  {copiedId === qrEvent.id ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> {t('common.copied')}</> : <><Copy className="w-3.5 h-3.5" /> {language === 'he' ? 'העתק קישור' : 'Copy Link'}</>}
                </button>
              </div>
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
              {/* Google Drive Button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedProvider('google');
                  setShowProviderModal(false);
                  if (!googleAccessToken || expiredProviders.includes('google')) {
                    connectGoogle();
                  } else {
                    setNewEventName('');
                    setSelectedLocalFiles([]);
                    setPendingFolder(null);
                    setShowGoogleCreateModal(true);
                  }
                }}
                className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-surface-border hover:border-copper-accent/40 hover:bg-surface-container transition-all cursor-pointer text-start w-full text-on-background"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center border border-surface-border shrink-0">
                    <GoogleIcon className="w-4 h-4 shrink-0" alt="Google Drive" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm block">Google Drive</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 tracking-wide">
                        {t('settings.recommended')}
                      </span>
                    </div>
                    <span className="text-[10px] text-sage-muted">
                      {expiredProviders.includes('google') ? (
                        <span className="text-red-400 font-semibold">{t('settings.expired')}</span>
                      ) : isGoogleConnected || googleAccessToken ? (
                        t('settings.connected')
                      ) : (
                        t('settings.notConnected')
                      )}
                    </span>
                  </div>
                </div>
                {expiredProviders.includes('google') ? (
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                ) : (isGoogleConnected || googleAccessToken) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>

              {/* Dropbox Button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedProvider('dropbox');
                  setShowProviderModal(false);
                  if (!dropboxAccessToken || expiredProviders.includes('dropbox')) {
                    connectDropbox();
                  } else {
                    setNewEventName('');
                    setSelectedLocalFiles([]);
                    setPendingFolder(null);
                    setShowDropboxCreateModal(true);
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
                      {expiredProviders.includes('dropbox') ? (
                        <span className="text-red-400 font-semibold">{t('settings.expired')}</span>
                      ) : isDropboxConnected || dropboxAccessToken ? (
                        t('settings.connected')
                      ) : (
                        t('settings.notConnected')
                      )}
                    </span>
                  </div>
                </div>
                {expiredProviders.includes('dropbox') ? (
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                ) : (isDropboxConnected || dropboxAccessToken) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
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
      {/* Share Modal */}
      {shareModalEvent && (
        <ShareModal
          isOpen={Boolean(shareModalEvent)}
          onClose={() => setShareModalEvent(null)}
          event={{ id: shareModalEvent.id!, name: shareModalEvent.name }}
        />
      )}
    </div>
  );
}
