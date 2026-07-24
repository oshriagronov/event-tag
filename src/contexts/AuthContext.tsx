import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
  pcloudAccessToken: string | null;
  boxAccessToken: string | null;
  isDropboxConnected: boolean;
  isGoogleConnected: boolean;
  isOneDriveConnected: boolean;
  isPCloudConnected: boolean;
  isBoxConnected: boolean;
  expiredProviders: CloudProvider[];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearDropboxToken: () => void;
  clearGoogleToken: () => void;
  clearOneDriveToken: () => void;
  clearPCloudToken: () => void;
  clearBoxToken: () => void;
  connectDropbox: () => void;
  disconnectDropbox: () => void;
  connectGoogle: () => void;
  disconnectGoogle: () => void;
  connectOneDrive: () => void;
  disconnectOneDrive: () => void;
  connectPCloud: () => void;
  disconnectPCloud: () => void;
  connectBox: () => void;
  disconnectBox: () => void;
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
    if (!p && state.includes('provider=pcloud')) p = 'pcloud';
    if (!p && state.includes('provider=box')) p = 'box';

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
    const locId = hashParams.get('locationid') || queryParams.get('locationid');
    if (locId) {
      localStorage.setItem('pcloud_location_id', locId);
    }
    let p = hashParams.get('provider') || queryParams.get('provider');
    if (!p && state.includes('provider=google')) p = 'google';
    if (!p && state.includes('provider=onedrive')) p = 'onedrive';
    if (!p && state.includes('provider=pcloud')) p = 'pcloud';
    if (!p && state.includes('provider=box')) p = 'box';
    if (!p && locId) p = 'pcloud';
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

