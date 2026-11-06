import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./api', () => ({ default: api }));

import { supportService } from './support.service';

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
});

describe('support service', () => {
  it('asks for access with the person, the reason, the length and the mode', async () => {
    const body = { personId: 'p1', reason: 'Please look at my batch list', minutes: 30 as const, mode: 'view' as const };
    await supportService.request(body);
    expect(api.post).toHaveBeenCalledWith('/support-access', body);
  });

  it.each([
    ['mine', () => supportService.mine(), '/support-access/mine'],
    ['get', () => supportService.get('a1'), '/support-access/a1'],
    ['pending', () => supportService.pending(), '/support-access/for-me/pending'],
    ['history', () => supportService.history(), '/support-access/for-me/history'],
  ])('reads with GET: %s', async (_name, call, url) => {
    await call();
    expect(api.get).toHaveBeenCalledWith(url);
  });

  it.each([
    ['cancel', () => supportService.cancel('a1'), '/support-access/a1/cancel'],
    ['start', () => supportService.start('a1'), '/support-access/a1/start'],
    ['token', () => supportService.token('a1'), '/support-access/a1/token'],
    ['end', () => supportService.end('a1'), '/support-access/a1/end'],
    ['endOwn', () => supportService.endOwn('a1'), '/support-access/for-me/a1/end'],
  ])('acts with POST: %s', async (_name, call, url) => {
    await call();
    expect(api.post).toHaveBeenCalledWith(url);
  });

  it('answers a request with the decision and whether edit is allowed', async () => {
    await supportService.respond('a1', { decision: 'allow', allowEdit: true });
    expect(api.post).toHaveBeenCalledWith('/support-access/for-me/a1/respond', { decision: 'allow', allowEdit: true });
  });
});
