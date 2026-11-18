type Chunk = { file: string; css?: string[]; imports?: string[]; isEntry?: boolean; isDynamicEntry?: boolean };

export type PageLocale = 'en' | 'fr' | 'rw';
export function buildLandingPage(options: {
  shell: string;
  appHtml: string;
  stylesheets: string[];
  modulepreloads: string[];
  fonts: string[];
  locale: PageLocale;
  meta: { description: string; share: string; schema: string };
  languageFile?: string;
}): string;
export function landingAddress(locale: PageLocale): string;
export function landingFile(locale: PageLocale): string;
export function siteOf(shell: string): string;
export function languageFileOf(manifest: Record<string, Chunk>, locale: PageLocale): string | undefined;
export function stylesheetsOf(manifest: Record<string, Chunk>): { stylesheets: string[]; modulepreloads: string[] };
export function fontsToPreload(css: string): string[];
