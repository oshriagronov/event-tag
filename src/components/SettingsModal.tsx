import { useState } from 'react';
import { Settings, X, Moon, Sun, Type, Globe } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from '../services/translations';

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, fontSize, language, setTheme, setFontSize, setLanguage } = useSettings();
  const { t, isRtl } = useTranslation();

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 start-4 z-50 p-3 rounded-2xl bg-white/10 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/20 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/80 transition-all shadow-lg hover:rotate-90 duration-300 cursor-pointer"
        title={t('settings.title')}
      >
        <Settings className="w-5 h-5" />
      </button>
    );
  }

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={() => setIsOpen(false)}
      />
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 m-0">
            <Settings className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            {t('settings.title')}
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Theme Toggle */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              {t('settings.theme')}
            </label>
            <div className="flex gap-3 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/40 dark:border-slate-800/40">
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  theme === 'light' 
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' 
                    : 'text-slate-500 hover:text-slate-750 dark:hover:text-slate-300'
                }`}
              >
                <Sun className="w-4 h-4" />
                {t('settings.light')}
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700' 
                    : 'text-slate-500 hover:text-slate-750 dark:hover:text-slate-300'
                }`}
              >
                <Moon className="w-4 h-4" />
                {t('settings.dark')}
              </button>
            </div>
          </div>

          {/* Font Size Toggle */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Type className="w-4 h-4 text-amber-500" />
              {t('settings.fontSize')}
            </label>
            <div className="flex gap-3 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/40 dark:border-slate-800/40">
              <button
                onClick={() => setFontSize('normal')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  fontSize === 'normal' 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t('settings.normal')}
              </button>
              <button
                onClick={() => setFontSize('large')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  fontSize === 'large' 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t('settings.large')}
              </button>
              <button
                onClick={() => setFontSize('xlarge')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  fontSize === 'xlarge' 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t('settings.xlarge')}
              </button>
            </div>
          </div>

          {/* Language Toggle */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-500" />
              {t('settings.language')}
            </label>
            <div className="flex gap-3 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-200/40 dark:border-slate-800/40">
              <button
                onClick={() => setLanguage('he')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  language === 'he' 
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t('settings.hebrew')}
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  language === 'en' 
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {t('settings.english')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
