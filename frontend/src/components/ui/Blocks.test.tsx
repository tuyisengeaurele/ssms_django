import { act, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountUp } from '../../hooks/useCountUp';
import { setReducedMotion } from '../../test/setup';
import Avatar, { initialsOf } from './Avatar';
import EmptyState from './EmptyState';
import PageHeader from './PageHeader';
import Panel from './Panel';
import StatTile from './StatTile';

describe('useCountUp', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }));
  afterEach(() => vi.useRealTimers());

  it('counts up to the number', () => {
    const { result } = renderHook(() => useCountUp(12, 600));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBe(12);
  });

  it('shows the number at once when motion is reduced', () => {
    setReducedMotion(true);
    const { result } = renderHook(() => useCountUp(12));
    expect(result.current).toBe(12);
  });

  it('never shows a stale number when the target changes under reduced motion', () => {
    setReducedMotion(true);
    const seen: number[] = [];
    const { rerender } = renderHook(({ target }) => {
      const value = useCountUp(target);
      seen.push(value);
      return value;
    }, { initialProps: { target: 0 } });
    seen.length = 0;
    rerender({ target: 7 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((v) => v === 7)).toBe(true);
  });

  it('stays at zero for zero', () => {
    const { result } = renderHook(() => useCountUp(0));
    expect(result.current).toBe(0);
  });
});

describe('StatTile', () => {
  it('shows the label, the number and a hint', () => {
    setReducedMotion(true);
    render(<StatTile label="Total farms" value={6} hint="6 registered" />);
    expect(screen.getByText('Total farms')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('6 registered')).toBeInTheDocument();
  });

  it('shows words as they are', () => {
    render(<StatTile label="System status" value="Online" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('draws a plain line icon with no coloured tile', () => {
    const { container } = render(<StatTile label="Users" value={9} icon="users" />);
    const icon = container.querySelector('.stat-tile-icon svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[style*="gradient"], .stat-card-icon, .stat-card-glow')).toBeNull();
  });
});

describe('PageHeader', () => {
  it('has one level one heading with a subtitle and actions', () => {
    render(<PageHeader title="Users" subtitle="Create accounts and manage access" actions={<button>Add</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText('Create accounts and manage access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('works without a subtitle or actions', () => {
    render(<PageHeader title="Alerts" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Alerts' })).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('names its content with a level two heading', () => {
    render(
      <Panel title="Farm registry" note="Six farms" actions={<button>Add farm</button>}>
        <p>body</p>
      </Panel>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Farm registry' })).toBeInTheDocument();
    expect(screen.getByText('Six farms')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add farm' })).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('can hold a table edge to edge', () => {
    const { container } = render(<Panel title="Users" flush><table /></Panel>);
    expect(container.querySelector('.panel-body')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('says what is missing and offers a next step', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No farms yet" description="Add the first farm to begin." action={{ label: 'Add a farm', to: '/farms/new' }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'No farms yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a farm' })).toHaveAttribute('href', '/farms/new');
  });

  it('runs a button action', () => {
    const onClick = vi.fn();
    render(<EmptyState title="Nothing here" action={{ label: 'Try again', onClick }} />);
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Avatar', () => {
  it('takes the first letters of the first two names', () => {
    expect(initialsOf('Auris Tuyisenge')).toBe('AT');
    expect(initialsOf('eurelie')).toBe('E');
    expect(initialsOf('  Mugisha   Serge Pierre ')).toBe('MS');
    expect(initialsOf('')).toBe('?');
  });

  it('is decoration, the name is written next to it', () => {
    const { container } = render(<Avatar name="Bruce Ishimwe" />);
    expect(container.querySelector('.row-avatar')).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('BI');
  });
});
