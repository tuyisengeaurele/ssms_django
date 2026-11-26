import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The contact inbox without subjects: the start of the message is what a row says, and on a phone the New and Answered
// marks still show.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const shell = readFileSync(join(__dirname, 'shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = Array.from(css.matchAll(/@media \(max-width: 760px\)\s*\{[\s\S]*?\n\}/g), (m) => m[0]).find((part) => part.includes('.inbox-row')) ?? '';

describe('the contact inbox', () => {
  it('shows the New and Answered marks on a phone, on a line of their own', () => {
    expect(phone).not.toMatch(/\.badge[^{]*\{[^}]*display:\s*none/);
    expect(phone).toMatch(/\.inbox-badges\s*\{[^}]*grid-column:\s*1 \/ 3/);
  });

  it('makes the start of an unread message stand out, now that no subject does', () => {
    expect(css).toMatch(/\.inbox-row\.is-unread \.inbox-preview[^{]*\{[^}]*font-weight:\s*[67]00/);
    expect(css).not.toMatch(/\.inbox-subject/);
  });

  it('keeps a long message to two lines in the bell', () => {
    expect(shell).toMatch(/\.note-preview\s*\{[^}]*-webkit-line-clamp:\s*2/);
    expect(shell).toMatch(/\.note-preview\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
