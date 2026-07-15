import { useNavigate, Link } from 'react-router-dom';
import { Lock, ExternalLink, Scale, CheckCircle2, Home } from 'lucide-react';
import { useTranslation } from '../services/translations';

interface LegalPageProps {
  defaultTab?: 'privacy' | 'terms';
}

export function LegalPage({ defaultTab = 'privacy' }: LegalPageProps) {
  const navigate = useNavigate();
  const { t, isRtl } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-bl from-amber-500/5 via-transparent to-orange-500/5 dark:from-amber-500/2 dark:to-orange-500/2 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      {/* Floating Home button */}
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 end-4 z-50 p-3 rounded-2xl bg-white/10 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/20 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-800/80 transition-all shadow-lg hover:scale-105 duration-300 cursor-pointer"
        title={t('legal.backToHome')}
      >
        <Home className="w-5 h-5" />
      </button>

      {/* Main Content Area */}
      <main className="relative z-10 flex-grow max-w-4xl w-full mx-auto px-6 py-12 flex flex-col gap-8">
        {/* Title panel */}
        <div 
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl text-start"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-extrabold m-0">
              {defaultTab === 'privacy' ? t('legal.privacyTitle') : t('legal.termsTitle')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm m-0">
              {t('legal.lastUpdated')}
            </p>
          </div>
        </div>

        {/* Legal Text Container */}
        <div 
          className="bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-8 md:p-10 backdrop-blur-xl shadow-xl shadow-slate-100/10 dark:shadow-none transition-all duration-300 leading-relaxed text-slate-700 dark:text-slate-300 text-start"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {defaultTab === 'privacy' ? (
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-4">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t('legal.privacyHeaderBadge')}</span>
                </div>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  {t('legal.privacyIntro')}
                </p>
              </div>

              <hr className="border-slate-200 dark:border-slate-800" />

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">1</span>
                  {t('legal.privacySection1Title')}
                </h3>
                <p className={isRtl ? 'mr-8' : 'ml-8'}>
                  {t('legal.privacySection1Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'mr-14' : 'ml-14'} space-y-1.5 text-sm`}>
                  {(t('legal.privacySection1Bullets') as string[]).map((bullet, idx) => (
                    <li key={idx} className={idx === 1 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">2</span>
                  {t('legal.privacySection2Title')}
                </h3>
                <p className={isRtl ? 'mr-8' : 'ml-8'}>
                  {t('legal.privacySection2Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'mr-14' : 'ml-14'} space-y-1.5 text-sm`}>
                  {(t('legal.privacySection2Bullets') as string[]).map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">3</span>
                  {t('legal.privacySection3Title')}
                </h3>
                <p className={isRtl ? 'mr-8' : 'ml-8'}>
                  {t('legal.privacySection3Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'mr-14' : 'ml-14'} space-y-1.5 text-sm`}>
                  {(t('legal.privacySection3Bullets') as string[]).map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">4</span>
                  {t('legal.privacySection4Title')}
                </h3>
                <p className={`${isRtl ? 'mr-8' : 'ml-8'} text-sm`}>
                  {t('legal.privacySection4Text')}
                </p>
              </section>

              <hr className="border-slate-200 dark:border-slate-800" />

              <section className="bg-emerald-500/5 rounded-2xl p-4 border border-emerald-500/10 text-xs flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-emerald-800 dark:text-emerald-400 mb-1">{t('legal.privacyDisclosureTitle')}</h5>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    EventTag&#39;s use and transfer to any other app of information received from Google APIs will adhere to{' '}
                    <a 
                      href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-amber-600 hover:underline inline-flex items-center gap-0.5"
                    >
                      {t('legal.privacyDisclosureLink')}
                      <ExternalLink className="w-3 h-3 inline animate-pulse" />
                    </a>
                    , including the Limited Use requirements.
                  </p>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold mb-4">
                  <Scale className="w-3.5 h-3.5" />
                  <span>{t('legal.termsHeaderBadge')}</span>
                </div>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  {t('legal.termsIntro')}
                </p>
              </div>

              <hr className="border-slate-200 dark:border-slate-800" />

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">1</span>
                  {t('legal.termsSection1Title')}
                </h3>
                <p className={`${isRtl ? 'mr-8' : 'ml-8'} text-sm`}>
                  {t('legal.termsSection1Text')}
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">2</span>
                  {t('legal.termsSection2Title')}
                </h3>
                <p className={`${isRtl ? 'mr-8' : 'ml-8'} text-sm leading-relaxed`}>
                  {t('legal.termsSection2Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'mr-14' : 'ml-14'} space-y-1.5 text-xs`}>
                  {(t('legal.termsSection2Bullets') as string[]).map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">3</span>
                  {t('legal.termsSection3Title')}
                </h3>
                <p className={`${isRtl ? 'mr-8' : 'ml-8'} text-sm leading-relaxed`}>
                  {t('legal.termsSection3Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'mr-14' : 'ml-14'} space-y-1.5 text-xs`}>
                  {(t('legal.termsSection3Bullets') as string[]).map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">4</span>
                  {t('legal.termsSection4Title')}
                </h3>
                <p className={`${isRtl ? 'mr-8' : 'ml-8'} text-sm`}>
                  {t('legal.termsSection4Text')}
                </p>
              </section>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-200/60 dark:border-slate-800/60 mt-auto relative z-10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400 dark:text-slate-500">
          <p>© {new Date().getFullYear()} EventTag — {t('legal.allRightsReserved')}</p>
          <div className="flex gap-4">
            <Link
              to="/privacy"
              className={`hover:text-amber-500 transition-colors cursor-pointer ${defaultTab === 'privacy' ? 'text-amber-500 font-bold' : ''}`}
            >
              {t('legal.privacyTitle')}
            </Link>
            <span>•</span>
            <Link
              to="/terms"
              className={`hover:text-amber-500 transition-colors cursor-pointer ${defaultTab === 'terms' ? 'text-amber-500 font-bold' : ''}`}
            >
              {t('legal.termsTitle')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
