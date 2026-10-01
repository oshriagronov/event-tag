// Applies saved theme, language and accessibility preferences before first paint.
(function(){
  try {
    var savedTheme = localStorage.getItem('event-tag-theme');
    if (!savedTheme) {
      savedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.classList.add('theme-' + savedTheme);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
    
    var savedLang = localStorage.getItem('event-tag-lang');
    if (!savedLang || !['he', 'en'].includes(savedLang)) {
      savedLang = 'he';
    }
    document.documentElement.lang = savedLang;
    document.documentElement.dir = savedLang === 'he' ? 'rtl' : 'ltr';

    var raw = localStorage.getItem('site_a11y_prefs_v1');
    if (!raw) return;
    var p = JSON.parse(raw);
    if (!p || p.version !== 1) return;
    var c = document.documentElement.classList;
    c.toggle('a11y-links', !!p.links);
    c.toggle('a11y-contrast-high', p.contrast === 'high');
    c.toggle('a11y-contrast-invert', p.contrast === 'invert');
    c.toggle('a11y-contrast-mono', p.contrast === 'mono');
    c.toggle('a11y-text-100', p.textSize === 100);
    c.toggle('a11y-text-115', p.textSize === 115);
    c.toggle('a11y-text-130', p.textSize === 130);
    c.toggle('a11y-text-150', p.textSize === 150);
    c.toggle('a11y-lines-16', p.lineSpacing === '1.6');
    c.toggle('a11y-lines-20', p.lineSpacing === '2.0');
    c.toggle('a11y-readable-font', !!p.readableFont);
    c.toggle('a11y-headings', !!p.headings);
    c.toggle('a11y-large-cursor', !!p.largeCursor);
    c.toggle('a11y-stop-anim', !!p.stopAnim);
  } catch(e) {}
})();
