import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../services/translations';
import { Footer } from './Footer';
import { Shield, Monitor, EyeOff, KeyRound } from 'lucide-react';

export function PrivacyPage() {
  const { user, signIn } = useAuth();
  const { t, isRtl, language } = useTranslation();

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
                className="bg-deep-forest text-surface-container-lowest font-label-sm text-xs font-bold uppercase tracking-wider px-4 sm:px-5 py-2 rounded hover:bg-primary transition-all shadow-sm cursor-pointer border-none flex items-center gap-2"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>{t('landing.signInGoogle')}</span>
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
      <Footer />
    </div>
  );
}
