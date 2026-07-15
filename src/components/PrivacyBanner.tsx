import { ShieldCheck } from 'lucide-react';
import { useTranslation } from '../services/translations';

export function PrivacyBanner() {
  const { t } = useTranslation();

  return (
    <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-4">
      <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
      <div className="text-start">
        <h4 className="font-semibold text-emerald-300 text-base m-0">{t('privacyBanner.title')}</h4>
        <p className="text-emerald-400/80 text-sm mt-1 leading-relaxed m-0">
          {t('privacyBanner.desc')}
        </p>
      </div>
    </div>
  );
}
