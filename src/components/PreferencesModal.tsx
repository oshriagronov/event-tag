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
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[65] transition-opacity"
        onClick={closePreferences}
      />
      {/* Modal Container */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 text-start"
        dir={isRtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prefs-modal-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="prefs-modal-title" className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 m-0">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            {t('consent.preferencesTitle')}
          </h2>
          <button
            onClick={closePreferences}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed m-0">
          {t('consent.preferencesDesc')}
        </p>

        {/* Toggles */}
        <div className="flex flex-col gap-4 max-h-[350px] overflow-y-auto pr-1">
          
          {/* Essential Categories (locked) */}
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 p-4">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <span>{t('consent.essentialTitle')}</span>
                <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="mt-1 text-slate-500 dark:text-slate-400 text-xs leading-relaxed m-0">
                {t('consent.essentialDesc')}
              </p>
            </div>
            <div className="relative inline-flex items-center h-6 rounded-full w-11 bg-amber-500 opacity-60 cursor-not-allowed">
              <span className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${isRtl ? '-translate-x-6' : 'translate-x-6'}`} />
            </div>
          </div>

          {/* Analytics Category */}
          <div 
            onClick={() => handleToggle('analytics')}
            className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 hover:border-amber-500/30 p-4 cursor-pointer transition-all"
          >
            <div className="flex-1">
              <div className="font-bold text-slate-800 dark:text-slate-200">
                {t('consent.analyticsTitle')}
              </div>
              <p className="mt-1 text-slate-500 dark:text-slate-400 text-xs leading-relaxed m-0">
                {t('consent.analyticsDesc')}
              </p>
            </div>
            <button
              type="button"
              className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 ${
                draft.analytics ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            >
              <span className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${
                draft.analytics 
                  ? (isRtl ? '-translate-x-6' : 'translate-x-6') 
                  : (isRtl ? '-translate-x-1' : 'translate-x-1')
              }`} />
            </button>
          </div>

          {/* Error Monitoring Category */}
          <div 
            onClick={() => handleToggle('error_monitoring')}
            className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 hover:border-amber-500/30 p-4 cursor-pointer transition-all"
          >
            <div className="flex-1">
              <div className="font-bold text-slate-800 dark:text-slate-200">
                {t('consent.errorMonitoringTitle')}
              </div>
              <p className="mt-1 text-slate-500 dark:text-slate-400 text-xs leading-relaxed m-0">
                {t('consent.errorMonitoringDesc')}
              </p>
            </div>
            <button
              type="button"
              className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 ${
                draft.error_monitoring ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            >
              <span className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${
                draft.error_monitoring 
                  ? (isRtl ? '-translate-x-6' : 'translate-x-6') 
                  : (isRtl ? '-translate-x-1' : 'translate-x-1')
              }`} />
            </button>
          </div>

        </div>

        {/* Buttons */}
        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4">
          <button
            onClick={handleSave}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            {t('consent.savePreferences')}
          </button>
        </div>
      </div>
    </>
  );
}
