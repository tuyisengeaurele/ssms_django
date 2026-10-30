import { useLayoutEffect, useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'ssms_theme';
const CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && (CHOICES as string[]).includes(saved)) return saved as ThemeChoice;
  } catch {
    // Storage can be blocked. Following the computer still works.
  }
  return 'system';
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

// One choice for the whole page, so the menu that sets it and the layout that applies it always agree.
let current: ThemeChoice = readThemeChoice();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function setThemeChoice(choice: ThemeChoice) {
  current = choice;
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // The choice still holds for this visit.
  }
  notify();
}

/** Read the saved choice again, for example after another tab changed it. */
export function reloadThemeChoice() {
  current = readThemeChoice();
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) reloadThemeChoice();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', listener);
    window.removeEventListener('storage', onStorage);
  };
}

// A string, so React can tell whether anything changed.
const snapshot = () => `${current}|${systemPrefersDark() ? 'dark' : 'light'}`;

export function useTheme() {
  const [choice, system] = useSyncExternalStore(subscribe, snapshot).split('|') as [ThemeChoice, Theme];
  return { choice, theme: resolveTheme(choice, system === 'dark'), setChoice: setThemeChoice };
}

/**
 * Puts the theme on the page for as long as the signed in app is open. The public pages have their own look and never
 * carry it, so it is taken off again when the app closes.
 */
export function useApplyTheme() {
  const { theme } = useTheme();
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useLayoutEffect(() => () => document.documentElement.removeAttribute('data-theme'), []);
}
