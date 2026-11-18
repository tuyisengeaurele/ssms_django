import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The words of an invalid field come from ValidationMessages, which needs the language of the screen, so the app mounts it once,
// and the app itself sits inside the language provider that main.tsx makes (see languageProviderScope.test.ts).

describe('the app', () => {
  const app = readFileSync(join(__dirname, 'App.tsx'), 'utf8');
  const main = readFileSync(join(__dirname, 'main.tsx'), 'utf8');

  it('mounts ValidationMessages once', () => {
    expect(app.match(/<ValidationMessages \/>/g)).toHaveLength(1);
  });

  it('is started inside the language provider, which main.tsx makes from the address and the saved choice', () => {
    expect(main.indexOf('<LanguageProvider')).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('<LanguageProvider')).toBeLessThan(main.indexOf('<App />'));
    expect(main.indexOf('<App />')).toBeLessThan(main.indexOf('</LanguageProvider>'));
  });
});
