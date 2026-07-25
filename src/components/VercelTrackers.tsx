import { useConsent } from '../contexts/ConsentContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

export function VercelTrackers() {
  const { isAllowed } = useConsent();

  // Privacy Shield / Amendment 13 Compliance:
  // Analytics & Telemetry scripts (IP address & online identifiers collection)
  // are strictly gated by explicit user consent to the 'analytics' category.
  if (!isAllowed('analytics')) {
    return null;
  }

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
