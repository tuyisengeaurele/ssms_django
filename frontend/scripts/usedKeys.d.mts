export function calledKeys(code: string, fileName: string): Array<{ key: string; line: number }>;
export function templateFamilies(code: string, fileName: string): Array<{ pattern: RegExp; text: string; line: number }>;
export function tableUses(code: string, fileName: string): Array<{ kind: 'table' | 'field'; name: string; line: number }>;
export function definedValues(
  code: string,
  fileName: string,
): { tables: Map<string, Array<{ text: string; line: number }>>; fields: Map<string, Array<{ text: string; line: number }>> };
