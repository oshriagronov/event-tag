import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface ConsentCategories {
  analytics: boolean;
  error_monitoring: boolean;
}

export interface ConsentState {
  version: number;
  categories: ConsentCategories;
  timestamp: string;
}

export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = 'event_tag_consent_v1';
export const CONSENT_COOKIE_NAME = 'event_tag_consent';
export const CONSENT_REPROMPT_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export const ALL_CATEGORIES_OFF: ConsentCategories = {
  analytics: false,
  error_monitoring: false,
};

export const ALL_CATEGORIES_ON: ConsentCategories = {
  analytics: true,
  error_monitoring: true,
};

interface ConsentContextType {
  consent: ConsentState | null;
  needsPrompt: boolean;
  promptOpen: boolean;
  prefsOpen: boolean;
  isAllowed: (category: keyof ConsentCategories) => boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  customize: (categories: ConsentCategories) => void;
  reopen: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
  resetConsent: () => void;
}

const ConsentContext = createContext<ConsentContextType | undefined>(undefined);

function readStorage(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    const ts = Date.parse(parsed.timestamp);
    if (!Number.isFinite(ts) || Date.now() - ts > CONSENT_REPROMPT_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCookie(state: ConsentState | null) {
  const maxAge = Math.floor(CONSENT_REPROMPT_MS / 1000);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (!state) {
    document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  const value = state.categories.analytics ? '1' : '0';
  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

declare global {
  interface Window {
    __consent?: ConsentCategories;
  }
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(() => readStorage());
  const [isHydrated] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Sync state to cookies/global window variable
  useEffect(() => {
    if (isHydrated) {
      writeCookie(consent);
      if (typeof window !== 'undefined') {
        window.__consent = consent?.categories ?? ALL_CATEGORIES_OFF;
      }
    }
  }, [consent, isHydrated]);

  // Listen for storage events for multi-tab sync
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === CONSENT_STORAGE_KEY) {
        const stored = readStorage();
        setConsent(stored);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const save = useCallback((categories: ConsentCategories) => {
    const state: ConsentState = {
      version: CONSENT_VERSION,
      categories,
      timestamp: new Date().toISOString(),
    };
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
    setConsent(state);
    setManualOpen(false);
    setPrefsOpen(false);
  }, []);

  const acceptAll = useCallback(() => save(ALL_CATEGORIES_ON), [save]);
  const rejectAll = useCallback(() => save(ALL_CATEGORIES_OFF), [save]);
  const customize = useCallback((cats: ConsentCategories) => save(cats), [save]);

  const openPreferences = useCallback(() => setPrefsOpen(true), []);
  const closePreferences = useCallback(() => setPrefsOpen(false), []);

  const resetConsent = useCallback(() => {
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // ignore
    }
    writeCookie(null);
    if (typeof window !== 'undefined') {
      window.__consent = ALL_CATEGORIES_OFF;
    }
    setConsent(null);
    setManualOpen(false);
    setPrefsOpen(false);
  }, []);

  const reopen = useCallback(() => {
    if (consent === null) {
      setManualOpen(true);
    } else {
      setPrefsOpen(true);
    }
  }, [consent]);

  const isAllowed = useCallback((category: keyof ConsentCategories): boolean => {
    return consent?.categories[category] ?? false;
  }, [consent]);

  const needsPrompt = isHydrated && consent === null;
  const promptOpen = needsPrompt || manualOpen;

  return (
    <ConsentContext.Provider
      value={{
        consent,
        needsPrompt,
        promptOpen,
        prefsOpen,
        isAllowed,
        acceptAll,
        rejectAll,
        customize,
        reopen,
        openPreferences,
        closePreferences,
        resetConsent,
      }}
    >
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error('useConsent must be used within ConsentProvider');
  }
  return context;
}
