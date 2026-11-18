import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from './LanguageContext';

// `tn` picks the singular or the other text for a count, in the language on screen, with the count filled in.

const wrapper = ({ children }: { children: React.ReactNode }) => <LanguageProvider initialLocale="en">{children}</LanguageProvider>;
const language = () => renderHook(() => useLanguage(), { wrapper }).result;

beforeEach(() => localStorage.clear());

describe('tn', () => {
  it('says one record and many records in English', () => {
    const { current } = language();
    expect(current.tn(1, 'hpCountOne', 'hpCount')).toBe('1 record');
    expect(current.tn(4, 'hpCountOne', 'hpCount')).toBe('4 records');
    expect(current.tn(0, 'hpCountOne', 'hpCount')).toBe('0 records');
  });

  it('follows the language when it changes, and uses French singular for zero where the text can show the count', () => {
    const result = language();
    act(() => {
      void result.current.setLocale('fr');
    });
    expect(result.current.tn(0, 'hpCountOne', 'hpCount')).toBe('0 relevé');
    expect(result.current.tn(1, 'hpCountOne', 'hpCount')).toBe('1 relevé');
    expect(result.current.tn(2, 'hpCountOne', 'hpCount')).toBe('2 relevés');
  });

  it('uses the singular for zero in French when the singular text shows the count', () => {
    const result = language();
    act(() => {
      void result.current.setLocale('fr');
    });
    expect(result.current.tn(0, 'lotDayOne', 'lotDays')).toBe('0 jour');
    expect(result.current.tn(1, 'lotDayOne', 'lotDays')).toBe('1 jour');
    expect(result.current.tn(3, 'lotDayOne', 'lotDays')).toBe('3 jours');
  });

  it('keeps the plural for zero in French when the singular text has no number to show', () => {
    const result = language();
    act(() => {
      void result.current.setLocale('fr');
    });
    // "Afficher la ferme" is for the one farm there is. For 0 the plural sentence is used, as before.
    expect(result.current.tn(0, 'fkShowOne', 'fkShowAll')).toBe('Afficher les 0 fermes');
    expect(result.current.tn(1, 'fkShowOne', 'fkShowAll')).toBe('Afficher la ferme');
  });

  it('is Kinyarwanda one for 1 only', () => {
    const result = language();
    act(() => {
      void result.current.setLocale('rw');
    });
    expect(result.current.tn(1, 'hpCountOne', 'hpCount')).toBe('Inyandiko 1');
    expect(result.current.tn(0, 'hpCountOne', 'hpCount')).toBe('Inyandiko 0');
  });

  it('writes the count the way the caller formats it', () => {
    const { current } = language();
    expect(current.tn(1200, 'hpCountOne', 'hpCount', { n: '1,200' })).toBe('1,200 records');
  });
});
