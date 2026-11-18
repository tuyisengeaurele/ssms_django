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

/** Remember the root's HTML, but only when the build wrote a landing page there and this is a landing page address (/, /fr, /rw). */
export function rememberPrerendered(root: HTMLElement): void {
  html = root.hasAttribute('data-prerendered') && isLandingPath(window.location.pathname) ? root.innerHTML : null;
}

export function prerenderedHtml(): string | null {
  return html;
}

/** Call once the real page is on screen, so a later visit to the home address never shows a stale copy. */
export function forgetPrerendered(): void {
  html = null;
}
