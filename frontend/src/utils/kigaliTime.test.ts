import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromKigaliInput, toKigaliInput } from './kigaliTime';

// What an admin types means Kigali time, wherever their computer thinks it is. Rwanda is two hours ahead of UTC all year.

afterEach(() => vi.unstubAllEnvs());

const CASES: Array<[string, string]> = [
  ['2026-12-05T20:00:00Z', '2026-12-05T22:00'],
  ['2026-12-05T22:30:00Z', '2026-12-06T00:30'],
  ['2026-12-31T23:15:00+00:00', '2027-01-01T01:15'],
  ['2027-02-28T22:00:00Z', '2027-03-01T00:00'],
  // The same moment written with another offset.
  ['2026-06-10T09:00:00-05:00', '2026-06-10T16:00'],
];

describe.each(['Africa/Kigali', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'])('on a computer set to %s', (zone) => {
  const pretend = () => vi.stubEnv('TZ', zone);

  it.each(CASES)('reads %s as %s in Kigali', (iso, typed) => {
    pretend();
    expect(toKigaliInput(iso)).toBe(typed);
  });

  it.each(CASES)('sends what was typed as the same moment as %s', (iso, typed) => {
    pretend();
    const sent = fromKigaliInput(typed);
    expect(sent).toBe(`${typed}:00+02:00`);
    expect(new Date(sent).getTime()).toBe(new Date(iso).getTime());
  });
});

// Without this the tests above could pass on a machine where setting the zone does nothing.
it('really does change the zone of the test', () => {
  vi.stubEnv('TZ', 'America/Los_Angeles');
  const west = new Date(2026, 0, 1).getTimezoneOffset();
  vi.stubEnv('TZ', 'Pacific/Auckland');
  expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(west);
});

it('drops the seconds, which the boxes do not show', () => {
  expect(toKigaliInput('2026-12-05T20:00:59.999Z')).toBe('2026-12-05T22:00');
});
