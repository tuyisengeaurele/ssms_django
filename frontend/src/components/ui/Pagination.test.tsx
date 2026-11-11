import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import Pagination from './Pagination';

const meta = (over: object = {}) => ({ page: 1, pageSize: 20, totalItems: 45, totalPages: 3, hasNext: true, hasPrev: false, ...over });
const open = (m = meta(), onPage = vi.fn()) => {
  render(<LanguageProvider><Pagination meta={m} onPage={onPage} /></LanguageProvider>);
  return onPage;
};

beforeEach(() => localStorage.clear());

describe('Pagination', () => {
  it('says which rows are shown, in English', () => {
    open();
    expect(screen.getByRole('navigation', { name: 'Pages' })).toHaveTextContent('Showing 1 to 20 of 45');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
  });

  it('keeps the numbers in bold so the range and the total stand out', () => {
    open();
    expect(Array.from(document.querySelectorAll('.pager-count strong')).map((n) => n.textContent)).toEqual(['1 to 20', '45']);
  });

  it('says it in French, with its labels', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByRole('navigation', { name: 'Pages' })).toHaveTextContent('Affichage de 1 à 20 sur 45');
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
  });

  it('says it in Kinyarwanda, with its labels', () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(screen.getByRole('navigation', { name: 'Impapuro' })).toHaveTextContent('Herekanywe 1 kugeza 20 muri 45');
    expect(screen.getByRole('button', { name: 'Urupapuro rukurikira' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Urupapuro rwabanje' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Urupapuro 2' })).toBeInTheDocument();
  });

  it('goes to the page that was pressed, and to the next one', () => {
    const onPage = open(meta({ page: 2, hasPrev: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPage).toHaveBeenLastCalledWith(1);
  });

  it('draws nothing for a single page', () => {
    open(meta({ totalPages: 1, totalItems: 5, hasNext: false }));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
