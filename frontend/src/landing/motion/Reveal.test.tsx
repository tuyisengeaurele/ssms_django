import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';
import { Reveal } from './Reveal';

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;

let trigger: (visible: boolean) => void = () => {};

class FakeObserver {
  private cb: Callback;
  private el: Element | null = null;
  constructor(cb: Callback) {
    this.cb = cb;
    trigger = (visible) => {
      if (this.el) this.cb([{ isIntersecting: visible, target: this.el }]);
    };
  }
  observe(el: Element) {
    this.el = el;
  }
  unobserve() {}
  disconnect() {}
}

describe('Reveal', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('always renders its children', () => {
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('hides until it scrolls into view, then stays shown', () => {
    render(<Reveal>Hello</Reveal>);
    const el = screen.getByText('Hello');
    expect(el).toHaveClass('l-reveal');
    expect(el).not.toHaveClass('is-in');
    act(() => trigger(true));
    expect(el).toHaveClass('is-in');
    act(() => trigger(false));
    expect(el).toHaveClass('is-in');
  });

  it('stays plainly visible for people who prefer reduced motion', () => {
    setReducedMotion(true);
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText('Hello')).not.toHaveClass('l-reveal');
  });

  it('stays plainly visible when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText('Hello')).not.toHaveClass('l-reveal');
  });

  it('passes the delay and distance as CSS variables', () => {
    render(
      <Reveal delay={200} y={40}>
        Hello
      </Reveal>,
    );
    const el = screen.getByText('Hello');
    expect(el.style.getPropertyValue('--l-reveal-delay')).toBe('200ms');
    expect(el.style.getPropertyValue('--l-reveal-y')).toBe('40px');
  });
});

describe('Reveal on a prerendered page', () => {
  const rectOf = (top: number, height = 200) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => ({}) });

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not hide what is already on screen, so the first view does not blink', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectOf(100) as DOMRect);
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText('Hello')).not.toHaveClass('l-reveal');
  });

  it('still hides what is below the fold until it scrolls into view', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectOf(2000) as DOMRect);
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText('Hello')).toHaveClass('l-reveal');
  });

  it('renders on a server without a warning about layout effects', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(<Reveal>Hello</Reveal>);
    expect(html).toContain('Hello');
    expect(html).not.toMatch(/class="[^"]*l-reveal/);
    expect(spy).not.toHaveBeenCalled();
  });
});
