import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// framer-motion is 41 KB compressed and only the signed in app, its dialogs and its toasts animate with it. The landing page
// has its own small hooks. It used to download the library anyway, because the provider that tells framer about "reduced
// motion" sat at the root of the whole app. These checks keep it out of the landing page's way and keep every animation
// that does use framer inside a provider, so a person who asked for less motion still gets less motion.

const SRC = __dirname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, 'utf8');

describe('where framer-motion is used', () => {
  it('is not pulled in by the root of the app, which the landing page shares', () => {
    const app = read(join(SRC, 'App.tsx'));
    expect(app).not.toMatch(/framer-motion/);
    expect(app).not.toMatch(/MotionProvider/);
  });

  it('is only used by files that provide the reduced motion setting themselves', () => {
    const users = sources(SRC).filter((file) => {
      const code = read(file);
      // A value import of the library. A type only import costs nothing at run time.
      return /import\s+(?!type\b)[^;]*from\s+'framer-motion'/.test(code) && !file.endsWith('MotionProvider.tsx');
    });
    expect(users.map((file) => relative(SRC, file).replace(/\\/g, '/')).sort()).toEqual([
      'components/layout/DashboardLayout.tsx',
      'components/ui/Modal.tsx',
      'context/ToastList.tsx',
    ]);
    for (const file of users) {
      expect(read(file), relative(SRC, file)).toMatch(/<MotionProvider>/);
    }
  });
});
