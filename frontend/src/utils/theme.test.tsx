import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPrefersDark } from '../test/setup';
import { readThemeChoice, reloadThemeChoice, resolveTheme, setThemeChoice, THEME_KEY, useApplyTheme, useTheme } from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  reloadThemeChoice();
});

describe('readThemeChoice', () => {
  it('follows the computer when nothing was chosen', () => {
    expect(readThemeChoice()).toBe('system');
  });

  it.each(['light', 'dark', 'system'])('reads a saved %s', (value) => {
    localStorage.setItem(THEME_KEY, value);
    expect(readThemeChoice()).toBe(value);
  });

  it('ignores a saved value it does not know', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(readThemeChoice()).toBe('system');
  });

  it('follows the computer when the browser will not let it read storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readThemeChoice()).toBe('system');
    spy.mockRestore();
  });
});

describe('resolveTheme', () => {
  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ] as const)('%s with the computer on dark=%s is %s', (choice, systemDark, expected) => {
    expect(resolveTheme(choice, systemDark)).toBe(expected);
  });
});

describe('useTheme', () => {
  it('starts on the computer setting', () => {
    setPrefersDark(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe('system');
    expect(result.current.theme).toBe('dark');
  });

  it('changes and remembers the choice', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice('dark'));
    expect(result.current.choice).toBe('dark');
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('follows the computer live while the choice is system', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    act(() => setPrefersDark(true));
    expect(result.current.theme).toBe('dark');
    act(() => setPrefersDark(false));
    expect(result.current.theme).toBe('light');
  });

  it('ignores the computer once a theme was chosen', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice('light'));
    act(() => setPrefersDark(true));
    expect(result.current.theme).toBe('light');
  });

  it('shares one choice between every place that asks', () => {
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    act(() => a.result.current.setChoice('dark'));
    expect(b.result.current.choice).toBe('dark');
  });

  it('still switches for this visit when the browser will not save it', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice('dark'));
    expect(result.current.theme).toBe('dark');
    spy.mockRestore();
  });

  it('picks up a change made in another tab', () => {
    const { result } = renderHook(() => useTheme());
    localStorage.setItem(THEME_KEY, 'dark');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' })); });
    expect(result.current.choice).toBe('dark');
  });

  it('does not react to another tab changing something else', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'ssms_nav', newValue: 'open' })); });
    expect(result.current.choice).toBe('system');
  });
});

describe('useApplyTheme', () => {
  const attr = () => document.documentElement.getAttribute('data-theme');

  it('puts the theme on the page while the app is open', () => {
    renderHook(() => useApplyTheme());
    expect(attr()).toBe('light');
  });

  it('follows a change of choice', () => {
    renderHook(() => useApplyTheme());
    act(() => setThemeChoice('dark'));
    expect(attr()).toBe('dark');
  });

  it('follows the computer', () => {
    renderHook(() => useApplyTheme());
    act(() => setPrefersDark(true));
    expect(attr()).toBe('dark');
  });

  it('takes the theme off the page when the app closes, so public pages stay light', () => {
    setThemeChoice('dark');
    const { unmount } = renderHook(() => useApplyTheme());
    expect(attr()).toBe('dark');
    unmount();
    expect(attr()).toBeNull();
  });
});
