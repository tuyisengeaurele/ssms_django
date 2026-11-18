import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPrerendered, rememberPrerendered } from '../utils/prerendered';

const carried = vi.hoisted(() => ({ calls: [] as Array<Element | null> }));
vi.mock('../utils/prerendered', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/prerendered')>()),
  continueEntrance: (element: Element | null) => void carried.calls.push(element),
}));
import RouteFallback from './RouteFallback';

// What the app shows while the code of a page is arriving. On the home address, when the build already wrote the landing page,
// that is the same picture, so nothing changes on screen when the real page takes over.

function remember(html: string) {
  const root = document.createElement('div');
  root.setAttribute('data-prerendered', 'true');
  root.innerHTML = html;
  rememberPrerendered(root);
}

beforeEach(() => {
  forgetPrerendered();
  carried.calls.length = 0;
});
afterEach(() => window.history.pushState({}, '', '/'));

describe('RouteFallback', () => {
  it('carries the hero entrance on in its copy, so it does not start over', () => {
    remember('<p>Raise healthier silkworms.</p>');
    const { container } = render(<RouteFallback />);
    expect(carried.calls).toEqual([container.firstElementChild]);
  });

  it('has no entrance to carry on when it shows a plain page', () => {
    render(<RouteFallback />);
    expect(carried.calls).toEqual([]);
  });

  it('shows the landing page that was already on screen, on the home address', () => {
    remember('<p>Raise healthier silkworms.</p>');
    render(<RouteFallback />);
    expect(screen.getByText('Raise healthier silkworms.')).toBeInTheDocument();
  });

  it.each(['/fr', '/rw'])('shows it on the language pages too, %s', (path) => {
    window.history.pushState({}, '', path);
    remember('<p>Élevez des vers à soie.</p>');
    render(<RouteFallback />);
    expect(screen.getByText('Élevez des vers à soie.')).toBeInTheDocument();
  });

  it('keeps the links of that page real, so a click before the app is ready still goes somewhere', () => {
    remember('<a href="/login">Log in</a>');
    render(<RouteFallback />);
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('shows a plain page of the app colour when nothing was prerendered', () => {
    const { container } = render(<RouteFallback />);
    expect(container.firstElementChild).toBeEmptyDOMElement();
    expect(container.firstElementChild).toHaveStyle({ background: '#F6F3EC' });
  });

  it('does not show the landing page while another address is loading', () => {
    remember('<p>Raise healthier silkworms.</p>');
    window.history.pushState({}, '', '/farmer');
    render(<RouteFallback />);
    expect(screen.queryByText('Raise healthier silkworms.')).not.toBeInTheDocument();
  });
});
