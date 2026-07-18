import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  dropboxAccessToken: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearDropboxToken: () => void;
  connectDropbox: () => void;
  disconnectDropbox: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropboxAccessToken, setDropboxAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // Try to restore token from sessionStorage
    const savedToken = sessionStorage.getItem('dropbox_access_token');
    if (savedToken) {
      setDropboxAccessToken(savedToken);
    }

    // Check if there is an access token in the URL hash (from Dropbox OAuth redirect)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1)); // Remove the leading '#'
      const token = params.get('access_token');
      if (token) {
        setDropboxAccessToken(token);
        sessionStorage.setItem('dropbox_access_token', token);
        
        // Clean up hash from URL
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
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
    disconnectDropbox();
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
    sessionStorage.removeItem('dropbox_access_token');
  };

  const clearDropboxToken = () => {
    disconnectDropbox();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        dropboxAccessToken,
        signIn,
        signOut,
        clearDropboxToken,
        connectDropbox,
        disconnectDropbox,
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
