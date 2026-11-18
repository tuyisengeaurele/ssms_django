import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The app used to download an animation library (41 KB compressed) for its dialogs, toasts and page changes. They animate in CSS
// now (see styles/presenceCss.test.ts and hooks/usePresence.ts). These checks keep the library out for good, so a bundle that
// shrank does not quietly grow again.

const SRC = __dirname;
const ROOT = join(SRC, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('animation without a library', () => {
  it('has no framer-motion in the dependencies', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect({ ...manifest.dependencies, ...manifest.devDependencies }).not.toHaveProperty('framer-motion');
  });

  it('imports it nowhere in the source', () => {
    const users = files(SRC).filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('motionScope.test.ts') && /from\s+'(framer-)?motion'/.test(readFileSync(file, 'utf8')));
    expect(users).toEqual([]);
  });

  it('does not set aside a build chunk for it', () => {
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).not.toMatch(/framer-motion|'motion'/);
  });
});
