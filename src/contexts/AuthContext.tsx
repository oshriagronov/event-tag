import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

import { checkTokenValidity, type CloudProvider } from '../services/cloudProviders';

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
  markProviderExpired: (provider: CloudProvider) => void;
  dismissExpiredProviderNotice: (provider: CloudProvider) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropboxAccessToken, setDropboxAccessToken] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [onedriveAccessToken, setOneDriveAccessToken] = useState<string | null>(null);
  const [expiredProviders, setExpiredProviders] = useState<CloudProvider[]>([]);

  const markProviderExpired = (provider: CloudProvider) => {
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
    setExpiredProviders((prev) => (prev.includes(provider) ? prev : [...prev, provider]));
  };

  const dismissExpiredProviderNotice = (provider: CloudProvider) => {
    setExpiredProviders((prev) => prev.filter((p) => p !== provider));
  };

  const checkCloudConnections = async (): Promise<CloudProvider[]> => {
    const expired: CloudProvider[] = [];

    const dbx = localStorage.getItem('dropbox_access_token') || dropboxAccessToken;
    if (dbx) {
      const isValid = await checkTokenValidity('dropbox', dbx);
      if (!isValid) {
        setDropboxAccessToken(null);
        localStorage.removeItem('dropbox_access_token');
        expired.push('dropbox');
      }
    }

    const gdrive = localStorage.getItem('google_access_token') || googleAccessToken;
    if (gdrive) {
      const isValid = await checkTokenValidity('google', gdrive);
      if (!isValid) {
        setGoogleAccessToken(null);
        localStorage.removeItem('google_access_token');
        expired.push('google');
      }
    }

    const onedrive = localStorage.getItem('onedrive_access_token') || onedriveAccessToken;
    if (onedrive) {
      const isValid = await checkTokenValidity('onedrive', onedrive);
      if (!isValid) {
        setOneDriveAccessToken(null);
        localStorage.removeItem('onedrive_access_token');
        expired.push('onedrive');
      }
    }

    if (expired.length > 0) {
      setExpiredProviders((prev) => Array.from(new Set([...prev, ...expired])));
    }
    return expired;
  };

  useEffect(() => {
    // Restore tokens from localStorage so provider links persist across sessions and logouts until explicitly unlinked
    const savedDbxToken = localStorage.getItem('dropbox_access_token');
    if (savedDbxToken) setDropboxAccessToken(savedDbxToken);

    const savedGoogleToken = localStorage.getItem('google_access_token');
    if (savedGoogleToken) setGoogleAccessToken(savedGoogleToken);

    const savedOneDriveToken = localStorage.getItem('onedrive_access_token');
    if (savedOneDriveToken) setOneDriveAccessToken(savedOneDriveToken);

    // Check if there is an access token in the URL hash or query params from OAuth redirects
    const hash = window.location.hash;
    const search = window.location.search;
    if ((hash && hash.includes('access_token=')) || (search && search.includes('access_token='))) {
      const hashParams = hash ? new URLSearchParams(hash.substring(1)) : new URLSearchParams();
      const queryParams = new URLSearchParams(search);
      
      const token = hashParams.get('access_token') || queryParams.get('access_token');
      const state = hashParams.get('state') || queryParams.get('state') || '';
      
      let provider = hashParams.get('provider') || queryParams.get('provider');
      if (!provider && state.includes('provider=google')) provider = 'google';
      if (!provider && state.includes('provider=onedrive')) provider = 'onedrive';

      if (token) {
        if (provider === 'google') {
          setGoogleAccessToken(token);
          localStorage.setItem('google_access_token', token);
          setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
        } else if (provider === 'onedrive') {
          setOneDriveAccessToken(token);
          localStorage.setItem('onedrive_access_token', token);
          setExpiredProviders((prev) => prev.filter((p) => p !== 'onedrive'));
        } else {
          setDropboxAccessToken(token);
          localStorage.setItem('dropbox_access_token', token);
          setExpiredProviders((prev) => prev.filter((p) => p !== 'dropbox'));
        }
        
        // Clean up hash and search from URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        checkCloudConnections();
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('שגיאה בהתחברות:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        throw error;
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    // Cloud provider connections remain saved in localStorage until explicitly unlinked by the user.
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
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.readonly');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&state=provider%3Dgoogle`;
    window.location.href = authUrl;
  };

  const disconnectGoogle = () => {
    setGoogleAccessToken(null);
    localStorage.removeItem('google_access_token');
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
