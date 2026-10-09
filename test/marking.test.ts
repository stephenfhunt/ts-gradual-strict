/**
 * What can carry a mark, and what only looks like one (`spec.md` §Marking). One row per
 * construct: a marked one must report the null error inside it, under the name `--report`
 * gives it, with no stray; an unhonoured one must report nothing *and* be a stray, which is
 * what keeps it from passing silently.
 */
import { describe, expect, test } from 'vitest';
import { checkProgram, findStrays } from '../src/check.ts';
import { buildReport } from '../src/report.ts';
import { strictProgram } from './support.ts';

/**
 * A strict error, plus a reference to unmarked `legacy` so the report names the mark.
 * `legacy` is a global from a script file of its own, so no row's mark can cover it and a
 * leading `@strictFile` stays leading.
 */
const BAD = 'const n: number = legacy().length;';
const LEGACY = 'function legacy(): string | null { return null; }\n';

const marked: readonly (readonly [string, string, string])[] = [
  ['function declaration', `/** @strict */\nfunction f() { ${BAD} }`, 'f'],
  [
    'export default function',
    `/** @strict */\nexport default function () { ${BAD} }`,
    'function in m.ts',
  ],
  ['exported arrow', `/** @strict */\nexport const f = () => { ${BAD} };`, 'f'],
  ['class', `/** @strict */\nclass C { m() { ${BAD} } }`, 'C'],
  ['method', `class C {\n  /** @strict */\n  m() { ${BAD} }\n}`, 'C.m'],
  [
    'constructor',
    `class C {\n  /** @strict */\n  constructor() { ${BAD} }\n}`,
    'C.constructor',
  ],
  ['getter', `class C {\n  /** @strict */\n  get g() { ${BAD} return 1; }\n}`, 'C.g'],
  ['class property', `class C {\n  /** @strict */\n  h = () => { ${BAD} };\n}`, 'C.h'],
  ['object literal method', `const o = {\n  /** @strict */\n  m() { ${BAD} },\n};`, 'm'],
  [
    'object literal property',
    `const o = {\n  /** @strict */\n  m: () => { ${BAD} },\n};`,
    'm',
  ],
  ['namespace', `/** @strict */\nnamespace N { export function f() { ${BAD} } }`, 'N'],
  ['enum', '/** @strict */\nenum E { A = legacy().length }', 'E'],
  [
    'inline arrow argument',
    `declare function on(cb: () => void): void;\non(/** @strict */ () => { ${BAD} });`,
    'arrow in m.ts',
  ],
  [
    'expression statement',
    `declare function on(cb: () => void): void;\n/** @strict */\non(() => { ${BAD} });`,
    'statement in m.ts',
  ],
  [
    'if statement in a function',
    `function f(c: boolean) {\n  /** @strict */\n  if (c) { ${BAD} }\n}`,
    'if in f',
  ],
  ['block', `function f() {\n  /** @strict */\n  { ${BAD} }\n}`, 'block in f'],
  [
    'return statement in a method',
    'class C {\n  m() {\n    /** @strict */\n    return legacy().length;\n  }\n}',
    'return in C.m',
  ],
  ['for loop', `function f() {\n  /** @strict */\n  for (;;) { ${BAD} }\n}`, 'for in f'],
  ['whole file', `// @strictFile\n${BAD}`, 'm.ts'],
  [
    'whole file, after a license comment',
    `/* (c) ACME */\n// @strictFile\n${BAD}`,
    'm.ts',
  ],
];

/** Each with the fix its message must name: a stray that misdirects is half a fix. */
const stray: readonly (readonly [string, string, string])[] = [
  ['line comment', `// @strict\nfunction f() { ${BAD} }`, '`/** @strict */`'],
  ['plain block comment', `/* @strict */\nfunction f() { ${BAD} }`, '`/** @strict */`'],
  [
    'JSDoc attached to nothing',
    `function f() { ${BAD} }\n/** @strict */\n`,
    'directly above',
  ],
  [
    '@strictFile after an import',
    `import {} from './x';\n// @strictFile\n${BAD}`,
    'first token',
  ],
  [
    "@strictFile after 'use strict'",
    `'use strict';\n// @strictFile\n${BAD}`,
    'first token',
  ],
];

function run(source: string) {
  const program = strictProgram({
    'm.ts': source,
    'legacy.ts': LEGACY,
    'x.ts': 'export {};',
  });
  return {
    reported: checkProgram(program).length,
    strays: findStrays(program).map((x) => x.message),
    names: buildReport(program).edges.map((e) => e.from),
  };
}

describe('marking', () => {
  for (const [construct, source, name] of marked) {
    test(`a mark on: ${construct}`, () => {
      const r = run(source);
      expect(r.reported).toBeGreaterThan(0);
      expect(r.strays).toEqual([]);
      expect(r.names).toEqual([name]);
    });
  }

  for (const [construct, source, fix] of stray) {
    test(`marks nothing, and says so: ${construct}`, () => {
      const r = run(source);
      expect(r.reported).toBe(0);
      expect(r.strays).toEqual([expect.stringContaining(fix)]);
    });
  }
});
