import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({ role: 'FARMER' as 'FARMER' | 'SUPERVISOR' | 'ADMIN' }));
const farms = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Gad', role: auth.role }, logout: vi.fn() }) }));
vi.mock('../../services/farm.service', () => ({ farmService: farms }));

import QuickSearch from './QuickSearch';

const FARMS = [
  { id: 'f1', name: 'Rwanda Silk Farm', location: 'Musanze, Northern Province', owner: { id: 'u1', name: 'Aline Uwase', email: 'a@x.rw' } },
  { id: 'f2', name: 'Hill Farm', location: 'Huye, Southern Province', owner: { id: 'u2', name: 'Bosco Mugisha', email: 'b@x.rw' } },
];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function open(onClose = vi.fn(), isOpen = true) {
  const ui = (o: boolean) => (
    <MemoryRouter initialEntries={['/farmer']}>
      <LanguageProvider>
        <QuickSearch open={o} onClose={onClose} />
        <Where />
      </LanguageProvider>
    </MemoryRouter>
  );
  const view = render(ui(isOpen));
  return { ...view, onClose, reopen: (o: boolean) => view.rerender(ui(o)) };
}

const box = () => screen.getByRole('combobox', { name: 'Quick search' });
const options = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent ?? '');
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

beforeEach(() => {
  localStorage.clear();
  auth.role = 'FARMER';
  farms.getAll.mockReset();
  // The farms never arrive unless a test asks for them, so nothing updates after a test has finished.
  farms.getAll.mockReturnValue(new Promise(() => {}));
});

const withFarms = () => farms.getAll.mockResolvedValue({ data: { data: FARMS } });

describe('opening and closing', () => {
  it('shows nothing while closed and does not ask the server for farms', () => {
    open(vi.fn(), false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(farms.getAll).not.toHaveBeenCalled();
  });

  it('opens as a dialog with the search box focused', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Quick search' })).toHaveAttribute('aria-modal', 'true');
    expect(box()).toHaveFocus();
  });

  it('closes on Escape', () => {
    const { onClose } = open();
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the dim area outside is clicked, but not when the panel is', () => {
    const { onClose } = open();
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('quick-search-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts empty each time it opens', async () => {
    const { reopen } = open();
    type('hill');
    reopen(false);
    reopen(true);
    expect(box()).toHaveValue('');
  });

  it('gives the focus back to what had it before', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const { reopen } = open(vi.fn(), false);
    reopen(true);
    expect(box()).toHaveFocus();
    reopen(false);
    expect(outside).toHaveFocus();
    outside.remove();
  });
});

describe('what it lists', () => {
  it('lists the pages a farmer can open, with the profile and a new farm', async () => {
    open();
    expect(options()).toEqual(expect.arrayContaining(['Dashboard', 'My Farms', 'Batches', 'Alerts', 'Profile', 'New farm'].map((n) => expect.stringContaining(n))));
    expect(options().join('|')).not.toContain('Users');
    expect(options().join('|')).not.toContain('Audit log');
  });

  it('lists the admin pages for an administrator', () => {
    auth.role = 'ADMIN';
    open();
    const all = options().join('|');
    expect(all).toContain('Users');
    expect(all).toContain('Audit log');
    expect(all).toContain('System health');
  });

  it('gives a supervisor no new farm page', () => {
    auth.role = 'SUPERVISOR';
    open();
    expect(options().join('|')).not.toContain('New farm');
  });

  it('adds the farms once they are loaded, with the place under each name', async () => {
    withFarms();
    open();
    await waitFor(() => expect(options().join('|')).toContain('Rwanda Silk Farm'));
    expect(options().find((o) => o.includes('Rwanda Silk Farm'))).toContain('Musanze, Northern Province');
  });

  it('asks the server for farms once, however often it opens', async () => {
    withFarms();
    const { reopen } = open();
    await waitFor(() => expect(options().join('|')).toContain('Hill Farm'));
    reopen(false);
    reopen(true);
    reopen(false);
    reopen(true);
    expect(farms.getAll).toHaveBeenCalledTimes(1);
  });

  it('still works with pages only when the farms cannot be loaded', async () => {
    farms.getAll.mockRejectedValue(new Error('down'));
    open();
    await waitFor(() => expect(farms.getAll).toHaveBeenCalled());
    expect(options().join('|')).toContain('Dashboard');
    type('dash');
    expect(options()).toHaveLength(1);
  });

  it('tries the farms again on the next opening after a failure', async () => {
    farms.getAll.mockRejectedValueOnce(new Error('down'));
    const { reopen } = open();
    await waitFor(() => expect(farms.getAll).toHaveBeenCalledTimes(1));
    reopen(false);
    reopen(true);
    await waitFor(() => expect(farms.getAll).toHaveBeenCalledTimes(2));
  });
});

describe('searching', () => {
  it('narrows the list as the person types', async () => {
    withFarms();
    open();
    await waitFor(() => expect(farms.getAll).toHaveBeenCalled());
    type('hill');
    expect(options()).toHaveLength(1);
    expect(options()[0]).toContain('Hill Farm');
  });

  it('finds a farm by its owner', async () => {
    withFarms();
    open();
    await waitFor(() => expect(options().join('|')).toContain('Rwanda Silk Farm'));
    type('aline');
    expect(options()[0]).toContain('Rwanda Silk Farm');
  });

  it('says so when nothing matches, and keeps the list empty', () => {
    open();
    type('zzzz');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing matches "zzzz".')).toBeInTheDocument();
  });

  it('tells screen readers how many results there are', () => {
    open();
    type('dash');
    expect(screen.getByRole('status')).toHaveTextContent('1 result');
    type('zzzz');
    expect(screen.getByRole('status')).toHaveTextContent('No results');
  });
});

describe('keyboard', () => {
  it('marks the first result as the one Enter opens', () => {
    open();
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(box()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
  });

  it('moves down and up with the arrow keys and wraps at both ends', () => {
    open();
    const items = () => screen.getAllByRole('option');
    const selected = () => items().findIndex((o) => o.getAttribute('aria-selected') === 'true');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(selected()).toBe(1);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(selected()).toBe(items().length - 1);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(selected()).toBe(0);
  });

  it('goes back to the first result when the query changes', () => {
    open();
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    type('a');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the chosen page with Enter and closes', () => {
    const { onClose } = open();
    type('alerts');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/alerts');
    expect(onClose).toHaveBeenCalled();
  });

  it('opens a farm with Enter', async () => {
    withFarms();
    open();
    await waitFor(() => expect(options().join('|')).toContain('Hill Farm'));
    type('hill');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/farms/f2');
  });

  it('does nothing on Enter when nothing matches', () => {
    const { onClose } = open();
    type('zzzz');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/farmer');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not act on Enter while an input method is composing text', () => {
    const { onClose } = open();
    type('alerts');
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens a result when it is clicked', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('option', { name: /^Batches/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/batches');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', () => {
    open();
    const prevented = !fireEvent.keyDown(box(), { key: 'Tab' });
    expect(prevented).toBe(true);
  });
});

describe('in French', () => {
  it('uses the language of the screen and finds words typed without accents', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByRole('combobox', { name: 'Recherche rapide' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tableau' } });
    expect(options().join('|')).toContain('Tableau de bord');
  });
});
