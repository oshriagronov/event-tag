import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  addDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '../firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  premiumUntil: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuotaTier {
  maxPhotosPerMonth: number;
}

export interface QuotaConfig {
  standard: QuotaTier;
  premium: QuotaTier;
}

export interface SystemSettings {
  maintenanceMode: boolean;
  allowlistMode: boolean;
  quotas?: QuotaConfig;
  updatedAt?: unknown;
  updatedBy?: string;
}

export interface PhotosOverTimePoint {
  date: string;
  count: number;
}

export interface EventTimelinePoint {
  timestamp: number;
  photoCount: number;
}

export interface SystemHealthMetrics {
  totalPhotos: number;
  totalFaces: number;
  totalEmbeddings: number;
  googleDriveCount: number;
  dropboxCount: number;
  googleDrivePercent: number;
  dropboxPercent: number;
  activeEvents: number;
  scanningEvents: number;
  completedEvents: number;
  photosOverTime: PhotosOverTimePoint[];
  eventTimelines: EventTimelinePoint[];
}

export interface AuditLogEntry {
  id?: string;
  action: string;
  performedBy: string;
  userEmail?: string;
  target?: string;
  details?: Record<string, unknown> | string;
  severity: 'info' | 'warning' | 'security';
  timestamp?: unknown;
}

export interface AllowlistEntry {
  email: string;
  addedAt?: unknown;
  addedBy?: string;
}

export const DEFAULT_QUOTAS: QuotaConfig = {
  standard: {
    maxPhotosPerMonth: 500,
  },
  premium: {
    maxPhotosPerMonth: 10000,
  },
};

const DEFAULT_SETTINGS: SystemSettings = {
  maintenanceMode: false,
  allowlistMode: false,
  quotas: DEFAULT_QUOTAS,
};

/**
 * Log an audit event in the immutable audit_logs collection
 */
export async function logAuditEvent(
  action: string,
  performedBy: string,
  target?: string,
  details?: Record<string, unknown> | string,
  severity: 'info' | 'warning' | 'security' = 'info',
  userEmail?: string
): Promise<void> {
  try {
    await addDoc(collection(firestore, 'audit_logs'), {
      action,
      performedBy,
      userEmail: userEmail || 'admin@eventtag.com',
      target: target || '',
      details: details || {},
      severity,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

/**
 * Subscribe to audit logs (Admin only)
 */
export function subscribeAuditLogs(
  onUpdate: (logs: AuditLogEntry[]) => void,
  limitCount = 100,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(firestore, 'audit_logs'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snap) => {
      const logs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as AuditLogEntry[];
      onUpdate(logs);
    },
    onError
  );
}

/**
 * Ensure user profile exists in Firestore and sync changes
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(firestore, 'users', user.uid);
  const snap = await getDoc(userRef);

  const isInitialAdmin =
    user.email === 'admin@eventtag.com' ||
    (import.meta.env.VITE_ADMIN_EMAIL && user.email === import.meta.env.VITE_ADMIN_EMAIL);

  if (!snap.exists()) {
    const newProfile: UserProfile = {
      uid: user.uid,
      email: (user.email || '').toLowerCase(),
      displayName: user.displayName || user.email || 'משתמש',
      photoURL: user.photoURL || '',
      role: isInitialAdmin ? 'admin' : 'user',
      status: 'active',
      premiumUntil: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, newProfile);
    return newProfile;
  }

  const existingData = snap.data() as UserProfile;
  const updates: Partial<UserProfile> = {
    email: (user.email || '').toLowerCase(),
    displayName: user.displayName || existingData.displayName,
    photoURL: user.photoURL || existingData.photoURL,
    updatedAt: serverTimestamp(),
  };

  // If initial admin ENV matches and user is not admin yet, auto elevate
  if (isInitialAdmin && existingData.role !== 'admin') {
    updates.role = 'admin';
  }

  await updateDoc(userRef, updates);
  return { ...existingData, ...updates } as UserProfile;
}

/**
 * Get user profile by UID
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(firestore, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

/**
 * Real-time listener for user profile
 */
export function subscribeUserProfile(
  uid: string,
  onUpdate: (profile: UserProfile | null) => void,
  onError?: (err: Error) => void
) {
  return onSnapshot(
    doc(firestore, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
      } else {
        onUpdate(snap.data() as UserProfile);
      }
    },
    onError
  );
}

/**
 * Real-time listener for system config (maintenanceMode, allowlistMode, quotas)
 */
export function subscribeSystemSettings(
  onUpdate: (settings: SystemSettings) => void,
  onError?: (err: Error) => void
) {
  return onSnapshot(
    doc(firestore, 'system', 'config'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_SETTINGS);
      } else {
        const data = snap.data() as Partial<SystemSettings>;
        onUpdate({
          maintenanceMode: Boolean(data.maintenanceMode),
          allowlistMode: Boolean(data.allowlistMode),
          quotas: data.quotas || DEFAULT_QUOTAS,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
        });
      }
    },
    onError
  );
}

