import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
type FontSize = 'normal' | 'large' | 'xlarge';
type Language = 'he' | 'en';

interface SettingsContextType {
  theme: Theme;
  fontSize: FontSize;
  language: Language;
  setTheme: (t: Theme) => void;
  setFontSize: (s: FontSize) => void;
  setLanguage: (l: Language) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [fontSize, setFontSizeState] = useState<FontSize>('normal');
  const [language, setLanguageState] = useState<Language>('he');

  useEffect(() => {
    // Load from localStorage
    const savedTheme = localStorage.getItem('event-tag-theme') as Theme;
    const savedFontSize = localStorage.getItem('event-tag-font-size') as FontSize;
    const savedLanguage = localStorage.getItem('event-tag-lang') as Language;

    if (savedTheme && ['light', 'dark'].includes(savedTheme)) {
      setThemeState(savedTheme);
    }
    if (savedFontSize && ['normal', 'large', 'xlarge'].includes(savedFontSize)) {
      setFontSizeState(savedFontSize);
    }
    if (savedLanguage && ['he', 'en'].includes(savedLanguage)) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('event-tag-theme', t);
  };

  const setFontSize = (s: FontSize) => {
    setFontSizeState(s);
    localStorage.setItem('event-tag-font-size', s);
  };

  const setLanguage = (l: Language) => {
    setLanguageState(l);
    localStorage.setItem('event-tag-lang', l);
  };

  useEffect(() => {
    // Apply classes to document.documentElement (html)
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark', 'text-normal', 'text-large', 'text-xlarge', 'dark');
    root.classList.add(`theme-${theme}`);
    if (theme === 'dark') {
      root.classList.add('dark');
    }
    
    // We'll use CSS variables or classes for font sizes in index.css
    root.classList.add(`text-${fontSize}`);

    // System-wide translation and direction support
    root.setAttribute('dir', language === 'he' ? 'rtl' : 'ltr');
    root.setAttribute('lang', language);
  }, [theme, fontSize, language]);

  return (
    <SettingsContext.Provider value={{ theme, fontSize, language, setTheme, setFontSize, setLanguage }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
}
