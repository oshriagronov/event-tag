import { useState } from 'react';
import { Accessibility, X, Moon, Sun, Type, Globe } from 'lucide-react';
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
        className="fixed bottom-6 end-6 z-50 p-3 rounded-lg bg-surface-container border border-surface-border text-on-background hover:bg-surface-container-high hover:border-copper-accent/45 transition-all shadow-xl duration-300 cursor-pointer"
        title={t('settings.title')}
      >
        <Accessibility className="w-5 h-5" />
      </button>
    );
  }

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={() => setIsOpen(false)}
      />
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-surface-container border border-surface-border rounded-xl shadow-2xl p-6 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Accessibility className="w-5 h-5 text-copper-accent" />
            <h2 className="text-xl font-bold m-0 text-on-surface">{t('settings.title')}</h2>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded hover:bg-surface-container-high text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 text-start">
          {/* Theme Toggle */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-sage-muted flex items-center gap-2">
              <Sun className="w-3.5 h-3.5 text-copper-accent" />
              {t('settings.theme')}
            </label>
            <div className="flex gap-2 bg-surface-container-low p-1.5 rounded border border-surface-border">
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border-none ${
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
                className={`flex-1 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border-none ${
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

          {/* Font Size Toggle */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-sage-muted flex items-center gap-2">
              <Type className="w-3.5 h-3.5 text-copper-accent" />
              {t('settings.fontSize')}
            </label>
            <div className="flex gap-2 bg-surface-container-low p-1.5 rounded border border-surface-border">
              <button
                onClick={() => setFontSize('normal')}
                className={`flex-1 py-2 rounded text-xs font-bold transition-all cursor-pointer border-none ${
                  fontSize === 'normal' 
                    ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                    : 'bg-transparent text-sage-muted hover:text-on-background'
                }`}
              >
                {t('settings.normal')}
              </button>
              <button
                onClick={() => setFontSize('large')}
                className={`flex-1 py-2 rounded text-xs font-bold transition-all cursor-pointer border-none ${
                  fontSize === 'large' 
                    ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                    : 'bg-transparent text-sage-muted hover:text-on-background'
                }`}
              >
                {t('settings.large')}
              </button>
              <button
                onClick={() => setFontSize('xlarge')}
                className={`flex-1 py-2 rounded text-xs font-bold transition-all cursor-pointer border-none ${
                  fontSize === 'xlarge' 
                    ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                    : 'bg-transparent text-sage-muted hover:text-on-background'
                }`}
              >
                {t('settings.xlarge')}
              </button>
            </div>
          </div>

          {/* Language Toggle */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-sage-muted flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-copper-accent" />
              {t('settings.language')}
            </label>
            <div className="flex gap-2 bg-surface-container-low p-1.5 rounded border border-surface-border">
              <button
                onClick={() => setLanguage('he')}
                className={`flex-1 py-2 rounded text-xs font-bold transition-all cursor-pointer border-none ${
                  language === 'he' 
                    ? 'bg-surface-container-high text-copper-accent border border-surface-border/50 shadow' 
                    : 'bg-transparent text-sage-muted hover:text-on-background'
                }`}
              >
                {t('settings.hebrew')}
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`flex-1 py-2 rounded text-xs font-bold transition-all cursor-pointer border-none ${
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
    </>
  );
}
