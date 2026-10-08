import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { DiseaseCard } from './DiseaseCard';
import { HarvestCard } from './HarvestCard';
import { NewBatchCard } from './NewBatchCard';
import { ReadingsCard } from './ReadingsCard';
import { ReportCard } from './ReportCard';

const INTERACTIVE = 'a, button, input, select, textarea, [tabindex]';

function wrap(node: JSX.Element) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

describe('paper cards', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('report card reads like a printed batch report', () => {
    const { container } = wrap(<ReportCard />);
    const card = screen.getByRole('img', { name: /illustration of a batch report/i });
    expect(within(card).getByText('Gasabo Silk Farm')).toBeInTheDocument();
    expect(within(card).getByText('B-0004')).toBeInTheDocument();
    expect(within(card).getByText('Larva')).toBeInTheDocument();
    expect(within(card).getByText('24.6 °C')).toBeInTheDocument();
    expect(within(card).getByText('78 %')).toBeInTheDocument();
    expect(within(card).getByText('Within range')).toBeInTheDocument();
    expect(within(card).getByText('12 days')).toBeInTheDocument();
    expect(container.querySelectorAll(INTERACTIVE)).toHaveLength(0);
  });

  it('has no window chrome, sample badge or dot counters', () => {
    const { container } = wrap(
      <>
        <ReportCard />
        <DiseaseCard />
        <NewBatchCard />
        <ReadingsCard />
        <HarvestCard />
      </>,
    );
    expect(container.textContent).not.toMatch(/sample/i);
    expect(container.querySelector('.l-mock__dots, .l-mock__badge')).toBeNull();
  });

  it('disease card names the result and its confidence bars add up to 100', () => {
    const { container } = wrap(<DiseaseCard />);
    const card = screen.getByRole('img', { name: /illustration of a disease check result/i });
    expect(within(card).getByText('Healthy', { selector: 'strong' })).toBeInTheDocument();
    expect(within(card).getByText(/Confidence/)).toHaveTextContent('96 %');
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-score]'));
    expect(bars).toHaveLength(5);
    expect(bars.reduce((sum, el) => sum + Number(el.dataset.score), 0)).toBe(100);
  });

  it('new batch card shows a form that is not interactive', () => {
    const { container } = wrap(<NewBatchCard />);
    const card = screen.getByRole('img', { name: /illustration of the new batch form/i });
    expect(within(card).getByText('Gasabo Silk Farm')).toBeInTheDocument();
    expect(within(card).getByText('Create batch')).toBeInTheDocument();
    expect(container.querySelectorAll(INTERACTIVE)).toHaveLength(0);
  });

  it('readings card shows the numbers and a 24 hour line', () => {
    const { container } = wrap(<ReadingsCard />);
    const card = screen.getByRole('img', { name: /illustration of room readings/i });
    expect(within(card).getByText('24.6')).toBeInTheDocument();
    expect(within(card).getByText('Last 24 hours')).toBeInTheDocument();
    expect(container.querySelector('svg path')).not.toBeNull();
  });

  it('harvest card totals its rows', () => {
    wrap(<HarvestCard />);
    const card = screen.getByRole('img', { name: /illustration of harvest records/i });
    expect(within(card).getAllByText(/^Batch [ABC]$/)).toHaveLength(3);
    expect(within(card).getByText('107.9 kg')).toBeInTheDocument();
  });

  it('follows the chosen language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    wrap(<ReportCard />);
    expect(screen.getByText('Dans la plage')).toBeInTheDocument();
    expect(screen.getByText('12 jours')).toBeInTheDocument();
  });

  it('accepts a class name for layout', () => {
    const { container } = wrap(<HarvestCard className="custom" />);
    expect(container.firstElementChild).toHaveClass('custom');
  });
});
