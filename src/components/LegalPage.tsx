import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../services/translations';
import { Footer } from './Footer';
import { GoogleSignInButton } from './GoogleIcon';
import { Lock, ExternalLink, CheckCircle2, ShieldCheck, Mail, Phone, Clock, FileCheck } from 'lucide-react';

interface LegalPageProps {
  defaultTab?: 'privacy' | 'terms' | 'accessibility';
}

export function LegalPage({ defaultTab = 'privacy' }: LegalPageProps) {
  const { user, signIn } = useAuth();
  const { t, isRtl, language } = useTranslation();

  const getBullets = (key: string): string[] => {
    const res = t(key);
    return Array.isArray(res) ? (res as string[]) : [];
  };

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col antialiased relative selection:bg-copper-accent/30 selection:text-white" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Background patterns */}
      <div className="absolute inset-0 pattern-dots opacity-[0.03] pointer-events-none z-0" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-container/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none z-0" />

      {/* TopNavBar Shared Component */}
      <header className="fixed top-0 w-full z-50 bg-background/80 border-b border-surface-border/40 backdrop-blur-md">
        <div className="flex justify-between items-center px-6 md:px-12 h-20 max-w-7xl mx-auto w-full">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 no-underline">
            <span className="font-display-lg text-3xl md:text-4xl font-bold text-on-background tracking-tight">EventTag</span>
          </Link>
          
          {/* Navigation Links */}
          <nav className="hidden md:flex gap-8 items-center list-none" aria-label={language === 'he' ? 'ניווט ראשי' : 'Main Navigation'}>
            <a href="/#how-it-works" className="font-label-sm text-xs uppercase tracking-wider text-sage-muted hover:text-copper-accent transition-colors duration-300 no-underline">
              {t('landing.howItWorksBtn')}
            </a>
            <a href="/#faq" className="font-label-sm text-xs uppercase tracking-wider text-sage-muted hover:text-copper-accent transition-colors duration-300 no-underline">
              {t('landing.faqNavBtn')}
            </a>
            <Link to="/privacy" className="font-label-sm text-xs uppercase tracking-wider text-sage-muted hover:text-copper-accent transition-colors duration-300 no-underline">
              {language === 'he' ? 'פרטיות' : 'Privacy'}
            </Link>
            {user && (
              <Link to="/dashboard" className="font-label-sm text-xs uppercase tracking-wider text-sage-muted hover:text-copper-accent transition-colors duration-300 no-underline">
                {t('dashboard.myDashboard')}
              </Link>
            )}
          </nav>
          
          {/* Trailing Action */}
          <div className="flex items-center gap-4">
            {user ? (
              <Link to="/dashboard" className="bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider px-6 py-2.5 rounded hover:bg-primary transition-all shadow-sm no-underline cursor-pointer">
                {t('dashboard.myDashboard')}
              </Link>
            ) : (
              <GoogleSignInButton
                onClick={signIn}
                shape="Square"
                height={38}
              />
            )}
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      {defaultTab === 'accessibility' ? (
        <main id="main-content" className="flex-grow pt-32 pb-24 px-6 md:px-10 max-w-3xl mx-auto w-full z-10 text-start" tabIndex={-1}>
          {/* Accessibility Compliance Guarantee Banner */}
          <div className="mb-12 p-6 rounded-xl border border-surface-border bg-surface-container/40 backdrop-blur-sm flex items-start gap-4 shadow-sm">
            <ShieldCheck className="w-6 h-6 text-copper-accent shrink-0 mt-1" />
            <div className="flex flex-col gap-1">
              <h3 className="font-title-md text-base font-bold text-deep-forest m-0">
                {t('legal.accessibilityBadge')}
              </h3>
              <p className="font-body-md text-xs md:text-sm text-sage-muted leading-relaxed m-0 mt-1">
                {t('legal.accessibilityIntro')}
              </p>
            </div>
          </div>

          {/* Document Header */}
          <div className="max-w-3xl mx-auto mb-16 text-center">
            <h1 className="font-display-lg text-4xl md:text-5xl text-deep-forest mb-4 m-0 leading-tight">
              {t('legal.accessibilityTitle')}
            </h1>
            <p className="font-body-md text-sage-muted m-0 text-sm md:text-base">
              {t('legal.accessibilityUpdateDate')}
            </p>
          </div>

          {/* Document Content */}
          <article className="max-w-3xl mx-auto text-sage-muted space-y-12">
            <section className="space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                1. {t('legal.accessibilitySection1Title')}
              </h2>
              <ul className={`list-disc ${isRtl ? 'pr-6' : 'pl-6'} space-y-3 text-xs md:text-sm font-body-md leading-relaxed`}>
                {getBullets('legal.accessibilitySection1Bullets').map((bullet, idx) => (
                  <li key={idx}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                2. {t('legal.accessibilitySection2Title')}
              </h2>
              <p className="font-body-md text-sage-muted leading-relaxed m-0 text-xs md:text-sm">
                {t('legal.accessibilitySection2Text')}
              </p>
            </section>

            {/* Accessibility Coordinator Box */}
            <section className="border-t border-surface-border pt-8">
              <div className="bg-surface-container/40 border border-surface-border rounded-xl p-6 md:p-8 space-y-4 shadow-sm">
                <h3 className="font-headline-lg text-lg md:text-xl text-deep-forest font-bold m-0 flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-copper-accent" />
                  {t('legal.accessibilityCoordinatorTitle')}
                </h3>
                <p className="font-body-md text-xs md:text-sm text-sage-muted m-0 leading-relaxed">
                  {t('legal.accessibilityCoordinatorDesc')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs md:text-sm">
                  <div className="flex items-center gap-2.5 text-on-background font-bold">
                    <Mail className="w-4 h-4 text-copper-accent shrink-0" />
                    <a href="mailto:accessibility@eventtag.ai" className="hover:underline text-copper-accent">
                      {t('legal.accessibilityCoordinatorEmail')}
                    </a>
                  </div>
                  <div className="flex items-center gap-2.5 text-on-background font-bold">
                    <Phone className="w-4 h-4 text-copper-accent shrink-0" />
                    <span>{t('legal.accessibilityCoordinatorPhone')}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sage-muted col-span-1 sm:col-span-2">
                    <Clock className="w-4 h-4 text-copper-accent shrink-0" />
                    <span>{t('legal.accessibilityCoordinatorHours')}</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-surface-border/40 text-xs text-sage-muted">
                  <p className="m-0">{t('legal.accessibilityAuditDate')}</p>
                </div>
              </div>
            </section>
          </article>
        </main>
      ) : defaultTab === 'privacy' ? (
        <main id="main-content" className="flex-grow pt-32 pb-24 px-6 md:px-10 max-w-3xl mx-auto w-full z-10 text-start" tabIndex={-1}>
          {/* Guarantee Banner */}
          <div className="mb-12 p-6 rounded-xl border border-surface-border bg-surface-container/40 backdrop-blur-sm flex items-start gap-4 shadow-sm">
            <Lock className="w-5 h-5 text-copper-accent shrink-0 mt-1" />
            <div className="flex flex-col gap-1">
              <h3 className="font-title-md text-base font-bold text-deep-forest m-0">
                {language === 'he' ? 'הבטחת עיבוד על גבי המכשיר' : 'On-Device Processing Guarantee'}
              </h3>
              <p className="font-body-md text-xs md:text-sm text-sage-muted leading-relaxed m-0 mt-1">
                {language === 'he'
                  ? 'EventTag בנויה על יסודות של פרטיות. כל סריקה ביומטרית וזיהוי פנים מתרחשים מקומית בדפדפן שלך. אנו לעולם איננו מעלים את התמונות הלא-מוצפנות שלך לשרתים שלנו לצורך ניתוח.'
                  : 'EventTag is built on a foundation of privacy. All biometric scanning and facial recognition happens locally within your browser. We never upload your unencrypted photos to our servers for analysis.'}
              </p>
            </div>
          </div>

          {/* Document Header */}
          <div className="max-w-3xl mx-auto mb-16 text-center">
            <h1 className="font-display-lg text-4xl md:text-5xl text-deep-forest mb-4 m-0 leading-tight">
              {t('legal.privacyTitle')}
            </h1>
            <p className="font-body-md text-sage-muted m-0 text-sm md:text-base">
              {t('legal.lastUpdated')}
            </p>
          </div>

          {/* Document Content */}
          <article className="max-w-3xl mx-auto text-sage-muted space-y-12">
            <section className="space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                1. {t('legal.privacySection1Title')}
              </h2>
              <div className="space-y-4">
                <p className="font-body-md text-sage-muted leading-relaxed m-0">
                  {t('legal.privacySection1Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'pr-6' : 'pl-6'} space-y-2 text-xs md:text-sm font-body-md`}>
                  {getBullets('legal.privacySection1Bullets').map((bullet, idx) => (
                    <li key={idx} className={idx === 1 ? 'font-semibold text-deep-forest' : ''}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                2. {t('legal.privacySection2Title')}
              </h2>
              <div className="space-y-4">
                <p className="font-body-md text-sage-muted leading-relaxed m-0">
                  {t('legal.privacySection2Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'pr-6' : 'pl-6'} space-y-2 text-xs md:text-sm font-body-md`}>
                  {getBullets('legal.privacySection2Bullets').map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                3. {t('legal.privacySection3Title')}
              </h2>
              <div className="space-y-4">
                <p className="font-body-md text-sage-muted leading-relaxed m-0">
                  {t('legal.privacySection3Text')}
                </p>
                <ul className={`list-disc ${isRtl ? 'pr-6' : 'pl-6'} space-y-2 text-xs md:text-sm font-body-md`}>
                  {getBullets('legal.privacySection3Bullets').map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                4. {t('legal.privacySection4Title')}
              </h2>
              <div className="space-y-4">
                <p className="font-body-md text-sage-muted leading-relaxed m-0">
                  {t('legal.privacySection4Text')}
                </p>
              </div>
            </section>

            {/* Google Disclosure Box */}
            <section className="border-t border-surface-border pt-8">
              <div className="bg-surface-container/30 border border-surface-border rounded-xl p-6 flex gap-4 items-start shadow-sm">
                <CheckCircle2 className="w-5 h-5 text-copper-accent shrink-0 mt-0.5" />
                <div className="font-body-md">
                  <h5 className="font-bold text-deep-forest mb-2 text-sm md:text-base">{t('legal.privacyDisclosureTitle')}</h5>
                  <p className="text-sage-muted leading-relaxed m-0 text-xs md:text-sm">
                    EventTag&#39;s use and transfer to any other app of information received from Google APIs will adhere to{' '}
                    <a 
                      href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-copper-accent hover:underline inline-flex items-center gap-0.5 font-bold"
                    >
                      {t('legal.privacyDisclosureLink')}
                      <ExternalLink className="w-3.5 h-3.5 inline shrink-0" />
                    </a>
                    , including the Limited Use requirements.
                  </p>
                </div>
              </div>
            </section>

            {/* Support Block */}
            <section className="border-t border-surface-border pt-8">
              <div className="p-6 rounded-xl bg-surface-container/30 border border-surface-border inline-block text-start">
                <p className="font-label-sm text-xs text-sage-muted mb-2 uppercase tracking-wider">
                  {language === 'he' ? 'דוא"ל לתמיכה' : 'Email Support'}
                </p>
                <a className="font-display-lg text-lg text-copper-accent hover:underline transition-colors no-underline font-bold" href="mailto:privacy@eventtag.ai">
                  privacy@eventtag.ai
                </a>
              </div>
            </section>
          </article>
        </main>
      ) : (
        <main id="main-content" className="flex-grow pt-32 pb-24 px-6 md:px-10 max-w-3xl mx-auto w-full z-10 text-start" tabIndex={-1}>
          {/* Header Section */}
          <div className="max-w-3xl mx-auto mb-16 text-center">
            <h1 className="font-display-lg text-4xl md:text-5xl text-deep-forest mb-4 m-0 leading-tight">
              {t('legal.termsTitle')}
            </h1>
            <p className="font-body-md text-sage-muted m-0 text-sm md:text-base">
              {t('legal.lastUpdated')}
            </p>
          </div>

          {/* Document Content */}
          <article className="max-w-3xl mx-auto text-sage-muted space-y-12">
            {/* Introduction */}
            <section className="space-y-4">
              <p className="font-body-lg text-base md:text-lg text-deep-forest leading-relaxed m-0 font-semibold">
                {t('legal.termsIntro')}
              </p>
            </section>

            {/* Section 1 */}
            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                1. {t('legal.termsSection1Title')}
              </h2>
              <p className="font-body-md text-sage-muted leading-relaxed m-0">
                {t('legal.termsSection1Text')}
              </p>
            </section>

            {/* Section 2 */}
            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                2. {t('legal.termsSection2Title')}
              </h2>
              <p className="font-body-md text-sage-muted leading-relaxed mb-4 m-0">
                {t('legal.termsSection2Text')}
              </p>
              <ul className={`list-disc ${isRtl ? 'pr-6' : 'pl-6'} space-y-2 text-xs md:text-sm font-body-md`}>
                {getBullets('legal.termsSection2Bullets').map((bullet, idx) => (
                  <li key={idx}>{bullet}</li>
                ))}
              </ul>
            </section>

            {/* Section 3 */}
            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                3. {t('legal.termsSection3Title')}
              </h2>
              <p className="font-body-md text-sage-muted leading-relaxed mb-4 m-0">
                {t('legal.termsSection3Text')}
              </p>
              <ul className={`list-disc ${isRtl ? 'pr-6' : 'pl-6'} space-y-2 text-xs md:text-sm font-body-md`}>
                {getBullets('legal.termsSection3Bullets').map((bullet, idx) => (
                  <li key={idx}>{bullet}</li>
                ))}
              </ul>
            </section>

            {/* Section 4 */}
            <section className="border-t border-surface-border pt-8 space-y-4">
              <h2 className="font-headline-lg text-xl md:text-2xl text-deep-forest mb-4 m-0">
                4. {t('legal.termsSection4Title')}
              </h2>
              <p className="font-body-md text-sage-muted leading-relaxed m-0">
                {t('legal.termsSection4Text')}
              </p>
            </section>
          </article>
        </main>
      )}

      {/* Footer */}
      <Footer />
    </div>
  );
}

