import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

import { checkTokenValidity, type CloudProvider } from '../services/cloudProviders';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: (err: unknown) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  dropboxAccessToken: string | null;
  googleAccessToken: string | null;
  onedriveAccessToken: string | null;
  isDropboxConnected: boolean;
  isGoogleConnected: boolean;
  isOneDriveConnected: boolean;
  expiredProviders: CloudProvider[];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearDropboxToken: () => void;
  clearGoogleToken: () => void;
  clearOneDriveToken: () => void;
  connectDropbox: () => void;
  disconnectDropbox: () => void;
  connectGoogle: () => void;
  disconnectGoogle: () => void;
  connectOneDrive: () => void;
  disconnectOneDrive: () => void;
  checkCloudConnections: () => Promise<CloudProvider[]>;
  refreshGoogleTokenSilently: () => Promise<string | null>;
  markProviderExpired: (provider: CloudProvider) => void;
  dismissExpiredProviderNotice: (provider: CloudProvider) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getInitialToken(provider: CloudProvider): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  const search = window.location.search;

  // Check for error parameters returned from OAuth provider
  if ((hash && hash.includes('error=')) || (search && search.includes('error='))) {
    const hashParams = hash ? new URLSearchParams(hash.substring(1)) : new URLSearchParams();
    const queryParams = new URLSearchParams(search);
    const error = hashParams.get('error') || queryParams.get('error');
    const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
    const state = hashParams.get('state') || queryParams.get('state') || '';

    let p = hashParams.get('provider') || queryParams.get('provider');
    if (!p && state.includes('provider=google')) p = 'google';
    if (!p && state.includes('provider=onedrive')) p = 'onedrive';

    if (error && p === provider) {
      console.error(`OAuth redirect error for ${provider}:`, error, errorDesc);
      localStorage.removeItem(`${provider}_connected`);
      localStorage.removeItem(`${provider}_access_token`);
      const detail = errorDesc ? `${error}: ${decodeURIComponent(errorDesc)}` : error;
      setTimeout(() => {
        window.alert(`שגיאת התחברות ל-${provider}:\n\n${detail}\n\nאנא וודא כי ההגדרות ב-Developer Console תקינות.`);
      }, 300);
      window.history.replaceState(null, '', window.location.pathname);
      return null;
    }
  }

  if ((hash && hash.includes('access_token=')) || (search && search.includes('access_token='))) {
    const hashParams = hash ? new URLSearchParams(hash.substring(1)) : new URLSearchParams();
    const queryParams = new URLSearchParams(search);
    const token = hashParams.get('access_token') || queryParams.get('access_token');
    const expiresIn = hashParams.get('expires_in') || queryParams.get('expires_in');
    const state = hashParams.get('state') || queryParams.get('state') || '';

    let p = hashParams.get('provider') || queryParams.get('provider');
    if (!p && state.includes('provider=google')) p = 'google';
    if (!p && state.includes('provider=onedrive')) p = 'onedrive';
    if (!p) p = 'dropbox';

    if (token && p === provider) {
      localStorage.setItem(`${provider}_access_token`, token);
      localStorage.setItem(`${provider}_connected`, 'true');
      if (expiresIn) {
        const expiresAt = Date.now() + parseInt(expiresIn, 10) * 1000;
        localStorage.setItem(`${provider}_token_expires_at`, expiresAt.toString());
      }
      window.history.replaceState(null, '', window.location.pathname);
      return token;
    }
  }
  return localStorage.getItem(`${provider}_access_token`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropboxAccessToken, setDropboxAccessToken] = useState<string | null>(() => getInitialToken('dropbox'));
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => getInitialToken('google'));
  const [onedriveAccessToken, setOneDriveAccessToken] = useState<string | null>(() => getInitialToken('onedrive'));

  // Persistent connection flags (stay true until user explicitly disconnects)
  const [isDropboxConnected, setIsDropboxConnected] = useState<boolean>(
    () => typeof window !== 'undefined' && (localStorage.getItem('dropbox_connected') === 'true' || Boolean(getInitialToken('dropbox')))
  );
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(
    () => typeof window !== 'undefined' && (localStorage.getItem('google_connected') === 'true' || Boolean(getInitialToken('google')))
  );
  const [isOneDriveConnected, setIsOneDriveConnected] = useState<boolean>(
    () => typeof window !== 'undefined' && (localStorage.getItem('onedrive_connected') === 'true' || Boolean(getInitialToken('onedrive')))
  );

  const [expiredProviders, setExpiredProviders] = useState<CloudProvider[]>([]);

  const markProviderExpired = (provider: CloudProvider) => {
    // Note: Do not remove ${provider}_connected so connection persists visually
    if (provider === 'dropbox') {
      setDropboxAccessToken(null);
      localStorage.removeItem('dropbox_access_token');
    } else if (provider === 'google') {
      setGoogleAccessToken(null);
      localStorage.removeItem('google_access_token');
    } else if (provider === 'onedrive') {
      setOneDriveAccessToken(null);
      localStorage.removeItem('onedrive_access_token');
    }
    setExpiredProviders((prev) => Array.from(new Set([...prev, provider])));
  };

  const dismissExpiredProviderNotice = (provider: CloudProvider) => {
    setExpiredProviders((prev) => prev.filter((p) => p !== provider));
  };

  // Dynamically load Google Identity Services SDK only when user is authenticated
  // (not on guest pages where no user is logged in)
  useEffect(() => {
    if (!user) return;
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/event/')) return;
    if (typeof window === 'undefined') return;
    if (window.google?.accounts?.oauth2) return; // Already loaded
    if (document.querySelector('script[src*="gsi/client"]')) return; // Already loading

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [user]);

  /**
   * Attempt to renew Google access token silently via Google Identity Services (GIS)
   */
  const refreshGoogleTokenSilently = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId || typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
        resolve(null);
        return;
      }

      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response: { access_token?: string; expires_in?: number; error?: string }) => {
            if (response.access_token) {
              const token = response.access_token;
              const expiresIn = response.expires_in || 3600;
              const expiresAt = Date.now() + expiresIn * 1000;
              setGoogleAccessToken(token);
              setIsGoogleConnected(true);
              localStorage.setItem('google_access_token', token);
              localStorage.setItem('google_token_expires_at', expiresAt.toString());
              localStorage.setItem('google_connected', 'true');
              dismissExpiredProviderNotice('google');
              resolve(token);
            } else {
              console.warn('Google silent token refresh failed:', response.error);
              resolve(null);
            }
          },
          error_callback: (err: unknown) => {
            console.debug('Google silent token refresh omitted:', err);
            resolve(null);
          },
        });

        // Request access token silently without showing prompt if user granted permissions before
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        console.debug('Error invoking Google silent refresh:', err);
        resolve(null);
      }
    });
  }, []);

  const checkCloudConnections = useCallback(async (): Promise<CloudProvider[]> => {
    const expired: CloudProvider[] = [];
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/event/')) {
      return expired;
    }

    const dbx = localStorage.getItem('dropbox_access_token') || dropboxAccessToken;
    if (dbx) {
      const isValid = await checkTokenValidity('dropbox', dbx);
      if (!isValid) {
        setDropboxAccessToken(null);
        localStorage.removeItem('dropbox_access_token');
      }
    }

    const gdrive = localStorage.getItem('google_access_token') || googleAccessToken;
    const gConnected = localStorage.getItem('google_connected') === 'true' || isGoogleConnected;
    if (user && (gdrive || gConnected)) {
      const expiresAt = localStorage.getItem('google_token_expires_at');
      const isExpiredByTime = expiresAt ? Date.now() > (parseInt(expiresAt, 10) - 60000) : true;

      let isValid = false;
      if (gdrive && !isExpiredByTime) {
        isValid = await checkTokenValidity('google', gdrive);
      }

      if (!isValid && gConnected) {
        // Attempt silent token refresh before giving up
        const refreshedToken = await refreshGoogleTokenSilently();
        if (!refreshedToken && !gdrive) {
          setGoogleAccessToken(null);
          localStorage.removeItem('google_access_token');
        }
      }
    }

    const onedrive = localStorage.getItem('onedrive_access_token') || onedriveAccessToken;
    if (onedrive) {
      const isValid = await checkTokenValidity('onedrive', onedrive);
      if (!isValid) {
        setOneDriveAccessToken(null);
        localStorage.removeItem('onedrive_access_token');
      }
    }

    return expired;
  }, [user, dropboxAccessToken, googleAccessToken, onedriveAccessToken, isGoogleConnected, refreshGoogleTokenSilently]);

  // Periodic silent token refresh timer for Google Drive to prevent 1-hour expiration during active use
  useEffect(() => {
    if (!isGoogleConnected) return;

    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/event/')) return;
      const expiresAt = localStorage.getItem('google_token_expires_at');
      const isNearExpiry = expiresAt ? Date.now() > parseInt(expiresAt, 10) - 10 * 60 * 1000 : true;
      if (isNearExpiry) {
        refreshGoogleTokenSilently().catch(() => {});
      }
    }, 15 * 60 * 1000); // Check every 15 minutes

    return () => clearInterval(interval);
  }, [isGoogleConnected, refreshGoogleTokenSilently]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        checkCloudConnections();
      }
    });

    return () => unsubscribe();
  }, [checkCloudConnections]);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      console.error('שגיאה בהתחברות:', error);
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code !== 'auth/popup-closed-by-user') {
        throw error;
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const connectDropbox = () => {
    const clientId = import.meta.env.VITE_DROPBOX_CLIENT_ID;
    if (!clientId) {
      console.error('Dropbox Client ID is missing in environment variables.');
      alert('שגיאה: מזהה לקוח Dropbox חסר בקובץ ההגדרות (.env)');
      return;
    }
    localStorage.setItem('dropbox_connected', 'true');
    setIsDropboxConnected(true);
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}`;
    window.location.href = authUrl;
  };

  const disconnectDropbox = () => {
    setDropboxAccessToken(null);
    setIsDropboxConnected(false);
    localStorage.removeItem('dropbox_access_token');
    localStorage.removeItem('dropbox_token_expires_at');
    localStorage.removeItem('dropbox_connected');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'dropbox'));
  };

  const clearDropboxToken = () => {
    markProviderExpired('dropbox');
  };

  const connectGoogle = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('Google Client ID is missing in environment variables.');
      alert('שגיאה: מזהה לקוח Google Drive חסר בקובץ ההגדרות (.env)');
      return;
    }

    localStorage.setItem('google_connected', 'true');
    setIsGoogleConnected(true);

    // Try Google Identity Services GIS popup client first
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response: { access_token?: string; expires_in?: number }) => {
            if (response.access_token) {
              const token = response.access_token;
              const expiresIn = response.expires_in || 3600;
              const expiresAt = Date.now() + expiresIn * 1000;
              setGoogleAccessToken(token);
              setIsGoogleConnected(true);
              localStorage.setItem('google_access_token', token);
              localStorage.setItem('google_token_expires_at', expiresAt.toString());
              localStorage.setItem('google_connected', 'true');
              dismissExpiredProviderNotice('google');
            }
          },
        });
        tokenClient.requestAccessToken();
        return;
      } catch (err) {
        console.warn('GIS Token client failed, falling back to redirect:', err);
      }
    }

    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&state=provider%3Dgoogle`;
    window.location.href = authUrl;
  };

  const disconnectGoogle = () => {
    setGoogleAccessToken(null);
    setIsGoogleConnected(false);
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expires_at');
    localStorage.removeItem('google_connected');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
  };

  const clearGoogleToken = () => {
    markProviderExpired('google');
  };

  const connectOneDrive = () => {
    const clientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID;
    if (!clientId) {
      console.error('OneDrive Client ID is missing in environment variables.');
      alert('שגיאה: מזהה לקוח OneDrive חסר בקובץ ההגדרות (.env)');
      return;
    }
    localStorage.setItem('onedrive_connected', 'true');
    setIsOneDriveConnected(true);
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const scope = encodeURIComponent('files.read');
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scope}&state=provider%3Donedrive`;
    window.location.href = authUrl;
  };

  const disconnectOneDrive = () => {
    setOneDriveAccessToken(null);
    setIsOneDriveConnected(false);
    localStorage.removeItem('onedrive_access_token');
    localStorage.removeItem('onedrive_token_expires_at');
    localStorage.removeItem('onedrive_connected');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'onedrive'));
  };

  const clearOneDriveToken = () => {
    markProviderExpired('onedrive');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        dropboxAccessToken,
        googleAccessToken,
        onedriveAccessToken,
        isDropboxConnected,
        isGoogleConnected,
        isOneDriveConnected,
        expiredProviders,
        signIn,
        signOut,
        clearDropboxToken,
        clearGoogleToken,
        clearOneDriveToken,
        connectDropbox,
        disconnectDropbox,
        connectGoogle,
        disconnectGoogle,
        connectOneDrive,
        disconnectOneDrive,
        checkCloudConnections,
        refreshGoogleTokenSilently,
        markProviderExpired,
        dismissExpiredProviderNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
