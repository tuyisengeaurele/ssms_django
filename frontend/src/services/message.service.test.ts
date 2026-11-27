import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./api', () => ({ default: http }));

import { messageService } from './message.service';

beforeEach(() => {
  vi.clearAllMocks();
  http.get.mockResolvedValue({ data: { data: { unreadTotal: 2, conversation: null } } });
  http.post.mockResolvedValue({ data: { data: {} } });
});

describe('Reading conversations', () => {
  it('lists a page of them, and opens one at its end or before a message', () => {
    messageService.list();
    messageService.list(3);
    messageService.one('c1');
    messageService.one('c1', 'm9');
    expect(http.get.mock.calls).toEqual([
      ['/messages/conversations', { params: { page: 1 } }],
      ['/messages/conversations', { params: { page: 3 } }],
      ['/messages/conversations/c1', { params: undefined }],
      ['/messages/conversations/c1', { params: { before: 'm9' } }],
    ]);
  });
});

describe('Sending', () => {
  // On a weak connection a request can hang. It has to fail, so the page can offer to try again.
  it('is a request the person made, and gives up after a while', () => {
    const body = { body: 'Hello.', clientId: 'abc-12345', farmerId: 'u1' };
    messageService.send(body);
    const [url, sent, options] = http.post.mock.calls[0];
    expect([url, sent]).toEqual(['/messages/send', body]);
    expect(options.timeout).toBeGreaterThanOrEqual(20_000);
    expect(options.silent).toBeUndefined();
  });
});

describe('What the page does by itself', () => {
  it('marks read and checks for news silently', async () => {
    messageService.read('c1', 'm2');
    await messageService.updates('c1', '2026-11-27T10:00:00+00:00');
    expect(http.post).toHaveBeenCalledWith('/messages/read', { conversationId: 'c1', messageId: 'm2' }, expect.objectContaining({ silent: true }));
    expect(http.get).toHaveBeenCalledWith('/messages/updates', expect.objectContaining({
      silent: true, params: { conversation: 'c1', since: '2026-11-27T10:00:00+00:00' },
    }));
    expect(http.get.mock.calls[0][1].timeout).toBeGreaterThan(0);
  });

  it('asks about the count alone when no conversation is open', async () => {
    expect(await messageService.updates()).toEqual({ unreadTotal: 2, conversation: null });
    expect(http.get.mock.calls[0][1].params).toBeUndefined();
  });

  it.each([
    ['a failed request', () => Promise.reject(new Error('no'))],
    ['a page that is not an answer', () => Promise.resolve({ data: '<html></html>' })],
    ['an answer with no count', () => Promise.resolve({ data: { data: {} } })],
  ])('says "no news" after %s, and never fails', async (_, respond) => {
    http.get.mockImplementation(respond);
    await expect(messageService.updates()).resolves.toBeNull();
  });
});
