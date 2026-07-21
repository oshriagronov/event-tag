import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X, Trash2 } from 'lucide-react';
import { useTranslation } from '../services/translations';

export type ModalVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
}

export interface AlertOptions {
  title?: string;
  message: string;
  buttonText?: string;
  variant?: ModalVariant;
}

interface ModalState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant: ModalVariant;
  resolvePromise: ((value: boolean) => void) | null;
}

interface ModalContextType {
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
  alert: (options: string | AlertOptions) => Promise<void>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const { language, isRtl } = useTranslation();
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    variant: 'info',
    resolvePromise: null,
  });

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (options: string | ConfirmOptions): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        let title: string;
        let message: string;
        let confirmText = '';
        let cancelText = '';
        let variant: ModalVariant = 'info';

        if (typeof options === 'string') {
          message = options;
          const lower = message.toLowerCase();
          if (
            lower.includes('delete') ||
            lower.includes('למחוק') ||
            lower.includes('מחיק') ||
            lower.includes('warning') ||
            lower.includes('אזהרה') ||
            lower.includes('critical')
          ) {
            variant = 'danger';
            title = language === 'he' ? 'אישור מחיקה' : 'Confirm Action';
          } else {
            title = language === 'he' ? 'אישור' : 'Confirmation';
          }
        } else {
          message = options.message;
          title =
            options.title ||
            (options.variant === 'danger'
              ? language === 'he'
                ? 'אזהרה'
                : 'Warning'
              : language === 'he'
              ? 'אישור'
              : 'Confirmation');
          confirmText = options.confirmText || '';
          cancelText = options.cancelText || '';
          variant = options.variant || 'info';
        }

        setModalState({
          isOpen: true,
          type: 'confirm',
          title,
          message,
          confirmText,
          cancelText,
          variant,
          resolvePromise: resolve,
        });
      });
    },
    [language]
  );

  const alert = useCallback(
    (options: string | AlertOptions): Promise<void> => {
      return new Promise<void>((resolve) => {
        let title: string;
        let message: string;
        let confirmText = '';
        let variant: ModalVariant = 'info';

        if (typeof options === 'string') {
          message = options;
          const lower = message.toLowerCase();
          if (lower.includes('error') || lower.includes('שגיאה') || lower.includes('failed')) {
            variant = 'danger';
            title = language === 'he' ? 'שגיאה' : 'Error';
          } else if (lower.includes('success') || lower.includes('בהצלחה')) {
            variant = 'success';
            title = language === 'he' ? 'הודעה' : 'Success';
          } else {
            title = language === 'he' ? 'הודעה' : 'Notice';
          }
        } else {
          message = options.message;
          title =
            options.title ||
            (options.variant === 'danger'
              ? language === 'he'
                ? 'שגיאה'
                : 'Error'
              : options.variant === 'success'
              ? language === 'he'
                ? 'הצלחה'
                : 'Success'
              : language === 'he'
              ? 'הודעה'
              : 'Notice');
          confirmText = options.buttonText || '';
          variant = options.variant || 'info';
        }

        setModalState({
          isOpen: true,
          type: 'alert',
          title,
          message,
          confirmText,
          variant,
          resolvePromise: () => {
            resolve();
          },
        });
      });
    },
    [language]
  );

  const handleClose = useCallback((result: boolean) => {
    setModalState((prev) => {
      if (prev.resolvePromise) {
        prev.resolvePromise(result);
      }
      return { ...prev, isOpen: false, resolvePromise: null };
    });
  }, []);

  // Keyboard accessibility (Esc to cancel, Enter to confirm)
  useEffect(() => {
    if (!modalState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(false);
      } else if (e.key === 'Enter') {
        // Prevent enter from triggering if focus is on cancel button
        if (document.activeElement === cancelBtnRef.current) {
          e.preventDefault();
          handleClose(false);
        } else {
          e.preventDefault();
          handleClose(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState.isOpen, handleClose]);

  // Focus management on open
  useEffect(() => {
    if (modalState.isOpen) {
      setTimeout(() => {
        if (modalState.variant === 'danger' && cancelBtnRef.current) {
          cancelBtnRef.current.focus();
        } else if (confirmBtnRef.current) {
          confirmBtnRef.current.focus();
        }
      }, 50);
    }
  }, [modalState.isOpen, modalState.variant]);

  const renderIcon = () => {
    switch (modalState.variant) {
      case 'danger':
        return modalState.title.includes('מחיקה') || modalState.message.includes('למחוק') ? (
          <Trash2 className="w-5 h-5 text-red-500" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-red-500" />
        );
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-copper-accent" />;
    }
  };

  const getIconContainerStyles = () => {
    switch (modalState.variant) {
      case 'danger':
        return 'bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/10';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-amber-500/10';
      case 'success':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-emerald-500/10';
      case 'info':
      default:
        return 'bg-copper-accent/10 border-copper-accent/20 text-copper-accent shadow-copper-accent/10';
    }
  };

  const getConfirmButtonStyles = () => {
    switch (modalState.variant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20';
      case 'info':
      default:
        return 'bg-copper-accent hover:bg-copper-accent/90 text-white shadow-copper-accent/20';
    }
  };

  return (
    <ModalContext.Provider value={{ confirm, alert }}>
      {children}

      {modalState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
            onClick={() => handleClose(false)}
          />

          {/* Dialog Container */}
          <div
            className="relative bg-surface-container border border-surface-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-md animate-in fade-in zoom-in-95 duration-200 text-start z-10"
            dir={isRtl ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-dialog-title"
            aria-describedby="modal-dialog-desc"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-lg ${getIconContainerStyles()}`}
                >
                  {renderIcon()}
                </div>
                <div>
                  <h3 id="modal-dialog-title" className="text-lg font-bold text-on-background m-0">
                    {modalState.title}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => handleClose(false)}
                className="p-2 rounded-lg hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-all cursor-pointer border-none bg-transparent"
                title={language === 'he' ? 'סגור' : 'Close'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 py-5">
              <p
                id="modal-dialog-desc"
                className="text-sm text-sage-muted leading-relaxed whitespace-pre-line m-0 font-medium"
              >
                {modalState.message}
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-surface-border bg-surface-container-low">
              {modalState.type === 'confirm' && (
                <button
                  ref={cancelBtnRef}
                  onClick={() => handleClose(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-sage-muted hover:bg-surface-container-high hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
                >
                  {modalState.cancelText || (language === 'he' ? 'ביטול' : 'Cancel')}
                </button>
              )}
              <button
                ref={confirmBtnRef}
                onClick={() => handleClose(true)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all cursor-pointer border-none ${getConfirmButtonStyles()}`}
              >
                {modalState.confirmText ||
                  (modalState.type === 'confirm'
                    ? language === 'he'
                      ? 'אישור'
                      : 'Confirm'
                    : language === 'he'
                    ? 'הבנתי'
                    : 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
