import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../services/translations';
import { useConsent } from '../contexts/ConsentContext';
import { Shield, Monitor, EyeOff, KeyRound } from 'lucide-react';

export function PrivacyPage() {
  const { user, signIn } = useAuth();
  const { t, isRtl, language } = useTranslation();
  const { reopen } = useConsent();

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
            <span className="font-display-lg text-2xl md:text-3xl text-on-background tracking-tight">EventTag</span>
          </Link>
          
          {/* Navigation Links */}
          <nav className="hidden md:flex gap-8 items-center list-none" aria-label={language === 'he' ? 'ניווט ראשי' : 'Main Navigation'}>
            <a href="/#how-it-works" className="font-label-sm text-xs uppercase tracking-wider text-sage-muted hover:text-copper-accent transition-colors duration-300 no-underline">
              {t('landing.howItWorksBtn')}
            </a>
            <Link to="/privacy" className="font-label-sm text-xs uppercase tracking-wider text-copper-accent font-bold border-b-2 border-copper-accent pb-1 no-underline">
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
              <button 
                onClick={signIn}
                className="bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider px-6 py-2.5 rounded hover:bg-primary transition-all shadow-sm cursor-pointer border-none"
              >
                {language === 'he' ? 'התחברות' : 'Sign In'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" tabIndex={-1} className="flex-grow pt-32 pb-24 px-6 md:px-12 max-w-5xl mx-auto w-full z-10 focus:outline-none">
        <section className="mb-20 text-center max-w-3xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center justify-center p-5 bg-surface-container border border-surface-border rounded-full mb-8 shadow-sm">
            <Shield className="w-10 h-10 text-copper-accent" />
          </div>
          <h1 className="font-display-lg text-4xl md:text-5xl text-on-background mb-6">
            {language === 'he' ? 'פרטיות מוחלטת כברירת מחדל' : 'Absolute Privacy by Design'}
          </h1>
          <p className="font-body-lg text-lg text-sage-muted leading-relaxed m-0">
            {language === 'he'
              ? 'התמונות שלך לעולם אינן עוזבות את המכשיר שלך. כל זיהוי הפנים מתבצע ישירות בדפדפן שלך. אנו משלבים בין צילום יוקרתי לטכנולוגיית בינה מלאכותית מתקדמת הרצה מקומית, תוך מתן דגש מוחלט על שקט נפשי ופרטיות.'
              : 'Your photos never leave your device. All AI detection happens entirely in your browser. We bridge the gap between traditional luxury photography and cutting-edge browser-based AI, prioritizing a sense of calm and privacy.'}
          </p>
        </section>

        {/* Bento Grid Layout */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-20 text-start">
          {/* Card 1 */}
          <div className="group bg-surface-container border border-surface-border rounded-xl p-8 hover:border-copper-accent/35 hover:shadow-2xl transition-all duration-300 flex flex-col items-start relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Monitor className="w-16 h-16 text-on-background" />
            </div>
            <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border/50 flex items-center justify-center mb-6">
              <Monitor className="w-5 h-5 text-on-background" />
            </div>
            <h3 className="font-display-lg text-xl text-on-background mb-3">
              {language === 'he' ? 'עיבוד מקומי בדפדפן' : 'Local Browser Processing'}
            </h3>
            <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0">
              {language === 'he'
                ? 'ליהנות מטכנולוגיה מתקדמת בראש שקט. אלגוריתמי זיהוי פנים מתקדמים מופעלים ישירות בדפדפן שלך, מה שמונע כל מעבר של מידע ביומטרי לשרתים חיצוניים.'
                : 'Experience artisan-level care. Complex AI facial recognition algorithms run directly within your web browser, ensuring zero transit of biometric data to external servers.'}
            </p>
          </div>

          {/* Card 2 */}
          <div className="group bg-surface-container border border-surface-border rounded-xl p-8 hover:border-copper-accent/35 hover:shadow-2xl transition-all duration-300 flex flex-col items-start relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <EyeOff className="w-16 h-16 text-on-background" />
            </div>
            <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border/50 flex items-center justify-center mb-6">
              <EyeOff className="w-5 h-5 text-on-background" />
            </div>
            <h3 className="font-display-lg text-xl text-on-background mb-3">
              {language === 'he' ? 'ללא העלאת תמונות לשרתים' : 'No Photo Uploads to Our Servers'}
            </h3>
            <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0">
              {language === 'he'
                ? 'אבטחה מקסימלית בשילוב אלגנטיות. התמונות שלך מנותחות במקום על גבי המכשיר שלך, ובכך נמנעת גישה לא מורשית או איסוף נתונים לא רצוי.'
                : 'Curated elegance meets absolute security. Your high-resolution images are analyzed instantly on your device, preventing unauthorized access or data harvesting.'}
            </p>
          </div>

          {/* Card 3 */}
          <div className="group bg-surface-container border border-surface-border rounded-xl p-8 hover:border-copper-accent/35 hover:shadow-2xl transition-all duration-300 flex flex-col items-start relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <KeyRound className="w-16 h-16 text-on-background" />
            </div>
            <div className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-border/50 flex items-center justify-center mb-6">
              <KeyRound className="w-5 h-5 text-on-background" />
            </div>
            <h3 className="font-display-lg text-xl text-on-background mb-3">
              {language === 'he' ? 'הצפנת נתונים מאובטחת' : 'Secure Data Encryption'}
            </h3>
            <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0">
              {language === 'he'
                ? 'כל מידע תפעולי חיוני מאובטח באמצעות פרוטוקולי הצפנה מתקדמים ביותר, המגנים על הנתונים שלך ושומרים על שלמות הזיכרונות הוויזואליים שלך.'
                : 'Any necessary operational metadata is safeguarded with state-of-the-art encryption protocols, maintaining the pristine integrity of your visual memories.'}
            </p>
          </div>
        </section>

        {/* The EventTag Promise Banner */}
        <section className="mt-20 text-start">
          <div className="relative overflow-hidden rounded-xl bg-surface-container border border-surface-border p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 group">
            <div className="absolute inset-0 opacity-[0.03] transition-opacity duration-500 group-hover:opacity-[0.06] pointer-events-none" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBvM941sqL2AS2e5hBDirkvfoZSYzShFt18dbyEkoR9vv6S9nSfXsufShWHm7d4Z1a3GncQzRoad7MqNgewN3tUTfZbdL_CFRJDqADRgWvYkNecp9zxPrJwUnBiylre3xl0efc_3uvdFQAY1fm7JSk25YrVncWx9PbD-XUqbJE2BHzbgjT3x29eTHqhryxxU0yWkMjujqfjDqm01sTrjeKFDMEXTH74Ue6HPuUW7GYOIY_GcTm5Fli50g')" }}></div>
            <div className="flex-1 max-w-xl z-10 text-start">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-surface-container-high px-3 py-1 rounded-full border border-surface-border/50 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-copper-accent"></span>
                  <span className="font-label-sm text-[10px] text-copper-accent tracking-widest uppercase">
                    {language === 'he' ? 'ההתחייבות של EventTag' : 'The EventTag Promise'}
                  </span>
                </div>
              </div>
              <h2 className="font-display-lg text-2xl md:text-3xl text-on-background mb-4 m-0">
                {language === 'he' ? 'אירועים בלתי נשכחים, פרטיות מוחלטת.' : 'Elegant Celebrations, Absolute Privacy.'}
              </h2>
              <p className="font-body-md text-sm text-sage-muted leading-relaxed m-0 mt-2">
                {language === 'he'
                  ? 'אנו מאמינים שחוויות האירוע שלכם צריכות להישאר אישיות ומאובטחות. הארכיטקטורה שלנו תוכננה בקפידה כדי להבטיח שכל תמונת אירוע וכל רגע מרגש של האורחים שלכם יישארו פרטיים לחלוטין. תיהנו מהאלגנטיות של זיהוי מהיר ומתוחכם ללא דאגות אבטחה.'
                  : 'We believe your celebration memories deserve the highest standard of privacy. Our architecture is meticulously crafted to ensure that every event photo and guest moment remains entirely private. Enjoy the elegance of instant event curation without security worries.'}
              </p>
            </div>
            <div className="z-10 shrink-0">
              <div className="relative">
                <div className="absolute inset-0 bg-copper-accent/10 rounded-full blur-2xl -z-10"></div>
                <img 
                  className="w-48 h-48 md:w-56 md:h-56 object-cover rounded-full border-4 border-surface-container-high shadow-xl grayscale opacity-80 transition-all duration-500 group-hover:grayscale-0" 
                  alt="An elegant upscale event celebration background with glowing ambient warm lights and sophisticated guests." 
                  src="/luxury_event.jpg"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-surface-border/30 mt-auto bg-surface-container-lowest relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs md:text-sm text-sage-muted w-full">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-start">
            <span className="font-display-lg text-lg text-on-background tracking-tight">EventTag</span>
            <p className="m-0 font-body-md">© {new Date().getFullYear()} EventTag — {language === 'he' ? 'כל הזכויות שמורות' : 'All rights reserved'}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 font-label-sm uppercase tracking-wider text-[10px] md:text-xs">
            <Link to="/privacy-policy" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('legal.privacyTitle')}</Link>
            <span className="text-surface-border">•</span>
            <Link to="/terms" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('legal.termsTitle')}</Link>
            <span className="text-surface-border">•</span>
            <Link to="/accessibility" className="hover:text-copper-accent transition-colors cursor-pointer no-underline text-sage-muted font-bold">{t('a11y.accessibilityStatement')}</Link>
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
