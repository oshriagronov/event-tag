import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Shield } from 'lucide-react';
import { useConsent } from '../contexts/ConsentContext';
import { useTranslation } from '../services/translations';

export function CookieBanner() {
  const {
    promptOpen,
    acceptAll,
    rejectAll,
    openPreferences,
  } = useConsent();

  const { t, isRtl } = useTranslation();

  // Escape key handler: dismiss = reject
  useEffect(() => {
    if (!promptOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        rejectAll();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promptOpen, rejectAll]);

  if (!promptOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-desc"
      className="fixed inset-x-0 bottom-0 z-[60] p-4 flex justify-center md:justify-end"
    >
      <div 
        className="w-full max-w-md bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 md:p-6 shadow-2xl backdrop-blur-md relative animate-in slide-in-from-bottom duration-300 text-start"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Close button (X) = Reject All */}
        <button
          type="button"
          onClick={rejectAll}
          className="absolute top-4 end-4 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 id="consent-title" className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">
            {t('consent.title')}
          </h3>
        </div>

        {/* Body Description */}
        <p id="consent-desc" className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed m-0 mb-3 pr-4">
          {t('consent.body')}
        </p>

        {/* Policy Link */}
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 pr-4">
          {t('consent.policyPrompt')}{' '}
          <Link
            to="/privacy"
            className="font-semibold text-amber-500 hover:underline hover:text-amber-600 transition-colors"
          >
            {t('legal.privacyTitle')}
          </Link>
        </div>

        {/* Equal Visual Weight Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={rejectAll}
            className="px-2 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-750 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer text-center"
          >
            {t('consent.rejectAll')}
          </button>
          <button
            onClick={openPreferences}
            className="px-2 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-750 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer text-center"
          >
            {t('consent.customize')}
          </button>
          <button
            onClick={acceptAll}
            className="px-2 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-md hover:shadow-lg transition-all cursor-pointer text-center"
          >
            {t('consent.acceptAll')}
          </button>
        </div>
      </div>
    </div>
  );
}
