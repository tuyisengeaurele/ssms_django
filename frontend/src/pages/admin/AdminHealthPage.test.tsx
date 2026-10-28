import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const report = vi.hoisted(() => ({
  checkedAt: '2026-10-28T09:30:00+00:00',
  overall: 'ok',
  checks: [
    { key: 'database', status: 'ok', values: { ms: 12 } },
    { key: 'aiService', status: 'ok', values: { ms: 240 } },
    { key: 'email', status: 'ok', values: { sends: true } },
    { key: 'errorMonitoring', status: 'notSetUp', values: {} },
    { key: 'imageStorage', status: 'ok', values: {} },
    { key: 'sensors', status: 'ok', values: { online: 14, offline: 3, neverSeen: 0, lastReadingAt: '2026-10-28T09:28:00+00:00', silentMinutes: 2 } },
  ],
  numbers: { unreadAlerts: 84, openAirAlerts: 1, unansweredMessages: 2 },
}));

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/health.service', () => ({ healthService: api }));

import AdminHealthPage from './AdminHealthPage';

type Report = typeof report;
const reply = (patch: Partial<Report> = {}) => ({ data: { data: { ...report, ...patch } } });
const withCheck = (key: string, status: string, values: Record<string, unknown>) => ({
  overall: status === 'problem' ? 'problem' : 'ok',
  checks: report.checks.map((c) => (c.key === key ? { key, status, values } : c)),
});

function open() {
  return render(
    <LanguageProvider>
      <AdminHealthPage />
    </LanguageProvider>,
  );
}

/** The row of one check, found by its title. */
const rowOf = async (title: string) => (await screen.findByRole('heading', { level: 3, name: title })).closest('li') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.get.mockResolvedValue(reply());
});

