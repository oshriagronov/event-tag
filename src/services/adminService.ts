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

export interface SystemSettings {
  maintenanceMode: boolean;
  allowlistMode: boolean;
  updatedAt?: unknown;
  updatedBy?: string;
}

export interface AllowlistEntry {
  email: string;
  addedAt?: unknown;
  addedBy?: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  maintenanceMode: false,
  allowlistMode: false,
};

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
 * Real-time listener for system config (maintenanceMode, allowlistMode)
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
  adminUid: string
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
export async function updateUserStatus(uid: string, status: 'active' | 'blocked'): Promise<void> {
  await updateDoc(doc(firestore, 'users', uid), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update user premium plan expiry date (ISO string YYYY-MM-DD or null)
 */
export async function updateUserPremium(
  uid: string,
  premiumUntil: string | null
): Promise<void> {
  await updateDoc(doc(firestore, 'users', uid), {
    premiumUntil,
    updatedAt: serverTimestamp(),
  });
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
export async function addToAllowlist(email: string, adminUid: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;
  const docRef = doc(firestore, 'allowlist', cleanEmail);
  await setDoc(docRef, {
    email: cleanEmail,
    addedAt: serverTimestamp(),
    addedBy: adminUid,
  });
}

/**
 * Remove email from allowlist (Admin only)
 */
export async function removeFromAllowlist(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;
  await deleteDoc(doc(firestore, 'allowlist', cleanEmail));
}

/**
 * Bulk update user status ('active' | 'blocked')
 */
export async function bulkUpdateUserStatus(uids: string[], status: 'active' | 'blocked'): Promise<void> {
  if (!uids.length) return;
  const batch = writeBatch(firestore);
  uids.forEach((uid) => {
    batch.update(doc(firestore, 'users', uid), {
      status,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

/**
 * Bulk update user premium plan expiry date
 */
export async function bulkUpdateUserPremium(
  uids: string[],
  premiumUntil: string | null
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
}

/**
 * Bulk add emails to allowlist
 */
export async function bulkAddToAllowlist(emails: string[], adminUid: string): Promise<void> {
  if (!emails.length) return;
  const batch = writeBatch(firestore);
  const cleanEmails = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  cleanEmails.forEach((email) => {
    batch.set(doc(firestore, 'allowlist', email), {
      email,
      addedAt: serverTimestamp(),
      addedBy: adminUid,
    });
  });
  await batch.commit();
}

