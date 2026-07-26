import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from '../services/translations';
import { Footer } from './Footer';
import { GoogleSignInButton } from './GoogleIcon';
import {
  Camera,
  ScanFace,
  Shield,
  Sparkles,
  FolderUp,
  Users,
  ChevronDown,
  Monitor,
  EyeOff,
  KeyRound,
  Menu,
  X,
} from 'lucide-react';

export function LandingPage() {
  const { user, loading, signIn } = useAuth();
  const { theme } = useSettings();
  const navigate = useNavigate();
  const { t, isRtl, language } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dashboardImg = theme === 'light' ? '/dashboard-light.jpg' : '/dashboard-dark.jpg';

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  // Smooth scroll handler on hash load
  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        const timer = setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.pushState(null, '', `#${id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="flex-grow flex flex-col bg-background text-on-background relative overflow-x-hidden selection:bg-copper-accent/30 selection:text-white antialiased"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-background/85 backdrop-blur-md border-b border-surface-border/40">
        <div className="flex justify-between items-center px-6 md:px-12 min-h-[5rem] py-3 max-w-7xl mx-auto w-full flex-wrap gap-y-2">
          {/* Mobile Menu Button & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden text-on-background p-2 rounded-lg hover:bg-surface-container transition-colors cursor-pointer border-none bg-transparent"
              title={language === 'he' ? 'פתח תפריט' : 'Open menu'}
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link
              to="/"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                window.history.pushState(null, '', '/');
              }}
              className="flex items-center gap-3 no-underline"
            >
              <span className="font-display-lg text-3xl md:text-4xl font-bold text-on-background tracking-tight">
                EventTag
              </span>
            </Link>
          </div>

          {/* Navigation Links (Desktop) */}
          <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
            <li>
              <a
                href="#how-it-works"
                onClick={(e) => handleScrollTo(e, 'how-it-works')}
                className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant hover:text-copper-accent transition-colors duration-300 no-underline cursor-pointer"
              >
                {t('landing.howItWorksBtn')}
              </a>
            </li>
            <li>
              <a
                href="#faq"
                onClick={(e) => handleScrollTo(e, 'faq')}
                className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant hover:text-copper-accent transition-colors duration-300 no-underline cursor-pointer"
              >
                {t('landing.faqNavBtn')}
              </a>
            </li>
            <li>
              <a
                href="#privacy"
                onClick={(e) => handleScrollTo(e, 'privacy')}
                className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant hover:text-copper-accent transition-colors duration-300 no-underline cursor-pointer"
              >
                {language === 'he' ? 'פרטיות' : 'Privacy'}
              </a>
            </li>
            {user && (
              <li>
                <Link
                  to="/dashboard"
                  className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant hover:text-copper-accent transition-colors duration-300 no-underline"
                >
                  {t('dashboard.myDashboard')}
                </Link>
              </li>
            )}
          </ul>

          {/* Trailing Action */}
          <div className="hidden md:flex items-center gap-3 md:gap-4">
            {user ? (
              <Link
                to="/dashboard"
                className="bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider px-5 sm:px-6 py-2.5 rounded hover:bg-primary transition-all shadow-sm no-underline cursor-pointer"
              >
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
      </nav>

      {/* Mobile Navigation Drawer (Rendered outside <nav> matching Dashboard drawer) */}
      <div
        className={`fixed inset-0 z-[60] md:hidden transition-all duration-300 ${
          mobileMenuOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
            mobileMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setMobileMenuOpen(false)}
        />
        {/* Drawer Panel - Solid Background Matching Dashboard */}
        <div
          className={`absolute top-0 bottom-0 w-64 bg-surface-container-low h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 ease-out text-start ${
            isRtl
              ? `right-0 border-l border-surface-border/30 ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`
              : `left-0 border-r border-surface-border/30 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`
          }`}
        >
          <button
            onClick={() => setMobileMenuOpen(false)}
            className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-2 text-sage-muted hover:text-on-background cursor-pointer rounded-lg hover:bg-surface-container-high transition-colors`}
            title={language === 'he' ? 'סגור תפריט' : 'Close menu'}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col h-full py-8 gap-y-6 text-start" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Brand */}
            <div className="px-6 mb-4 flex flex-col justify-center items-start mt-4">
              <h1 className="font-display-lg text-3xl font-bold text-on-background tracking-tight m-0">EventTag</h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-1 px-3">
              <a
                href="#how-it-works"
                onClick={(e) => {
                  setMobileMenuOpen(false);
                  handleScrollTo(e, 'how-it-works');
                }}
                className="flex items-center gap-3 font-bold py-3 px-4 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container transition-all text-start cursor-pointer no-underline w-full"
              >
                <Sparkles className="w-4 h-4 text-copper-accent" />
                <span className="font-label-sm text-xs uppercase tracking-wider">{t('landing.howItWorksBtn')}</span>
              </a>
              <a
                href="#faq"
                onClick={(e) => {
                  setMobileMenuOpen(false);
                  handleScrollTo(e, 'faq');
                }}
                className="flex items-center gap-3 font-bold py-3 px-4 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container transition-all text-start cursor-pointer no-underline w-full"
              >
                <Users className="w-4 h-4 text-copper-accent" />
                <span className="font-label-sm text-xs uppercase tracking-wider">{t('landing.faqNavBtn')}</span>
              </a>
              <a
                href="#privacy"
                onClick={(e) => {
                  setMobileMenuOpen(false);
                  handleScrollTo(e, 'privacy');
                }}
                className="flex items-center gap-3 font-bold py-3 px-4 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container transition-all text-start cursor-pointer no-underline w-full"
              >
                <Shield className="w-4 h-4 text-copper-accent" />
                <span className="font-label-sm text-xs uppercase tracking-wider">{language === 'he' ? 'פרטיות' : 'Privacy'}</span>
              </a>
              {user && (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 font-bold py-3 px-4 rounded-lg text-copper-accent hover:bg-surface-container transition-all text-start cursor-pointer no-underline w-full"
                >
                  <Monitor className="w-4 h-4 text-copper-accent" />
                  <span className="font-label-sm text-xs uppercase tracking-wider">{t('dashboard.myDashboard')}</span>
                </Link>
              )}
            </nav>

            <div className="px-4 pt-4 border-t border-surface-border/30">
              {user ? (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider py-3 rounded text-center block no-underline shadow-sm"
                >
                  {t('dashboard.myDashboard')}
                </Link>
              ) : (
                <GoogleSignInButton
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signIn();
                  }}
                  shape="Square"
                  height={44}
                  className="w-full"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <main id="main-content" tabIndex={-1} className="flex-grow flex flex-col focus:outline-none">
        {/* Hero Section */}
        <section className="relative min-h-[85vh] lg:min-h-[90vh] flex items-center justify-center pt-28 pb-20 px-6 overflow-hidden">
          {/* Decorative Background Elements */}
          <div className="absolute inset-0 pattern-dots opacity-[0.03] z-0 pointer-events-none" />
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-surface-container-lowest/15 to-transparent z-0 pointer-events-none" />
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-primary-container/10 to-transparent rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-gradient-to-bl from-copper-accent/5 to-transparent rounded-full blur-3xl pointer-events-none" />

          {/* Centered Main Content */}
          <div className="max-w-5xl mx-auto w-full relative z-20 flex flex-col items-center text-center">
            {/* AI Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container/80 backdrop-blur-md border border-surface-border/60 text-copper-accent text-xs font-semibold uppercase tracking-wider mb-8 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('landing.aiPowered')}</span>
            </div>

            {/* Centered Title */}
            <h1 className="font-display-lg text-4xl sm:text-6xl lg:text-7xl text-on-background leading-[1.15] mb-6 tracking-tight max-w-3xl m-0">
              {t('landing.heroTitle')}
              <span className="block italic text-copper-accent font-normal mt-2">
                {t('landing.heroSubTitle')}
              </span>
            </h1>

            {/* Centered Subtitle */}
            <p className="font-body-lg text-base sm:text-xl text-sage-muted mb-10 max-w-2xl leading-relaxed m-0">
              {t('landing.heroDesc')}
            </p>

            {/* Centered Buttons & Links */}
            <div className="flex flex-col items-center justify-center gap-4 w-full sm:w-auto">
              <GoogleSignInButton
                onClick={signIn}
                shape="Square"
                height={50}
                className="shadow-2xl hover:scale-105 transition-transform"
              />

              <a
                href="https://github.com/oshriagronov/event-tag"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-label-sm text-xs uppercase tracking-widest text-sage-muted hover:text-on-background transition-colors no-underline cursor-pointer group mt-2 py-1 px-3"
              >
                <svg className="w-4 h-4 text-copper-accent shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>{t('landing.openSourceBtn')}</span>
                <span aria-hidden="true" className="group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform">›</span>
              </a>
            </div>

            {/* Dashboard Screenshot Preview Showcase */}
            <div className="mt-14 sm:mt-16 w-full max-w-5xl mx-auto relative group">
              {/* Outer Glow / Ambient Backdrop */}
              <div className="absolute -inset-1 bg-gradient-to-r from-copper-accent/20 via-primary-container/20 to-copper-accent/20 rounded-2xl blur-xl opacity-60 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              {/* Window Frame Container */}
              <div className="relative rounded-2xl bg-surface-container-low border border-surface-border/60 shadow-2xl overflow-hidden text-start" dir="ltr">
                {/* Window Header / macOS Controls */}
                <div className="flex items-center justify-between px-4 py-3 bg-surface-container-high/90 border-b border-surface-border/40 select-none">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/40 block" />
                    <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/40 block" />
                    <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/40 block" />
                  </div>
                  <div className="text-[11px] font-mono text-sage-muted/70 tracking-wider">
                    EventTag Dashboard
                  </div>
                  <div className="w-12" />
                </div>

                {/* Dashboard Image */}
                <div className="relative overflow-hidden bg-background">
                  <img
                    src={dashboardImg}
                    alt="EventTag Dashboard Overview - Manage private cloud event photo galleries"
                    className="w-full h-auto block object-cover shadow-inner transform group-hover:scale-[1.003] transition-transform duration-500"
                    loading="eager"
                  />
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

        {/* Absolute Privacy Section */}
        <section id="privacy" className="relative py-24 px-6 overflow-hidden scroll-mt-20 border-t border-surface-border/20">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary-container/5 to-transparent pointer-events-none" />

          <div className="max-w-6xl mx-auto w-full relative z-10">
            <div className="text-center mb-16">
              <div className="inline-flex items-center justify-center p-4 bg-surface-container border border-surface-border rounded-full mb-6 shadow-sm">
                <Shield className="w-8 h-8 text-copper-accent" />
              </div>
              <h2 className="font-display-lg text-3xl md:text-5xl text-on-background m-0">
                {t('landing.privacyTitle')}
              </h2>
              <div className="botanical-divider w-40 mx-auto my-4" />
              <p className="font-body-lg text-sage-muted text-lg mt-2 max-w-2xl mx-auto leading-relaxed">
                {t('landing.privacyDesc')}
              </p>
            </div>

            {/* Bento Grid Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-16 text-start">
              <div className="group bg-surface-container border border-surface-border rounded-xl p-8 hover:border-copper-accent/35 hover:shadow-2xl transition-all duration-300 flex flex-col items-start relative overflow-hidden">
                <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border/50 flex items-center justify-center mb-6">
                  <Monitor className="w-5 h-5 text-copper-accent" />
                </div>
                <h3 className="font-display-lg text-xl text-on-background mb-3">
                  {t('landing.privacyBullet1')}
                </h3>
                <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0">
                  {language === 'he'
                    ? 'אלגוריתמי זיהוי פנים מתקדמים מופעלים ישירות בדפדפן שלך, מה שמונע כל מעבר של מידע ביומטרי לשרתים חיצוניים.'
                    : 'Complex AI facial recognition algorithms run directly within your web browser, ensuring zero transit of biometric data to external servers.'}
                </p>
              </div>

              <div className="group bg-surface-container border border-surface-border rounded-xl p-8 hover:border-copper-accent/35 hover:shadow-2xl transition-all duration-300 flex flex-col items-start relative overflow-hidden">
                <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border/50 flex items-center justify-center mb-6">
                  <EyeOff className="w-5 h-5 text-copper-accent" />
                </div>
                <h3 className="font-display-lg text-xl text-on-background mb-3">
                  {t('landing.privacyBullet2')}
                </h3>
                <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0">
                  {language === 'he'
                    ? 'התמונות שלך מנותחות במקום על גבי המכשיר שלך, ובכך נמנעת גישה לא מורשית או איסוף נתונים לא רצוי.'
                    : 'Your high-resolution images are analyzed instantly on your device, preventing unauthorized access or data harvesting.'}
                </p>
              </div>

              <div className="group bg-surface-container border border-surface-border rounded-xl p-8 hover:border-copper-accent/35 hover:shadow-2xl transition-all duration-300 flex flex-col items-start relative overflow-hidden">
                <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border/50 flex items-center justify-center mb-6">
                  <KeyRound className="w-5 h-5 text-copper-accent" />
                </div>
                <h3 className="font-display-lg text-xl text-on-background mb-3">
                  {t('landing.privacyBullet3')}
                </h3>
                <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0">
                  {language === 'he'
                    ? 'בענן נשמרים רק וקטורים מתמטיים מופשטים, שמהם לא ניתן לשחזר את תמונת הפנים המקורית.'
                    : 'Any necessary operational metadata is safeguarded with state-of-the-art encryption, storing only non-reconstructable mathematical vectors.'}
                </p>
              </div>
            </div>

            {/* The EventTag Promise Banner */}
            <div className="relative overflow-hidden rounded-xl bg-surface-container border border-surface-border p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 group text-start">
              <div className="flex-1 max-w-xl z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-surface-container-high px-3 py-1 rounded-full border border-surface-border/50 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-copper-accent"></span>
                    <span className="font-label-sm text-[10px] text-copper-accent tracking-widest uppercase">
                      {language === 'he' ? 'ההתחייבות של EventTag' : 'The EventTag Promise'}
                    </span>
                  </div>
                </div>
                <h3 className="font-display-lg text-2xl md:text-3xl text-on-background mb-4 m-0">
                  {language === 'he' ? 'אירועים בלתי נשכחים, פרטיות מוחלטת.' : 'Elegant Celebrations, Absolute Privacy.'}
                </h3>
                <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0 mt-2">
                  {language === 'he'
                    ? 'אנו מאמינים שחוויות האירוע שלכם צריכות להישאר אישיות ומאובטחות. הארכיטקטורה שלנו תוכננה בקפידה כדי להבטיח שכל תמונת אירוע וכל רגע מרגש של האורחים שלכם יישארו פרטיים לחלוטין.'
                    : 'We believe your celebration memories deserve the highest standard of privacy. Our architecture is meticulously crafted to ensure that every event photo and guest moment remains entirely private.'}
                </p>
              </div>
              <div className="z-10 shrink-0">
                <div className="relative">
                  <div className="absolute inset-0 bg-copper-accent/10 rounded-full blur-2xl -z-10"></div>
                  <img
                    className="w-44 h-44 md:w-52 md:h-52 object-cover rounded-full border-4 border-surface-container-high shadow-xl grayscale opacity-80 transition-all duration-500 group-hover:grayscale-0"
                    alt="An elegant upscale event celebration background with glowing ambient warm lights and sophisticated guests."
                    src="/luxury_event.jpg"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Q&A / FAQ Section */}
        <section
          id="faq"
          className="relative py-24 px-6 border-t border-surface-border/20 bg-surface-container-low/20 backdrop-blur-sm scroll-mt-20"
        >
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
                { q: 'landing.q4', a: 'landing.a4' },
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
                  <Link
                    to="/privacy-policy"
                    className="font-semibold text-copper-accent hover:underline transition-colors no-underline"
                  >
                    מדיניות הפרטיות
                  </Link>{' '}
                  ואת{' '}
                  <Link
                    to="/terms"
                    className="font-semibold text-copper-accent hover:underline transition-colors no-underline"
                  >
                    תנאי השימוש בשירות
                  </Link>
                  .
                </p>
              ) : (
                <p className="m-0 font-body-md">
                  For more detailed information, please review our{' '}
                  <Link
                    to="/privacy-policy"
                    className="font-semibold text-copper-accent hover:underline transition-colors no-underline"
                  >
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link
                    to="/terms"
                    className="font-semibold text-copper-accent hover:underline transition-colors no-underline"
                  >
                    Terms of Service
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-24 px-6 relative border-t border-surface-border/20">
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low/30 to-transparent pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <h2 className="font-display-lg text-3xl md:text-5xl text-on-background mb-4 m-0">
              {t('landing.readyTitle')}
            </h2>
            <p className="font-body-md text-sage-muted mb-10 text-base md:text-lg m-0">
              {t('landing.readySub')}
            </p>
            <GoogleSignInButton
              onClick={signIn}
              shape="Square"
              height={48}
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