function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values).map((x) => possible[x % possible.length]).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64Digest
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropboxAccessToken, setDropboxAccessToken] = useState<string | null>(() => getInitialToken('dropbox'));
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => getInitialToken('google'));
  const [onedriveAccessToken, setOneDriveAccessToken] = useState<string | null>(() => getInitialToken('onedrive'));
  const [pcloudAccessToken, setPCloudAccessToken] = useState<string | null>(() => getInitialToken('pcloud'));
  const [boxAccessToken, setBoxAccessToken] = useState<string | null>(() => getInitialToken('box'));
  
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
  const [isPCloudConnected, setIsPCloudConnected] = useState<boolean>(
    () => typeof window !== 'undefined' && (localStorage.getItem('pcloud_connected') === 'true' || Boolean(getInitialToken('pcloud')))
  );
  const [isBoxConnected, setIsBoxConnected] = useState<boolean>(
    () => typeof window !== 'undefined' && (localStorage.getItem('box_connected') === 'true' || Boolean(getInitialToken('box')))
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
    } else if (provider === 'pcloud') {
      setPCloudAccessToken(null);
      localStorage.removeItem('pcloud_access_token');
    } else if (provider === 'box') {
      setBoxAccessToken(null);
      localStorage.removeItem('box_access_token');
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
          scope: 'https://www.googleapis.com/auth/drive.readonly',
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

  /**
   * Attempt to renew Box access token silently via refresh token
   */
  const refreshBoxTokenSilently = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('box_refresh_token');
    const clientId = import.meta.env.VITE_BOX_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_BOX_CLIENT_SECRET;
    if (!clientId || !refreshToken) return null;

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', clientId);
      if (clientSecret) {
        params.append('client_secret', clientSecret);
      }

      const response = await fetch('https://api.box.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.access_token) {
          const token = data.access_token;
          const expiresIn = data.expires_in || 3600;
          const expiresAt = Date.now() + expiresIn * 1000;
          setBoxAccessToken(token);
          setIsBoxConnected(true);
          localStorage.setItem('box_access_token', token);
          localStorage.setItem('box_connected', 'true');
          localStorage.setItem('box_token_expires_at', expiresAt.toString());
          if (data.refresh_token) {
            localStorage.setItem('box_refresh_token', data.refresh_token);
          }
          setExpiredProviders((prev) => prev.filter((p) => p !== 'box'));
          return token;
        }
      }
    } catch (err) {
      console.warn('Silent Box token refresh failed:', err);
    }
    return null;
  }, []);

  const processedBoxCodeRef = useRef<string | null>(null);

  // Listen for Box OAuth 2.0 Authorization Code callback (?code=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const search = window.location.search;
    if (!search || !search.includes('code=')) return;

    const queryParams = new URLSearchParams(search);
    const code = queryParams.get('code');
    const state = queryParams.get('state') || '';

    if (code && state.includes('provider=box')) {
      if (processedBoxCodeRef.current === code) {
        return;
      }
      processedBoxCodeRef.current = code;

      // Clean the URL query string immediately to prevent re-execution on re-render
      window.history.replaceState(null, '', window.location.pathname);

      const clientId = import.meta.env.VITE_BOX_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_BOX_CLIENT_SECRET;
      const verifier = sessionStorage.getItem('box_code_verifier');
      const redirectUri = window.location.origin + '/dashboard';

      if (!clientId) {
        console.error('VITE_BOX_CLIENT_ID is missing in environment variables');
        return;
      }

      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', clientId);
      if (clientSecret) {
        params.append('client_secret', clientSecret);
      }
      if (verifier) {
        params.append('code_verifier', verifier);
      }
      params.append('redirect_uri', redirectUri);

      fetch('https://api.box.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
        .then(async (res) => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error_description || errData.error || `HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          sessionStorage.removeItem('box_code_verifier');
          if (data.access_token) {
            const token = data.access_token;
            const expiresIn = data.expires_in || 3600;
            const expiresAt = Date.now() + expiresIn * 1000;
            setBoxAccessToken(token);
            setIsBoxConnected(true);
            localStorage.setItem('box_access_token', token);
            localStorage.setItem('box_connected', 'true');
            localStorage.setItem('box_token_expires_at', expiresAt.toString());
            if (data.refresh_token) {
              localStorage.setItem('box_refresh_token', data.refresh_token);
            }
            setExpiredProviders((prev) => prev.filter((p) => p !== 'box'));
          }
        })
        .catch((err) => {
          sessionStorage.removeItem('box_code_verifier');
          // If valid token already exists in localStorage or state, ignore duplicate exchange error
          if (localStorage.getItem('box_access_token')) {
            console.log('Box code exchange encountered duplicate error, but active token exists:', err);
            return;
          }
          console.error('Failed to exchange Box authorization code:', err);
          localStorage.removeItem('box_connected');
          localStorage.removeItem('box_access_token');
          setIsBoxConnected(false);
          window.alert(`שגיאת התחברות ל-Box:\n\n${err.message || err}`);
        });
    }
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

    const pcloud = localStorage.getItem('pcloud_access_token') || pcloudAccessToken;
    if (pcloud) {
      const isValid = await checkTokenValidity('pcloud', pcloud);
      if (!isValid) {
        setPCloudAccessToken(null);
        localStorage.removeItem('pcloud_access_token');
      }
    }

    const box = localStorage.getItem('box_access_token') || boxAccessToken;
    const bConnected = localStorage.getItem('box_connected') === 'true' || isBoxConnected;
    if (box || bConnected) {
      const expiresAt = localStorage.getItem('box_token_expires_at');
      const isExpiredByTime = expiresAt ? Date.now() > (parseInt(expiresAt, 10) - 60000) : true;

      let isValid = false;
      if (box && !isExpiredByTime) {
        isValid = await checkTokenValidity('box', box);
      }

      if (!isValid && bConnected) {
        const refreshedToken = await refreshBoxTokenSilently();
        if (!refreshedToken && !box) {
          setBoxAccessToken(null);
          localStorage.removeItem('box_access_token');
        }
      }
    }

    return expired;
  }, [user, dropboxAccessToken, googleAccessToken, onedriveAccessToken, pcloudAccessToken, boxAccessToken, isGoogleConnected, isBoxConnected, refreshGoogleTokenSilently, refreshBoxTokenSilently]);

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
          scope: 'https://www.googleapis.com/auth/drive.readonly',
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
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.readonly');
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

  const connectPCloud = () => {
    const clientId = import.meta.env.VITE_PCLOUD_CLIENT_ID;
    if (!clientId) {
      console.error('pCloud Client ID is missing in environment variables.');
      alert('שגיאה: מזהה לקוח pCloud חסר בקובץ ההגדרות (.env)');
      return;
    }
    localStorage.setItem('pcloud_connected', 'true');
    setIsPCloudConnected(true);
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const authUrl = `https://my.pcloud.com/oauth2/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&state=provider%3Dpcloud`;
    window.location.href = authUrl;
  };

  const disconnectPCloud = () => {
    setPCloudAccessToken(null);
    setIsPCloudConnected(false);
    localStorage.removeItem('pcloud_access_token');
    localStorage.removeItem('pcloud_token_expires_at');
    localStorage.removeItem('pcloud_connected');
    localStorage.removeItem('pcloud_location_id');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'pcloud'));
  };

  const clearPCloudToken = () => {
    markProviderExpired('pcloud');
  };

  const connectBox = async () => {
    const clientId = import.meta.env.VITE_BOX_CLIENT_ID;
    if (!clientId) {
      console.error('Box Client ID is missing in environment variables.');
      alert('שגיאה: מזהה לקוח Box חסר בקובץ ההגדרות (.env)');
      return;
    }
    localStorage.setItem('box_connected', 'true');
    setIsBoxConnected(true);

    const verifier = generateRandomString(64);
    sessionStorage.setItem('box_code_verifier', verifier);

    const redirectUri = window.location.origin + '/dashboard';
    let authUrl = `https://account.box.com/api/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=provider%3Dbox`;

    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      try {
        const challenge = await generateCodeChallenge(verifier);
        authUrl += `&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
      } catch (err) {
        console.warn('Could not generate PKCE challenge:', err);
      }
    }

    window.location.href = authUrl;
  };

  const disconnectBox = () => {
    setBoxAccessToken(null);
    setIsBoxConnected(false);
    localStorage.removeItem('box_access_token');
    localStorage.removeItem('box_token_expires_at');
    localStorage.removeItem('box_refresh_token');
    localStorage.removeItem('box_connected');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'box'));
  };

  const clearBoxToken = () => {
    markProviderExpired('box');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        dropboxAccessToken,
        googleAccessToken,
        onedriveAccessToken,
        pcloudAccessToken,
        boxAccessToken,
        isDropboxConnected,
        isGoogleConnected,
        isOneDriveConnected,
        isPCloudConnected,
        isBoxConnected,
        expiredProviders,
        signIn,
        signOut,
        clearDropboxToken,
        clearGoogleToken,
        clearOneDriveToken,
        clearPCloudToken,
        clearBoxToken,
        connectDropbox,
        disconnectDropbox,
        connectGoogle,
        disconnectGoogle,
        connectOneDrive,
        disconnectOneDrive,
        connectPCloud,
        disconnectPCloud,
        connectBox,
        disconnectBox,
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

