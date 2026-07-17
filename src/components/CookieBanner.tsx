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
        className="w-full max-w-md bg-surface-container border border-surface-border rounded-xl p-6 shadow-2xl backdrop-blur-md relative animate-in slide-in-from-bottom duration-300 text-start"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Close button (X) = Reject All */}
        <button
          type="button"
          onClick={rejectAll}
          className="absolute top-4 end-4 p-1.5 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Shield className="w-4 h-4" />
          </div>
          <h3 id="consent-title" className="font-title-md text-base font-bold text-on-background m-0">
            {t('consent.title')}
          </h3>
        </div>

        {/* Body Description */}
        <p id="consent-desc" className="font-body-md text-sage-muted text-xs leading-relaxed m-0 mb-3 pr-4">
          {t('consent.body')}
        </p>

        {/* Policy Link */}
        <div className="font-body-md text-xs text-sage-muted mb-4 pr-4">
          {t('consent.policyPrompt')}{' '}
          <Link
            to="/privacy-policy"
            className="font-semibold text-copper-accent hover:underline transition-colors no-underline"
          >
            {t('legal.privacyTitle')}
          </Link>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={rejectAll}
            className="px-2 py-2.5 rounded text-xs font-bold bg-surface-container-high border border-surface-border text-on-background hover:bg-surface-border transition-all cursor-pointer text-center"
          >
            {t('consent.rejectAll')}
          </button>
          <button
            onClick={openPreferences}
            className="px-2 py-2.5 rounded text-xs font-bold bg-surface-container-high border border-surface-border text-on-background hover:bg-surface-border transition-all cursor-pointer text-center"
          >
            {t('consent.customize')}
          </button>
          <button
            onClick={acceptAll}
            className="px-2 py-2.5 rounded text-xs font-bold bg-deep-forest hover:bg-primary text-background shadow transition-all cursor-pointer text-center border-none"
          >
            {t('consent.acceptAll')}
          </button>
        </div>
      </div>
    </div>
  );
}
