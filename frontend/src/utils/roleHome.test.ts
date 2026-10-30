import { describe, expect, it } from 'vitest';
import { homePathFor } from './roleHome';

describe('homePathFor', () => {
  it.each([
    ['ADMIN', '/admin'],
    ['SUPERVISOR', '/supervisor'],
    ['FARMER', '/farmer'],
  ] as const)('sends a %s to %s', (role, path) => {
    expect(homePathFor(role)).toBe(path);
  });

  it('sends anyone else, or nobody, to the farmer dashboard', () => {
    expect(homePathFor(undefined)).toBe('/farmer');
    expect(homePathFor('SOMETHING' as never)).toBe('/farmer');
  });
});
