import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetPrerendered, prerenderedHtml, rememberPrerendered } from './prerendered';

// The build writes the landing page into the home page, so it is on screen before any script has run. When React starts, its
// loading state for the landing page must be that same picture, or the page would go blank for the moment the landing code
// takes to arrive. This remembers the HTML that was already on screen so React can show it as that loading state.

function rootWith(html: string, prerendered: boolean): HTMLElement {
  const root = document.createElement('div');
  root.id = 'root';
  if (prerendered) root.setAttribute('data-prerendered', 'true');
  root.innerHTML = html;
  return root;
}

beforeEach(() => forgetPrerendered());
afterEach(() => window.history.pushState({}, '', '/'));

describe('the prerendered landing page', () => {
  it('is remembered from the root of the home page', () => {
    rememberPrerendered(rootWith('<h1>Raise healthier silkworms.</h1>', true));
    expect(prerenderedHtml()).toBe('<h1>Raise healthier silkworms.</h1>');
  });

  it('is not remembered when the build did not write one', () => {
    rememberPrerendered(rootWith('<h1>x</h1>', false));
    expect(prerenderedHtml()).toBeNull();
  });

  it('is not remembered on any other address, whatever the root holds', () => {
    window.history.pushState({}, '', '/login');
    rememberPrerendered(rootWith('<h1>x</h1>', true));
    expect(prerenderedHtml()).toBeNull();
  });

  it('is forgotten once the real page is on screen, so it never comes back stale', () => {
    rememberPrerendered(rootWith('<h1>x</h1>', true));
    forgetPrerendered();
    expect(prerenderedHtml()).toBeNull();
  });

  it('is empty by default', () => {
    expect(prerenderedHtml()).toBeNull();
  });
});
