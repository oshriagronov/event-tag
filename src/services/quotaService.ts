import type { User } from 'firebase/auth';
import type { UserProfile, SystemSettings } from './adminService';
import { DEFAULT_QUOTAS } from './adminService';

export interface UserQuotaStatus {
  tier: 'admin' | 'premium' | 'standard';
  tierName: string;
  isAdmin: boolean;
  isPremium: boolean;
  maxPhotosPerEvent: number;
}

/**
 * Calculate the user's current tier and per-event photo quota limit
 */
export function getUserQuotaStatus(
  user: User | null,
  userProfile: UserProfile | null,
  systemSettings: SystemSettings,
  language: 'he' | 'en' = 'he'
): UserQuotaStatus {
  const isAdmin = Boolean(
    userProfile?.role === 'admin' ||
      user?.email === 'admin@eventtag.com' ||
      (import.meta.env.VITE_ADMIN_EMAIL && user?.email === import.meta.env.VITE_ADMIN_EMAIL)
  );

  const isPremium = Boolean(
    userProfile?.premiumUntil && new Date(userProfile.premiumUntil).getTime() > Date.now()
  );

  const quotas = systemSettings.quotas || DEFAULT_QUOTAS;
  const activeTierQuotas = isPremium ? quotas.premium : quotas.standard;
  const maxPhotosPerEvent = isAdmin ? Infinity : activeTierQuotas.maxPhotosPerEvent;

  const tier: 'admin' | 'premium' | 'standard' = isAdmin
    ? 'admin'
    : isPremium
    ? 'premium'
    : 'standard';

  const tierName =
    tier === 'admin'
      ? language === 'he' ? 'מנהל מערכת' : 'Admin'
      : tier === 'premium'
      ? language === 'he' ? 'פרימיום' : 'Premium'
      : language === 'he' ? 'רגיל' : 'Standard';

  return {
    tier,
    tierName,
    isAdmin,
    isPremium,
    maxPhotosPerEvent,
  };
}

/**
 * Detect if an error is a Firebase Firestore quota exhaustion, rate limiting, or high demand error
 */
export function isFirebaseQuotaOrDemandError(error: unknown): boolean {
  if (!error) return false;

  const err = error as { code?: string; message?: string; status?: number; details?: string };
  const code = (err.code || '').toLowerCase();
  const message = (err.message || '').toLowerCase();
  const details = (err.details || '').toLowerCase();

  const demandPatterns = [
    'resource-exhausted',
    'resource_exhausted',
    'quota-exceeded',
    'quota_exceeded',
    'unavailable',
    'deadline-exceeded',
    'too many requests',
    '429',
    'quota exceeded',
    'resource has been exhausted',
    'service unavailable',
    'over quota',
    'daily limit exceeded',
    'bandwidth exceeded',
    'rate limit exceeded',
  ];

  return demandPatterns.some(
    (pattern) =>
      code.includes(pattern) || message.includes(pattern) || details.includes(pattern)
  );
}

/**
 * Format any Firestore error into a user-friendly title and message, prioritizing High Demand messages
 */
export function getFirestoreErrorMessage(
  error: unknown,
  language: 'he' | 'en' = 'he'
): { title: string; message: string; isHighDemand: boolean } {
  if (isFirebaseQuotaOrDemandError(error)) {
    return {
      title: language === 'he' ? 'עומס זמני במערכת' : 'High System Demand',
      message:
        language === 'he'
          ? 'יש לנו עומס גבוה היום במערכת, אנא נסה שוב מחר.'
          : 'We are experiencing high demand today. Please come back tomorrow.',
      isHighDemand: true,
    };
  }

  const errStr = error instanceof Error ? error.message : String(error);
  const isPermission =
    errStr.includes('permission-denied') ||
    errStr.includes('PERMISSION_DENIED') ||
    errStr.includes('Missing or insufficient permissions');

  if (isPermission) {
    return {
      title: language === 'he' ? 'הרשאה נדחתה' : 'Permission Denied',
      message:
        language === 'he'
          ? 'אין הרשאה לביצוע הפעולה (אפשר שהמערכת בתחזוקה או שנחרגה מכסת התמונות).'
          : 'Permission denied (the system may be in maintenance or photo quota was exceeded).',
      isHighDemand: false,
    };
  }

  return {
    title: language === 'he' ? 'שגיאת מערכת' : 'System Error',
    message:
      language === 'he'
        ? `אירעה שגיאה בביצוע הפעולה:\n${errStr}`
        : `An error occurred while executing the operation:\n${errStr}`,
    isHighDemand: false,
  };
}