/**
 * Update system settings (Admin only)
 */
export async function updateSystemSettings(
  updates: Partial<SystemSettings>,
  adminUid: string,
  adminEmail?: string
): Promise<void> {
  const configRef = doc(firestore, 'system', 'config');
  const snap = await getDoc(configRef);
  if (!snap.exists()) {
    await setDoc(configRef, {
      ...DEFAULT_SETTINGS,
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  } else {
    await updateDoc(configRef, {
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  }

  if (updates.maintenanceMode !== undefined) {
    await logAuditEvent(
      updates.maintenanceMode ? 'maintenance_on' : 'maintenance_off',
      adminUid,
      'system/config',
      `מצב תחזוקה ${updates.maintenanceMode ? 'הופעל' : 'כובה'}`,
      updates.maintenanceMode ? 'warning' : 'info',
      adminEmail
    );
  }

  if (updates.allowlistMode !== undefined) {
    await logAuditEvent(
      updates.allowlistMode ? 'allowlist_mode_on' : 'allowlist_mode_off',
      adminUid,
      'system/config',
      `מצב גישה מוגבלת ${updates.allowlistMode ? 'הופעל' : 'כובה'}`,
      'info',
      adminEmail
    );
  }
}

/**
 * Update quota limits configuration (Admin only)
 */
export async function updateQuotaConfig(
  quotas: QuotaConfig,
  adminUid: string,
  adminEmail?: string
): Promise<void> {
  await updateSystemSettings({ quotas }, adminUid, adminEmail);
  await logAuditEvent(
    'quota_updated',
    adminUid,
    'system/config/quotas',
    `עודכנו מכסות תוכניות: רגיל (${quotas.standard.maxPhotosPerMonth} תמונות/30 יום), פרימיום (${quotas.premium.maxPhotosPerMonth} תמונות/30 יום)`,
    'info',
    adminEmail
  );
}

/**
 * Subscribe to real-time aggregated system health metrics
 */
export function subscribeSystemHealthMetrics(
  onUpdate: (metrics: SystemHealthMetrics) => void,
  onError?: (err: Error) => void
) {
  return onSnapshot(
    collection(firestore, 'events'),
    (snap) => {
      let totalPhotos = 0;
      let totalFaces = 0;
      let googleDriveCount = 0;
      let dropboxCount = 0;
      let activeEvents = 0;
      let scanningEvents = 0;
      let completedEvents = 0;

      const eventsWithDates: { timestamp: number; photoCount: number }[] = [];

      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const photoCount = Number(data.photoCount || 0);
        const faceCount = Number(data.faceCount || 0);

        let timestamp = Date.now();
        if (data.createdAt && typeof data.createdAt === 'object' && 'seconds' in data.createdAt) {
          timestamp = data.createdAt.seconds * 1000;
        }
        eventsWithDates.push({ timestamp, photoCount });

        totalPhotos += photoCount;
        totalFaces += faceCount;

        const provider = (data.provider || data.storageProvider || '').toLowerCase();
        if (provider.includes('dropbox')) {
          dropboxCount++;
        } else {
          googleDriveCount++;
        }

        const isScanning = Boolean(data.isScanning || data.scanning);
        const isCompleted = photoCount > 0 && !isScanning;

        if (isScanning) {
          scanningEvents++;
        } else if (isCompleted) {
          completedEvents++;
        } else {
          activeEvents++;
        }
      });

      // Build 7-day cumulative photo indexing timeline
      const now = new Date();
      const photosOverTime: PhotosOverTimePoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
        const dayEndTimestamp = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();

        const cumulativeCount = eventsWithDates
          .filter((e) => e.timestamp <= dayEndTimestamp)
          .reduce((sum, e) => sum + e.photoCount, 0);

        photosOverTime.push({ date: dateStr, count: cumulativeCount });
      }

      const totalConnected = googleDriveCount + dropboxCount;
      const googleDrivePercent = totalConnected > 0 ? Math.round((googleDriveCount / totalConnected) * 100) : 50;
      const dropboxPercent = totalConnected > 0 ? 100 - googleDrivePercent : 50;

      // Embeddings count equals totalFaces stored
      const totalEmbeddings = totalFaces;

      onUpdate({
        totalPhotos,
        totalFaces,
        totalEmbeddings,
        googleDriveCount,
        dropboxCount,
        googleDrivePercent,
        dropboxPercent,
        activeEvents,
        scanningEvents,
        completedEvents,
        photosOverTime,
        eventTimelines: eventsWithDates,
      });
    },
    onError
  );
}

/**
 * Get all users list (Admin only)
 */
export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(firestore, 'users'));
  return snap.docs.map((d) => d.data() as UserProfile);
}

