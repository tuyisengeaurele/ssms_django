import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import RecoveryCodes from './RecoveryCodes';

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF'];

const open = () => render(<LanguageProvider><RecoveryCodes codes={CODES} /></LanguageProvider>);

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('RecoveryCodes', () => {
  it('lists every code, one to a line, so none is missed', () => {
    open();
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(CODES);
  });

  it('copies all the codes, one to a line, and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CODES.join('\n')));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied'));
  });

  it('downloads the codes as a text file with a plain name', () => {
    const urls: Blob[] = [];
    // The test browser has neither, so both are made here.
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { urls.push(blob); return 'blob:codes'; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(name).toBe('ssms-recovery-codes.txt');
    expect(urls).toHaveLength(1);
    expect(urls[0].type).toBe('text/plain');
  });

  it('speaks French when the person chose French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
  });
});
