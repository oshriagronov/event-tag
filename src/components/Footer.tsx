import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../services/translations';
import { useConsent } from '../contexts/ConsentContext';

export function Footer() {
  const { t, language } = useTranslation();
  const { reopen } = useConsent();
  const location = useLocation();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    if (location.pathname === '/' || location.pathname === '') {
      e.preventDefault();
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.pushState(null, '', `#${sectionId}`);
      }
    }
  };

  return (
    <footer className="bg-surface-container-lowest border-t border-surface-border/40 pt-16 pb-12 px-6 md:px-12 mt-auto relative z-10">
      <div className="max-w-7xl mx-auto w-full">
        {/* Massive Brand Title */}
        <div className="mb-12">
          <span className="font-display-lg text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-on-background tracking-tighter block select-none">
            EventTag
          </span>
        </div>

        {/* Middle Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 pb-12">
          {/* Tagline Column */}
          <div className="md:col-span-6 flex flex-col justify-start">
            <p className="text-sage-muted text-sm md:text-base leading-relaxed max-w-md m-0 font-body-md">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Navigation / Product Column */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <h4 className="font-bold text-on-background text-sm tracking-wide uppercase m-0 font-label-sm">
              {t('footer.productCol')}
            </h4>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5 text-xs md:text-sm text-sage-muted">
              <li>
                <a
                  href="/#how-it-works"
                  onClick={(e) => handleNavClick(e, 'how-it-works')}
                  className="hover:text-copper-accent transition-colors no-underline cursor-pointer font-body-md text-sage-muted block"
                >
                  {t('landing.howItWorksBtn')}
                </a>
              </li>
              <li>
                <a
                  href="/#faq"
                  onClick={(e) => handleNavClick(e, 'faq')}
                  className="hover:text-copper-accent transition-colors no-underline cursor-pointer font-body-md text-sage-muted block"
                >
                  {t('landing.faqNavBtn')}
                </a>
              </li>
              <li>
                <a
                  href="/#privacy"
                  onClick={(e) => handleNavClick(e, 'privacy')}
                  className="hover:text-copper-accent transition-colors no-underline cursor-pointer font-body-md text-sage-muted block"
                >
                  {t('landing.privacyTitle')}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Column */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <h4 className="font-bold text-on-background text-sm tracking-wide uppercase m-0 font-label-sm">
              {t('footer.legalCol')}
            </h4>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5 text-xs md:text-sm text-sage-muted">
              <li>
                <Link
                  to="/privacy-policy"
                  className="hover:text-copper-accent transition-colors no-underline cursor-pointer font-body-md text-sage-muted block"
                >
                  {t('legal.privacyTitle')}
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="hover:text-copper-accent transition-colors no-underline cursor-pointer font-body-md text-sage-muted block"
                >
                  {t('legal.termsTitle')}
                </Link>
              </li>
              <li>
                <Link
                  to="/accessibility"
                  className="hover:text-copper-accent transition-colors no-underline cursor-pointer font-body-md text-sage-muted block"
                >
                  {t('legal.accessibilityTitle')}
                </Link>
              </li>
              <li>
                <button
                  onClick={reopen}
                  className="hover:text-copper-accent transition-colors cursor-pointer bg-transparent border-none p-0 outline-none text-xs md:text-sm text-sage-muted font-body-md text-start block"
                >
                  {t('consent.managePreferences')}
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar Separator */}
        <div className="border-t border-surface-border/30 pt-8 flex items-center justify-between gap-4 text-xs text-sage-muted">
          <p className="m-0 font-body-sm">
            © {new Date().getFullYear()} EventTag.{' '}
            {language === 'he' ? 'כל הזכויות שמורות.' : 'All Rights Reserved.'}
          </p>
        </div>
      </div>
    </footer>
  );
}
