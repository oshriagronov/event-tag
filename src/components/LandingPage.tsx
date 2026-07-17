import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../services/translations';
import { useConsent } from '../contexts/ConsentContext';
import {
  Camera,
  ScanFace,
  Shield,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  FolderUp,
  Users,
  Lock,
  Zap,
  ChevronDown,
} from 'lucide-react';

export function LandingPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const { t, isRtl, language } = useTranslation();
  const { reopen } = useConsent();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col bg-background text-on-background relative overflow-x-hidden selection:bg-copper-accent/30 selection:text-white antialiased">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-background/85 backdrop-blur-md border-b border-surface-border/40">
        <div className="flex justify-between items-center px-6 md:px-12 h-20 max-w-7xl mx-auto w-full">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 no-underline">
            <span className="font-display-lg text-2xl md:text-3xl text-on-background tracking-tight">EventTag</span>
          </Link>
          
          {/* Navigation Links (Desktop) */}
          <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
            <li>
              <a href="#how-it-works" className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant hover:text-copper-accent transition-colors duration-300 no-underline">
                {t('landing.howItWorksBtn')}
              </a>
            </li>
            <li>
              <Link to="/privacy" className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant hover:text-copper-accent transition-colors duration-300 no-underline">
                {language === 'he' ? 'פרטיות' : 'Privacy'}
              </Link>
            </li>
            {user && (
              <li>
                <Link to="/dashboard" className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant hover:text-copper-accent transition-colors duration-300 no-underline">
                  {t('dashboard.myDashboard')}
                </Link>
              </li>
            )}
          </ul>

          {/* Trailing Action */}
          <div className="flex items-center gap-4">
            {user ? (
              <Link to="/dashboard" className="bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider px-6 py-2.5 rounded hover:bg-primary transition-all shadow-sm no-underline cursor-pointer">
                {t('dashboard.myDashboard')}
              </Link>
            ) : (
              <button 
                onClick={signIn}
                className="bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider px-6 py-2.5 rounded hover:bg-primary transition-all shadow-sm cursor-pointer border-none"
              >
                {language === 'he' ? 'התחברות' : 'Sign In'}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-32 pb-20 px-6 overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute inset-0 pattern-dots opacity-[0.03] z-0 pointer-events-none" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-surface-container-lowest/15 to-transparent z-0 pointer-events-none" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-primary-container/10 to-transparent rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-gradient-to-bl from-copper-accent/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto w-full relative z-10 flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          {/* Text Content */}
          <div className="flex-1 text-center lg:text-start flex flex-col items-center lg:items-start">
            {/* AI Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-surface-border/50 text-copper-accent text-xs font-semibold uppercase tracking-wider mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('landing.aiPowered')}</span>
            </div>

            <h1 className="font-display-lg text-4xl sm:text-5xl lg:text-7xl text-on-background leading-tight mb-6 tracking-tight max-w-2xl m-0">
              {t('landing.heroTitle')}
              <br />
              <span className="italic text-copper-accent mt-2 block font-normal">
                {t('landing.heroSubTitle')}
              </span>
            </h1>

            <p className="font-body-lg text-lg text-sage-muted mb-10 max-w-xl leading-relaxed m-0">
              {t('landing.heroDesc')}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 w-full sm:w-auto">
              <button
                onClick={signIn}
                className="w-full sm:w-auto bg-deep-forest hover:bg-primary text-background font-label-sm text-xs uppercase tracking-widest px-8 py-4 rounded-lg flex items-center justify-center gap-3 transition-all duration-300 font-bold shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                </svg>
                <span>{t('landing.signInGoogle')}</span>
                {isRtl ? (
                  <ArrowLeft className="w-4 h-4 transform hover:-translate-x-1 transition-transform" />
                ) : (
                  <ArrowRight className="w-4 h-4 transform hover:translate-x-1 transition-transform" />
                )}
              </button>

              <a
                href="#how-it-works"
                className="w-full sm:w-auto px-8 py-4 rounded-lg font-label-sm text-xs uppercase tracking-widest text-on-background border border-surface-border hover:bg-surface-container transition-all text-center no-underline"
              >
                {t('landing.howItWorksBtn')}
              </a>
            </div>

            {/* Privacy Trust Badge */}
            <div className="mt-12 flex items-center justify-center lg:justify-start gap-3 text-sage-muted bg-surface-container/30 px-4 py-2.5 rounded-xl border border-surface-border/20">
              <Lock className="w-4 h-4 text-copper-accent" />
              <span className="font-label-sm text-[10px] uppercase tracking-wider">{t('landing.privacyBullet1')} • {t('landing.privacyBullet2')}</span>
            </div>
          </div>

          {/* Visual Asset / Framed Art */}
          <div className="flex-grow-0 flex-shrink-0 flex justify-center w-full max-w-md lg:max-w-none lg:w-[480px]">
            <div className="relative w-full aspect-square rounded-2xl bg-surface-container-low border border-surface-border/30 flex items-center justify-center p-12 overflow-hidden shadow-2xl group">
              {/* Decorative classical corners */}
              <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-sage-muted/20"></div>
              <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-sage-muted/20"></div>
              <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-sage-muted/20"></div>
              <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-sage-muted/20"></div>
              
              <div className="absolute inset-0 bg-gradient-to-tr from-copper-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              
              <div className="w-32 h-32 rounded-3xl bg-surface-container-lowest border border-surface-border/50 dark:border-none dark:bg-gradient-to-br dark:from-primary-container dark:to-secondary-container flex items-center justify-center shadow-xl shadow-black/40 group-hover:scale-105 transition-transform duration-700 ease-out">
                <Users className="w-16 h-16 text-copper-accent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="relative py-24 px-6 bg-surface-container-low/40 border-t border-b border-surface-border/20 backdrop-blur-sm scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-16">
            <h2 className="font-display-lg text-3xl md:text-5xl text-on-background m-0">
              {t('landing.howItWorksTitle')}
            </h2>
            <div className="botanical-divider w-40 mx-auto my-4" />
            <p className="font-body-md text-sage-muted text-lg mt-2 max-w-xl mx-auto leading-relaxed">
              {t('landing.howItWorksSub')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="group relative p-8 rounded-2xl bg-surface-container border border-surface-border hover:border-copper-accent/35 transition-all duration-300 hover:shadow-2xl hover:shadow-black/20 hover:-translate-y-1 text-center">
              {/* Step number badge */}
              <div className="absolute -top-4 right-6 left-auto w-8 h-8 rounded-full bg-gradient-to-br from-copper-accent to-muted-gold flex items-center justify-center text-background text-sm font-bold shadow-lg">
                1
              </div>

              <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300 border border-surface-border/40">
                <FolderUp className="w-7 h-7 text-copper-accent" />
              </div>
              <h3 className="font-title-md text-lg font-bold text-on-background mb-3">
                {t('landing.step1Title')}
              </h3>
              <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">
                {t('landing.step1Desc')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="group relative p-8 rounded-2xl bg-surface-container border border-surface-border hover:border-copper-accent/35 transition-all duration-300 hover:shadow-2xl hover:shadow-black/20 hover:-translate-y-1 text-center">
              <div className="absolute -top-4 right-6 left-auto w-8 h-8 rounded-full bg-gradient-to-br from-copper-accent to-muted-gold flex items-center justify-center text-background text-sm font-bold shadow-lg">
                2
              </div>

              <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300 border border-surface-border/40">
                <ScanFace className="w-7 h-7 text-copper-accent" />
              </div>
              <h3 className="font-title-md text-lg font-bold text-on-background mb-3">
                {t('landing.step2Title')}
              </h3>
              <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">
                {t('landing.step2Desc')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="group relative p-8 rounded-2xl bg-surface-container border border-surface-border hover:border-copper-accent/35 transition-all duration-300 hover:shadow-2xl hover:shadow-black/20 hover:-translate-y-1 text-center">
              <div className="absolute -top-4 right-6 left-auto w-8 h-8 rounded-full bg-gradient-to-br from-copper-accent to-muted-gold flex items-center justify-center text-background text-sm font-bold shadow-lg">
                3
              </div>

              <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300 border border-surface-border/40">
                <Camera className="w-7 h-7 text-copper-accent" />
              </div>
              <h3 className="font-title-md text-lg font-bold text-on-background mb-3">
                {t('landing.step3Title')}
              </h3>
              <p className="font-body-md text-sage-muted text-sm leading-relaxed m-0">
                {t('landing.step3Desc')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section id="privacy" className="relative py-24 px-6 overflow-hidden scroll-mt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary-container/5 to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto w-full relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-16">
            {/* Privacy badge cluster */}
            <div className="relative shrink-0">
              <div className="w-36 h-36 rounded-2xl bg-surface-container border border-surface-border flex items-center justify-center shadow-2xl">
                <Shield className="w-16 h-16 text-copper-accent" />
              </div>
            </div>

            <div className="flex-1 text-start">
              <h2 className="font-display-lg text-3xl md:text-5xl text-on-background m-0 mb-4">
                {t('landing.privacyTitle')}
              </h2>
              <p className="font-body-lg text-sage-muted leading-relaxed mb-8 m-0 text-lg">
                {t('landing.privacyDesc')}
              </p>

              <div className="flex flex-col sm:flex-row flex-wrap gap-4">
                {[
                  { icon: Zap, text: t('landing.privacyBullet1') },
                  { icon: Lock, text: t('landing.privacyBullet2') },
                  { icon: Shield, text: t('landing.privacyBullet3') },
                ].map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-center gap-3 px-5 py-3 rounded-xl bg-surface-container border border-surface-border/50 backdrop-blur-sm"
                  >
                    <Icon className="w-4 h-4 text-copper-accent shrink-0" />
                    <span className="font-label-sm text-xs uppercase tracking-wider text-on-background">
                      {text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative py-24 px-6 border-t border-surface-border/20 bg-surface-container-low/20 backdrop-blur-sm scroll-mt-20">
        <div className="max-w-4xl mx-auto w-full" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="text-center mb-16">
            <h2 className="font-display-lg text-3xl md:text-5xl text-on-background m-0">
              {t('landing.faqTitle')}
            </h2>
            <div className="botanical-divider w-40 mx-auto my-4" />
            <p className="font-body-md text-sage-muted text-lg mt-2 max-w-xl mx-auto">
              {t('landing.faqSub')}
            </p>
          </div>

          <div className="space-y-4 text-start">
            {[
              { q: 'landing.q1', a: 'landing.a1' },
              { q: 'landing.q2', a: 'landing.a2' },
              { q: 'landing.q3', a: 'landing.a3' },
            ].map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-surface-border/80 bg-surface-container overflow-hidden transition-all duration-300 shadow-sm hover:border-copper-accent/35"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-6 text-start font-bold text-lg text-on-background cursor-pointer select-none gap-4 bg-transparent border-none outline-none"
                  >
                    <span className="font-title-md text-base md:text-lg">{t(item.q)}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-sage-muted transition-transform duration-300 shrink-0 ${
                        isOpen ? 'transform rotate-180 text-copper-accent' : ''
                      }`}
                    />
                  </button>
                  <div
                    className={`transition-all duration-300 ease-in-out ${
                      isOpen ? 'max-h-[500px] border-t border-surface-border/50' : 'max-h-0'
                    } overflow-hidden`}
                  >
                    <p className="p-6 font-body-md text-sage-muted leading-relaxed text-sm md:text-base m-0 bg-surface-container-low/50">
                      {t(item.a)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legal Pages notice */}
          <div className="mt-12 text-center text-xs md:text-sm text-sage-muted">
            {language === 'he' ? (
              <p className="m-0 font-body-md">
                למידע נוסף ומפורט, אנא קראו את{' '}
                <Link to="/privacy-policy" className="font-semibold text-copper-accent hover:underline transition-colors no-underline">
                  מדיניות הפרטיות
                </Link>{' '}
                ואת{' '}
                <Link to="/terms" className="font-semibold text-copper-accent hover:underline transition-colors no-underline">
                  תנאי השימוש בשירות
                </Link>
                .
              </p>
            ) : (
              <p className="m-0 font-body-md">
                For more detailed information, please review our{' '}
                <Link to="/privacy-policy" className="font-semibold text-copper-accent hover:underline transition-colors no-underline">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link to="/terms" className="font-semibold text-copper-accent hover:underline transition-colors no-underline">
                  Terms of Service
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low/30 to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="font-display-lg text-3xl md:text-5xl text-on-background mb-4 m-0">
            {t('landing.readyTitle')}
          </h2>
          <p className="font-body-md text-sage-muted mb-10 text-base md:text-lg m-0">
            {t('landing.readySub')}
          </p>
          <button
            onClick={signIn}
            className="w-full sm:w-auto bg-deep-forest hover:bg-primary text-background font-label-sm text-xs uppercase tracking-widest px-8 py-4 rounded-lg flex items-center justify-center gap-3 transition-all duration-300 font-bold shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer mx-auto"
          >
            <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
            </svg>
            <span>{t('landing.signInGoogle')}</span>
            {isRtl ? (
              <ArrowLeft className="w-4 h-4 transform hover:-translate-x-1 transition-transform" />
            ) : (
              <ArrowRight className="w-4 h-4 transform hover:translate-x-1 transition-transform" />
            )}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-surface-border/30 mt-auto bg-surface-container-lowest">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs md:text-sm text-sage-muted w-full">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-start">
            <span className="font-display-lg text-lg text-on-background tracking-tight">EventTag</span>
            <p className="m-0 font-body-md">© {new Date().getFullYear()} EventTag — {language === 'he' ? 'כל הזכויות שמורות' : 'All rights reserved'}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 font-label-sm uppercase tracking-wider text-[10px] md:text-xs">
            <Link to="/privacy-policy" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('legal.privacyTitle')}</Link>
            <span className="text-surface-border">•</span>
            <Link to="/terms" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('legal.termsTitle')}</Link>
            <span className="text-surface-border">•</span>
            <button
              onClick={reopen}
              className="hover:text-copper-accent transition-colors cursor-pointer bg-transparent border-none p-0 outline-none font-bold text-sage-muted font-label-sm uppercase tracking-wider text-[10px] md:text-xs"
            >
              {t('consent.managePreferences')}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
