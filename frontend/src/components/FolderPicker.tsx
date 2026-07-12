import { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  ChevronLeft,
  Home,
  Image as ImageIcon,
  Loader2,
  X,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';
import { listFolders, countPhotosInFolder } from '../services/googleDrive';
import type { DriveFolder } from '../services/googleDrive';

interface FolderPickerProps {
  accessToken: string;
  onSelect: (folderId: string, folderName: string) => void;
  onCancel: () => void;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export function FolderPicker({ accessToken, onSelect, onCancel }: FolderPickerProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'Google Drive' },
  ]);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [countingPhotos, setCountingPhotos] = useState(false);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const loadFolders = useCallback(async (parentId: string) => {
    setLoading(true);
    setError(null);
    setSelectedFolder(null);
    setPhotoCount(null);

    try {
      const result = await listFolders(accessToken, parentId);
      setFolders(result);
    } catch (err) {
      console.error('Error loading folders:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'שגיאה בטעינת תיקיות מ-Google Drive'
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

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
      const count = await countPhotosInFolder(accessToken, folder.id);
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
        className="relative w-full max-w-2xl max-h-[85vh] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/20 dark:shadow-black/50 border border-white/20 dark:border-slate-700/50 flex flex-col overflow-hidden animate-in"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'modalIn 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white m-0">
                בחירת תיקייה מ-Google Drive
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                בחר את התיקייה עם תמונות האירוע
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 px-6 py-3 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/50 dark:border-slate-800/50 overflow-x-auto text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center gap-1 shrink-0">
              {index > 0 && (
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              )}
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  index === breadcrumbs.length - 1
                    ? 'text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-500/10'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
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
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
              <span className="text-sm text-slate-500 dark:text-slate-400">
                טוען תיקיות...
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 max-w-sm">
                {error}
              </p>
              <button
                onClick={() => loadFolders(currentFolderId)}
                className="text-sm text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                נסה שוב
              </button>
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center">
                <Folder className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                אין תיקיות משנה במיקום זה
              </p>
              {breadcrumbs.length > 1 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  ניתן לבחור את התיקייה הנוכחית באמצעות הכפתור למטה
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                    selectedFolder?.id === folder.id
                      ? 'bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-400 dark:border-amber-500/50 shadow-sm'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-2 border-transparent'
                  }`}
                  onClick={() => handleSelectFolder(folder)}
                  onDoubleClick={() => handleNavigateInto(folder)}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      selectedFolder?.id === folder.id
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-800/70 text-slate-400 dark:text-slate-500 group-hover:text-amber-500 group-hover:bg-amber-50 dark:group-hover:bg-amber-500/10'
                    }`}
                  >
                    <Folder className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 block truncate">
                      {folder.name}
                    </span>
                    {folder.modifiedTime && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        עודכן{' '}
                        {new Date(folder.modifiedTime).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>

                  {/* Photo count badge on selected folder */}
                  {selectedFolder?.id === folder.id && (
                    <div className="flex items-center gap-1.5 text-xs shrink-0">
                      {countingPhotos ? (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          סופר תמונות...
                        </span>
                      ) : photoCount !== null ? (
                        <span className="flex items-center gap-1 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-lg font-medium">
                          <ImageIcon className="w-3.5 h-3.5" />
                          {photoCount} תמונות
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
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                    title="פתח תיקייה"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {selectedFolder ? (
              <span>
                נבחרה: <strong className="text-slate-600 dark:text-slate-300">{selectedFolder.name}</strong>
              </span>
            ) : breadcrumbs.length > 1 ? (
              <span>לחץ על תיקייה לבחירה, או לחץ פעמיים לכניסה</span>
            ) : (
              <span>בחר תיקייה מתוך Google Drive</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer font-medium"
            >
              ביטול
            </button>

            {/* Select current folder (when inside a subfolder) */}
            {breadcrumbs.length > 1 && !selectedFolder && (
              <button
                onClick={() => {
                  const current = breadcrumbs[breadcrumbs.length - 1];
                  onSelect(current.id, current.name);
                }}
                className="px-4 py-2 rounded-xl text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer font-medium"
              >
                בחר תיקייה נוכחית
              </button>
            )}

            <button
              onClick={handleConfirmSelection}
              disabled={!selectedFolder}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:brightness-110 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              בחר תיקייה זו
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
