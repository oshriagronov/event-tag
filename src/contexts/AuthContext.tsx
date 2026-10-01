import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

import { checkTokenValidity, type CloudProvider } from '../services/cloudProviders';
import { postApi, ServerApiError } from '../services/serverApi';
import {
  ensureUserProfile,
  subscribeUserProfile,
  subscribeSystemSettings,
  subscribeAllowlist,
  subscribeAllowlistEntry,
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
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup';
            callback: (response: { code?: string; error?: string }) => void;
            error_callback?: (err: unknown) => void;
          }) => {
            requestCode: () => void;
          };
          revoke?: (token: string, done?: () => void) => void;
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
  connectDropbox: () => void;
  disconnectDropbox: () => Promise<void>;
  connectGoogle: () => void;
  disconnectGoogle: () => Promise<void>;
  connectOneDrive: () => void;
  disconnectOneDrive: () => Promise<void>;
  checkCloudConnections: () => Promise<CloudProvider[]>;
  /**
   * Return an access token that stays valid for at least a few minutes,
   * renewing it when needed. Pass `rejectedToken` after a 401 to renew unless
   * another caller already replaced that token. Resolves to null only when the
   * provider requires the user to reconnect; transient renewal failures throw.
   */
  getFreshAccessToken: (provider: CloudProvider, options?: { rejectedToken?: string }) => Promise<string | null>;
  markProviderExpired: (provider: CloudProvider) => void;
  dismissExpiredProviderNotice: (provider: CloudProvider) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
// Keep Drive authorization non-sensitive: this app only manages files it
// creates or that the user explicitly opens with the app.
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
// Google access tokens live for one hour and the implicit/token flow cannot be
// renewed without a user click. When the serverless token broker is deployed
// (see api/google-token.ts) the authorization-code flow is used instead, which
// yields a refresh token so long-running uploads never lose authorization.
const GOOGLE_OFFLINE_ACCESS = import.meta.env.VITE_GOOGLE_OFFLINE_ACCESS === 'true';
// Renew tokens this long before they expire.
const TOKEN_RENEWAL_MARGIN_MS = 5 * 60_000;

/**
 * Google and Dropbox refresh tokens live only in an encrypted HttpOnly cookie
 * managed by the token brokers (api/google-token.ts, api/dropbox-token.ts), so
 * page scripts can never read them. The browser keeps short-lived access tokens.
 */
type BrokerProvider = 'google' | 'dropbox';

class ReconnectRequiredError extends Error {}
/** The token broker is not deployed (e.g. the plain Vite dev server). */
class BrokerUnavailableError extends Error {}

// Refresh tokens saved in localStorage by older builds; moved into the cookie on first use.
const legacyRefreshTokenKey = (uid: string, provider: BrokerProvider) => `${uid}_${provider}_refresh_token`;
const accessTokenKey = (uid: string, provider: CloudProvider) => `${uid}_${provider}_access_token`;
const expiresAtKey = (uid: string, provider: CloudProvider) => `${uid}_${provider}_token_expires_at`;

/**
 * Providers that renew unattended through the broker keep access tokens for the
 * tab session only. OneDrive and Google without the broker cannot renew
 * without the user, so their tokens stay in localStorage.
 */
function tokenStorage(provider: CloudProvider): Storage {
  return provider === 'dropbox' || (provider === 'google' && GOOGLE_OFFLINE_ACCESS) ? sessionStorage : localStorage;
}

function readAccessToken(uid: string, provider: CloudProvider): string | null {
  return tokenStorage(provider).getItem(accessTokenKey(uid, provider));
}

function readTokenExpiry(uid: string, provider: CloudProvider): number {
  return Number(tokenStorage(provider).getItem(expiresAtKey(uid, provider)));
}

function writeAccessToken(uid: string, provider: CloudProvider, token: string, expiresAt: number | null) {
  const storage = tokenStorage(provider);
  storage.setItem(accessTokenKey(uid, provider), token);
  if (expiresAt) storage.setItem(expiresAtKey(uid, provider), String(expiresAt));
  localStorage.setItem(`${uid}_${provider}_connected`, 'true');
}

