import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const report = vi.hoisted(() => ({
  checkedAt: '2026-10-28T09:30:00+00:00',
  overall: 'ok',
  checks: [
    { key: 'web', status: 'ok', values: { ms: 48 } },
    { key: 'database', status: 'ok', values: { ms: 12 } },
    { key: 'aiService', status: 'ok', values: { ms: 240 } },
    { key: 'email', status: 'ok', values: { sends: true } },
    { key: 'errorMonitoring', status: 'notSetUp', values: {} },
    { key: 'imageStorage', status: 'ok', values: {} },
    { key: 'sensors', status: 'ok', values: { online: 14, offline: 3, neverSeen: 0, lastReadingAt: '2026-10-28T09:28:00+00:00', silentMinutes: 2 } },
    { key: 'jobs', status: 'ok', values: { hours: 3 } },
    { key: 'alertStream', status: 'ok', values: { ms: 9 } },
    { key: 'website', status: 'ok', values: { ms: 130 } },
  ],
  numbers: { unreadAlerts: 84, openAirAlerts: 1, unansweredMessages: 2 },
}));

const api = vi.hoisted(() => ({ get: vi.fn(), history: vi.fn(), runTest: vi.fn() }));
vi.mock('../../services/health.service', () => ({ healthService: api }));

import AdminHealthPage from './AdminHealthPage';

const unknown = { percent: null, samples: 0, coverage: 0 };
const known = (percent: number, samples = 288) => ({ percent, samples, coverage: 1 });
const points = (ms: Array<number | null>) => ms.map((value, i) => ({ at: `2026-10-28T0${i}:00:00+00:00`, status: 'ok', ms: value }));
const SERVICES = ['web', 'database', 'aiService', 'email', 'errorMonitoring', 'imageStorage', 'sensors', 'jobs', 'alertStream', 'website'];
const history = (over: Record<string, unknown> = {}) => ({
  data: {
    data: {
      services: Object.fromEntries(SERVICES.map((key) => [key, { points: [], uptime: { day: unknown, week: unknown, month: unknown } }])
        .map(([key, value]) => [key, (over as Record<string, unknown>)[key as string] ?? value])),
    },
  },
});

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
  api.history.mockResolvedValue(history());
  api.runTest.mockResolvedValue({ data: { data: { name: 'email', ok: true, outcome: 'sent', milliseconds: 420, ranAt: '2026-10-28T09:31:00+00:00' } } });
});

describe('System health page', () => {
  it('has one title and asks the server once on opening, for the live answer and for the history', async () => {
    open();
    expect(screen.getByRole('heading', { level: 2, name: 'System health' })).toBeInTheDocument();
    await screen.findByText('Disease check service');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.history).toHaveBeenCalledTimes(1);
  });

  it('lists the ten checks in order, each under its own title', async () => {
    open();
    await screen.findByText('Disease check service');
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual([
      'Web API', 'Database', 'Disease check service', 'Email', 'Error reporting', 'Photo storage', 'Sensors',
      'Scheduled jobs', 'Live alerts', 'Website',
    ]);
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
    expect(await screen.findByRole('heading', { level: 2, name: 'État du système' })).toBeInTheDocument();
    expect(within(await rowOf('Base de données')).getByText('OK')).toBeInTheDocument();
  });

  it('never shows an address, a key or a password', async () => {
    api.get.mockResolvedValue(reply(withCheck('aiService', 'problem', { reason: 'unreachable' })));
    const { container } = open();
    await screen.findByText('Disease check service');
    expect(container.textContent).not.toMatch(/https?:\/\/|localhost|password|secret|dsn/i);
  });
});


