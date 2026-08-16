import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

import { checkTokenValidity, type CloudProvider } from '../services/cloudProviders';
import {
  ensureUserProfile,
  subscribeUserProfile,
  subscribeSystemSettings,
  subscribeAllowlist,
  type UserProfile,
  type SystemSettings,
  type AllowlistEntry,
} from '../services/adminService';

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
  userProfile: UserProfile | null;
  isAdmin: boolean;
  isBlocked: boolean;
  systemSettings: SystemSettings;
  allowlist: AllowlistEntry[];
  isAllowlisted: boolean;
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
      const uid = auth.currentUser?.uid;
      if (uid) {
        localStorage.setItem(`${uid}_${provider}_access_token`, token);
        localStorage.setItem(`${uid}_${provider}_connected`, 'true');
        if (expiresIn) {
          const expiresAt = Date.now() + parseInt(expiresIn, 10) * 1000;
          localStorage.setItem(`${uid}_${provider}_token_expires_at`, expiresAt.toString());
        }
      } else {
        localStorage.setItem(`pending_${provider}_access_token`, token);
        if (expiresIn) {
          const expiresAt = Date.now() + parseInt(expiresIn, 10) * 1000;
          localStorage.setItem(`pending_${provider}_token_expires_at`, expiresAt.toString());
        }
      }
      window.history.replaceState(null, '', window.location.pathname);
      return token;
    }
  }
  return null;
}

