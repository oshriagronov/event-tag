import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../services/translations';
import {
  Eye,
  Type,
  Sun,
  Sparkles,
  RotateCcw,
  X,
  Link2,
  Heading,
  MousePointer,
  Baseline,
  FileText,
  Accessibility
} from 'lucide-react';

export interface A11yPrefs {
  version: 1;
  links: boolean;
  contrast: 'off' | 'high' | 'invert' | 'mono';
  textSize: 100 | 115 | 130 | 150;
  lineSpacing: 'normal' | '1.6' | '2.0';
  readableFont: boolean;
  headings: boolean;
  largeCursor: boolean;
  stopAnim: boolean;
}

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  version: 1,
  links: false,
  contrast: 'off',
  textSize: 100,
  lineSpacing: 'normal',
  readableFont: false,
  headings: false,
  largeCursor: false,
  stopAnim: false,
};

const STORAGE_KEY = 'site_a11y_prefs_v1';

export function applyPrefsToElement(prefs: A11yPrefs, el: HTMLElement = document.documentElement) {
  const cl = el.classList;
  
  cl.toggle('a11y-links', Boolean(prefs.links));
  cl.toggle('a11y-contrast-high', prefs.contrast === 'high');
  cl.toggle('a11y-contrast-invert', prefs.contrast === 'invert');
  cl.toggle('a11y-contrast-mono', prefs.contrast === 'mono');
  cl.toggle('a11y-text-115', prefs.textSize === 115);
  cl.toggle('a11y-text-130', prefs.textSize === 130);
  cl.toggle('a11y-text-150', prefs.textSize === 150);
  cl.toggle('a11y-lines-16', prefs.lineSpacing === '1.6');
  cl.toggle('a11y-lines-20', prefs.lineSpacing === '2.0');
  cl.toggle('a11y-readable-font', Boolean(prefs.readableFont));
  cl.toggle('a11y-headings', Boolean(prefs.headings));
  cl.toggle('a11y-large-cursor', Boolean(prefs.largeCursor));
  cl.toggle('a11y-stop-anim', Boolean(prefs.stopAnim));
}

export function loadStoredPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_PREFS;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1) {
      return { ...DEFAULT_A11Y_PREFS, ...parsed };
    }
  } catch (e) {
    // Ignore storage errors
  }
  return DEFAULT_A11Y_PREFS;
}

export function savePrefs(prefs: A11yPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    // Ignore storage errors
  }
}

