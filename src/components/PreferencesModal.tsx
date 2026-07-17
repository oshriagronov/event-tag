import { useState, useEffect } from 'react';
import { Shield, X, Lock } from 'lucide-react';
import { useConsent, ALL_CATEGORIES_OFF, type ConsentCategories } from '../contexts/ConsentContext';
import { useTranslation } from '../services/translations';

export function PreferencesModal() {
  const {
    prefsOpen,
    closePreferences,
    consent,
    customize,
  } = useConsent();

  const { t, isRtl } = useTranslation();

  const [draft, setDraft] = useState<ConsentCategories>(() => {
    return consent?.categories ?? ALL_CATEGORIES_OFF;
  });

  // Sync draft with consent state when it opens
  useEffect(() => {
    if (prefsOpen && consent) {
      setDraft(consent.categories);
    }
  }, [prefsOpen, consent]);

  if (!prefsOpen) return null;

  const handleToggle = (key: keyof ConsentCategories) => {
    setDraft((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = () => {
    customize(draft);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] transition-opacity"
        onClick={closePreferences}
      />
      {/* Modal Container */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-lg bg-surface-container border border-surface-border rounded-xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 text-start"
        dir={isRtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prefs-modal-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="prefs-modal-title" className="font-display-lg text-lg text-on-background flex items-center gap-2.5 m-0">
            <Shield className="w-5 h-5 text-copper-accent" />
            {t('consent.preferencesTitle')}
          </h2>
          <button
            onClick={closePreferences}
            className="p-1.5 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">
          {t('consent.preferencesDesc')}
        </p>

        {/* Toggles */}
        <div className="flex flex-col gap-4 max-h-[350px] overflow-y-auto pr-1">
          
          {/* Essential Categories (locked) */}
          <div className="flex items-start justify-between gap-4 rounded border border-surface-border bg-surface-container-low p-4">
            <div className="flex-1 text-start">
              <div className="flex items-center gap-1.5 font-bold text-on-background">
                <span>{t('consent.essentialTitle')}</span>
                <Lock className="w-3.5 h-3.5 text-sage-muted" />
              </div>
              <p className="mt-1 font-body-md text-sage-muted text-xs leading-relaxed m-0">
                {t('consent.essentialDesc')}
              </p>
            </div>
            <div className="relative inline-flex items-center h-6 rounded-full w-11 bg-copper-accent opacity-60 cursor-not-allowed">
              <span className={`inline-block w-4 h-4 transform rounded-full bg-background transition-transform ${isRtl ? '-translate-x-6' : 'translate-x-6'}`} />
            </div>
          </div>

          {/* Analytics Category */}
          <div 
            onClick={() => handleToggle('analytics')}
            className="flex items-start justify-between gap-4 rounded border border-surface-border/50 hover:border-copper-accent/30 p-4 cursor-pointer transition-all bg-surface-container-low/50"
          >
            <div className="flex-1 text-start">
              <div className="font-bold text-on-background">
                {t('consent.analyticsTitle')}
              </div>
              <p className="mt-1 font-body-md text-sage-muted text-xs leading-relaxed m-0">
                {t('consent.analyticsDesc')}
              </p>
            </div>
            <button
              type="button"
              className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors outline-none border-none cursor-pointer ${
                draft.analytics ? 'bg-copper-accent' : 'bg-surface-container-high border border-surface-border'
              }`}
            >
              <span className={`inline-block w-4 h-4 transform rounded-full bg-background transition-transform ${
                draft.analytics 
                  ? (isRtl ? '-translate-x-6' : 'translate-x-6') 
                  : (isRtl ? '-translate-x-1' : 'translate-x-1')
              }`} />
            </button>
          </div>

          {/* Error Monitoring Category */}
          <div 
            onClick={() => handleToggle('error_monitoring')}
            className="flex items-start justify-between gap-4 rounded border border-surface-border/50 hover:border-copper-accent/30 p-4 cursor-pointer transition-all bg-surface-container-low/50"
          >
            <div className="flex-1 text-start">
              <div className="font-bold text-on-background">
                {t('consent.errorMonitoringTitle')}
              </div>
              <p className="mt-1 font-body-md text-sage-muted text-xs leading-relaxed m-0">
                {t('consent.errorMonitoringDesc')}
              </p>
            </div>
            <button
              type="button"
              className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors outline-none border-none cursor-pointer ${
                draft.error_monitoring ? 'bg-copper-accent' : 'bg-surface-container-high border border-surface-border'
              }`}
            >
              <span className={`inline-block w-4 h-4 transform rounded-full bg-background transition-transform ${
                draft.error_monitoring 
                  ? (isRtl ? '-translate-x-6' : 'translate-x-6') 
                  : (isRtl ? '-translate-x-1' : 'translate-x-1')
              }`} />
            </button>
          </div>

        </div>

        {/* Buttons */}
        <div className="flex justify-end border-t border-surface-border pt-4">
          <button
            onClick={handleSave}
            className="w-full sm:w-auto px-6 py-2.5 rounded text-xs font-bold bg-deep-forest hover:bg-primary text-background shadow transition-all cursor-pointer border-none"
          >
            {t('consent.savePreferences')}
          </button>
        </div>
      </div>
    </>
  );
}
