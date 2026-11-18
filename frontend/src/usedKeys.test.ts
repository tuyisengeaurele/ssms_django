import { describe, expect, it } from 'vitest';
import { calledKeys, definedValues, tableUses, templateFamilies } from '../scripts/usedKeys.mjs';

// The checks that every text the code asks for exists (src/i18n/keysUsed.test.ts) read the source with these helpers.

const keys = (code: string) => calledKeys(code, 'x.tsx').map((found) => found.key);

describe('calledKeys: texts asked for by name', () => {
  it('finds t() and say() with a plain string', () => {
    expect(keys(`const a = t('navFarms'); const b = say("navBatches");`)).toEqual(['navFarms', 'navBatches']);
  });

  it('finds a template without any substitution', () => {
    expect(keys('const a = t(`navFarms`);')).toEqual(['navFarms']);
  });

  it('finds both answers of a choice between two texts', () => {
    expect(keys(`t(n === 1 ? 'qsOne' : 'qsMany')`)).toEqual(['qsOne', 'qsMany']);
  });

  it('finds the answers in a nested choice and inside brackets', () => {
    expect(keys(`t((a ? 'x1' : b ? 'x2' : 'x3'))`)).toEqual(['x1', 'x2', 'x3']);
  });

  it('finds a call made on an object, such as language.t()', () => {
    expect(keys(`language.t('navFarms')`)).toEqual(['navFarms']);
  });

  it('finds the key of sayIn(locale, key), which is its second argument', () => {
    expect(keys(`sayIn(loadLocale(), 'erReference')`)).toEqual(['erReference']);
  });

  it('knows the line each one is on', () => {
    expect(calledKeys(`\n\nt('navFarms')`, 'x.ts')[0].line).toBe(3);
  });

  it('skips a key that is worked out at run time', () => {
    expect(keys(`t(key); t(TABLE[x]); t(a + b); t(\`lpFaq\${n}Q\`)`)).toEqual([]);
  });

  it('skips other functions, even with a key-like word', () => {
    expect(keys(`console.log('navFarms'); translate('navFarms'); setTitle('navFarms')`)).toEqual([]);
  });

  it('reads JSX as well as plain TypeScript', () => {
    expect(keys(`const el = <p>{t('navFarms')}</p>;`)).toEqual(['navFarms']);
    expect(calledKeys(`const x = (v: number) => t('navFarms');`, 'x.ts').map((f) => f.key)).toEqual(['navFarms']);
  });
});

describe('templateFamilies: texts whose name is built from a number or a word', () => {
  it('turns the fixed parts into a pattern that a real key must match', () => {
    const [family] = templateFamilies('t(`lpFaq${n}Q`)', 'x.tsx');
    expect(family.pattern.test('lpFaq3Q')).toBe(true);
    expect(family.pattern.test('lpFaq3A')).toBe(false);
    expect(family.text).toBe('lpFaq${n}Q');
  });

  it('handles several holes and a hole at the end', () => {
    const [a, b] = templateFamilies('t(`hlO_${name}_${outcome}`); t(`stage${stage}`)', 'x.ts');
    expect(a.pattern.test('hlO_web_ok')).toBe(true);
    expect(b.pattern.test('stageHatching')).toBe(true);
    expect(b.pattern.test('navStage')).toBe(false);
  });

  it('ignores a template with no hole, which calledKeys already covers', () => {
    expect(templateFamilies('t(`navFarms`)', 'x.ts')).toEqual([]);
  });
});

describe('calledKeys: a fallback written after a lookup', () => {
  it('finds the text after ?? and ||, since a missing entry shows it', () => {
    expect(keys(`t(LABELS[kind] ?? 'alTypeSystem')`)).toEqual(['alTypeSystem']);
    expect(keys(`t(LABELS[kind] || 'alTypeOther')`)).toEqual(['alTypeOther']);
  });

  it('sees through a type assertion and a non null mark', () => {
    expect(keys(`t('navFarms' as string); t(('navBatches')!)`)).toEqual(['navFarms', 'navBatches']);
  });
});

describe('tableUses: a text looked up in a table or read from a field', () => {
  const uses = (code: string) => tableUses(code, 'x.tsx').map((use) => `${use.kind}:${use.name}`);

  it('names the table in t(TABLE[x])', () => {
    expect(uses(`t(ROLE_LABEL_KEY[user.role])`)).toEqual(['table:ROLE_LABEL_KEY']);
  });

  it('names the table when a field of the entry is read, t(TABLE[x].text)', () => {
    expect(uses(`t(STATUS_WORDS[check.status].text)`)).toEqual(['table:STATUS_WORDS']);
  });

  it('names the table on both sides of a fallback', () => {
    expect(uses(`t(A[x] ?? B[y])`)).toEqual(['table:A', 'table:B']);
  });

  it('names the field in t(item.labelKey), where the item comes from a list', () => {
    expect(uses(`t(tab.labelKey)`)).toEqual(['field:labelKey']);
    expect(uses(`t(a.b.title)`)).toEqual(['field:title']);
  });

  it('ignores a plain variable, a literal and a template, which other checks cover or cannot know', () => {
    expect(uses(`t(key); t('navFarms'); t(\`lpFaq\${n}Q\`)`)).toEqual([]);
  });

  it('records the line of each use', () => {
    expect(tableUses(`

t(T[x])`, 'x.ts')[0].line).toBe(3);
  });
});

describe('definedValues: the texts written into tables and fields', () => {
  it('lists the name-shaped values of a table, not its property names', () => {
    const { tables } = definedValues(`const ROLE_LABEL_KEY = { admin: 'roleAdmin', farmer: 'roleFarmer', other: 'plain text' };`, 'x.ts');
    expect(tables.get('ROLE_LABEL_KEY')?.map((v) => v.text)).toEqual(['roleAdmin', 'roleFarmer']);
  });

  it('reads tables of objects and lists too', () => {
    const { tables } = definedValues(`const STATUS = { ok: { text: 'hlOk', tone: 'good' }, bad: { text: 'hlBad', tone: 'bad' } }; const LIST = ['navFarms', 'navBatches'];`, 'x.ts');
    expect(tables.get('STATUS')?.map((v) => v.text)).toEqual(['hlOk', 'hlBad']);
    expect(tables.get('LIST')?.map((v) => v.text)).toEqual(['navFarms', 'navBatches']);
  });

  it('does not read snake_case words as names, since they are codes from the server', () => {
    const { tables } = definedValues(`const KIND = { batch_started: 'calStarted' };`, 'x.ts');
    expect(tables.get('KIND')?.map((v) => v.text)).toEqual(['calStarted']);
  });

  it('lists the name-shaped values of each field', () => {
    const { fields } = definedValues(`const TABS = [{ labelKey: 'navFarms', to: '/farms' }, { labelKey: 'navBatches', to: '/batches' }];`, 'x.ts');
    expect(fields.get('labelKey')?.map((v) => v.text)).toEqual(['navFarms', 'navBatches']);
    expect(fields.get('to')).toBeUndefined();
  });
});
