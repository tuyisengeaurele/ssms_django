// @vitest-environment node
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle, type Deps, type Mailer } from '../api/send-mail';

// The mail sender is a public address, so everything it is given has to be proved. These tests send it real Request objects
// and watch what it would hand to Gmail.

const SECRET = 'a'.repeat(32);
const NOW_SECONDS = 1_700_000_000;
const BODY = '{"to":["ada@example.rw"],"raw":"aGVsbG8="}';
/** The same example is checked by the API's tests, so the two sides cannot drift apart. It protects nothing. */
const SHARED_SIGNATURE = '3e6c623abb55c7f7ea909166acdec4cf34de5c6b367d73a74870abb1a0ae8a95';
const ENV = { GMAIL_USER: 'ssms@example.rw', GMAIL_APP_PASSWORD: 'b'.repeat(16), MAIL_RELAY_SECRET: SECRET };

const sign = (body: string, at: number, secret = SECRET) => createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');

function request(body: string, options: { secret?: string; at?: number; headers?: Record<string, string>; method?: string } = {}) {
  const at = options.at ?? NOW_SECONDS;
  const method = options.method ?? 'POST';
  return new Request('https://site.example/api/send-mail', {
    method,
    headers: options.headers ?? {
      'content-type': 'application/json',
      'x-ssms-timestamp': String(at),
      'x-ssms-signature': sign(body, at, options.secret),
    },
    body: method === 'GET' ? undefined : body,
  });
}

function fake(env: Record<string, string | undefined> = ENV, outcome: () => Promise<{ rejected: unknown[] }> = async () => ({ rejected: [] })) {
  const sendMail = vi.fn<Mailer['sendMail']>(() => outcome());
  const mailer = vi.fn(() => ({ sendMail }));
  const deps: Deps = { env, now: () => NOW_SECONDS * 1000, mailer };
  return { deps, mailer, sendMail };
}

async function answer(req: Request, deps: Deps) {
  const response = await handle(req, deps);
  return { status: response.status, body: (await response.json()) as { ok: boolean; error?: string } };
}

afterEach(() => vi.restoreAllMocks());

