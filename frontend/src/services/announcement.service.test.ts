import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn() }));
const ended = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ default: http, endSession: ended }));

import { announcementService } from './announcement.service';
import { hasSessionHint, rememberSession, setAccessToken } from './session';

const row = { id: 1, kind: 'maintenance', text: { en: 'Off on Saturday.', fr: '', rw: '' }, version: 1, showUntil: '2027-01-01T00:00:00+00:00' };
const answer = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const fetched = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setAccessToken(null);
  vi.stubGlobal('fetch', fetched);
});

afterEach(() => vi.unstubAllGlobals());

describe('Asking as a visitor', () => {
  it('reads the public route with no token and no cookie, even when an old token is about', async () => {
    setAccessToken('an.old.token');
    fetched.mockResolvedValue(answer({ success: true, data: [row] }));
    expect(await announcementService.visitor()).toEqual([row]);
    const [url, options] = fetched.mock.calls[0];
    expect(url).toBe(`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/announcements/public`);
    expect(options.credentials).toBe('omit');
    expect(JSON.stringify(options.headers ?? {})).not.toMatch(/authorization/i);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(http.get).not.toHaveBeenCalled();
  });

  it.each([
    ['no connection', () => Promise.reject(new TypeError('failed'))],
    ['a server error', () => Promise.resolve(answer({ success: false }, 500))],
    ['a refusal', () => Promise.resolve(answer({ success: false }, 401))],
    ['a page that is not JSON', () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('<html>'); } } as unknown as Response)],
    ['JSON of another shape', () => Promise.resolve(answer({ data: 'soon' }))],
    ['nothing at all', () => Promise.resolve(answer(null))],
  ])('says "no news" after %s, and signs nobody out', async (_, respond) => {
    rememberSession();
    fetched.mockImplementation(respond);
    expect(await announcementService.visitor()).toBeNull();
    expect(ended).not.toHaveBeenCalled();
    expect(hasSessionHint()).toBe(true);
  });

  it('says "no news" in a browser with no fetch', async () => {
    vi.stubGlobal('fetch', undefined);
    expect(await announcementService.visitor()).toBeNull();
  });
});

describe('Asking as somebody signed in', () => {
  it('asks silently, and gives up after a while', async () => {
    http.get.mockResolvedValue({ data: { success: true, data: [row] } });
    expect(await announcementService.current()).toEqual([row]);
    const [url, options] = http.get.mock.calls[0];
    expect(url).toBe('/announcements');
    expect(options.silent).toBe(true);
    expect(options.timeout).toBeGreaterThan(0);
  });

  it('says "no news" instead of failing', async () => {
    http.get.mockRejectedValue(new Error('no'));
    await expect(announcementService.current()).resolves.toBeNull();
    http.get.mockResolvedValue({ data: '<html></html>' });
    await expect(announcementService.current()).resolves.toBeNull();
  });
});

describe('What comes back', () => {
  // A newer server may know a type this page does not. The banner it can draw are still drawn.
  it('keeps only the rows the banner can draw', async () => {
    const odd = [row, { ...row, id: 2, kind: 'party' }, { ...row, id: 3, text: null }, null, 'x', { ...row, id: '4' }];
    fetched.mockResolvedValue(answer({ data: odd }));
    expect(await announcementService.visitor()).toEqual([row]);
  });

  it('can say there is nothing, which is news', async () => {
    fetched.mockResolvedValue(answer({ data: [] }));
    expect(await announcementService.visitor()).toEqual([]);
  });
});
