import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { continueEntrance, forgetPrerendered, rememberPrerendered } from './prerendered';

// The hero's entrance plays on the page the build wrote. A moment later React replaces that page with its own copy (first the
// copy it keeps as a loading state, then the real page). New elements start their animations from the beginning, so without
// care the entrance would play again, or jump to its end, in front of the visitor. continueEntrance puts each hero animation of
// the new elements at the time the first one had reached, so the entrance carries on instead.

interface FakeAnimation {
  animationName: string;
  currentTime: number | null;
}

const hero = (name = 'l-hero-up'): FakeAnimation => ({ animationName: name, currentTime: 0 });
const holder = (animations: FakeAnimation[]) => ({ getAnimations: vi.fn(() => animations) }) as unknown as Element;

function rootWith(prerendered: boolean): HTMLElement {
  const root = document.createElement('div');
  if (prerendered) root.setAttribute('data-prerendered', 'true');
  root.innerHTML = '<p>x</p>';
  return root;
}

let now = 0;
let paints: Array<{ name: string; startTime: number }> = [];

beforeEach(() => {
  forgetPrerendered();
  now = 540;
  paints = [{ name: 'first-contentful-paint', startTime: 300 }];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'getEntriesByName').mockImplementation(((name: string) => paints.filter((entry) => entry.name === name)) as typeof performance.getEntriesByName);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('continueEntrance', () => {
  it('sets each hero animation to the time since the page first showed', () => {
    rememberPrerendered(rootWith(true));
    const a = hero();
    const b = hero('l-hero-word');
    continueEntrance(holder([a, b]));
    expect(a.currentTime).toBe(240);
    expect(b.currentTime).toBe(240);
  });

  it('uses the first paint when there is no first contentful paint yet', () => {
    paints = [{ name: 'first-paint', startTime: 100 }];
    rememberPrerendered(rootWith(true));
    const a = hero();
    continueEntrance(holder([a]));
    expect(a.currentTime).toBe(440);
  });

  it('asks for the animations of everything inside the element', () => {
    rememberPrerendered(rootWith(true));
    const element = holder([]);
    continueEntrance(element);
    expect(element.getAnimations).toHaveBeenCalledWith({ subtree: true });
  });

  it('leaves other animations alone, such as a transition or something that is not the hero', () => {
    rememberPrerendered(rootWith(true));
    const other = { animationName: 'l-suggest-in', currentTime: 0 };
    const transition = { transitionProperty: 'opacity', currentTime: 0 };
    continueEntrance(holder([other, transition] as unknown as FakeAnimation[]));
    expect(other.currentTime).toBe(0);
    expect(transition.currentTime).toBe(0);
  });

  it('does nothing when the page did not start from the page the build wrote', () => {
    rememberPrerendered(rootWith(false));
    const a = hero();
    continueEntrance(holder([a]));
    expect(a.currentTime).toBe(0);
  });

  it('does nothing once the real page is on screen, so a later visit to the home page plays its entrance in full', () => {
    rememberPrerendered(rootWith(true));
    forgetPrerendered();
    const a = hero();
    continueEntrance(holder([a]));
    expect(a.currentTime).toBe(0);
  });

  it('does nothing without a paint to measure from', () => {
    paints = [];
    rememberPrerendered(rootWith(true));
    const a = hero();
    continueEntrance(holder([a]));
    expect(a.currentTime).toBe(0);
  });

  it('does nothing in a browser that cannot list animations, or without an element', () => {
    rememberPrerendered(rootWith(true));
    expect(() => continueEntrance(null)).not.toThrow();
    expect(() => continueEntrance({} as Element)).not.toThrow();
  });

  it('never throws, whatever the browser does with the animation', () => {
    rememberPrerendered(rootWith(true));
    const broken = hero();
    Object.defineProperty(broken, 'currentTime', {
      set() {
        throw new Error('not allowed');
      },
    });
    expect(() => continueEntrance(holder([broken]))).not.toThrow();
  });
});