function clearAccessToken(uid: string, provider: CloudProvider) {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(accessTokenKey(uid, provider));
    storage.removeItem(expiresAtKey(uid, provider));
  }
}

/** Move access tokens that older builds kept in localStorage into the tab session. */
function migrateAccessTokenStorage(uid: string) {
  for (const provider of ['google', 'dropbox'] as const) {
    if (tokenStorage(provider) !== sessionStorage) continue;
    const token = localStorage.getItem(accessTokenKey(uid, provider));
    if (!token) continue;
    if (!sessionStorage.getItem(accessTokenKey(uid, provider))) {
      sessionStorage.setItem(accessTokenKey(uid, provider), token);
      const expiresAt = localStorage.getItem(expiresAtKey(uid, provider));
      if (expiresAt) sessionStorage.setItem(expiresAtKey(uid, provider), expiresAt);
    }
    localStorage.removeItem(accessTokenKey(uid, provider));
    localStorage.removeItem(expiresAtKey(uid, provider));
  }
}

interface BrokerTokens {
  access_token: string;
  expires_in: number;
  has_refresh_token: boolean;
}

/**
 * Call a provider token broker as the signed-in user. Throws
 * ReconnectRequiredError when the grant is gone, BrokerUnavailableError when
 * the broker is not deployed, and the original error for transient failures.
 */
async function requestTokenBroker(provider: BrokerProvider, body: Record<string, string>): Promise<BrokerTokens> {
  const uid = auth.currentUser?.uid;
  const legacy = uid ? localStorage.getItem(legacyRefreshTokenKey(uid, provider)) : null;
  try {
    const data = await postApi<BrokerTokens>(
      `/api/${provider}-token`,
      legacy ? { ...body, legacy_refresh_token: legacy } : body,
      { authenticated: true }
    );
    // The broker now holds the refresh token in its cookie.
    if (uid && legacy && data.has_refresh_token) localStorage.removeItem(legacyRefreshTokenKey(uid, provider));
    return data;
  } catch (error) {
    if (error instanceof ServerApiError) {
      if (error.code === 'invalid_grant') {
        if (uid) localStorage.removeItem(legacyRefreshTokenKey(uid, provider));
        throw new ReconnectRequiredError(`${provider} grant was revoked or expired`);
      }
      if (error.status === 404 || error.code === 'not_configured') {
        throw new BrokerUnavailableError(`${provider} token broker is not available`);
      }
    }
    throw error;
  }
}

/**
 * Talk to Dropbox directly from the browser. Only used when the broker is not
 * deployed (local development); the refresh token then stays in localStorage.
 */
async function requestDropboxTokenDirectly(
  params: Record<string, string>
): Promise<{ access_token: string; expires_in: number; refresh_token?: string } | null> {
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: import.meta.env.VITE_DROPBOX_CLIENT_ID }),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) return null;
    throw new Error(`Dropbox token request failed: ${response.status}`);
  }
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  return { access_token: data.access_token, expires_in: data.expires_in || 14_400, refresh_token: data.refresh_token };
}

const oauthStateKey = (provider: CloudProvider) => `pending_${provider}_oauth_state`;

/** Remember a one-time `state` value for an implicit-flow redirect. */
function createOAuthState(provider: 'google' | 'onedrive'): string {
  const state = `provider=${provider}:${crypto.randomUUID()}`;
  sessionStorage.setItem(oauthStateKey(provider), state);
  return state;
}

/**
 * Read an implicit-flow redirect result (Google fallback / OneDrive). The
 * response is only trusted when its `state` matches the value this tab stored
 * before redirecting; otherwise a crafted link could plant an attacker's token
 * and make the user upload event photos into the attacker's cloud account.
 * Dropbox uses the PKCE code flow and never returns tokens in the URL.
 */
