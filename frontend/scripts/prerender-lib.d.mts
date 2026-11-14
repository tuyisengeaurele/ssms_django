type Chunk = { file: string; css?: string[]; imports?: string[]; isEntry?: boolean; isDynamicEntry?: boolean };

export function buildLandingPage(options: {
  shell: string;
  appHtml: string;
  stylesheets: string[];
  modulepreloads: string[];
  fonts: string[];
}): string;
export function stylesheetsOf(manifest: Record<string, Chunk>): { stylesheets: string[]; modulepreloads: string[] };
export function fontsToPreload(css: string): string[];
