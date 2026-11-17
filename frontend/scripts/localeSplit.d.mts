import type { Plugin } from 'vite';

export const LOCALES: string[];
export function pickLocale(code: string, locale: string): string;
export function localeSplit(): Plugin;