function getInitialToken(provider: CloudProvider): string | null {
  if (typeof window === 'undefined' || provider === 'dropbox') return null;
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const queryParams = new URLSearchParams(window.location.search);
  const state = hashParams.get('state') || queryParams.get('state') || '';
  if (!state.startsWith(`provider=${provider}:`)) return null;
  const error = hashParams.get('error') || queryParams.get('error');
  const token = hashParams.get('access_token');
  if (!error && !token) return null;

  window.history.replaceState(null, '', window.location.pathname);
  const expectedState = sessionStorage.getItem(oauthStateKey(provider));
  sessionStorage.removeItem(oauthStateKey(provider));
  if (!expectedState || state !== expectedState) {
    console.error(`OAuth state validation failed for ${provider}.`);
    return null;
  }

  if (error) {
    const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
    console.error(`OAuth redirect error for ${provider}:`, error, errorDesc);
    const detail = errorDesc ? `${error}: ${errorDesc}` : error;
    setTimeout(() => {
      window.alert(`שגיאת התחברות ל-${provider}:\n\n${detail}\n\nאנא וודא כי ההגדרות ב-Developer Console תקינות.`);
    }, 300);
    return null;
  }
  if (!token) return null;

  const expiresIn = Number(hashParams.get('expires_in'));
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? String(Date.now() + expiresIn * 1000) : null;
  const uid = auth.currentUser?.uid;
  if (uid) {
    writeAccessToken(uid, provider, token, expiresAt ? Number(expiresAt) : null);
  } else {
    // Firebase restores the session asynchronously; keep the token for this tab
    // only until the signed-in user is known.
    sessionStorage.setItem(`pending_${provider}_access_token`, token);
    if (expiresAt) sessionStorage.setItem(`pending_${provider}_token_expires_at`, expiresAt);
  }
  return token;
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

function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then((digest) => ({
    verifier,
    challenge: btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, ''),
  }));
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
  const [isOwnEmailAllowlisted, setIsOwnEmailAllowlisted] = useState(false);
  const [expiredProviders, setExpiredProviders] = useState<CloudProvider[]>([]);
  const googleRefreshTimerRef = useRef<number | null>(null);
  const dropboxRefreshTimerRef = useRef<number | null>(null);

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

  const markProviderExpired = useCallback((provider: CloudProvider) => {
    const uid = user?.uid || auth.currentUser?.uid;
    if (uid) clearAccessToken(uid, provider);
    if (provider === 'dropbox') setDropboxAccessToken(null);
    else if (provider === 'google') setGoogleAccessToken(null);
    else if (provider === 'onedrive') setOneDriveAccessToken(null);
    setExpiredProviders((prev) => Array.from(new Set([...prev, provider])));
  }, [user?.uid]);

  const dismissExpiredProviderNotice = useCallback((provider: CloudProvider) => {
    setExpiredProviders((prev) => prev.filter((p) => p !== provider));
  }, []);

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

  const storeGoogleToken = useCallback((token: string, expiresInSec: number) => {
    const uid = auth.currentUser?.uid;
    if (uid) writeAccessToken(uid, 'google', token, Date.now() + expiresInSec * 1000);
    setGoogleAccessToken(token);
    setIsGoogleConnected(true);
    dismissExpiredProviderNotice('google');
  }, [dismissExpiredProviderNotice]);

  /**
   * Ask Google Identity Services for a new token without a consent prompt.
   * Browsers usually block this popup when it is not triggered by a click, so
   * it is only a fallback for deployments without the token broker.
   */
  const requestGoogleTokenViaGis = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId || typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
        resolve(null);
        return;
      }

      let settled = false;
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(token);
      };
      const timeoutId = window.setTimeout(() => finish(null), 15_000);

      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPE,
          callback: (response) => {
            if (response.access_token) {
              storeGoogleToken(response.access_token, response.expires_in || 3600);
              finish(response.access_token);
            } else {
              console.warn('Google silent token refresh failed:', response.error);
              finish(null);
            }
          },
          error_callback: (err: unknown) => {
            console.debug('Google silent token refresh omitted:', err);
            finish(null);
          },
        });
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        console.debug('Error invoking Google silent refresh:', err);
        finish(null);
      }
    });
  }, [storeGoogleToken]);

  /**
   * Renew the Google access token: the broker's refresh-token cookie first
   * (works unattended, indefinitely), silent GIS as a fallback. Resolves to
   * null when the user must reconnect; throws on transient failures.
   */
  const refreshGoogleToken = useCallback(async (): Promise<string | null> => {
    if (GOOGLE_OFFLINE_ACCESS && auth.currentUser) {
      try {
        const data = await requestTokenBroker('google', { grant_type: 'refresh_token' });
        storeGoogleToken(data.access_token, data.expires_in);
        return data.access_token;
      } catch (err) {
        if (!(err instanceof ReconnectRequiredError) && !(err instanceof BrokerUnavailableError)) throw err;
      }
    }
    return requestGoogleTokenViaGis();
  }, [requestGoogleTokenViaGis, storeGoogleToken]);

  const storeDropboxToken = useCallback((uid: string, token: string, expiresInSec: number) => {
    writeAccessToken(uid, 'dropbox', token, Date.now() + expiresInSec * 1000);
    setDropboxAccessToken(token);
    setIsDropboxConnected(true);
    dismissExpiredProviderNotice('dropbox');
  }, [dismissExpiredProviderNotice]);

  /** Renew the Dropbox access token. Resolves to null when the user must reconnect. */
  const refreshDropboxToken = useCallback(async (uid: string): Promise<string | null> => {
    if (!import.meta.env.VITE_DROPBOX_CLIENT_ID) return null;
    let data: { access_token: string; expires_in: number } | null;
    try {
      data = await requestTokenBroker('dropbox', { grant_type: 'refresh_token' });
    } catch (err) {
      if (err instanceof ReconnectRequiredError) return null;
      if (!(err instanceof BrokerUnavailableError)) throw err;
      const legacyRefreshToken = localStorage.getItem(legacyRefreshTokenKey(uid, 'dropbox'));
      if (!legacyRefreshToken) return null;
      const direct = await requestDropboxTokenDirectly({ grant_type: 'refresh_token', refresh_token: legacyRefreshToken });
      if (direct?.refresh_token) localStorage.setItem(legacyRefreshTokenKey(uid, 'dropbox'), direct.refresh_token);
      data = direct;
    }
    if (!data) return null;
    storeDropboxToken(uid, data.access_token, data.expires_in);
    return data.access_token;
  }, [storeDropboxToken]);

  const completeDropboxAuthorization = useCallback(async (uid: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!state?.startsWith('provider=dropbox:')) return;
    if (!code) {
      // Consent was declined or failed; only trust the error for our own request.
      if (params.get('error') && state === localStorage.getItem('pending_dropbox_oauth_state')) {
        console.warn('Dropbox authorization was not completed:', params.get('error'), params.get('error_description'));
        localStorage.removeItem('pending_dropbox_oauth_state');
        localStorage.removeItem('pending_dropbox_pkce_verifier');
        window.history.replaceState(null, '', window.location.pathname);
      }
      return;
    }

    const expectedState = localStorage.getItem('pending_dropbox_oauth_state');
    const verifier = localStorage.getItem('pending_dropbox_pkce_verifier');
    if (!expectedState || state !== expectedState || !verifier) {
      console.error('Dropbox OAuth state validation failed.');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }

    try {
      let data: { access_token: string; expires_in: number } | null;
      try {
        const tokens = await requestTokenBroker('dropbox', { grant_type: 'authorization_code', code, code_verifier: verifier });
        if (!tokens.has_refresh_token) throw new Error('Dropbox did not return renewable credentials.');
        data = tokens;
      } catch (err) {
        if (!(err instanceof BrokerUnavailableError)) throw err;
        const direct = await requestDropboxTokenDirectly({
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${window.location.origin}/dashboard`,
          code_verifier: verifier,
        });
        if (!direct?.refresh_token) throw new Error('Dropbox did not return renewable credentials.', { cause: err });
        localStorage.setItem(legacyRefreshTokenKey(uid, 'dropbox'), direct.refresh_token);
        data = direct;
      }
      storeDropboxToken(uid, data.access_token, data.expires_in);
    } catch (error) {
      console.error('Unable to complete Dropbox authorization:', error);
      setExpiredProviders((prev) => Array.from(new Set([...prev, 'dropbox'])));
    } finally {
      localStorage.removeItem('pending_dropbox_oauth_state');
      localStorage.removeItem('pending_dropbox_pkce_verifier');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [storeDropboxToken]);

  const inflightRefreshRef = useRef<Partial<Record<CloudProvider, Promise<string | null>>>>({});

  const getFreshAccessToken = useCallback(async (
    provider: CloudProvider,
    { rejectedToken }: { rejectedToken?: string } = {}
  ): Promise<string | null> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const token = readAccessToken(uid, provider);
    const expiresAt = readTokenExpiry(uid, provider);
    const hasKnownExpiry = Number.isFinite(expiresAt) && expiresAt > 0;
    const isRejected = rejectedToken !== undefined && token === rejectedToken;
    if (token && !isRejected && (!hasKnownExpiry || expiresAt - Date.now() > TOKEN_RENEWAL_MARGIN_MS)) {
      return token;
    }
    // OneDrive uses the implicit flow and cannot be renewed without the user.
    if (provider === 'onedrive') return isRejected ? null : token;

    // Parallel upload workers share a single renewal request.
    let refresh = inflightRefreshRef.current[provider];
    if (!refresh) {
      refresh = (provider === 'google' ? refreshGoogleToken() : refreshDropboxToken(uid)).finally(() => {
        delete inflightRefreshRef.current[provider];
      });
      inflightRefreshRef.current[provider] = refresh;
    }
    const renewed = await refresh;
    if (renewed) return renewed;
    // Renewal needs a user gesture; a token that has not expired yet still works.
    if (!isRejected && token && hasKnownExpiry && expiresAt > Date.now()) return token;
    return null;
  }, [refreshDropboxToken, refreshGoogleToken]);

  const checkCloudConnections = useCallback(async (): Promise<CloudProvider[]> => {
    const expired: CloudProvider[] = [];
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/event/')) {
      return expired;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) return expired;

    // Check Dropbox
    const dbxConnected = localStorage.getItem(`${uid}_dropbox_connected`) === 'true';
    let dbx = readAccessToken(uid, 'dropbox');
    if (dbxConnected || dbx) {
      const expiresAt = readTokenExpiry(uid, 'dropbox');
      const isExpiredByTime = expiresAt > 0 ? Date.now() > expiresAt - 60000 : false;

      let isValid: boolean | null = null;
      try {
        if (!dbx || isExpiredByTime) dbx = await refreshDropboxToken(uid);
        if (dbx) isValid = await checkTokenValidity('dropbox', dbx);
      } catch (error) {
        console.warn('Dropbox connection check deferred after a transient failure:', error);
      }

      if (isValid === false && dbxConnected) {
        setDropboxAccessToken(null);
        clearAccessToken(uid, 'dropbox');
        setExpiredProviders((prev) => Array.from(new Set([...prev, 'dropbox'])));
        expired.push('dropbox');
      } else if (isValid) {
        setExpiredProviders((prev) => prev.filter((p) => p !== 'dropbox'));
      }
    } else {
      setExpiredProviders((prev) => prev.filter((p) => p !== 'dropbox'));
    }

    // Check Google
    const gConnected = localStorage.getItem(`${uid}_google_connected`) === 'true';
    const gdrive = readAccessToken(uid, 'google');
    if (gConnected || gdrive) {
      const expiresAt = readTokenExpiry(uid, 'google');
      const isExpiredByTime = expiresAt > 0 ? Date.now() > expiresAt - 60000 : true;

      let isValid: boolean | null = null;
      try {
        if (gdrive && !isExpiredByTime) isValid = await checkTokenValidity('google', gdrive);
      } catch (error) {
        console.warn('Google connection check deferred after a transient failure:', error);
      }

      if (isValid === false || (!gdrive || isExpiredByTime)) {
        let refreshed: string | null = null;
        try {
          refreshed = await refreshGoogleToken();
        } catch (error) {
          console.warn('Google token renewal deferred after a transient failure:', error);
        }
        if (!refreshed) {
          // A silent prompt can be blocked by browser privacy settings. Keep the
          // persisted connection and only show an expired state after an explicit
          // provider rejection, so users are not unnecessarily reauthenticated.
          if (isValid === false) {
            setGoogleAccessToken(null);
            clearAccessToken(uid, 'google');
            setExpiredProviders((prev) => Array.from(new Set([...prev, 'google'])));
            expired.push('google');
          }
        }
      } else if (isValid) {
        setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
      }
    } else {
      setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
    }

    // Check OneDrive
    const odConnected = localStorage.getItem(`${uid}_onedrive_connected`) === 'true';
    const onedrive = readAccessToken(uid, 'onedrive');
    if (odConnected || onedrive) {
      const expiresAt = readTokenExpiry(uid, 'onedrive');
      const isExpiredByTime = expiresAt > 0 ? Date.now() > expiresAt - 60000 : false;

      let isValid: boolean | null = null;
      try {
        if (onedrive && !isExpiredByTime) isValid = await checkTokenValidity('onedrive', onedrive);
      } catch (error) {
        console.warn('OneDrive connection check deferred after a transient failure:', error);
      }

      if (isValid === false && odConnected) {
        setOneDriveAccessToken(null);
        clearAccessToken(uid, 'onedrive');
        setExpiredProviders((prev) => Array.from(new Set([...prev, 'onedrive'])));
        expired.push('onedrive');
      } else if (isValid) {
        setExpiredProviders((prev) => prev.filter((p) => p !== 'onedrive'));
      }
    } else {
      setExpiredProviders((prev) => prev.filter((p) => p !== 'onedrive'));
    }

    return expired;
  }, [refreshDropboxToken, refreshGoogleToken]);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const uid = firebaseUser.uid;
        clearLegacyStorageKeys();
        migrateAccessTokenStorage(uid);
        await completeDropboxAuthorization(uid);

        // Check and apply any pending token from getInitialToken
        (['google', 'onedrive'] as CloudProvider[]).forEach((p) => {
          // Tokens from older builds were parked in localStorage without state validation.
          localStorage.removeItem(`pending_${p}_access_token`);
          localStorage.removeItem(`pending_${p}_token_expires_at`);
          const pendingToken = sessionStorage.getItem(`pending_${p}_access_token`);
          if (pendingToken) {
            const pendingExpiresAt = Number(sessionStorage.getItem(`pending_${p}_token_expires_at`));
            writeAccessToken(uid, p, pendingToken, pendingExpiresAt > 0 ? pendingExpiresAt : null);
            sessionStorage.removeItem(`pending_${p}_access_token`);
            sessionStorage.removeItem(`pending_${p}_token_expires_at`);
          }
        });

        // Load user-scoped connection status & tokens
        const dbxConn = localStorage.getItem(`${uid}_dropbox_connected`) === 'true';
        const gConn = localStorage.getItem(`${uid}_google_connected`) === 'true';
        const odConn = localStorage.getItem(`${uid}_onedrive_connected`) === 'true';

        setIsDropboxConnected(dbxConn);
        setIsGoogleConnected(gConn);
        setIsOneDriveConnected(odConn);

        const dbxToken = readAccessToken(uid, 'dropbox');
        const gToken = readAccessToken(uid, 'google');
        const odToken = readAccessToken(uid, 'onedrive');

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
      } else {
        setUserProfile(null);
        setIsDropboxConnected(false);
        setIsGoogleConnected(false);
        setIsOneDriveConnected(false);
        setDropboxAccessToken(null);
        setGoogleAccessToken(null);
        setOneDriveAccessToken(null);
        setExpiredProviders([]);
        clearLegacyStorageKeys();
        if (unsubProfile) unsubProfile();
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, [checkCloudConnections, completeDropboxAuthorization]);

  useEffect(() => {
    if (googleRefreshTimerRef.current) window.clearTimeout(googleRefreshTimerRef.current);
    const uid = user?.uid;
    if (!uid || !googleAccessToken) return;
    const expiresAt = readTokenExpiry(uid, 'google');
    if (!Number.isFinite(expiresAt)) return;
    googleRefreshTimerRef.current = window.setTimeout(() => {
      getFreshAccessToken('google').catch((error) => console.warn('Google proactive refresh deferred:', error));
    }, Math.max(0, expiresAt - Date.now() - TOKEN_RENEWAL_MARGIN_MS));
    return () => {
      if (googleRefreshTimerRef.current) window.clearTimeout(googleRefreshTimerRef.current);
    };
  }, [googleAccessToken, getFreshAccessToken, user?.uid]);

  useEffect(() => {
    if (dropboxRefreshTimerRef.current) window.clearTimeout(dropboxRefreshTimerRef.current);
    const uid = user?.uid;
    if (!uid || !dropboxAccessToken) return;
    const expiresAt = readTokenExpiry(uid, 'dropbox');
    if (!Number.isFinite(expiresAt)) return;
    dropboxRefreshTimerRef.current = window.setTimeout(() => {
      getFreshAccessToken('dropbox').catch((error) => console.warn('Dropbox proactive refresh deferred:', error));
    }, Math.max(0, expiresAt - Date.now() - TOKEN_RENEWAL_MARGIN_MS));
    return () => {
      if (dropboxRefreshTimerRef.current) window.clearTimeout(dropboxRefreshTimerRef.current);
    };
  }, [dropboxAccessToken, getFreshAccessToken, user?.uid]);

  // The Firestore rules only honor the profile role; this flag just gates the UI.
  const isAdmin = userProfile?.role === 'admin';

  const isBlocked = Boolean(userProfile?.status === 'blocked');

  // Everyone may check their own verified address; only admins load the full list.
  const verifiedEmail = user?.emailVerified && user.email ? user.email.toLowerCase() : null;
  useEffect(() => {
    if (!verifiedEmail) {
      setIsOwnEmailAllowlisted(false);
      return;
    }
    return subscribeAllowlistEntry(verifiedEmail, setIsOwnEmailAllowlisted);
  }, [verifiedEmail]);

  useEffect(() => {
    if (!isAdmin) {
      setAllowlist([]);
      return;
    }
    return subscribeAllowlist(setAllowlist, (err) => console.warn('Allowlist listener error:', err));
  }, [isAdmin]);

  const isAllowlisted = Boolean(!systemSettings.allowlistMode || isAdmin || isOwnEmailAllowlisted);

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
    const beginAuthorization = () => createPkcePair().then(({ verifier, challenge }) => {
      const state = `provider=dropbox:${crypto.randomUUID()}`;
      localStorage.setItem('pending_dropbox_pkce_verifier', verifier);
      localStorage.setItem('pending_dropbox_oauth_state', state);
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        token_access_type: 'offline',
        code_challenge_method: 'S256',
        code_challenge: challenge,
        redirect_uri: `${window.location.origin}/dashboard`,
        state,
      });
      window.location.assign(`https://www.dropbox.com/oauth2/authorize?${params.toString()}`);
    }).catch((error) => {
      console.error('Unable to start Dropbox authorization:', error);
      alert('לא ניתן להתחיל את החיבור ל-Dropbox. נסה שוב.');
    });
    const uid = auth.currentUser?.uid;
    if (!uid) {
      void beginAuthorization();
      return;
    }
    // A visible reconnect action first tries the existing renewable session.
    // Most apparent expirations therefore finish without another OAuth prompt.
    void refreshDropboxToken(uid).then((token) => {
      if (!token) void beginAuthorization();
    }).catch(() => beginAuthorization());
  };

  /** Revoke the grant at the provider (best effort) and clear the broker cookie. */
  const revokeBrokerGrant = async (provider: BrokerProvider) => {
    if (!auth.currentUser) return;
    try {
      await requestTokenBroker(provider, { grant_type: 'revoke' });
    } catch (error) {
      if (!(error instanceof BrokerUnavailableError)) console.warn(`Could not revoke ${provider} access:`, error);
    }
  };

  const disconnectDropbox = async () => {
    const uid = user?.uid || auth.currentUser?.uid;
    setDropboxAccessToken(null);
    setIsDropboxConnected(false);
    await revokeBrokerGrant('dropbox');
    if (uid) {
      clearAccessToken(uid, 'dropbox');
      localStorage.removeItem(`${uid}_dropbox_connected`);
      localStorage.removeItem(legacyRefreshTokenKey(uid, 'dropbox'));
    }
    localStorage.removeItem('dropbox_access_token');
    localStorage.removeItem('dropbox_token_expires_at');
    localStorage.removeItem('dropbox_connected');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'dropbox'));
  };

  const connectGoogle = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('Google Client ID is missing in environment variables.');
      alert('שגיאה: מזהה לקוח Google Drive חסר בקובץ ההגדרות (.env)');
      return;
    }

    const oauth2 = typeof window !== 'undefined' ? window.google?.accounts?.oauth2 : undefined;

    // Preferred: authorization-code flow through the token broker, which
    // returns a refresh token so the connection survives the 1-hour expiry.
    if (GOOGLE_OFFLINE_ACCESS && oauth2?.initCodeClient) {
      try {
        const codeClient = oauth2.initCodeClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPE,
          ux_mode: 'popup',
          callback: (response) => {
            if (!response.code) {
              console.warn('Google authorization was not completed:', response.error);
              return;
            }
            requestTokenBroker('google', { grant_type: 'authorization_code', code: response.code })
              .then((data) => {
                if (!data.has_refresh_token) {
                  // Google only issues a refresh token on first consent (e.g. the
                  // grant was created on another device). Revoking the grant makes
                  // the next connect show consent again and return one.
                  oauth2.revoke?.(data.access_token);
                  alert('כדי לאפשר העלאות ארוכות ללא הפסקה, יש לאשר את הגישה ל-Google Drive פעם נוספת. לחץ שוב על "התחבר".');
                  return;
                }
                storeGoogleToken(data.access_token, data.expires_in);
              })
              .catch((error) => {
                console.error('Unable to complete Google authorization:', error);
                alert('לא ניתן להשלים את החיבור ל-Google Drive. נסה שוב.');
              });
          },
        });
        codeClient.requestCode();
        return;
      } catch (err) {
        console.warn('GIS code client failed, falling back to token client:', err);
      }
    }

    if (oauth2) {
      try {
        const tokenClient = oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPE,
          callback: (response) => {
            if (response.access_token) {
              storeGoogleToken(response.access_token, response.expires_in || 3600);
            }
          },
        });
        tokenClient.requestAccessToken();
        return;
      } catch (err) {
        console.warn('GIS Token client failed, falling back to redirect:', err);
      }
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${window.location.origin}/dashboard`,
      response_type: 'token',
      scope: GOOGLE_DRIVE_SCOPE,
      state: createOAuthState('google'),
    });
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  };

  const disconnectGoogle = async () => {
    const uid = user?.uid || auth.currentUser?.uid;
    setGoogleAccessToken(null);
    setIsGoogleConnected(false);
    // Revoking the grant also guarantees a fresh refresh token on reconnect.
    if (GOOGLE_OFFLINE_ACCESS) await revokeBrokerGrant('google');
    if (uid) {
      const accessToken = readAccessToken(uid, 'google');
      if (accessToken) window.google?.accounts?.oauth2?.revoke?.(accessToken);
      clearAccessToken(uid, 'google');
      localStorage.removeItem(legacyRefreshTokenKey(uid, 'google'));
      localStorage.removeItem(`${uid}_google_connected`);
    }
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expires_at');
    localStorage.removeItem('google_connected');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'google'));
  };

  const connectOneDrive = () => {
    const clientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID;
    if (!clientId) {
      console.error('OneDrive Client ID is missing in environment variables.');
      alert('שגיאה: מזהה לקוח OneDrive חסר בקובץ ההגדרות (.env)');
      return;
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'token',
      redirect_uri: `${window.location.origin}/dashboard`,
      scope: 'files.read',
      state: createOAuthState('onedrive'),
    });
    window.location.assign(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`);
  };

  const disconnectOneDrive = async () => {
    const uid = user?.uid || auth.currentUser?.uid;
    setOneDriveAccessToken(null);
    setIsOneDriveConnected(false);
    if (uid) {
      clearAccessToken(uid, 'onedrive');
      localStorage.removeItem(`${uid}_onedrive_connected`);
    }
    localStorage.removeItem('onedrive_access_token');
    localStorage.removeItem('onedrive_token_expires_at');
    localStorage.removeItem('onedrive_connected');
    setExpiredProviders((prev) => prev.filter((p) => p !== 'onedrive'));
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
        connectDropbox,
        disconnectDropbox,
        connectGoogle,
        disconnectGoogle,
        connectOneDrive,
        disconnectOneDrive,
        checkCloudConnections,
        getFreshAccessToken,
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
