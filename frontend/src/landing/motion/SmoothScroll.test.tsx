import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCoarsePointer, setReducedMotion } from '../../test/setup';

const created = vi.fn();
const destroyed = vi.fn();

vi.mock('lenis', () => ({
  default: class FakeLenis {
    constructor() {
      created();
    }
    raf() {}
    destroy() {
      destroyed();
    }
  },
}));

import { SmoothScroll } from './SmoothScroll';

describe('SmoothScroll', () => {
  beforeEach(() => {
    created.mockClear();
    destroyed.mockClear();
  });

  it('renders its children', () => {
    render(<SmoothScroll>content</SmoothScroll>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('starts smooth scrolling on a desktop pointer and cleans up', () => {
    const { unmount } = render(<SmoothScroll>content</SmoothScroll>);
    expect(created).toHaveBeenCalledTimes(1);
    unmount();
    expect(destroyed).toHaveBeenCalledTimes(1);
  });

  it('does nothing on touch devices', () => {
    setCoarsePointer(true);
    render(<SmoothScroll>content</SmoothScroll>);
    expect(created).not.toHaveBeenCalled();
  });

  it('does nothing when the user prefers reduced motion', () => {
    setReducedMotion(true);
    render(<SmoothScroll>content</SmoothScroll>);
    expect(created).not.toHaveBeenCalled();
  });
});