describe('The services added with the history', () => {
  it.each([
    ['Web API', 'The API answered on its public address in 48 ms.'],
    ['Website', 'The website answered in 130 ms.'],
    ['Live alerts', 'The live alert stream answered in 9 ms.'],
    ['Scheduled jobs', 'A scheduled job finished 3 hr ago.'],
  ])('says in words what %s found', async (title, sentence) => {
    open();
    expect(within(await rowOf(title)).getByText(sentence)).toBeInTheDocument();
  });

  it('says a service has no address to ask when it is not set up', async () => {
    api.get.mockResolvedValue(reply(withCheck('web', 'notSetUp', {})));
    open();
    expect(within(await rowOf('Web API')).getByText(/not set, so it cannot ask itself/)).toBeInTheDocument();
  });

  it('says the scheduler may have stopped when no job finished for a long time', async () => {
    api.get.mockResolvedValue(reply(withCheck('jobs', 'problem', { hours: 30 })));
    open();
    expect(within(await rowOf('Scheduled jobs')).getByText(/No scheduled job has finished for 30 hr/)).toBeInTheDocument();
  });

  it('says why the website did not answer', async () => {
    api.get.mockResolvedValue(reply(withCheck('website', 'problem', { reason: 'timeout' })));
    open();
    expect(within(await rowOf('Website')).getByText('The website did not answer in time.')).toBeInTheDocument();
  });
});

describe('Uptime', () => {
  it('shows the share of checks that passed over a day, a week and a month', async () => {
    api.history.mockResolvedValue(history({ database: { points: [], uptime: { day: known(100), week: known(99.9), month: known(98.2) } } }));
    open();
    const row = await rowOf('Database');
    await within(row).findByText('99.9%');
    expect(within(row).getByText('24 hours').nextElementSibling).toHaveTextContent('100%');
    expect(within(row).getByText('7 days').nextElementSibling).toHaveTextContent('99.9%');
    expect(within(row).getByText('30 days').nextElementSibling).toHaveTextContent('98.2%');
  });

  it('says not enough checks yet, never 0 percent, when nothing was checked', async () => {
    open();
    const row = await rowOf('Database');
    expect(within(row).getAllByText('Not enough checks yet').length).toBeGreaterThan(0);
    expect(within(row).queryByText('0%')).not.toBeInTheDocument();
  });

  it('says how many checks a figure is built from', async () => {
    api.history.mockResolvedValue(history({ database: { points: [], uptime: { day: known(100, 3), week: known(100, 3), month: known(100, 3) } } }));
    open();
    expect((await within(await rowOf('Database')).findAllByTitle('From 3 checks')).length).toBe(3);
  });

  it('still shows the live answer when the history cannot be loaded', async () => {
    api.history.mockRejectedValue(new Error('down'));
    open();
    expect(within(await rowOf('Database')).getByText('The database answered in 12 ms.')).toBeInTheDocument();
    expect(within(await rowOf('Database')).getAllByText('Not enough checks yet').length).toBeGreaterThan(0);
  });
});

describe('The last 24 hours', () => {
  it('draws a line for a service that reports how long it took', async () => {
    api.history.mockResolvedValue(history({ database: { points: points([10, 12, 30, 11]), uptime: { day: known(100), week: known(100), month: known(100) } } }));
    open();
    const row = await rowOf('Database');
    expect(await within(row).findByRole('img', { name: 'Database, answer time over the last 24 hours' })).toBeInTheDocument();
  });

  it('says there is no history yet when nothing was written', async () => {
    open();
    expect(within(await rowOf('Database')).getByText(/No history yet/)).toBeInTheDocument();
  });

  it('gives a service with no times a row of checks, with the same facts in words', async () => {
    const mixed = [
      { at: '2026-10-28T01:00:00+00:00', status: 'ok', ms: null },
      { at: '2026-10-28T02:00:00+00:00', status: 'problem', ms: null },
      { at: '2026-10-28T03:00:00+00:00', status: 'ok', ms: null },
    ];
    api.history.mockResolvedValue(history({ email: { points: mixed, uptime: { day: known(66.7, 3), week: known(66.7, 3), month: known(66.7, 3) } } }));
    open();
    const row = await rowOf('Email');
    expect(await within(row).findByText('3 checks in the last 24 hours, 1 with a problem.')).toBeInTheDocument();
  });
});

