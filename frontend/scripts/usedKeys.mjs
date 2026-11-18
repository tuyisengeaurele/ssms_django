// Reads the source for the texts it asks for, so a test can check that every one exists in every language.
// The app looks a text up by name, t('navFarms'). A misspelt name does not fail to build, it shows the name on the screen.
import ts from 'typescript';

/** Where the key is in a call: t('key') and say('key') use the first argument, sayIn(locale, 'key') the second. */
const KEY_ARGUMENT = { t: 0, say: 0, sayIn: 1 };

function parse(code, fileName) {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

const lineOf = (file, node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

function calleeName(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

/** Looks through brackets, type assertions and non null marks to the expression that matters. */
function unwrap(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    node = node.expression;
  }
  return node;
}

const isFallback = (node) => ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken);

/** The fixed texts an argument can be: a string, a template without holes, either answer of a choice, or the text after ?? or ||. Anything else is not known. */
function literalsOf(node) {
  node = unwrap(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)];
  if (isFallback(node)) return [...literalsOf(node.left), ...literalsOf(node.right)];
  return [];
}

/** Every text asked for by a plain name: [{ key, line }]. A name worked out at run time is left to the other checks. */
export function calledKeys(code, fileName) {
  const file = parse(code, fileName);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name && name in KEY_ARGUMENT) {
        const argument = node.arguments[KEY_ARGUMENT[name]];
        if (argument) for (const key of literalsOf(argument)) found.push({ key, line: lineOf(file, argument) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Names built from a number or a word, t(`lpFaq${n}Q`): the fixed parts as a pattern that at least one real key must match. */
export function templateFamilies(code, fileName) {
  const file = parse(code, fileName);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const argument = name && name in KEY_ARGUMENT ? node.arguments[KEY_ARGUMENT[name]] : undefined;
      if (argument && ts.isTemplateExpression(argument)) {
        const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);
        const parts = [argument.head.text, ...argument.templateSpans.map((span) => span.literal.text)];
        found.push({
          pattern: new RegExp('^' + parts.map(escape).join('.+') + '$'),
          text: argument.getText(file).slice(1, -1),
          line: lineOf(file, argument),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function dynamicUses(node, found, file) {
  node = unwrap(node);
  if (ts.isConditionalExpression(node)) {
    dynamicUses(node.whenTrue, found, file);
    dynamicUses(node.whenFalse, found, file);
    return;
  }
  if (isFallback(node)) {
    dynamicUses(node.left, found, file);
    dynamicUses(node.right, found, file);
    return;
  }
  if (!ts.isElementAccessExpression(node) && !ts.isPropertyAccessExpression(node)) return;
  // Walk down the chain: TABLE[x].text is a property of an entry of TABLE, item.labelKey is a field of something from a list.
  let current = node;
  let throughElement = false;
  while (ts.isElementAccessExpression(current) || ts.isPropertyAccessExpression(current)) {
    if (ts.isElementAccessExpression(current)) throughElement = true;
    current = unwrap(current.expression);
  }
  const line = lineOf(file, node);
  if (throughElement && ts.isIdentifier(current)) found.push({ kind: 'table', name: current.text, line });
  else if (ts.isPropertyAccessExpression(node)) found.push({ kind: 'field', name: node.name.text, line });
}

/**
 * Texts asked for by looking them up: t(ROLE_LABEL_KEY[role]) names a table, t(tab.labelKey) names a field.
 * [{ kind: 'table' | 'field', name, line }]
 */
export function tableUses(code, fileName) {
  const file = parse(code, fileName);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name && name in KEY_ARGUMENT && node.arguments[KEY_ARGUMENT[name]]) dynamicUses(node.arguments[KEY_ARGUMENT[name]], found, file);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The shape of a text name: a short lowercase prefix, then a capital (navFarms, lpFaq1Q, hlO_web_ok). Server codes such as batch_started are not. */
const NAME_SHAPE = /^[a-z]{1,6}[A-Z][A-Za-z0-9_]*$/;

/**
 * What the code writes into tables and fields that are later read with t():
 * `tables` maps a constant's name to the name-shaped strings in its value (not its property names), and
 * `fields` maps a property name to the name-shaped strings assigned to it anywhere. Each is a list of { text, line }.
 */
export function definedValues(code, fileName) {
  const file = parse(code, fileName);
  const tables = new Map();
  const fields = new Map();
  const add = (map, key, text, node) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ text, line: lineOf(file, node) });
  };
  const propertyName = (property) => (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null);

  const collect = (node, into) => {
    if (ts.isPropertyAssignment(node)) {
      collect(node.initializer, into);
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) return;
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && NAME_SHAPE.test(node.text)) into.push({ text: node.text, node });
    ts.forEachChild(node, (child) => collect(child, into));
  };

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const values = [];
      collect(node.initializer, values);
      for (const { text, node: where } of values) add(tables, node.name.text, text, where);
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node);
      const value = unwrap(node.initializer);
      if (name && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && NAME_SHAPE.test(value.text)) add(fields, name, value.text, value);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { tables, fields };
}
