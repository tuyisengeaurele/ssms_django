import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The form keeps a place for a sending error above the button. With nothing in it, that place left a hole.

const css = readFileSync(join(__dirname, 'contact.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the contact form', () => {
  it('holds no empty room above the button while there is no error, and keeps the error where it is announced', () => {
    const empty = css.match(/\.landing \.l-contact__error:empty \{[^}]*\}/)?.[0] ?? '';
    expect(empty).toMatch(/min-height:\s*0/);
    expect(empty).toMatch(/margin:\s*0/);
    // Hidden with display none, a screen reader would not announce what arrives in it.
    expect(empty).not.toMatch(/display:\s*none/);
  });
});
