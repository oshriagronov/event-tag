import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../services/translations';
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
  const { t, isRtl } = useTranslation();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-to-bl from-amber-50 via-slate-50 to-orange-50 dark:from-[#111113] dark:via-[#15141a] dark:to-[#1a1510]" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-amber-400/20 to-orange-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-amber-500/15 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

        {/* Floating decorative elements */}
        <div className="absolute top-32 left-16 w-20 h-20 bg-amber-400/10 dark:bg-amber-500/5 rounded-2xl rotate-12 animate-float-slow" />
        <div className="absolute top-48 right-24 w-14 h-14 bg-orange-400/10 dark:bg-orange-500/5 rounded-xl -rotate-6 animate-float-medium" />
        <div className="absolute bottom-40 left-32 w-16 h-16 bg-amber-300/10 dark:bg-amber-400/5 rounded-2xl rotate-45 animate-float-slow" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center flex flex-col items-center gap-8 py-20">
          {/* Logo & Badge */}
          <div className="flex flex-col items-center gap-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm font-medium backdrop-blur-sm">
              <Sparkles className="w-4 h-4" />
              <span>{t('landing.aiPowered')}</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-amber-500/30 dark:shadow-amber-500/20">
                <Users className="w-9 h-9 text-white" />
              </div>
              <h1 className="text-6xl md:text-7xl font-black tracking-tight text-slate-900 dark:text-white m-0">
                Event<span className="bg-gradient-to-l from-amber-500 to-orange-500 bg-clip-text text-transparent">Tag</span>
              </h1>
            </div>
          </div>

          {/* Headline */}
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-700 dark:text-slate-200 leading-relaxed m-0">
              {t('landing.heroTitle')}
              <br />
              <span className="bg-gradient-to-l from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                {t('landing.heroSubTitle')}
              </span>
            </h2>
            <p className="text-lg text-slate-500 dark:text-slate-400 mt-4 max-w-2xl mx-auto leading-relaxed">
              {t('landing.heroDesc')}
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
            <button
              onClick={signIn}
              className="group relative px-8 py-4 rounded-2xl text-lg font-bold bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-xl shadow-amber-500/30 hover:shadow-amber-500/50 hover:brightness-110 transition-all duration-300 cursor-pointer flex items-center gap-3 active:scale-[0.98]"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity=".9"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" opacity=".8"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity=".7"/>
              </svg>
              <span>{t('landing.signInGoogle')}</span>
              {isRtl ? (
                <ArrowLeft className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" />
              ) : (
                <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
              )}
            </button>

            <a
              href="#how-it-works"
              className="px-6 py-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all cursor-pointer backdrop-blur-sm flex items-center gap-2"
            >
              <span>{t('landing.howItWorksBtn')}</span>
              <ChevronDown className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-6 h-6 text-slate-400 dark:text-slate-600" />
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="relative py-24 px-6 bg-white/50 dark:bg-slate-900/30 backdrop-blur-sm"
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white m-0">
              {t('landing.howItWorksTitle')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-3 text-lg">
              {t('landing.howItWorksSub')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="group relative p-8 rounded-3xl bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 hover:border-amber-300/60 dark:hover:border-amber-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/5 dark:hover:shadow-amber-500/5 hover:-translate-y-1 text-center">
              {/* Step number */}
              <div className="absolute -top-4 right-6 left-auto w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-amber-500/30">
                1
              </div>

              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-500/15 dark:to-amber-500/5 flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform duration-300">
                <FolderUp className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                {t('landing.step1Title')}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed m-0">
                {t('landing.step1Desc')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="group relative p-8 rounded-3xl bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 hover:border-amber-300/60 dark:hover:border-amber-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/5 dark:hover:shadow-amber-500/5 hover:-translate-y-1 text-center">
              <div className="absolute -top-4 right-6 left-auto w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-amber-500/30">
                2
              </div>

              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-500/15 dark:to-amber-500/5 flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform duration-300">
                <ScanFace className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                {t('landing.step2Title')}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed m-0">
                {t('landing.step2Desc')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="group relative p-8 rounded-3xl bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 hover:border-amber-300/60 dark:hover:border-amber-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/5 dark:hover:shadow-amber-500/5 hover:-translate-y-1 text-center">
              <div className="absolute -top-4 right-6 left-auto w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-amber-500/30">
                3
              </div>

              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-500/15 dark:to-amber-500/5 flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform duration-300">
                <Camera className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                {t('landing.step3Title')}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed m-0">
                {t('landing.step3Desc')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-50/30 to-transparent dark:via-amber-500/3" />

        <div className="relative max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12">
            {/* Privacy icon cluster */}
            <div className="relative shrink-0">
              <div className="w-40 h-40 rounded-3xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-500/10 dark:to-teal-500/5 flex items-center justify-center border border-emerald-200/50 dark:border-emerald-500/20">
                <Shield className="w-20 h-20 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="absolute -top-3 -right-3 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Lock className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="flex-1 text-start">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white m-0 mb-4">
                {t('landing.privacyTitle')}
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-6 m-0">
                {t('landing.privacyDesc')}
              </p>

              <div className="flex flex-wrap gap-4">
                {[
                  { icon: Zap, text: t('landing.privacyBullet1') },
                  { icon: Lock, text: t('landing.privacyBullet2') },
                  { icon: Shield, text: t('landing.privacyBullet3') },
                ].map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm"
                  >
                    <Icon className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-4 m-0">
            {t('landing.readyTitle')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 text-lg m-0">
            {t('landing.readySub')}
          </p>
          <button
            onClick={signIn}
            className="group px-8 py-4 rounded-2xl text-lg font-bold bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-xl shadow-amber-500/30 hover:shadow-amber-500/50 hover:brightness-110 transition-all duration-300 cursor-pointer flex items-center gap-3 mx-auto active:scale-[0.98]"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity=".9"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" opacity=".8"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity=".7"/>
            </svg>
            <span>{t('landing.signInGoogle')}</span>
            {isRtl ? (
              <ArrowLeft className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" />
            ) : (
              <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
            )}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-200/60 dark:border-slate-800/60 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold">EventTag</span>
          </div>
          <p>© {new Date().getFullYear()} {t('landing.copyright')}</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer">{t('legal.privacyTitle')}</Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link to="/terms" className="hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer">{t('legal.termsTitle')}</Link>
          </div>
        </div>
      </footer>

      {/* Custom animations */}
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) rotate(12deg); }
          50% { transform: translateY(-20px) rotate(18deg); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-15px) rotate(-12deg); }
        }
        .animate-float-slow { animation: float-slow 8s ease-in-out infinite; }
        .animate-float-medium { animation: float-medium 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
