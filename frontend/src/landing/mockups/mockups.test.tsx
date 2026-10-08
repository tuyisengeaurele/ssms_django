import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { AlertsMock } from './AlertsMock';
import { DashboardMock } from './DashboardMock';
import { DiseaseMock } from './DiseaseMock';

const INTERACTIVE = 'a, button, input, select, textarea, [tabindex]';

function wrap(node: JSX.Element) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

describe('product mockups', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('dashboard mock is a labeled image with the sample badge and three batches', () => {
    const { container } = wrap(<DashboardMock />);
    expect(screen.getByRole('img', { name: /sample dashboard/i })).toBeInTheDocument();
    expect(screen.getByText('Sample')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-row]')).toHaveLength(3);
    expect(container.querySelectorAll(INTERACTIVE)).toHaveLength(0);
  });

  it('dashboard mock can show harvest records instead', () => {
    const { container } = wrap(<DashboardMock variant="harvest" />);
    expect(screen.getByRole('img', { name: /sample harvest records/i })).toBeInTheDocument();
    expect(screen.getByText('Harvest records')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-row]')).toHaveLength(3);
  });

  it('disease mock shows a result with confidence bars that add up to 100', () => {
    const { container } = wrap(<DiseaseMock />);
    expect(screen.getByRole('img', { name: /sample disease check/i })).toBeInTheDocument();
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-score]'));
    expect(bars).toHaveLength(5);
    const total = bars.reduce((sum, el) => sum + Number(el.dataset.score), 0);
    expect(total).toBe(100);
    expect(container.querySelectorAll(INTERACTIVE)).toHaveLength(0);
  });

  it('alerts mock lists three alerts', () => {
    const { container } = wrap(<AlertsMock />);
    expect(screen.getByRole('img', { name: /sample list of three alerts/i })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-row]')).toHaveLength(3);
    expect(container.querySelectorAll(INTERACTIVE)).toHaveLength(0);
  });

  it('follows the chosen language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    wrap(<AlertsMock />);
    expect(screen.getByText('Exemple')).toBeInTheDocument();
  });

  it('accepts a class name for layout', () => {
    const { container } = wrap(<DiseaseMock className="custom" />);
    expect(container.firstElementChild).toHaveClass('custom');
  });
});
