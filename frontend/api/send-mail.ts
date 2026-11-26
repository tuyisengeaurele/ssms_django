/**
 * The mail sender of the live site. The API runs on a host that cannot reach Gmail's sending ports, so it builds each email,
 * signs it and posts it here, and this passes it to Gmail.
 *
 * The address is public. Nothing is sent without a recent signature made with the secret the API shares with this function,
 * mail always leaves from the SSMS account, and no log line or answer ever repeats an address, the message or a secret.
 *
 * Everything is in this one file because every file in this folder becomes a function of its own.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

// The API has the same limits in core/mail_relay.py.
const MIN_SECRET_LENGTH = 32;
const MAX_SKEW_SECONDS = 300;
const MAX_BODY_BYTES = 1_000_000;
const MAX_RECIPIENTS = 20;

// One plain address and nothing else. The mail library reads commas and angle brackets as more addresses.
const ADDRESS = /^[^\s,;:<>()[\]"\\@]+@[^\s,;:<>()[\]"\\@]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export interface Mailer {
  sendMail(mail: { envelope: { from: string; to: string[] }; raw: Buffer }): Promise<{ rejected: unknown[] }>;
}

export interface Deps {
  env: Record<string, string | undefined>;
  /** Milliseconds, as Date.now gives them. */
  now: () => number;
  mailer: (user: string, password: string) => Mailer;
}

type Problem = 'bad_request' | 'unauthorized' | 'method' | 'too_large' | 'send_failed' | 'not_set_up';
const STATUS: Record<Problem, number> = {
  bad_request: 400,
  unauthorized: 401,
  method: 405,
  too_large: 413,
  send_failed: 502,
  not_set_up: 503,
};

const reply = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const refuse = (error: Problem) => reply({ ok: false, error }, STATUS[error]);

function signedRecently(headers: Headers, body: Buffer, secret: string, nowSeconds: number): boolean {
  const timestamp = headers.get('x-ssms-timestamp') ?? '';
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex'));
  const given = Buffer.from(headers.get('x-ssms-signature') ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function readMessage(body: Buffer): { to: string[]; raw: Buffer } | null {
  let data: unknown;
  try {
    data = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  const { to, raw } = (data ?? {}) as { to?: unknown; raw?: unknown };
  if (!Array.isArray(to) || to.length < 1 || to.length > MAX_RECIPIENTS) return null;
  if (!to.every((address): address is string => typeof address === 'string' && address.length <= 254 && ADDRESS.test(address))) return null;
  if (typeof raw !== 'string' || raw.length % 4 !== 0 || !BASE64.test(raw)) return null;
  return { to, raw: Buffer.from(raw, 'base64') };
}

export async function handle(request: Request, deps: Deps): Promise<Response> {
  if (request.method !== 'POST') return refuse('method');

  const { GMAIL_USER: user, GMAIL_APP_PASSWORD: password, MAIL_RELAY_SECRET: secret } = deps.env;
  if (!user || !password || !secret || secret.length < MIN_SECRET_LENGTH) return refuse('not_set_up');

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_BODY_BYTES) return refuse('too_large');
  if (!signedRecently(request.headers, body, secret, Math.floor(deps.now() / 1000))) return refuse('unauthorized');

  const message = readMessage(body);
  if (!message) return refuse('bad_request');

  // The send is finished before the answer goes out: the host pauses whatever is still running once it has answered.
  try {
    const { rejected } = await deps.mailer(user, password).sendMail({ envelope: { from: user, to: message.to }, raw: message.raw });
    if (rejected.length > 0) return refuse('send_failed');
  } catch {
    // The mail server's words often repeat an address, so nothing of the error is kept.
    return refuse('send_failed');
  }
  return reply({ ok: true }, 200);
}

const live: Deps = {
  env: process.env,
  now: Date.now,
  mailer: (user, pass) =>
    nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
};

export function POST(request: Request): Promise<Response> {
  return handle(request, live);
}

export function GET(request: Request): Promise<Response> {
  return handle(request, live);
}
