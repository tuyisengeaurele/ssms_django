// Runs before the app. A signed in person on dark gets the dark page from the first paint, so the cream page does not
// flash while the app loads. Public pages keep their own look, so they are skipped. src/utils/theme.ts does the rest.
(function () {
  try {
    var PUBLIC = ['/login', '/register', '/forgot-password', '/reset-password', '/check-email', '/verify-email', '/unauthorized', '/join', '/lot', '/privacy', '/terms'];
    var path = location.pathname;
    if (path === '/') return;
    for (var i = 0; i < PUBLIC.length; i++) {
      if (path === PUBLIC[i] || path.indexOf(PUBLIC[i] + '/') === 0) return;
    }
    if (!localStorage.getItem('ssms_session')) return;
    var choice = localStorage.getItem('ssms_theme');
    var dark = choice === 'dark' || (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {
    // Without it the app still sets the theme once it has loaded.
  }
})();
