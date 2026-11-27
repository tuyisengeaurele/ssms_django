import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import type { AdminAnnouncement } from '../../types';

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('../../services/announcement.service', () => ({ announcementService: api }));

import AnnouncementDialog from './AnnouncementDialog';

const stored: AdminAnnouncement = {
  id: 7, kind: 'urgent', version: 1, text: { en: 'Save your work.', fr: 'Enregistrez.', rw: '' }, showPublic: true,
  showFrom: '2026-12-05T20:00:42+00:00', showUntil: '2026-12-06T20:00:42+00:00', endedAt: null, status: 'scheduled',
  createdBy: { id: 'a1', name: 'Aline Admin' },
};

const onSaved = vi.fn();
const onClose = vi.fn();
const onEndedAlready = vi.fn();

function open(announcement: AdminAnnouncement | null = null) {
  render(
    <LanguageProvider>
      <AnnouncementDialog announcement={announcement} onSaved={onSaved} onEndedAlready={onEndedAlready} onClose={onClose} />
    </LanguageProvider>,
  );
}

const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const english = () => field('Text (English)');
const type = (box: HTMLElement, value: string) => { fireEvent.change(box, { target: { value } }); };
const save = () => screen.getByRole('button', { name: 'Save' });
const press = async () => { await act(async () => { fireEvent.click(save()); }); };
const preview = () => screen.getByRole('group', { name: 'Preview' });

function refused(status: number, code: string, errors?: Record<string, string[]>) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { code, message: 'No.', errors }, headers: {} } as never);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T08:15:30Z'));
  vi.clearAllMocks();
  localStorage.clear();
  setReducedMotion(true);
  api.create.mockResolvedValue({ data: { data: stored } });
  api.update.mockResolvedValue({ data: { data: stored } });
});

afterEach(() => vi.useRealTimers());

