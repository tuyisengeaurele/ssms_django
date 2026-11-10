import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Dates are written through dateFormat, so Kinyarwanda gets its own month and weekday names. The browser's formatter
// answers "rw" with English, so a screen that calls it directly shows English months to a Kinyarwanda reader.

const SRC = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('every screen writes dates through dateFormat', () => {
  const files = sources(SRC).filter((path) => !path.endsWith('dateFormat.ts'));

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(['new Intl.DateTimeFormat(', '.toLocaleDateString(', '.toLocaleTimeString('])('does not call the browser directly with %s', (call) => {
    const offenders = files.filter((path) => readFileSync(path, 'utf8').includes(call)).map((path) => path.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
});
