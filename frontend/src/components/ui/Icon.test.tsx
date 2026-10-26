import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon } from './Icon';

describe('Icon', () => {
  it('draws every icon as an svg that screen readers skip', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
      unmount();
    }
  });

  it('uses one stroke weight and size unless told otherwise', () => {
    const { container } = render(<Icon name="users" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '18');
    expect(svg).toHaveAttribute('height', '18');
    expect(svg).toHaveAttribute('stroke-width', '1.6');
  });

  it('accepts a size and a class', () => {
    const { container } = render(<Icon name="alerts" size={22} className="x" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '22');
    expect(svg).toHaveClass('x');
  });

  it('covers every part of the admin menu', () => {
    for (const name of ['dashboard', 'adminDashboard', 'users', 'cooperatives', 'farms', 'batches', 'harvests', 'overview',
      'detections', 'devices', 'messages', 'audit', 'systemReport', 'alerts', 'profile', 'logout']) {
      expect(ICON_NAMES, name).toContain(name);
    }
  });
});
