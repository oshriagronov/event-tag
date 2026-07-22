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
  const [expiredProviders, setExpiredProviders] = useState<CloudProvider[]>([]);

  const markProviderExpired = (provider: CloudProvider) => {
    if (provider === 'dropbox') {
      setDropboxAccessToken(null);
      localStorage.removeItem('dropbox_access_token');
      localStorage.removeItem('dropbox_token_expires_at');
    } else if (provider === 'google') {
      setGoogleAccessToken(null);
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_token_expires_at');
    } else if (provider === 'onedrive') {
      setOneDriveAccessToken(null);
      localStorage.removeItem('onedrive_access_token');
      localStorage.removeItem('onedrive_token_expires_at');
    }
    setExpiredProviders((prev) => Array.from(new Set([...prev, provider])));
  };

  const dismissExpiredProviderNotice = (provider: CloudProvider) => {
    setExpiredProviders((prev) => prev.filter((p) => p !== provider));
  };

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
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          callback: (response: { access_token?: string; expires_in?: number; error?: string }) => {
            if (response.access_token) {
              const token = response.access_token;
              const expiresIn = response.expires_in || 3600;
              const expiresAt = Date.now() + expiresIn * 1000;
              setGoogleAccessToken(token);
              localStorage.setItem('google_access_token', token);
              localStorage.setItem('google_token_expires_at', expiresAt.toString());
              setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
              resolve(token);
            } else {
              resolve(null);
            }
          },
          error_callback: () => resolve(null),
        });

        // Request access token silently without showing prompt if user granted permissions before
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        console.warn('Silent Google token refresh failed:', err);
        resolve(null);
      }
    });
  }, []);

  const checkCloudConnections = useCallback(async (): Promise<CloudProvider[]> => {
    const expired: CloudProvider[] = [];

    const dbx = localStorage.getItem('dropbox_access_token') || dropboxAccessToken;
    if (dbx) {
      const isValid = await checkTokenValidity('dropbox', dbx);
      if (!isValid) {
        setDropboxAccessToken(null);
        localStorage.removeItem('dropbox_access_token');
        localStorage.removeItem('dropbox_token_expires_at');
        expired.push('dropbox');
      }
    }

    const gdrive = localStorage.getItem('google_access_token') || googleAccessToken;
    if (gdrive) {
      const expiresAt = localStorage.getItem('google_token_expires_at');
      const isExpiredByTime = expiresAt ? Date.now() > (parseInt(expiresAt, 10) - 60000) : false;

      let isValid = false;
      if (!isExpiredByTime) {
        isValid = await checkTokenValidity('google', gdrive);
      }

      if (!isValid) {
        // Attempt silent token refresh before declaring token expired!
        const refreshedToken = await refreshGoogleTokenSilently();
        if (!refreshedToken) {
          setGoogleAccessToken(null);
          localStorage.removeItem('google_access_token');
          localStorage.removeItem('google_token_expires_at');
          expired.push('google');
        }
      }
    }

    const onedrive = localStorage.getItem('onedrive_access_token') || onedriveAccessToken;
    if (onedrive) {
      const isValid = await checkTokenValidity('onedrive', onedrive);
      if (!isValid) {
        setOneDriveAccessToken(null);
        localStorage.removeItem('onedrive_access_token');
        localStorage.removeItem('onedrive_token_expires_at');
        expired.push('onedrive');
      }
    }

    if (expired.length > 0) {
      setExpiredProviders((prev) => Array.from(new Set([...prev, ...expired])));
    }
    return expired;
  }, [dropboxAccessToken, googleAccessToken, onedriveAccessToken, refreshGoogleTokenSilently]);

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
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}`;
    window.location.href = authUrl;
  };

  const disconnectDropbox = () => {
    setDropboxAccessToken(null);
    localStorage.removeItem('dropbox_access_token');
    localStorage.removeItem('dropbox_token_expires_at');
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

    // Try Google Identity Services GIS popup client first
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          callback: (response: { access_token?: string; expires_in?: number }) => {
            if (response.access_token) {
              const token = response.access_token;
              const expiresIn = response.expires_in || 3600;
              const expiresAt = Date.now() + expiresIn * 1000;
              setGoogleAccessToken(token);
              localStorage.setItem('google_access_token', token);
              localStorage.setItem('google_token_expires_at', expiresAt.toString());
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
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.readonly');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&state=provider%3Dgoogle`;
    window.location.href = authUrl;
  };

  const disconnectGoogle = () => {
    setGoogleAccessToken(null);
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expires_at');
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
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const scope = encodeURIComponent('files.read');
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scope}&state=provider%3Donedrive`;
    window.location.href = authUrl;
  };

  const disconnectOneDrive = () => {
    setOneDriveAccessToken(null);
    localStorage.removeItem('onedrive_access_token');
    localStorage.removeItem('onedrive_token_expires_at');
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