describe('The test buttons', () => {
  const buttonsIn = async (title: string) => within(await rowOf(title)).queryAllByRole('button', { name: 'Run test' });

  it.each(['Database', 'Disease check service', 'Email', 'Photo storage', 'Sensors'])('offers a test for %s', async (title) => {
    open();
    expect((await buttonsIn(title)).length).toBe(1);
  });

  it.each(['Web API', 'Error reporting', 'Scheduled jobs', 'Live alerts', 'Website'])('offers none for %s, which cannot be tried safely', async (title) => {
    open();
    await rowOf(title);
    expect((await buttonsIn(title)).length).toBe(0);
  });

  it('runs the right test and shows what happened, with the time it took', async () => {
    open();
    const row = await rowOf('Email');
    fireEvent.click(within(row).getByRole('button', { name: 'Run test' }));
    expect(api.runTest).toHaveBeenCalledWith('email');
    expect(await within(row).findByText('Worked')).toBeInTheDocument();
    expect(within(row).getByText(/A test message was sent to your own address\./)).toBeInTheDocument();
    expect(within(row).getByText(/420 ms/)).toBeInTheDocument();
  });

  it.each([
    ['Database', 'database-write'],
    ['Disease check service', 'disease-check'],
    ['Photo storage', 'storage'],
    ['Sensors', 'device-ingest'],
  ])('%s runs %s', async (title, name) => {
    open();
    fireEvent.click(within(await rowOf(title)).getByRole('button', { name: 'Run test' }));
    expect(api.runTest).toHaveBeenCalledWith(name);
  });

  it('says it is running, and cannot be pressed twice meanwhile', async () => {
    let finish: (v: unknown) => void = () => {};
    api.runTest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    open();
    const row = await rowOf('Email');
    fireEvent.click(within(row).getByRole('button', { name: 'Run test' }));
    expect(await within(row).findByRole('button', { name: 'Running' })).toBeDisabled();
    finish({ data: { data: { name: 'email', ok: true, outcome: 'printed', milliseconds: 5, ranAt: '2026-10-28T09:31:00+00:00' } } });
    expect(await within(row).findByText(/printed instead of sent/)).toBeInTheDocument();
  });

  it('says a test did not work, and why, in words', async () => {
    api.runTest.mockResolvedValue({ data: { data: { name: 'disease-check', ok: false, outcome: 'timeout', milliseconds: 10000, ranAt: '2026-10-28T09:31:00+00:00' } } });
    open();
    const row = await rowOf('Disease check service');
    fireEvent.click(within(row).getByRole('button', { name: 'Run test' }));
    expect(await within(row).findByText('Did not work')).toBeInTheDocument();
    expect(within(row).getByText(/did not answer in time/)).toBeInTheDocument();
  });

  it('says so when the test itself could not be run', async () => {
    api.runTest.mockRejectedValue(new Error('429'));
    open();
    const row = await rowOf('Email');
    fireEvent.click(within(row).getByRole('button', { name: 'Run test' }));
    expect(await within(row).findByText('The test could not be run. Please try again in a moment.')).toBeInTheDocument();
  });

  it('keeps the result of one service apart from another', async () => {
    open();
    fireEvent.click(within(await rowOf('Email')).getByRole('button', { name: 'Run test' }));
    await within(await rowOf('Email')).findByText('Worked');
    expect(within(await rowOf('Database')).queryByText('Worked')).not.toBeInTheDocument();
  });
});

describe('Refreshing by itself', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('asks again every minute while the page is open on screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    await screen.findByText('Disease check service');
    expect(api.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.history).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('does not ask while the page is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    await screen.findByText('Disease check service');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('keeps what is on screen when a quiet refresh fails, without a loud error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    await screen.findByText('Disease check service');
    api.get.mockRejectedValueOnce(new Error('down'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(screen.getByText('The database answered in 12 ms.')).toBeInTheDocument();
  });

  it('stops asking when the page is left', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = open();
    await screen.findByText('Disease check service');
    unmount();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe('In French and Kinyarwanda', () => {
  it('names the buttons and the uptime in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    const row = await rowOf('Base de données');
    expect(within(row).getByRole('button', { name: 'Lancer le test' })).toBeInTheDocument();
    expect(within(row).getByText('24 heures')).toBeInTheDocument();
  });

  it('is not left in English in Kinyarwanda', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    const { container } = open();
    await waitFor(() => expect(container.querySelectorAll('.health-card').length).toBe(10));
    expect(container.textContent).not.toMatch(/Run test|Not enough checks yet/);
  });
});
