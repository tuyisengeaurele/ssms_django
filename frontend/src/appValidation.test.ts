import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The words of an invalid field come from ValidationMessages, which needs the language of the screen, so the app mounts it
// once, inside the language provider.

describe('the app', () => {
  const app = readFileSync(join(__dirname, 'App.tsx'), 'utf8');

  it('mounts ValidationMessages once, inside the language provider', () => {
    expect(app.match(/<ValidationMessages \/>/g)).toHaveLength(1);
    expect(app.indexOf('<LanguageProvider>')).toBeLessThan(app.indexOf('<ValidationMessages />'));
    expect(app.indexOf('<ValidationMessages />')).toBeLessThan(app.indexOf('</LanguageProvider>'));
  });
});
