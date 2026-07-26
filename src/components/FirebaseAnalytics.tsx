import { useEffect, useRef } from 'react';
import { getAnalytics, isSupported, setAnalyticsCollectionEnabled, type Analytics } from 'firebase/analytics';

import app from '../firebase';
import { useConsent } from '../contexts/ConsentContext';

export function FirebaseAnalytics() {
  const { isAllowed } = useConsent();
  const analyticsRef = useRef<Analytics | null>(null);
  const analyticsAllowed = isAllowed('analytics');

  useEffect(() => {
    let active = true;

    // Israeli Privacy Shield / Amendment 13 Compliance:
    // Firebase Analytics collection (telemetry & IP identifiers) is strictly gated
    // by user explicit opt-in consent to the 'analytics' category.
    if (!analyticsAllowed) {
      if (analyticsRef.current) {
        setAnalyticsCollectionEnabled(analyticsRef.current, false);
      }
      return;
    }

    isSupported().then((supported) => {
      if (supported && active) {
        if (!analyticsRef.current) {
          analyticsRef.current = getAnalytics(app);
        }
        setAnalyticsCollectionEnabled(analyticsRef.current, true);
      }
    });

    return () => {
      active = false;
    };
  }, [analyticsAllowed]);

  return null;
}