export function AccessibilityWidget() {
  const { t, isRtl } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>(loadStoredPrefs);
  const [announcement, setAnnouncement] = useState('');

  // Synchronize state with document.documentElement & localStorage
  const updatePrefs = useCallback((updater: (prev: A11yPrefs) => A11yPrefs, announceMsg?: string) => {
    setPrefs((prev) => {
      const next = updater(prev);
      savePrefs(next);
      applyPrefsToElement(next);
      return next;
    });
    if (announceMsg) {
      setAnnouncement(announceMsg);
    }
  }, []);

  // Initial load sync
  useEffect(() => {
    applyPrefsToElement(prefs);
  }, []);

  // Alt+A keyboard shortcut handler (layout-independent via e.code)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset handler
  const handleReset = () => {
    updatePrefs(() => DEFAULT_A11Y_PREFS, t('a11y.resetAnnouncement'));
  };

  return (
    <>
      {/* Live Region for announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Floating Trigger Button */}
      <button
        id="a11y-widget-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="a11y-widget-panel"
        aria-label={t('a11y.widgetTriggerLabel')}
        title={t('a11y.widgetTriggerLabel')}
        className="fixed bottom-6 end-6 z-50 p-3 bg-deep-forest text-surface-container-lowest dark:bg-copper-accent dark:text-black rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 focus-visible:ring-4 focus-visible:ring-copper-accent focus-visible:outline-none flex items-center justify-center cursor-pointer border border-surface-border/40"
      >
        <Accessibility className="w-5 h-5 shrink-0" />
      </button>

      {/* Popover Widget Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          <div
            id="a11y-widget-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-panel-title"
            dir={isRtl ? 'rtl' : 'ltr'}
            className="relative w-full max-w-3xl bg-surface-container border border-surface-border rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6 text-start max-h-[90vh] overflow-y-auto"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b border-surface-border/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-copper-accent/15 text-copper-accent">
                  <Eye className="w-6 h-6" />
                </div>
                <div>
                  <h2 id="a11y-panel-title" className="font-display-lg text-xl sm:text-2xl text-on-background font-bold m-0">
                    {t('a11y.widgetTitle')}
                  </h2>
                  <p className="font-body-md text-xs text-sage-muted m-0 mt-0.5">
                    {t('a11y.keyboardHint')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-colors cursor-pointer border-none bg-transparent"
                aria-label={t('a11y.closeWidget')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              {/* High Contrast / Invert / Mono */}
              <div className="p-4 rounded-xl border border-surface-border/60 bg-surface-container-low flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-on-background font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-copper-accent" />
                    {t('a11y.contrastMode')}
                  </span>
                  <span className="text-xs text-sage-muted font-normal uppercase">
                    {prefs.contrast === 'high' ? t('a11y.contrastHigh') : prefs.contrast === 'invert' ? t('a11y.contrastInvert') : prefs.contrast === 'mono' ? t('a11y.contrastMono') : t('a11y.contrastNormal')}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <button
                    onClick={() => updatePrefs((p) => ({ ...p, contrast: 'off' }), t('a11y.appliedAnnouncement'))}
                    className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.contrast === 'off' ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                  >
                    {t('a11y.contrastNormal')}
                  </button>
                  <button
                    onClick={() => updatePrefs((p) => ({ ...p, contrast: 'high' }), t('a11y.appliedAnnouncement'))}
                    className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.contrast === 'high' ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                  >
                    {t('a11y.contrastHigh')}
                  </button>
                  <button
                    onClick={() => updatePrefs((p) => ({ ...p, contrast: 'invert' }), t('a11y.appliedAnnouncement'))}
                    className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.contrast === 'invert' ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                  >
                    {t('a11y.contrastInvert')}
                  </button>
                  <button
                    onClick={() => updatePrefs((p) => ({ ...p, contrast: 'mono' }), t('a11y.appliedAnnouncement'))}
                    className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.contrast === 'mono' ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                  >
                    {t('a11y.contrastMono')}
                  </button>
                </div>
              </div>

              {/* Text Sizing */}
              <div className="p-4 rounded-xl border border-surface-border/60 bg-surface-container-low flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-on-background font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-copper-accent" />
                    {t('a11y.textSize')}
                  </span>
                  <span className="text-xs text-sage-muted font-normal">{prefs.textSize}%</span>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[100, 115, 130, 150].map((size) => (
                    <button
                      key={size}
                      onClick={() => updatePrefs((p) => ({ ...p, textSize: size as any }), t('a11y.appliedAnnouncement'))}
                      className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.textSize === size ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                    >
                      {size}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Spacing */}
              <div className="p-4 rounded-xl border border-surface-border/60 bg-surface-container-low flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-on-background font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Baseline className="w-4 h-4 text-copper-accent" />
                    {t('a11y.lineSpacing')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    onClick={() => updatePrefs((p) => ({ ...p, lineSpacing: 'normal' }), t('a11y.appliedAnnouncement'))}
                    className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.lineSpacing === 'normal' ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                  >
                    {t('a11y.lineSpacingNormal')}
                  </button>
                  <button
                    onClick={() => updatePrefs((p) => ({ ...p, lineSpacing: '1.6' }), t('a11y.appliedAnnouncement'))}
                    className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.lineSpacing === '1.6' ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                  >
                    1.6
                  </button>
                  <button
                    onClick={() => updatePrefs((p) => ({ ...p, lineSpacing: '2.0' }), t('a11y.appliedAnnouncement'))}
                    className={`py-1.5 px-2 text-xs rounded font-bold transition-all border ${prefs.lineSpacing === '2.0' ? 'bg-copper-accent text-white border-copper-accent' : 'bg-surface-container-high text-on-background border-surface-border'}`}
                  >
                    2.0
                  </button>
                </div>
              </div>

              {/* Readable Font */}
              <button
                type="button"
                aria-pressed={prefs.readableFont}
                onClick={() => updatePrefs((p) => ({ ...p, readableFont: !p.readableFont }), t('a11y.appliedAnnouncement'))}
                className={`p-4 rounded-xl border transition-all text-start flex items-center justify-between cursor-pointer ${prefs.readableFont ? 'border-copper-accent bg-copper-accent/10' : 'border-surface-border/60 bg-surface-container-low hover:border-copper-accent/40'}`}
              >
                <div className="flex items-center gap-2.5 font-bold text-sm text-on-background">
                  <Type className="w-4 h-4 text-copper-accent" />
                  {t('a11y.readableFont')}
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${prefs.readableFont ? 'bg-copper-accent border-copper-accent text-white' : 'border-surface-border'}`}>
                  {prefs.readableFont && <span className="text-xs">✓</span>}
                </div>
              </button>

              {/* Highlight Links */}
              <button
                type="button"
                aria-pressed={prefs.links}
                onClick={() => updatePrefs((p) => ({ ...p, links: !p.links }), t('a11y.appliedAnnouncement'))}
                className={`p-4 rounded-xl border transition-all text-start flex items-center justify-between cursor-pointer ${prefs.links ? 'border-copper-accent bg-copper-accent/10' : 'border-surface-border/60 bg-surface-container-low hover:border-copper-accent/40'}`}
              >
                <div className="flex items-center gap-2.5 font-bold text-sm text-on-background">
                  <Link2 className="w-4 h-4 text-copper-accent" />
                  {t('a11y.highlightLinks')}
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${prefs.links ? 'bg-copper-accent border-copper-accent text-white' : 'border-surface-border'}`}>
                  {prefs.links && <span className="text-xs">✓</span>}
                </div>
              </button>

              {/* Highlight Headings */}
              <button
                type="button"
                aria-pressed={prefs.headings}
                onClick={() => updatePrefs((p) => ({ ...p, headings: !p.headings }), t('a11y.appliedAnnouncement'))}
                className={`p-4 rounded-xl border transition-all text-start flex items-center justify-between cursor-pointer ${prefs.headings ? 'border-copper-accent bg-copper-accent/10' : 'border-surface-border/60 bg-surface-container-low hover:border-copper-accent/40'}`}
              >
                <div className="flex items-center gap-2.5 font-bold text-sm text-on-background">
                  <Heading className="w-4 h-4 text-copper-accent" />
                  {t('a11y.highlightHeadings')}
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${prefs.headings ? 'bg-copper-accent border-copper-accent text-white' : 'border-surface-border'}`}>
                  {prefs.headings && <span className="text-xs">✓</span>}
                </div>
              </button>

              {/* Stop Animations */}
              <button
                type="button"
                aria-pressed={prefs.stopAnim}
                onClick={() => updatePrefs((p) => ({ ...p, stopAnim: !p.stopAnim }), t('a11y.appliedAnnouncement'))}
                className={`p-4 rounded-xl border transition-all text-start flex items-center justify-between cursor-pointer ${prefs.stopAnim ? 'border-copper-accent bg-copper-accent/10' : 'border-surface-border/60 bg-surface-container-low hover:border-copper-accent/40'}`}
              >
                <div className="flex items-center gap-2.5 font-bold text-sm text-on-background">
                  <Sparkles className="w-4 h-4 text-copper-accent" />
                  {t('a11y.stopAnimations')}
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${prefs.stopAnim ? 'bg-copper-accent border-copper-accent text-white' : 'border-surface-border'}`}>
                  {prefs.stopAnim && <span className="text-xs">✓</span>}
                </div>
              </button>

              {/* Large Cursor */}
              <button
                type="button"
                aria-pressed={prefs.largeCursor}
                onClick={() => updatePrefs((p) => ({ ...p, largeCursor: !p.largeCursor }), t('a11y.appliedAnnouncement'))}
                className={`p-4 rounded-xl border transition-all text-start flex items-center justify-between cursor-pointer ${prefs.largeCursor ? 'border-copper-accent bg-copper-accent/10' : 'border-surface-border/60 bg-surface-container-low hover:border-copper-accent/40'}`}
              >
                <div className="flex items-center gap-2.5 font-bold text-sm text-on-background">
                  <MousePointer className="w-4 h-4 text-copper-accent" />
                  {t('a11y.largeCursor')}
                </div>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${prefs.largeCursor ? 'bg-copper-accent border-copper-accent text-white' : 'border-surface-border'}`}>
                  {prefs.largeCursor && <span className="text-xs">✓</span>}
                </div>
              </button>

            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between border-t border-surface-border/60 pt-4 mt-2">
              <a
                href="/accessibility"
                className="text-xs text-copper-accent hover:underline font-bold inline-flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                {t('a11y.accessibilityStatement')}
              </a>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-xs font-bold text-sage-muted hover:text-on-background hover:bg-surface-container-high rounded-lg transition-colors border border-surface-border flex items-center gap-1.5 cursor-pointer bg-transparent"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('a11y.reset')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