/**
 * Real-time listener for all users (Admin only)
 */
export function subscribeAllUsers(
  onUpdate: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
) {
  return onSnapshot(
    collection(firestore, 'users'),
    (snap) => {
      const users = snap.docs.map((d) => d.data() as UserProfile);
      onUpdate(users);
    },
    onError
  );
}

/**
 * Update user status: 'active' | 'blocked'
 */
export async function updateUserStatus(
  uid: string,
  status: 'active' | 'blocked',
  adminUid?: string,
  adminEmail?: string
): Promise<void> {
  await updateDoc(doc(firestore, 'users', uid), {
    status,
    updatedAt: serverTimestamp(),
  });

  if (adminUid) {
    await logAuditEvent(
      status === 'blocked' ? 'user_blocked' : 'user_unblocked',
      adminUid,
      uid,
      `משתמש ${uid} שונה למצב ${status}`,
      status === 'blocked' ? 'warning' : 'info',
      adminEmail
    );
  }
}

/**
 * Update user premium plan expiry date (ISO string YYYY-MM-DD or null)
 */
export async function updateUserPremium(
  uid: string,
  premiumUntil: string | null,
  adminUid?: string,
  adminEmail?: string
): Promise<void> {
  await updateDoc(doc(firestore, 'users', uid), {
    premiumUntil,
    updatedAt: serverTimestamp(),
  });

  if (adminUid) {
    await logAuditEvent(
      'premium_granted',
      adminUid,
      uid,
      premiumUntil ? `הוענקה תוכנית פרימיום עד ${premiumUntil}` : 'בוטלה תוכנית פרימיום',
      'info',
      adminEmail
    );
  }
}

/**
 * Real-time listener for allowlist emails (Admin only)
 */
export function subscribeAllowlist(
  onUpdate: (entries: AllowlistEntry[]) => void,
  onError?: (err: Error) => void
) {
  return onSnapshot(
    collection(firestore, 'allowlist'),
    (snap) => {
      const entries = snap.docs.map((d) => d.data() as AllowlistEntry);
      onUpdate(entries);
    },
    onError
  );
}

