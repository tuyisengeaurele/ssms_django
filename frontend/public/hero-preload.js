// The landing page is the most common first visit. Start its hero photo early.
if (location.pathname === '/') {
  var l = document.createElement('link');
  l.rel = 'preload';
  l.as = 'image';
  l.type = 'image/avif';
  l.setAttribute('imagesrcset', '/images/hero-bg-640.avif 640w, /images/hero-bg-1280.avif 1280w, /images/hero-bg-1920.avif 1920w, /images/hero-bg-2560.avif 2560w');
  l.setAttribute('imagesizes', '(min-width: 1400px) 1360px, 100vw');
  l.setAttribute('fetchpriority', 'high');
  document.head.appendChild(l);
}
