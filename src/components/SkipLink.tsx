import { useTranslation } from '../services/translations';

export function SkipLink() {
  const { t } = useTranslation();

  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] focus:px-6 focus:py-3 focus:bg-copper-accent focus:text-white focus:font-bold focus:rounded-lg focus:shadow-2xl focus:ring-4 focus:ring-copper-accent/50 focus:outline-none transition-transform"
    >
      {t('a11y.skipToMain')}
    </a>
  );
}
