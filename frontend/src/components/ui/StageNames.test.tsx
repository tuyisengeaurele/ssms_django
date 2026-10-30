import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import StageStepper from '../../pages/farmer/StageStepper';
import StageBadge from './StageBadge';

const show = (node: JSX.Element) => render(<LanguageProvider>{node}</LanguageProvider>);

beforeEach(() => localStorage.clear());

describe('stage names follow the language', () => {
  it('on a badge', () => {
    localStorage.setItem('ssms_locale', 'fr');
    show(<StageBadge stage="COCOON" />);
    expect(screen.getByText('Cocon')).toBeInTheDocument();
  });

  it('keeps an unknown stage as it came', () => {
    show(<StageBadge stage="MYSTERY" />);
    expect(screen.getByText('MYSTERY')).toBeInTheDocument();
  });

  it('on the stepper, and in the name of its button', () => {
    localStorage.setItem('ssms_locale', 'fr');
    show(<StageStepper current="LARVA" canAdvance busy={false} onAdvance={() => {}} />);
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('.stepper-label')?.textContent)).toEqual(['Œuf', 'Larve', 'Pupe', 'Cocon', 'Récolte']);
    expect(screen.getByRole('button', { name: /Pupe/ })).toBeInTheDocument();
  });

  it('in Kinyarwanda', () => {
    localStorage.setItem('ssms_locale', 'rw');
    show(<StageStepper current="EGG" canAdvance={false} busy={false} onAdvance={() => {}} />);
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('.stepper-label')?.textContent)).toEqual(['Igi', 'Larva', 'Pupa', 'Igishishwa', 'Isarura']);
  });
});
