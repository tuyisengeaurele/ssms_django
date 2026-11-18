/**
 * The landing page that the build wrote into the home page, kept so React can show it while its own code is arriving.
 *
 * The page is on screen before any script runs. If React then started with a blank loading state, the picture would go blank
 * for as long as the landing code takes to load. Showing the HTML that was already there as the loading state keeps the screen
 * unchanged, and the real page replaces it without a visible difference. Its links are plain anchors, so a click in that moment
 * still works.
 */
import { isLandingPath } from '../i18n/landingAddress';

let html: string | null = null;
// True from the moment a page the build wrote is on screen until the real page has replaced it.
let started = false;

/** Remember the root's HTML, but only when the build wrote a landing page there and this is a landing page address (/, /fr, /rw). */
export function rememberPrerendered(root: HTMLElement): void {
  html = root.hasAttribute('data-prerendered') && isLandingPath(window.location.pathname) ? root.innerHTML : null;
  started = html !== null;
}

export function prerenderedHtml(): string | null {
  return html;
}

/** Call once the real page is on screen, so a later visit to the home address never shows a stale copy. */
export function forgetPrerendered(): void {
  html = null;
  started = false;
}

/**
 * The hero's entrance plays on the page the build wrote. React then replaces that page, first with the copy kept above and then
 * with the real page, and every new element starts its animation from the beginning. Called with the new elements, this sets
 * each hero animation to the time the first page had reached, so the entrance carries on in place. It does nothing for a visit
 * that did not start from the page the build wrote, which plays its entrance in full. It never throws: at worst the entrance
 * plays again.
 */
export function continueEntrance(element: Element | null): void {
  if (!started || !element || typeof element.getAnimations !== 'function') return;
  try {
    const paint = performance.getEntriesByName('first-contentful-paint')[0] ?? performance.getEntriesByName('first-paint')[0];
    if (!paint) return;
    const elapsed = performance.now() - paint.startTime;
    for (const animation of element.getAnimations({ subtree: true })) {
      if ('animationName' in animation && String(animation.animationName).startsWith('l-hero-')) animation.currentTime = elapsed;
    }
  } catch {
    // Keep the page as it is.
  }
}
