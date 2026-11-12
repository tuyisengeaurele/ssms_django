import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { resetWarmUp } from '../services/warmUp';
import { Cta } from './Cta';
import { Hero } from './Hero';

// The two big "Create your account" buttons are where most visitors decide. Reaching one starts waking a sleeping API.

const healthCalls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).endsWith('/health'));

beforeEach(() => {
  localStorage.clear();
  resetWarmUp();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => vi.unstubAllGlobals());

const inApp = (node: JSX.Element) => render(<MemoryRouter><LanguageProvider>{node}</LanguageProvider></MemoryRouter>);

describe('The create account buttons', () => {
  it('on the hero start the wake when a pointer reaches them', () => {
    inApp(<Hero />);
    expect(healthCalls()).toHaveLength(0);
    fireEvent.pointerEnter(screen.getAllByRole('link', { name: /Create your account/ })[0]);
    expect(healthCalls()).toHaveLength(1);
  });

  it('at the bottom of the page start the wake when a finger touches them', () => {
    inApp(<Cta />);
    fireEvent.touchStart(screen.getByRole('link', { name: /Create your account/ }));
    expect(healthCalls()).toHaveLength(1);
  });
});
