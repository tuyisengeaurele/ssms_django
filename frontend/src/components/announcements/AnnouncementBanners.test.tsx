import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { Locale } from '../../i18n/locales';
import type { Announcement, AnnouncementKind } from '../../types';
import AnnouncementBanners from './AnnouncementBanners';

const one = (id: number, kind: AnnouncementKind = 'information', text: Partial<Announcement['text']> = {}): Announcement => ({
  id, kind, version: 1, text: { en: `Notice ${id}`, fr: '', rw: '', ...text }, showUntil: '2027-01-01T00:00:00+00:00',
});

const open = (props: { items: Announcement[]; onClose?: (item: Announcement) => void; locale?: Locale }, screenLocale: Locale = 'en') =>
  render(<LanguageProvider initialLocale={screenLocale}><AnnouncementBanners {...props} /></LanguageProvider>);

beforeEach(() => localStorage.clear());

describe('The announcement banner', () => {
  it('draws nothing when there is nothing to say', () => {
    open({ items: [] });
    expect(screen.queryByRole('region', { name: 'Announcements' })).not.toBeInTheDocument();
  });

  it('is a named region that tells a screen reader when something arrives', () => {
    open({ items: [one(1)] });
    expect(screen.getByRole('region', { name: 'Announcements' })).toHaveAttribute('aria-live', 'polite');
  });

  it.each([
    ['information', 'Information'], ['maintenance', 'Maintenance'], ['urgent', 'Urgent'],
  ] as const)('says the type in words and with an icon, not by colour alone: %s', (kind, word) => {
    open({ items: [one(1, kind)] });
    const item = screen.getByText('Notice 1').closest('li')!;
    expect(within(item).getByText(word)).toBeInTheDocument();
    expect(item).toHaveClass(`announcement--${kind}`);
    expect(item.querySelector('svg.announcement-icon')).not.toBeNull();
  });

  it('draws a different icon for each type', () => {
    open({ items: [one(1, 'information'), one(2, 'maintenance'), one(3, 'urgent')] });
    const drawings = [...document.querySelectorAll('svg.announcement-icon')].map((svg) => svg.innerHTML);
    expect(new Set(drawings).size).toBe(3);
  });

  it('keeps the order it was given', () => {
    open({ items: [one(2, 'urgent'), one(1)] });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Notice 2'), expect.stringContaining('Notice 1'),
    ]);
  });

  it('shows markup as the words that were typed', () => {
    open({ items: [one(1, 'information', { en: '<img src=x onerror=alert(1)> <b>Save</b>' })] });
    expect(screen.getByText('<img src=x onerror=alert(1)> <b>Save</b>')).toBeInTheDocument();
    expect(document.querySelector('img, b')).toBeNull();
  });

  it('writes the screen language when there is one', async () => {
    open({ items: [one(1, 'maintenance', { fr: 'Entretien samedi.' })] }, 'fr');
    const text = await screen.findByText('Entretien samedi.');
    expect(text).toHaveAttribute('lang', 'fr');
    expect(await screen.findByRole('region', { name: 'Annonces' })).toBeInTheDocument();
    expect(await screen.findByText('Maintenance')).toBeInTheDocument();
  });

  it('writes English, and says it is English, when the language is missing', async () => {
    open({ items: [one(1, 'information', { fr: 'Rien pour le kinyarwanda.' })] }, 'rw');
    expect(await screen.findByRole('region', { name: 'Amatangazo ya SSMS' })).toBeInTheDocument();
    expect(screen.getByText('Notice 1')).toHaveAttribute('lang', 'en');
  });

  // The admin's form shows how each language will look, whatever language the admin is reading.
  it('can be drawn in a language other than the screen language', async () => {
    open({ items: [one(1, 'urgent', { rw: 'Ni ngombwa.' })], locale: 'rw' });
    expect(await screen.findByText('Byihutirwa')).toBeInTheDocument();
    expect(screen.getByText('Ni ngombwa.')).toHaveAttribute('lang', 'rw');
    expect(screen.getByRole('region', { name: 'Amatangazo ya SSMS' })).toHaveAttribute('lang', 'rw');
  });

  it('names the close button in the language on screen', async () => {
    open({ items: [one(1)], onClose: vi.fn() }, 'fr');
    expect(await screen.findByRole('button', { name: "Fermer l'annonce" })).toBeInTheDocument();
  });

  it.each(['information', 'maintenance'] as const)('lets %s be closed', (kind) => {
    const onClose = vi.fn();
    const item = one(1, kind);
    open({ items: [item], onClose });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close announcement' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(item);
  });

  it('gives an urgent one no way to be closed', () => {
    open({ items: [one(1, 'urgent')], onClose: vi.fn() });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells apart two close buttons by the words they close', () => {
    open({ items: [one(1), one(2)], onClose: vi.fn() });
    const [first, second] = screen.getAllByRole('button', { name: 'Close announcement' });
    expect(first).toHaveAccessibleDescription('Notice 1');
    expect(second).toHaveAccessibleDescription('Notice 2');
  });

  it('draws no close button when there is nothing for it to do, as in the preview', () => {
    open({ items: [one(1)] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