describe('Writing a new announcement', () => {
  it('starts now and runs for a day, in Kigali time, and says so', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'New announcement' })).toBeInTheDocument();
    expect(field('Type').value).toBe('information');
    expect(field('Show from').value).toBe('2026-11-27T10:15');
    expect(field('Show until').value).toBe('2026-11-28T10:15');
    expect(field('Show from')).toHaveAccessibleDescription('Kigali time');
    expect(field('Also show to visitors, including on the sign in page').checked).toBe(false);
  });

  it('cannot be saved without English words', () => {
    open();
    expect(save()).toBeDisabled();
    type(english(), '   ');
    type(field('Text (French, optional)'), 'Bonjour');
    expect(save()).toBeDisabled();
    type(english(), 'Off on Saturday.');
    expect(save()).toBeEnabled();
  });

  it.each(['2026-11-27T10:15', '2026-11-27T09:00', ''])('cannot be saved when the end (%s) is not after the start', (end) => {
    open();
    type(english(), 'Off on Saturday.');
    type(field('Show until'), end);
    expect(save()).toBeDisabled();
    if (end) expect(field('Show until')).toHaveAccessibleDescription(/The end must come after the start\./);
  });

  it('counts each text down from 200 and lets no more be typed', () => {
    open();
    for (const name of ['Text (English)', 'Text (French, optional)', 'Text (Kinyarwanda, optional)']) {
      expect(field(name)).toHaveAttribute('maxlength', '200');
      expect(field(name)).toHaveAccessibleDescription('200 left');
    }
    type(english(), 'x'.repeat(150));
    expect(english()).toHaveAccessibleDescription('50 left');
  });

  it('sends what was typed as Kigali time, in the words the server knows', async () => {
    open();
    type(field('Type'), 'maintenance');
    type(english(), '  SSMS is off\non   Saturday. ');
    type(field('Text (Kinyarwanda, optional)'), 'Ku wa gatandatu.');
    type(field('Show from'), '2026-12-05T22:00');
    type(field('Show until'), '2026-12-05T23:30');
    fireEvent.click(field('Also show to visitors, including on the sign in page'));
    await press();
    expect(api.create).toHaveBeenCalledWith({
      kind: 'maintenance', textEn: 'SSMS is off on Saturday.', textFr: '', textRw: 'Ku wa gatandatu.', showPublic: true,
      showFrom: '2026-12-05T22:00:00+02:00', showUntil: '2026-12-05T23:30:00+02:00',
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe('The preview', () => {
  it('draws the banner as people will see it, in the language picked', async () => {
    open();
    expect(within(preview()).queryByRole('region')).not.toBeInTheDocument();
    type(english(), 'Off  on Saturday.');
    type(field('Text (French, optional)'), 'Fermé samedi.');
    type(field('Type'), 'maintenance');
    const region = within(preview()).getByRole('region', { name: 'Announcements' });
    expect(region).toHaveTextContent('Maintenance');
    expect(region).toHaveTextContent('Off on Saturday.');
    // It changes with every letter typed, so a screen reader is not told each time.
    expect(region).not.toHaveAttribute('aria-live');
    expect(within(preview()).queryByRole('button', { name: 'Close announcement' })).not.toBeInTheDocument();

    const french = within(preview()).getByRole('button', { name: 'Français' });
    expect(french).toHaveAttribute('aria-pressed', 'false');
    await act(async () => { fireEvent.click(french); });
    expect(french).toHaveAttribute('aria-pressed', 'true');
    expect(within(preview()).getByText('Fermé samedi.')).toBeInTheDocument();

    // No Kinyarwanda was written, so a Kinyarwanda reader gets the English.
    await act(async () => { fireEvent.click(within(preview()).getByRole('button', { name: 'Kinyarwanda' })); });
    expect(within(preview()).getByText('Off on Saturday.')).toHaveAttribute('lang', 'en');
  });
});

describe('Changing one', () => {
  it('starts with what is stored', () => {
    open(stored);
    expect(screen.getByRole('dialog', { name: 'Edit announcement' })).toBeInTheDocument();
    expect(field('Type').value).toBe('urgent');
    expect(english().value).toBe('Save your work.');
    expect(field('Text (French, optional)').value).toBe('Enregistrez.');
    expect(field('Show from').value).toBe('2026-12-05T22:00');
    expect(field('Also show to visitors, including on the sign in page').checked).toBe(true);
  });

  // The boxes show no seconds. Sending a time nobody touched would move it, and put a change on record that nobody made.
  it('sends only what was changed', async () => {
    open(stored);
    type(english(), 'Save your work now.');
    await press();
    expect(api.update).toHaveBeenCalledWith(7, { textEn: 'Save your work now.' });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('sends nothing at all when nothing was changed, and closes', async () => {
    open(stored);
    await press();
    expect(api.update).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says so when somebody else ended it meanwhile', async () => {
    api.update.mockRejectedValue(refused(409, 'announcement_ended'));
    open(stored);
    type(english(), 'Too late.');
    await press();
    expect(onEndedAlready).toHaveBeenCalledWith('This announcement has already ended.');
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('When the server refuses', () => {
  it('writes each problem by its own field', async () => {
    api.create.mockRejectedValue(refused(422, 'announcement_past', { showUntil: ['Choose an end time that is still to come.'] }));
    open();
    type(english(), 'Off.');
    await press();
    expect(field('Show until')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Show until')).toHaveAccessibleDescription(/Choose an end time that is still to come\./);
    expect(onSaved).not.toHaveBeenCalled();
    type(field('Show until'), '2026-11-29T10:00');
    expect(field('Show until')).not.toHaveAttribute('aria-invalid');
  });

  it('writes anything else above the form, and can be tried again', async () => {
    api.create.mockRejectedValue(new AxiosError('x', 'ERR_NETWORK'));
    open();
    type(english(), 'Off.');
    await press();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});

describe('While saving', () => {
  it('cannot be closed, or saved twice', async () => {
    api.create.mockReturnValue(new Promise(() => {}));
    open();
    type(english(), 'Off.');
    await press();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
