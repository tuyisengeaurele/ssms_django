import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

// A new address is a new page: the layout draws it afresh, and it fades in. The Messages page is the exception. Its
// addresses are one page with a list beside the open conversation, so moving between them must not draw it again.

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Aline', role: 'FARMER', email: 'a@x.rw', cooperativeId: null }, logout: () => {}, acting: null }),
}));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: { ping: vi.fn().mockReturnValue(new Promise(() => {})) } }));
vi.mock('../../services/support.service', () => ({ supportService: new Proxy({}, { get: () => () => new Promise(() => {}) }) }));
vi.mock('../../services/message.service', () => ({ messageService: { updates: vi.fn().mockResolvedValue(null) } }));
vi.mock('../../services/announcement.service', () => ({ announcementService: { current: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/mfa.service', () => ({ mfaService: { status: vi.fn().mockReturnValue(new Promise(() => {})) } }));

import DashboardLayout from './DashboardLayout';

const drawn = vi.fn();
function Page({ to }: { to: string }) {
  const navigate = useNavigate();
  const [words, setWords] = useState('');
  useEffect(() => { drawn(); }, []);
  return (
    <>
      <input aria-label="kept words" value={words} onChange={(e) => setWords(e.target.value)} />
      <button type="button" onClick={() => navigate(to)}>move</button>
    </>
  );
}

async function moveFrom(from: string, to: string, pattern: string) {
  render(
    <MemoryRouter initialEntries={[from]}>
      <LanguageProvider>
        <Routes><Route element={<DashboardLayout />}><Route path={pattern} element={<Page to={to} />} /></Route></Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('kept words'), { target: { value: 'half written' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'move' })); });
  return (screen.getByLabelText('kept words') as HTMLInputElement).value;
}

beforeEach(() => {
  localStorage.clear();
  drawn.mockClear();
});

describe('Moving between addresses', () => {
  it.each([['/messages', '/messages/c1'], ['/messages/c1', '/messages/c2'], ['/messages/c1', '/messages']])(
    'keeps the Messages page from %s to %s',
    async (from, to) => {
      expect(await moveFrom(from, to, '/messages/:id?')).toBe('half written');
      expect(drawn).toHaveBeenCalledTimes(1);
    },
  );

  it('still draws any other page afresh', async () => {
    expect(await moveFrom('/farms/a', '/farms/b', '/farms/:id')).toBe('');
    expect(drawn).toHaveBeenCalledTimes(2);
  });
});