describe('the mail sender', () => {
  it('matches the shared signature example', async () => {
    const { deps } = fake();
    const result = await answer(
      request(BODY, { headers: { 'x-ssms-timestamp': String(NOW_SECONDS), 'x-ssms-signature': SHARED_SIGNATURE } }),
      deps,
    );
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it('hands Gmail the exact bytes and the signed recipients', async () => {
    const bytes = Buffer.from('Subject: Ubuhehere\r\n\r\nTempérature trop basse\r\n', 'utf8');
    const body = JSON.stringify({ to: ['ada@example.rw', 'ben@example.rw'], raw: bytes.toString('base64') });
    const { deps, mailer, sendMail } = fake();
    expect(await answer(request(body), deps)).toEqual({ status: 200, body: { ok: true } });
    expect(mailer).toHaveBeenCalledWith('ssms@example.rw', 'b'.repeat(16));
    const [mail] = sendMail.mock.calls[0];
    expect(mail.envelope).toEqual({ from: 'ssms@example.rw', to: ['ada@example.rw', 'ben@example.rw'] });
    expect(Buffer.compare(mail.raw, bytes)).toBe(0);
  });

  it.each([
    ['not signed', () => request(BODY, { headers: { 'content-type': 'application/json' } })],
    ['signed with another secret', () => request(BODY, { secret: 'c'.repeat(32) })],
    [
      'changed after signing',
      () =>
        request(BODY.replace('ada@', 'eve@'), {
          headers: { 'x-ssms-timestamp': String(NOW_SECONDS), 'x-ssms-signature': sign(BODY, NOW_SECONDS) },
        }),
    ],
    ['signed with something that is not a signature', () => request(BODY, { headers: { 'x-ssms-timestamp': String(NOW_SECONDS), 'x-ssms-signature': 'zz' } })],
  ])('refuses a request that is %s', async (_name, build) => {
    const { deps, mailer } = fake();
    expect(await answer(build(), deps)).toEqual({ status: 401, body: { ok: false, error: 'unauthorized' } });
    expect(mailer).not.toHaveBeenCalled();
  });

  it('refuses a request older or newer than 300 seconds', async () => {
    for (const skew of [301, -301]) {
      const { deps, mailer } = fake();
      expect((await answer(request(BODY, { at: NOW_SECONDS - skew }), deps)).status).toBe(401);
      expect(mailer).not.toHaveBeenCalled();
    }
    for (const skew of [299, -299]) {
      expect((await answer(request(BODY, { at: NOW_SECONDS - skew }), fake().deps)).status).toBe(200);
    }
  });

  it('refuses a time that is not a whole number', async () => {
    const headers = { 'x-ssms-timestamp': 'soon', 'x-ssms-signature': createHmac('sha256', SECRET).update(`soon.${BODY}`).digest('hex') };
    expect((await answer(request(BODY, { headers }), fake().deps)).status).toBe(401);
  });

  it('refuses other methods', async () => {
    const { deps, mailer } = fake();
    expect(await answer(request(BODY, { method: 'GET' }), deps)).toEqual({ status: 405, body: { ok: false, error: 'method' } });
    expect(mailer).not.toHaveBeenCalled();
  });

  it.each([
    ['the Gmail address is missing', { ...ENV, GMAIL_USER: undefined }],
    ['the app password is missing', { ...ENV, GMAIL_APP_PASSWORD: '' }],
    ['the secret is missing', { ...ENV, MAIL_RELAY_SECRET: undefined }],
    ['the secret is short', { ...ENV, MAIL_RELAY_SECRET: 'a'.repeat(31) }],
  ])('says it is not set up when %s', async (_name, env) => {
    const { deps, mailer } = fake(env);
    expect(await answer(request(BODY, { secret: env.MAIL_RELAY_SECRET || SECRET }), deps)).toEqual({
      status: 503,
      body: { ok: false, error: 'not_set_up' },
    });
    expect(mailer).not.toHaveBeenCalled();
  });

  it('refuses a body that is too large', async () => {
    const body = JSON.stringify({ to: ['ada@example.rw'], raw: 'A'.repeat(1_000_000) });
    const { deps, mailer } = fake();
    expect(await answer(request(body), deps)).toEqual({ status: 413, body: { ok: false, error: 'too_large' } });
    expect(mailer).not.toHaveBeenCalled();
  });

  const to = (value: unknown) => JSON.stringify({ to: value, raw: 'aGVsbG8=' });
  it.each([
    ['is not JSON', 'hello'],
    ['is not an object', '[1]'],
    ['is null', 'null'],
    ['has no recipient', to([])],
    ['has 21 recipients', to(Array.from({ length: 21 }, (_, i) => `p${i}@example.rw`))],
    ['has a recipient that is not text', to([7])],
    ['has a recipient without an at sign', to(['ada.example.rw'])],
    ['has a line break in a recipient', to(['ada@example.rw\r\nRCPT TO:<eve@example.rw>'])],
    // The mail library splits a text at commas, which would get past the limit on recipients.
    ['has two addresses in one recipient', to(['ada@example.rw,eve@example.rw'])],
    ['has a name around a recipient', to(['Ada <ada@example.rw>'])],
    ['has an empty message', JSON.stringify({ to: ['ada@example.rw'], raw: '' })],
    ['has a message that is not base64', JSON.stringify({ to: ['ada@example.rw'], raw: 'not base64!' })],
  ])('refuses a body that %s', async (_name, body) => {
    const { deps, mailer } = fake();
    expect(await answer(request(body), deps)).toEqual({ status: 400, body: { ok: false, error: 'bad_request' } });
    expect(mailer).not.toHaveBeenCalled();
  });

  it('takes 20 recipients', async () => {
    const body = JSON.stringify({ to: Array.from({ length: 20 }, (_, i) => `p${i}@example.rw`), raw: 'aGVsbG8=' });
    expect((await answer(request(body), fake().deps)).status).toBe(200);
  });

  const gmailSays = 'Invalid login for ada@example.rw using ' + 'b'.repeat(16);
  it.each([
    ['Gmail throws', async () => Promise.reject(new Error(gmailSays))],
    ['Gmail refuses a recipient', async () => ({ rejected: ['ada@example.rw'] })],
  ])('reports a failure when %s, repeating nothing and logging nothing', async (_name, outcome) => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    const response = await handle(request(BODY), fake(ENV, outcome).deps);
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'send_failed' });
    for (const secret of ['ada@example.rw', 'b'.repeat(16), SECRET, 'Invalid login']) expect(text).not.toContain(secret);
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  });
});
