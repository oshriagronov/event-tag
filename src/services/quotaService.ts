import type { UserProfile, SystemSettings } from './adminService';
import { DEFAULT_QUOTAS } from './adminService';
import type { UserUsage } from './firestore';
import { ServerApiError } from './serverApi';

export interface UserQuotaStatus {
  tier: 'admin' | 'premium' | 'standard';
  tierName: string;
  isAdmin: boolean;
  isPremium: boolean;
  maxPhotosPerMonth: number;
  photosUsedThisCycle: number;
  remainingPhotosThisCycle: number;
  isCycleActive: boolean;
  hasReachedPhotoLimit: boolean;
  percentUsed: number;
  resetDate: Date | null;
  formattedResetDate: string;
  cycleStatusText: string;
}

/**
 * Calculate the user's current tier and rolling 30-day photo quota status
 */
export function getUserQuotaStatus(
  userProfile: UserProfile | null,
  userUsage: UserUsage | null,
  systemSettings: SystemSettings,
  language: 'he' | 'en' = 'he'
): UserQuotaStatus {
  const isAdmin = userProfile?.role === 'admin';

  const isPremium = Boolean(
    userProfile?.premiumUntil && new Date(userProfile.premiumUntil).getTime() > Date.now()
  );

  const quotas = systemSettings?.quotas || DEFAULT_QUOTAS;
  const activeTierQuotas = isPremium ? quotas.premium : quotas.standard;
  const maxPhotosPerMonth = isAdmin ? Infinity : activeTierQuotas.maxPhotosPerMonth;

  // Usage cycle calculation
  const now = new Date();
  let resetDate: Date | null = null;
  let isCycleActive = false;
  let photosUsedThisCycle = 0;

  if (userUsage) {
    const rawReset = userUsage.cycleReset;
    if (rawReset) {
      resetDate = (rawReset as { toDate?: () => Date }).toDate
        ? (rawReset as { toDate: () => Date }).toDate()
        : new Date(rawReset as unknown as string);
    }

    if (resetDate && now.getTime() < resetDate.getTime()) {
      isCycleActive = true;
      photosUsedThisCycle = userUsage.photosThisCycle || 0;
    } else {
      // Cycle has expired: count is 0 until next upload starts a new cycle
      isCycleActive = false;
      photosUsedThisCycle = 0;
      resetDate = null;
    }
  }

  const remainingPhotosThisCycle = isAdmin
    ? Infinity
    : Math.max(0, maxPhotosPerMonth - photosUsedThisCycle);

  const hasReachedPhotoLimit = !isAdmin && remainingPhotosThisCycle <= 0;

  const percentUsed = isAdmin
    ? 0
    : Math.min(100, Math.round((photosUsedThisCycle / maxPhotosPerMonth) * 100));

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

  // Format reset date
  let formattedResetDate = '';
  let cycleStatusText: string;

  if (isAdmin) {
    cycleStatusText = language === 'he' ? 'תמונות ללא הגבלה' : 'Unlimited photos';
  } else if (isCycleActive && resetDate) {
    formattedResetDate = resetDate.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    cycleStatusText = language === 'he'
      ? `מתאפס ב-${formattedResetDate}`
      : `Resets on ${formattedResetDate}`;
  } else {
    cycleStatusText = language === 'he'
      ? 'המחזור יתחיל בהעלאה הראשונה (ל-30 יום)'
      : 'Cycle starts on first upload (for 30 days)';
  }

  return {
    tier,
    tierName,
    isAdmin,
    isPremium,
    maxPhotosPerMonth,
    photosUsedThisCycle,
    remainingPhotosThisCycle,
    isCycleActive,
    hasReachedPhotoLimit,
    percentUsed,
    resetDate,
    formattedResetDate,
    cycleStatusText,
  };
}

/**
 * Detect if an error is a Firebase Firestore quota exhaustion, rate limiting, or high demand error
 */
export function isFirebaseQuotaOrDemandError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof ServerApiError) return error.status === 429 || error.code === 'maintenance';

  const err = error as { name?: string; code?: string; message?: string; status?: number; details?: string };
  // Only Firebase errors qualify. Cloud-provider failures such as a Drive 503 or
  // 429 are transient and handled by the provider retry logic instead.
  if (err.name !== 'FirebaseError' && typeof err.code !== 'string') return false;
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
  if (error instanceof ServerApiError && error.code === 'photo_limit_reached') {
    return {
      title: language === 'he' ? 'חריגה ממכסת תמונות' : 'Photo Limit Reached',
      message:
        language === 'he'
          ? 'הגעת למכסת התמונות שלך ל-30 יום. התמונות שכבר נשמרו לא נפגעו; ניתן להוסיף תמונות נוספות כשהמכסה תתאפס.'
          : 'You have reached your 30-day photo limit. Photos already saved are kept; you can add more once your quota resets.',
      isHighDemand: false,
    };
  }

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
    (error instanceof ServerApiError && (error.status === 403 || error.status === 401)) ||
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
