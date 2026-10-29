import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import DiseaseInfoCard from './DiseaseInfoCard';

const show = (result: string) => render(<LanguageProvider><DiseaseInfoCard result={result} /></LanguageProvider>);

beforeEach(() => localStorage.clear());

describe('Disease info card', () => {
  it('says in a sentence or two what grasserie is', () => {
    show('Grasserie');
    expect(screen.getByRole('heading', { name: 'What this may mean' })).toBeInTheDocument();
    expect(screen.getByText(/Grasserie is a virus disease/)).toBeInTheDocument();
  });

  it('gives the steps that apply to every disease', () => {
    show('Grasserie');
    const steps = screen.getByRole('list', { name: 'What you can do now' });
    expect(within(steps).getByText(/Take the sick worms out of the tray/)).toBeInTheDocument();
    expect(within(steps).getByText(/Wash your hands and tools/)).toBeInTheDocument();
    expect(within(steps).getByText(/Check the other trays and batches/)).toBeInTheDocument();
    expect(within(steps).getByText(/Ask your supervisor or a sericulture officer before using any disinfectant or medicine/)).toBeInTheDocument();
  });

  it('adds the steps that belong to grasserie', () => {
    show('Grasserie');
    const steps = screen.getByRole('list', { name: 'What you can do now' });
    expect(within(steps).getByText(/Feed only clean, good leaves/)).toBeInTheDocument();
  });

  it('says where the advice comes from and that it is not a diagnosis', () => {
    show('Grasserie');
    expect(screen.getByText(/Central Silk Board/)).toBeInTheDocument();
    expect(screen.getByText(/general advice, not a diagnosis/i)).toBeInTheDocument();
  });

  it('never names a product, a dose or a number to use', () => {
    const { container } = show('Grasserie');
    expect(container.textContent).not.toMatch(/\d+(\.\d+)?\s?(%|ml|g\b|kg|litre|liter)|formalin|bleach|chlorine|lime/i);
  });

  it.each(['Healthy', 'NotSilkworm', 'Uncertain', 'Flacherie', 'Muscardine', 'Pebrine', 'Something else', 'Class_7', ''])('shows nothing for "%s"', (result) => {
    const { container } = show(result);
    expect(container).toBeEmptyDOMElement();
  });
});
