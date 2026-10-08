import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    const isCode = /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !path.includes(join('src', 'test'));
    return isCode ? [path] : [];
  });
}

const BANNED: Array<[RegExp, string]> = [
  [/['"`][^'"`\n]*\bFailed to\b/, 'say "We couldn\'t ..." instead of "Failed to ..."'],
  [/['"`][^'"`\n]*\b(failed|Failed)\.['"`]/, 'say what could not be done and what to try next'],
  [/unexpected error/i, 'say what the person can do next'],
  [/['"`]Invalid [a-z ]+\./, 'explain what is wrong and what to do'],
  [/\bError details\b/, 'call it "Technical details"'],
  [/['"`][^'"`\n]*\bHTTP \d{3}\b/, 'do not show status codes'],
];

describe('friendly wording in the app', () => {
  const files = sourceFiles(SRC);

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('keeps cold or technical error wording out of the interface', () => {
    const problems: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line) || /console\./.test(line)) return;
          for (const [pattern, hint] of BANNED) {
            if (pattern.test(line)) problems.push(`${file.replace(SRC, 'src')}:${i + 1}: ${line.trim()} (${hint})`);
          }
        });
    }
    expect(problems, '\n' + problems.join('\n')).toEqual([]);
  });
});