describe('System health page', () => {
  it('has one title and asks the server once on opening', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'System health' })).toBeInTheDocument();
    await screen.findByText('Disease check service');
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('lists the six checks in order, each under its own title', async () => {
    open();
    await screen.findByText('Disease check service');
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Database', 'Disease check service', 'Email', 'Error reporting', 'Photo storage', 'Sensors']);
  });

  it('says in words that everything works when nothing is a problem', async () => {
    open();
    expect(await screen.findByRole('status')).toHaveTextContent('Everything that was checked is working.');
  });

  it('says something needs attention when a check has a problem', async () => {
    api.get.mockResolvedValue(reply(withCheck('database', 'problem', {})));
    open();
    expect(await screen.findByRole('status')).toHaveTextContent('Something needs attention. Look for the checks marked Problem.');
  });

  it('says every status in words, not by colour alone', async () => {
    api.get.mockResolvedValue(reply(withCheck('aiService', 'problem', { reason: 'unreachable' })));
    open();
    expect(within(await rowOf('Database')).getByText('OK')).toBeInTheDocument();
    expect(within(await rowOf('Disease check service')).getByText('Problem')).toBeInTheDocument();
    expect(within(await rowOf('Error reporting')).getByText('Not set up')).toBeInTheDocument();
  });

  it('shows how fast the database and the disease check service answered', async () => {
    open();
    expect(within(await rowOf('Database')).getByText('The database answered in 12 ms.')).toBeInTheDocument();
    expect(within(await rowOf('Disease check service')).getByText('The disease check service answered in 240 ms.')).toBeInTheDocument();
  });

  it.each([
    ['timeout', 'The disease check service did not answer in time.'],
    ['unreachable', 'The disease check service could not be reached.'],
    ['badAnswer', 'The disease check service answered with an error.'],
  ])('says why the disease check service is a problem: %s', async (reason, sentence) => {
    api.get.mockResolvedValue(reply(withCheck('aiService', 'problem', { reason })));
    open();
    expect(within(await rowOf('Disease check service')).getByText(sentence)).toBeInTheDocument();
  });

  it('says the database did not answer when it is a problem', async () => {
    api.get.mockResolvedValue(reply(withCheck('database', 'problem', {})));
    open();
    expect(within(await rowOf('Database')).getByText('The database did not answer.')).toBeInTheDocument();
  });

  it('treats not set up as a plain fact, not as a problem', async () => {
    api.get.mockResolvedValue(reply({ checks: report.checks.map((c) => (c.key === 'email' ? { key: 'email', status: 'notSetUp', values: { sends: false } } : c)) }));
    open();
    expect(within(await rowOf('Email')).getByText('Email is not set up, so no message leaves the server.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Everything that was checked is working.');
  });

  it('says set up, not tested, for email, error reporting and photo storage', async () => {
    open();
    expect(within(await rowOf('Email')).getByText('Email is set up.')).toBeInTheDocument();
    expect(within(await rowOf('Photo storage')).getByText('Photo storage is set up.')).toBeInTheDocument();
    expect(within(await rowOf('Error reporting')).getByText('Error reporting is not set up.')).toBeInTheDocument();
    expect(screen.getByText(/OK means it is set up/)).toBeInTheDocument();
  });

  it('counts the sensors online and offline and says when the last reading came', async () => {
    open();
    const row = await rowOf('Sensors');
    expect(within(row).getByText(/Online: 14\. Offline: 3\./)).toBeInTheDocument();
    expect(within(row).getByText(/Last reading 2 min ago/)).toBeInTheDocument();
  });

  it('says how long the sensors have been silent, in hours once it is long', async () => {
    api.get.mockResolvedValue(reply(withCheck('sensors', 'problem', { online: 0, offline: 17, neverSeen: 0, lastReadingAt: '2026-10-28T04:30:00+00:00', silentMinutes: 300 })));
    open();
    expect(within(await rowOf('Sensors')).getByText(/No reading for 5 hr/)).toBeInTheDocument();
  });

  it('says no reading has ever come when there is none', async () => {
    api.get.mockResolvedValue(reply(withCheck('sensors', 'problem', { online: 0, offline: 4, neverSeen: 4, lastReadingAt: null, silentMinutes: null })));
    open();
    expect(within(await rowOf('Sensors')).getByText(/No reading has ever arrived/)).toBeInTheDocument();
  });

  it('says no sensor is registered when the sensors are not set up', async () => {
    api.get.mockResolvedValue(reply(withCheck('sensors', 'notSetUp', {})));
    open();
    expect(within(await rowOf('Sensors')).getByText('No sensor is registered yet.')).toBeInTheDocument();
  });

  it('shows what is waiting for attention', async () => {
    open();
    await screen.findByText('Unread alerts');
    const waiting = screen.getByRole('heading', { level: 2, name: 'Waiting for attention' }).closest('section') as HTMLElement;
    expect(within(waiting).getByText('Unread alerts').nextElementSibling).toHaveTextContent('84');
    expect(within(waiting).getByText('Open temperature and humidity alerts').nextElementSibling).toHaveTextContent('1');
    expect(within(waiting).getByText('Messages not answered').nextElementSibling).toHaveTextContent('2');
  });

  it('shows when the checks were made', async () => {
    open();
    expect(await screen.findByText(/^Checked /)).toBeInTheDocument();
  });

  it('asks again when the person presses Check again, and says it is checking meanwhile', async () => {
    open();
    await screen.findByText('Disease check service');
    let finish: (v: unknown) => void = () => {};
    api.get.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('button', { name: 'Checking' })).toBeDisabled();
    expect(api.get).toHaveBeenCalledTimes(2);
    finish(reply(withCheck('database', 'problem', {})));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled());
    expect(within(await rowOf('Database')).getByText('Problem')).toBeInTheDocument();
  });

  it('keeps the last answer on screen while it checks again', async () => {
    open();
    await screen.findByText('Disease check service');
    api.get.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.getByText('The database answered in 12 ms.')).toBeInTheDocument();
  });

  it('says it could not load and offers to try again', async () => {
    api.get.mockRejectedValueOnce(new Error('down'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't check the system. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Disease check service')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the earlier answer and says so when a later check fails', async () => {
    open();
    await screen.findByText('Disease check service');
    api.get.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't check the system. Please try again.");
    expect(screen.getByText('The database answered in 12 ms.')).toBeInTheDocument();
  });

  it('is written in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'État du système' })).toBeInTheDocument();
    expect(within(await rowOf('Base de données')).getByText('OK')).toBeInTheDocument();
  });

  it('never shows an address, a key or a password', async () => {
    api.get.mockResolvedValue(reply(withCheck('aiService', 'problem', { reason: 'unreachable' })));
    const { container } = open();
    await screen.findByText('Disease check service');
    expect(container.textContent).not.toMatch(/https?:\/\/|localhost|password|secret|dsn/i);
  });
});
