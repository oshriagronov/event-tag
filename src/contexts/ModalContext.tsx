import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from '../services/translations';

export type ModalVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
  /**
   * Async action run when the user confirms. The dialog stays open in a loading
   * state until it resolves; if it throws, the error is shown inside the dialog
   * with a retry button. The confirm promise resolves true only after success.
   */
  onConfirm?: () => Promise<void>;
  /** Text shown next to the spinner while onConfirm runs. */
  progressText?: string;
  /** Message shown inside the dialog when onConfirm fails. */
  errorMessage?: string | ((err: unknown) => string);
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
  onConfirm?: () => Promise<void>;
  progressText?: string;
  errorMessage?: string | ((err: unknown) => string);
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

  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const processingRef = useRef(false);

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
        let onConfirm: (() => Promise<void>) | undefined;
        let progressText: string | undefined;
        let errorMessage: string | ((err: unknown) => string) | undefined;

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
          onConfirm = options.onConfirm;
          progressText = options.progressText;
          errorMessage = options.errorMessage;
        }

        setActionError(null);
        setIsProcessing(false);
        setModalState({
          isOpen: true,
          type: 'confirm',
          title,
          message,
          confirmText,
          cancelText,
          variant,
          onConfirm,
          progressText,
          errorMessage,
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
    if (processingRef.current) return; // Cannot dismiss while an action is running
    setModalState((prev) => {
      if (prev.resolvePromise) {
        prev.resolvePromise(result);
      }
      return { ...prev, isOpen: false, resolvePromise: null };
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (processingRef.current) return;
    const { onConfirm, errorMessage } = modalState;
    if (!onConfirm) {
      handleClose(true);
      return;
    }
    processingRef.current = true;
    setIsProcessing(true);
    setActionError(null);
    try {
      await onConfirm();
      processingRef.current = false;
      setIsProcessing(false);
      handleClose(true);
    } catch (err) {
      console.error('Modal action failed:', err);
      processingRef.current = false;
      setIsProcessing(false);
      setActionError(
        (typeof errorMessage === 'function' ? errorMessage(err) : errorMessage) ||
          (language === 'he' ? 'הפעולה נכשלה. אנא נסה שוב.' : 'The action failed. Please try again.')
      );
    }
  }, [modalState, handleClose, language]);

  // Keyboard accessibility (Esc to cancel, Enter to confirm)
  useEffect(() => {
    if (!modalState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (processingRef.current) {
        if (e.key === 'Escape' || e.key === 'Enter') e.preventDefault();
        return;
      }
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
          handleConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState.isOpen, handleClose, handleConfirm]);

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
            aria-busy={isProcessing}
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
                disabled={isProcessing}
                className="p-2 rounded-lg hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-all cursor-pointer border-none bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
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
              {isProcessing && (
                // Visually hidden: the button spinner is the only visible indicator
                <span role="status" aria-live="polite" className="sr-only">
                  {modalState.progressText || (language === 'he' ? 'מבצע פעולה, אנא המתן...' : 'Working, please wait...')}
                </span>
              )}
              {actionError && !isProcessing && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-red-400"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-surface-border bg-surface-container-low">
              {modalState.type === 'confirm' && (
                <button
                  ref={cancelBtnRef}
                  onClick={() => handleClose(false)}
                  disabled={isProcessing}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-sage-muted hover:bg-surface-container-high hover:text-on-background transition-colors cursor-pointer border-none bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {modalState.cancelText || (language === 'he' ? 'ביטול' : 'Cancel')}
                </button>
              )}
              <button
                ref={confirmBtnRef}
                onClick={handleConfirm}
                disabled={isProcessing}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all cursor-pointer border-none inline-flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${getConfirmButtonStyles()}`}
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                {actionError && !isProcessing
                  ? language === 'he'
                    ? 'נסה שוב'
                    : 'Retry'
                  : modalState.confirmText ||
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
