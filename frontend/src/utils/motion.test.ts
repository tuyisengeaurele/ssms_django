import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DURATION, EASE_OUT } from './motion';

// One motion style: the stylesheet tokens and the framer values must say the same thing.
const css = readFileSync(join(__dirname, '../index.css'), 'utf8');
const token = (name: string) => css.match(new RegExp(`${name}:\s*([^;]+);`))?.[1].trim() ?? '';

describe('motion style', () => {
  it('uses the same easing curve in code as in the stylesheet', () => {
    const curve = token('--ease-out').match(/cubic-bezier\(([^)]+)\)/)?.[1].split(',').map(Number);
    expect([...EASE_OUT]).toEqual(curve);
  });

  it.each([
    ['fast', '--duration-fast'],
    ['base', '--duration-normal'],
    ['slow', '--duration-slow'],
  ] as const)('uses the same %s duration in code as in the stylesheet', (name, tokenName) => {
    expect(DURATION[name] * 1000).toBe(Number.parseInt(token(tokenName), 10));
  });
});

describe('where framer animates', () => {
  const files = ['components/layout/DashboardLayout.tsx', 'components/ui/Modal.tsx', 'context/ToastList.tsx'];

  it.each(files)('%s takes its timing from the shared values, not its own numbers', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(source).not.toMatch(/duration:\s*[0-9.]/);
    expect(source).not.toMatch(/ease:\s*[[']/);
    expect(source).toMatch(/utils\/motion/);
  });
});
