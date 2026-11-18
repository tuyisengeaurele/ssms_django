import { describe, expect, it } from 'vitest';
import { calledKeys, definedValues, pluralPairs, singularChecks, tableUses, templateFamilies } from '../scripts/usedKeys.mjs';

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

describe('singularChecks: a text chosen by hand because a count is 1', () => {
  const lines = (code: string) => singularChecks(code, 'x.tsx').map((found) => found.line);

  it('finds a choice between two texts made inside t()', () => {
    expect(lines(`const a = t(n === 1 ? 'xOne' : 'x');`)).toEqual([1]);
  });

  it('finds a choice between two calls of t()', () => {
    expect(lines(`const a = n === 1 ? t('xOne') : fill(t('x'), { n });`)).toEqual([1]);
  });

  it('finds it written the other way round, and with != and !==', () => {
    expect(lines(`t(1 === n ? 'a' : 'b'); t(n !== 1 ? 'a' : 'b'); t(n != 1 ? 'a' : 'b')`)).toEqual([1, 1, 1]);
  });

  it('finds a comparison that is really the same choice, n > 1 and n <= 1', () => {
    expect(lines(`t(n > 1 ? 'many' : 'one'); t(n <= 1 ? 'one' : 'many')`)).toEqual([1, 1]);
  });

  it('knows the line and the condition', () => {
    const [found] = singularChecks(`

const a = t(list.length === 1 ? 'a' : 'b');`, 'x.ts');
    expect(found.line).toBe(3);
    expect(found.condition).toBe('list.length === 1');
  });

  it('ignores a comparison with 1 that has nothing to do with texts', () => {
    expect(lines(`const id = rooms.length === 1 ? rooms[0].id : '';`)).toEqual([]);
  });

  it('ignores a choice for zero, which is a different sentence and not a plural', () => {
    expect(lines(`t(n === 0 ? 'none' : 'some')`)).toEqual([]);
  });

  it('ignores a condition that is only partly about a count', () => {
    expect(lines(`const k = item.kind === 'late' && item.days === 1 ? 'yesterday' : KEY[item.kind];`)).toEqual([]);
  });

  it('finds the inner choice of a chain, so a zero check in front does not hide it', () => {
    expect(lines(`const a = n === 0 ? t('none') : n === 1 ? t('one') : fill(t('many'), { n });`)).toEqual([1]);
  });
});

describe('pluralPairs: the two texts a count chooses between', () => {
  const pairs = (code: string) => pluralPairs(code, 'x.tsx').map((p) => `${p.one}|${p.other}`);

  it('finds the keys given to tn', () => {
    expect(pairs(`tn(n, 'xOne', 'x'); tn(a.length, 'yOne', 'y', { n: 1 })`)).toEqual(['xOne|x', 'yOne|y']);
  });

  it('finds the keys given to pluralText, where they come after the function and the language', () => {
    expect(pairs(`pluralText(t, locale, n, 'xOne', 'x')`)).toEqual(['xOne|x']);
  });

  it('skips a call whose keys are not written out', () => {
    expect(pairs(`tn(n, one, other); tn(n, ONE[x], 'x')`)).toEqual([]);
  });

  it('knows the line', () => {
    expect(pluralPairs(`

tn(n, 'xOne', 'x')`, 'x.ts')[0].line).toBe(3);
  });
});

describe('calls that happen to share a name with something every object has', () => {
  const odd = `a.toString(); b.valueOf(1, 2, 3); c.constructor(1); d.hasOwnProperty('x', 'y')`;

  it('are not mistaken for text lookups or plural calls', () => {
    expect(calledKeys(odd, 'x.ts')).toEqual([]);
    expect(tableUses(odd, 'x.ts')).toEqual([]);
    expect(templateFamilies(odd, 'x.ts')).toEqual([]);
    expect(pluralPairs(odd, 'x.ts')).toEqual([]);
    expect(singularChecks(odd, 'x.ts')).toEqual([]);
  });
});