/**
 * Add email to allowlist (Admin only)
 */
export async function addToAllowlist(email: string, adminUid: string, adminEmail?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;
  const docRef = doc(firestore, 'allowlist', cleanEmail);
  await setDoc(docRef, {
    email: cleanEmail,
    addedAt: serverTimestamp(),
    addedBy: adminUid,
  });

  await logAuditEvent(
    'allowlist_added',
    adminUid,
    cleanEmail,
    `נוסף אימייל לרשימת מורשים: ${cleanEmail}`,
    'info',
    adminEmail
  );
}

/**
 * Remove email from allowlist (Admin only)
 */
export async function removeFromAllowlist(email: string, adminUid?: string, adminEmail?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;
  await deleteDoc(doc(firestore, 'allowlist', cleanEmail));

  if (adminUid) {
    await logAuditEvent(
      'allowlist_removed',
      adminUid,
      cleanEmail,
      `הוסר אימייל מרשימת מורשים: ${cleanEmail}`,
      'info',
      adminEmail
    );
  }
}

/**
 * Bulk update user status ('active' | 'blocked')
 */
export async function bulkUpdateUserStatus(
  uids: string[],
  status: 'active' | 'blocked',
  adminUid?: string,
  adminEmail?: string
): Promise<void> {
  if (!uids.length) return;
  const batch = writeBatch(firestore);
  uids.forEach((uid) => {
    batch.update(doc(firestore, 'users', uid), {
      status,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();

  if (adminUid) {
    await logAuditEvent(
      status === 'blocked' ? 'user_blocked' : 'user_unblocked',
      adminUid,
      `bulk:${uids.length}`,
      `עדכון גורף: ${uids.length} משתמשים שונו למצב ${status}`,
      status === 'blocked' ? 'warning' : 'info',
      adminEmail
    );
  }
}

/**
 * Bulk update user premium plan expiry date
 */
export async function bulkUpdateUserPremium(
  uids: string[],
  premiumUntil: string | null,
  adminUid?: string,
  adminEmail?: string
): Promise<void> {
  if (!uids.length) return;
  const batch = writeBatch(firestore);
  uids.forEach((uid) => {
    batch.update(doc(firestore, 'users', uid), {
      premiumUntil,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();

  if (adminUid) {
    await logAuditEvent(
      'premium_granted',
      adminUid,
      `bulk:${uids.length}`,
      `עדכון פרימיום גורף ל-${uids.length} משתמשים עד ${premiumUntil || 'ללא הגבלה'}`,
      'info',
      adminEmail
    );
  }
}

/**
 * Bulk add emails to allowlist
 */
export async function bulkAddToAllowlist(emails: string[], adminUid: string, adminEmail?: string): Promise<void> {
  if (!emails.length) return;
  const cleanEmails = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!cleanEmails.length) return;

  // Write in batches of 500
  const BATCH_SIZE = 450;
  for (let i = 0; i < cleanEmails.length; i += BATCH_SIZE) {
    const chunk = cleanEmails.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestore);
    chunk.forEach((email) => {
      batch.set(doc(firestore, 'allowlist', email), {
        email,
        addedAt: serverTimestamp(),
        addedBy: adminUid,
      });
    });
    await batch.commit();
  }

  await logAuditEvent(
    'allowlist_bulk_imported',
    adminUid,
    `bulk:${cleanEmails.length}`,
    `יבוא גורף של ${cleanEmails.length} כתובות אימייל לרשימת מורשים`,
    'info',
    adminEmail
  );
}

/**
 * Export current allowlist entries to CSV file
 */
export function exportAllowlistCsv(entries: AllowlistEntry[]): void {
  if (!entries.length) return;
  const headers = 'email,addedBy\n';
  const rows = entries
    .map((e) => `"${e.email.replace(/"/g, '""')}","${(e.addedBy || '').replace(/"/g, '""')}"`)
    .join('\n');
  const csvContent = headers + rows;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `allowlist_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


