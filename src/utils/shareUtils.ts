export interface ShareOptions {
  eventId: string;
  eventName: string;
  language: 'he' | 'en';
  onFallback?: () => void;
}

export const getShareUrl = (eventId: string): string => {
  return `${window.location.origin}/event/${eventId}`;
};

export const getShareText = (eventName: string, language: 'he' | 'en'): string => {
  if (language === 'he') {
    return `מצאת את התמונות שלך מ-${eventName}? לחץ על הקישור והעלה סלפי לצפייה בתמונות האישיות שלך:`;
  }
  return `Find your photos from ${eventName}! Click the link and upload a selfie to view your personal photos:`;
};

/**
 * Triggers native OS Web Share API if available.
 * If unsupported or throws a non-Abort error, calls `onFallback` to trigger custom share UI.
 */
export const handleShareEvent = async ({
  eventId,
  eventName,
  language,
  onFallback,
}: ShareOptions): Promise<boolean> => {
  const shareUrl = getShareUrl(eventId);
  const text = getShareText(eventName, language);
  const title = `EventTag - ${eventName}`;

  // Check if Web Share API is supported in current browser/device environment
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url: shareUrl,
      });
      return true; // Successfully shared via native OS share
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error?.name === 'AbortError') {
        // User cancelled native share sheet, return clean state without error or fallback
        return true;
      }
      console.warn('Native Web Share API failed or unsupported, falling back to custom share modal:', err);
    }
  }

  // OS share unavailable or failed -> fallback to custom modal
  if (onFallback) {
    onFallback();
  }
  return false;
};
