import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Status and role labels are plain words. A dot or a coloured pill beside them looks like a template, so these
// rules keep both out of the stylesheets and the markup.

const here = __dirname;
const components = readFileSync(join(here, 'components.css'), 'utf8');
const shell = readFileSync(join(here, 'shell.css'), 'utf8');

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start) + 1);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('Plain labels', () => {
  it('draws a badge as plain text with no pill behind it', () => {
    const badge = rule(components, '.badge');
    expect(badge).not.toBe('');
    expect(badge).not.toMatch(/border-radius|background|padding:\s*[1-9]/);
    expect(badge).not.toMatch(/text-transform:\s*uppercase/);
  });

  it.each(['green', 'blue', 'yellow', 'red', 'purple', 'gray', 'teal', 'ink'])('colours badge-%s with its text only', (name) => {
    const css = rule(components, `.badge-${name}`);
    expect(css).not.toBe('');
    expect(css).not.toMatch(/background/);
  });

  it('colours a stage or result label with its text only', () => {
    const css = rule(components, '.badge-stage');
    expect(css).toMatch(/color:/);
    expect(css).not.toMatch(/background/);
  });

  it('has no dot before a label', () => {
    expect(components).not.toMatch(/\.badge-dot/);
  });

  it('has no coloured dots in the alert lists or the inbox', () => {
    expect(shell).not.toMatch(/\.note-dot/);
    expect(components).not.toMatch(/\.note-dot|\.inbox-dot/);
  });

  it('shows menu and sidebar counts as plain numbers', () => {
    for (const [css, selector] of [[shell, '.sidebar-badge'], [shell, '.menu-count']] as const) {
      const block = rule(css, selector);
      expect(block).not.toBe('');
      expect(block).not.toMatch(/border-radius|background/);
    }
  });

  it('leaves no dot or pill classes in the markup', () => {
    const offenders = sources(join(here, '..'))
      .filter((file) => /badge-dot|note-dot|inbox-dot/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(join(here, '..'), ''));
    expect(offenders).toEqual([]);
  });
});
