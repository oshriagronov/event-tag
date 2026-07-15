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
  googleAccessToken: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearGoogleToken: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // Try to restore token from sessionStorage
      if (firebaseUser) {
        const savedToken = sessionStorage.getItem('google_access_token');
        if (savedToken) {
          setGoogleAccessToken(savedToken);
        }
      } else {
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_access_token');
      }
    });
    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Extract the Google OAuth access token for Drive API
      const credential = (await import('firebase/auth')).GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      setGoogleAccessToken(token);
      if (token) {
        sessionStorage.setItem('google_access_token', token);
      }
    } catch (error: any) {
      console.error('שגיאה בהתחברות:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        throw error;
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setGoogleAccessToken(null);
    sessionStorage.removeItem('google_access_token');
  };

  const clearGoogleToken = () => {
    setGoogleAccessToken(null);
    sessionStorage.removeItem('google_access_token');
  };

  return (
    <AuthContext.Provider value={{ user, loading, googleAccessToken, signIn, signOut, clearGoogleToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