function clearLegacyStorageKeys() {
  if (typeof window === 'undefined') return;
  const legacyKeys = [
    'google_connected',
    'google_access_token',
    'google_token_expires_at',
    'dropbox_connected',
    'dropbox_access_token',
    'dropbox_token_expires_at',
    'onedrive_connected',
    'onedrive_access_token',
    'onedrive_token_expires_at',
  ];
  legacyKeys.forEach((key) => localStorage.removeItem(key));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropboxAccessToken, setDropboxAccessToken] = useState<string | null>(() => getInitialToken('dropbox'));
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => getInitialToken('google'));
  const [onedriveAccessToken, setOneDriveAccessToken] = useState<string | null>(() => getInitialToken('onedrive'));

  // Persistent connection flags (stay true until user explicitly disconnects)
  const [isDropboxConnected, setIsDropboxConnected] = useState<boolean>(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(false);
  const [isOneDriveConnected, setIsOneDriveConnected] = useState<boolean>(false);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    maintenanceMode: false,
    allowlistMode: false,
  });
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [expiredProviders, setExpiredProviders] = useState<CloudProvider[]>([]);

  useEffect(() => {
    const unsubSettings = subscribeSystemSettings(
      (settings) => {
        setSystemSettings(settings);
      },
      (err) => {
        console.warn('System settings listener error:', err);
      }
    );
    return () => unsubSettings();
  }, []);

  const markProviderExpired = (provider: CloudProvider) => {
    const uid = user?.uid || auth.currentUser?.uid;
    if (provider === 'dropbox') {
      setDropboxAccessToken(null);
      if (uid) localStorage.removeItem(`${uid}_dropbox_access_token`);
    } else if (provider === 'google') {
      setGoogleAccessToken(null);
      if (uid) localStorage.removeItem(`${uid}_google_access_token`);
    } else if (provider === 'onedrive') {
      setOneDriveAccessToken(null);
      if (uid) localStorage.removeItem(`${uid}_onedrive_access_token`);
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
              const uid = auth.currentUser?.uid;
              if (uid) {
                localStorage.setItem(`${uid}_google_access_token`, token);
                localStorage.setItem(`${uid}_google_token_expires_at`, expiresAt.toString());
                localStorage.setItem(`${uid}_google_connected`, 'true');
              }
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

    if (!user) return expired;
    const uid = user.uid;

    // Check Dropbox
    const dbxConnected = localStorage.getItem(`${uid}_dropbox_connected`) === 'true' || isDropboxConnected;
    const dbx = localStorage.getItem(`${uid}_dropbox_access_token`) || dropboxAccessToken;
    if (dbxConnected || dbx) {
      const expiresAt = localStorage.getItem(`${uid}_dropbox_token_expires_at`);
      const isExpiredByTime = expiresAt ? Date.now() > parseInt(expiresAt, 10) - 60000 : false;

      let isValid = false;
      if (dbx && !isExpiredByTime) {
        isValid = await checkTokenValidity('dropbox', dbx);
      }

      if (!isValid && dbxConnected) {
        setDropboxAccessToken(null);
        localStorage.removeItem(`${uid}_dropbox_access_token`);
        setExpiredProviders((prev) => Array.from(new Set([...prev, 'dropbox'])));
        expired.push('dropbox');
      } else if (isValid) {
        setExpiredProviders((prev) => prev.filter((p) => p !== 'dropbox'));
      }
    } else {
      setExpiredProviders((prev) => prev.filter((p) => p !== 'dropbox'));
    }

    // Check Google
    const gConnected = localStorage.getItem(`${uid}_google_connected`) === 'true' || isGoogleConnected;
    const gdrive = localStorage.getItem(`${uid}_google_access_token`) || googleAccessToken;
    if (gConnected || gdrive) {
      const expiresAt = localStorage.getItem(`${uid}_google_token_expires_at`);
      const isExpiredByTime = expiresAt ? Date.now() > parseInt(expiresAt, 10) - 60000 : true;

      let isValid = false;
      if (gdrive && !isExpiredByTime) {
        isValid = await checkTokenValidity('google', gdrive);
      }

      if (!isValid && gConnected) {
        const refreshed = await refreshGoogleTokenSilently();
        if (!refreshed) {
          setGoogleAccessToken(null);
          localStorage.removeItem(`${uid}_google_access_token`);
          setExpiredProviders((prev) => Array.from(new Set([...prev, 'google'])));
          expired.push('google');
        }
      } else if (isValid) {
        setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
      }
    } else {
      setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
    }

    // Check OneDrive
    const odConnected = localStorage.getItem(`${uid}_onedrive_connected`) === 'true' || isOneDriveConnected;
    const onedrive = localStorage.getItem(`${uid}_onedrive_access_token`) || onedriveAccessToken;
    if (odConnected || onedrive) {
      const expiresAt = localStorage.getItem(`${uid}_onedrive_token_expires_at`);
      const isExpiredByTime = expiresAt ? Date.now() > parseInt(expiresAt, 10) - 60000 : false;

      let isValid = false;
      if (onedrive && !isExpiredByTime) {
        isValid = await checkTokenValidity('onedrive', onedrive);
      }

      if (!isValid && odConnected) {
        setOneDriveAccessToken(null);
        localStorage.removeItem(`${uid}_onedrive_access_token`);
        setExpiredProviders((prev) => Array.from(new Set([...prev, 'onedrive'])));
        expired.push('onedrive');
      } else if (isValid) {
        setExpiredProviders((prev) => prev.filter((p) => p !== 'onedrive'));
      }
    } else {
      setExpiredProviders((prev) => prev.filter((p) => p !== 'onedrive'));
    }

    return expired;
  }, [
    user,
    dropboxAccessToken,
    googleAccessToken,
    onedriveAccessToken,
    isDropboxConnected,
    isGoogleConnected,
    isOneDriveConnected,
    refreshGoogleTokenSilently,
  ]);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let unsubAllowlist: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const uid = firebaseUser.uid;
        clearLegacyStorageKeys();

        // Check and apply any pending token from getInitialToken
        (['dropbox', 'google', 'onedrive'] as CloudProvider[]).forEach((p) => {
          const pendingToken = localStorage.getItem(`pending_${p}_access_token`);
          if (pendingToken) {
            const pendingExpiresAt = localStorage.getItem(`pending_${p}_token_expires_at`);
            localStorage.setItem(`${uid}_${p}_access_token`, pendingToken);
            localStorage.setItem(`${uid}_${p}_connected`, 'true');
            if (pendingExpiresAt) {
              localStorage.setItem(`${uid}_${p}_token_expires_at`, pendingExpiresAt);
            }
            localStorage.removeItem(`pending_${p}_access_token`);
            localStorage.removeItem(`pending_${p}_token_expires_at`);
          }
        });

        // Load user-scoped connection status & tokens
        const dbxConn = localStorage.getItem(`${uid}_dropbox_connected`) === 'true';
        const gConn = localStorage.getItem(`${uid}_google_connected`) === 'true';
        const odConn = localStorage.getItem(`${uid}_onedrive_connected`) === 'true';

        setIsDropboxConnected(dbxConn);
        setIsGoogleConnected(gConn);
        setIsOneDriveConnected(odConn);

        const dbxToken = localStorage.getItem(`${uid}_dropbox_access_token`);
        const gToken = localStorage.getItem(`${uid}_google_access_token`);
        const odToken = localStorage.getItem(`${uid}_onedrive_access_token`);

        setDropboxAccessToken(dbxToken);
        setGoogleAccessToken(gToken);
        setOneDriveAccessToken(odToken);

        checkCloudConnections();

        try {
          const profile = await ensureUserProfile(firebaseUser);
          setUserProfile(profile);
        } catch (err) {
          console.error('Failed to ensure user profile:', err);
        }

        unsubProfile = subscribeUserProfile(firebaseUser.uid, (profile) => {
          setUserProfile(profile);
        });

        unsubAllowlist = subscribeAllowlist((entries) => {
          setAllowlist(entries);
        });
      } else {
        setUserProfile(null);
        setAllowlist([]);
        setIsDropboxConnected(false);
        setIsGoogleConnected(false);
        setIsOneDriveConnected(false);
        setDropboxAccessToken(null);
        setGoogleAccessToken(null);
        setOneDriveAccessToken(null);
        setExpiredProviders([]);
        clearLegacyStorageKeys();
        if (unsubProfile) unsubProfile();
        if (unsubAllowlist) unsubAllowlist();
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      if (unsubAllowlist) unsubAllowlist();
    };
  }, [checkCloudConnections]);

  const isAdmin = Boolean(
    userProfile?.role === 'admin' ||
      user?.email === 'admin@eventtag.com' ||
      (import.meta.env.VITE_ADMIN_EMAIL && user?.email === import.meta.env.VITE_ADMIN_EMAIL)
  );

  const isBlocked = Boolean(userProfile?.status === 'blocked');

  const isAllowlisted = Boolean(
    !systemSettings.allowlistMode ||
      isAdmin ||
      (user?.email && allowlist.some((e) => e.email.toLowerCase() === user.email?.toLowerCase()))
  );

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
    setIsDropboxConnected(false);
    setIsGoogleConnected(false);
    setIsOneDriveConnected(false);
    setDropboxAccessToken(null);
    setGoogleAccessToken(null);
    setOneDriveAccessToken(null);
    setExpiredProviders([]);
    clearLegacyStorageKeys();
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
    const uid = user?.uid || auth.currentUser?.uid;
    setDropboxAccessToken(null);
    setIsDropboxConnected(false);
    if (uid) {
      localStorage.removeItem(`${uid}_dropbox_access_token`);
      localStorage.removeItem(`${uid}_dropbox_token_expires_at`);
      localStorage.removeItem(`${uid}_dropbox_connected`);
    }
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

    // Try Google Identity Services GIS popup client first
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
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
              const uid = auth.currentUser?.uid;
              if (uid) {
                localStorage.setItem(`${uid}_google_access_token`, token);
                localStorage.setItem(`${uid}_google_token_expires_at`, expiresAt.toString());
                localStorage.setItem(`${uid}_google_connected`, 'true');
              }
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
    const uid = user?.uid || auth.currentUser?.uid;
    setGoogleAccessToken(null);
    setIsGoogleConnected(false);
    if (uid) {
      localStorage.removeItem(`${uid}_google_access_token`);
      localStorage.removeItem(`${uid}_google_token_expires_at`);
      localStorage.removeItem(`${uid}_google_connected`);
    }
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
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const scope = encodeURIComponent('files.read');
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=${scope}&state=provider%3Donedrive`;
    window.location.href = authUrl;
  };

  const disconnectOneDrive = () => {
    const uid = user?.uid || auth.currentUser?.uid;
    setOneDriveAccessToken(null);
    setIsOneDriveConnected(false);
    if (uid) {
      localStorage.removeItem(`${uid}_onedrive_access_token`);
      localStorage.removeItem(`${uid}_onedrive_token_expires_at`);
      localStorage.removeItem(`${uid}_onedrive_connected`);
    }
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
        userProfile,
        isAdmin,
        isBlocked,
        systemSettings,
        allowlist,
        isAllowlisted,
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
