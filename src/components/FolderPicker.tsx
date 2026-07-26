import { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  ChevronLeft,
  ChevronRight,
  Home,
  Image as ImageIcon,
  Loader2,
  X,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';
import { listFolders, countPhotosInFolder, type CloudProvider } from '../services/cloudProviders';
import type { DropboxFolder as DriveFolder } from '../services/dropbox';
import { useTranslation } from '../services/translations';
import { useAuth } from '../contexts/AuthContext';

interface FolderPickerProps {
  provider: CloudProvider;
  accessToken: string;
  onSelect: (folderId: string, folderName: string) => void;
  onCancel: () => void;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export function FolderPicker({ provider, accessToken, onSelect, onCancel }: FolderPickerProps) {
  const { t, isRtl, language } = useTranslation();
  const { connectDropbox, connectGoogle, connectOneDrive, markProviderExpired } = useAuth();
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const providerTitle = provider === 'dropbox' ? 'Dropbox' : provider === 'google' ? 'Google Drive' : 'OneDrive';
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: '', name: providerTitle },
  ]);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [countingPhotos, setCountingPhotos] = useState(false);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const handleReconnect = () => {
    if (provider === 'dropbox') connectDropbox();
    else if (provider === 'google') connectGoogle();
    else if (provider === 'onedrive') connectOneDrive();
  };

  const loadFolders = useCallback(async (parentId: string) => {
    setLoading(true);
    setError(null);
    setIsExpired(false);
    setSelectedFolder(null);
    setPhotoCount(null);

    try {
      const result = await listFolders(provider, accessToken, parentId);
      setFolders(result);
    } catch (err) {
      console.error('Error loading folders:', err);
      const providerName = provider === 'dropbox' ? 'Dropbox' : provider === 'google' ? 'Google Drive' : 'OneDrive';
      const errStr = err instanceof Error ? err.message : String(err);
      
      if (errStr.includes('401') || errStr.includes('403') || errStr.includes('expired_access_token') || errStr.includes('invalid_token') || errStr.includes('unregistered callers') || errStr.includes('PERMISSION_DENIED')) {
        markProviderExpired(provider);
        setIsExpired(true);
        setError(language === 'he' 
          ? `תוקף החיבור לחשבון ${providerName} פג. אנא התחבר מחדש.` 
          : `Connection to ${providerName} has expired. Please log in again.`);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : t('folderPicker.errorLoading', { provider: providerName })
        );
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, provider, t, language, markProviderExpired]);

  useEffect(() => {
    loadFolders(currentFolderId);
  }, [currentFolderId, loadFolders]);

  const handleNavigateInto = (folder: DriveFolder) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleSelectFolder = async (folder: DriveFolder) => {
    setSelectedFolder(folder);
    setCountingPhotos(true);
    setPhotoCount(null);

    try {
      const count = await countPhotosInFolder(provider, accessToken, folder.id);
      setPhotoCount(count);
    } catch {
      setPhotoCount(null);
    } finally {
      setCountingPhotos(false);
    }
  };

  const handleConfirmSelection = () => {
    if (selectedFolder) {
      onSelect(selectedFolder.id, selectedFolder.name);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] bg-surface-container border border-surface-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in text-on-background"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'modalIn 0.3s ease-out' }}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-surface-border flex items-center justify-center text-copper-accent shadow-lg shadow-copper-accent/10">
              <FolderOpen className="w-5 h-5 text-copper-accent" />
            </div>
            <div className="text-start">
              <h2 className="text-lg font-bold text-on-background m-0">
                {provider === 'dropbox'
                  ? t('folderPicker.titleDropbox')
                  : provider === 'google'
                    ? t('folderPicker.titleGoogle')
                    : t('folderPicker.titleOneDrive')}
              </h2>
              <p className="text-xs text-sage-muted mt-0.5 m-0">
                {t('folderPicker.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-all cursor-pointer border-none bg-transparent"
            title={t('folderPicker.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 px-6 py-3 bg-surface-container-low border-b border-surface-border overflow-x-auto text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id || 'root'} className="flex items-center gap-1 shrink-0">
              {index > 0 && (
                isRtl ? (
                  <ChevronLeft className="w-3.5 h-3.5 text-sage-muted" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-sage-muted" />
                )
              )}
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  index === breadcrumbs.length - 1
                    ? 'text-copper-accent font-semibold bg-copper-accent/10'
                    : 'text-sage-muted hover:text-on-background hover:bg-surface-container-high'
                }`}
              >
                {index === 0 && <Home className="w-3.5 h-3.5" />}
                <span className="whitespace-nowrap">{crumb.name}</span>
              </button>
            </div>
          ))}
        </div>


        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-copper-accent animate-spin" />
              <span className="text-sm text-sage-muted">
                {t('folderPicker.loadingFolders')}
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-sm text-red-400 max-w-sm m-0 leading-relaxed font-medium">
                {error}
              </p>
              {isExpired ? (
                <button
                  onClick={handleReconnect}
                  className="px-5 py-2.5 rounded-lg bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs shadow transition-all cursor-pointer border-none"
                >
                  {language === 'he' ? 'התחבר מחדש לספק הענן' : 'Reconnect Cloud Provider'}
                </button>
              ) : (
                <button
                  onClick={() => loadFolders(currentFolderId)}
                  className="text-sm text-copper-accent hover:underline cursor-pointer border-none bg-transparent p-0"
                >
                  {t('folderPicker.tryAgain')}
                </button>
              )}
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border flex items-center justify-center">
                <Folder className="w-6 h-6 text-sage-muted" />
              </div>
              <p className="text-sm text-sage-muted font-medium m-0">
                {t('folderPicker.noSubfolders')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                    selectedFolder?.id === folder.id
                      ? 'bg-surface-container-high border-copper-accent/50 shadow-sm'
                      : 'hover:bg-surface-container-low border-transparent'
                  }`}
                  onClick={() => handleSelectFolder(folder)}
                  onDoubleClick={() => handleNavigateInto(folder)}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 border border-surface-border/30 ${
                      selectedFolder?.id === folder.id
                        ? 'bg-copper-accent/20 text-copper-accent'
                        : 'bg-surface-container-low text-sage-muted group-hover:text-copper-accent group-hover:bg-surface-container-high'
                    }`}
                  >
                    <Folder className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0 text-start">
                    <span className="text-sm font-medium text-on-background block truncate">
                      {folder.name}
                    </span>
                  </div>

                  {/* Photo count badge on selected folder */}
                  {selectedFolder?.id === folder.id && (
                    <div className="flex items-center gap-1.5 text-xs shrink-0">
                      {countingPhotos ? (
                        <span className="flex items-center gap-1 text-copper-accent font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {t('folderPicker.countingPhotos')}
                        </span>
                      ) : photoCount !== null ? (
                        <span className="flex items-center gap-1 bg-copper-accent/20 text-copper-accent px-2.5 py-1 rounded-lg font-medium">
                          <ImageIcon className="w-3.5 h-3.5" />
                          {t('folderPicker.photosCount', { count: photoCount })}
                        </span>
                      ) : null}
                    </div>
                  )}

                  {/* Navigate into arrow */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNavigateInto(folder);
                    }}
                    className="p-1.5 rounded-lg hover:bg-surface-container-high text-sage-muted hover:text-on-background opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0 border-none bg-transparent"
                    title={language === 'he' ? 'פתח תיקייה' : 'Open Folder'}
                  >
                    {isRtl ? (
                      <ChevronLeft className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-surface-border bg-surface-container-low">
          <div className="text-xs text-sage-muted flex-1 truncate max-w-[60%] text-start">
            {selectedFolder ? (
              <span>
                {t('folderPicker.selectedFolder', { name: selectedFolder.name })}
              </span>
            ) : breadcrumbs.length > 1 ? (
              <span>{t('folderPicker.clickToSelect')}</span>
            ) : (
              <span>
                {provider === 'dropbox'
                  ? t('folderPicker.selectFromDropbox')
                  : provider === 'google'
                    ? t('folderPicker.selectFromGoogle')
                    : t('folderPicker.selectFromOneDrive')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm text-sage-muted hover:bg-surface-container-high hover:text-on-background transition-colors cursor-pointer font-medium border-none bg-transparent"
            >
              {t('folderPicker.cancel')}
            </button>

            <button
              onClick={handleConfirmSelection}
              disabled={!selectedFolder}
              className="px-5 py-2.5 rounded-lg text-sm font-bold bg-copper-accent text-white shadow-lg shadow-copper-accent/20 hover:bg-copper-accent/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none border-none"
            >
              {t('folderPicker.selectFolderBtn')}
            </button>
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
