import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The contact inbox without subjects: the start of the message is what a row says, and on a phone the New and Answered
// marks still show.

const css = readFileSync(join(__dirname, 'components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const shell = readFileSync(join(__dirname, 'shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = Array.from(css.matchAll(/@media \(max-width: 760px\)\s*\{[\s\S]*?\n\}/g), (m) => m[0]).find((part) => part.includes('.inbox-row')) ?? '';

describe('the contact inbox', () => {
  // Two lines a message on a phone: the name with the date, then the start of the message with its mark. Left to place
  // themselves, the four parts took four lines, with the date alone on one and the mark alone on another.
  const placed = (name: string) => phone.match(new RegExp(`\.${name} \{[^}]*\}`))?.[0] ?? '';

  it('keeps a message to two lines on a phone: name and date, then its start and its mark', () => {
    expect(phone).not.toMatch(/\.badge[^{]*\{[^}]*display:\s*none/);
    expect(placed('inbox-who')).toMatch(/grid-area:\s*1 \/ 1/);
    expect(placed('inbox-when')).toMatch(/grid-area:\s*1 \/ 2/);
    expect(placed('inbox-preview')).toMatch(/grid-area:\s*2 \/ 1 \/ 3 \/ 3/);
    expect(placed('inbox-badges')).toMatch(/grid-area:\s*2 \/ 2/);
    expect(phone).toMatch(/\.inbox-row\.has-marks \.inbox-preview\s*\{[^}]*grid-column-end:\s*2/);
  });

  it('makes the start of an unread message stand out, now that no subject does', () => {
    expect(css).toMatch(/\.inbox-row\.is-unread \.inbox-preview[^{]*\{[^}]*font-weight:\s*[67]00/);
    expect(css).not.toMatch(/\.inbox-subject/);
  });

  it('keeps the dates in one column, with or without a mark beside them', () => {
    // Each row is a grid of its own. A mark column as wide as its mark, or gone without one, moved the date from row to row.
    expect(css).toMatch(/\.inbox-row \{[^}]*grid-template-columns:\s*160px minmax\(0, 1fr\) auto minmax\(\d{2,3}px, auto\)/);
  });

  it('keeps a long message to two lines in the bell', () => {
    expect(shell).toMatch(/\.note-preview\s*\{[^}]*-webkit-line-clamp:\s*2/);
    expect(shell).toMatch(/\.note-preview\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
