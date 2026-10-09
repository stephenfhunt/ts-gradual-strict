/**
 * Silencing a strict-only error inside a mark (`spec.md` §Silencing an error). Each way of
 * doing it is checked against both builds that will see it — this tool's strict program
 * and the project's own non-strict one — because a silencer that satisfies one and breaks
 * the other is the trap: `@ts-expect-error` over an error only strict rules report is an
 * *unused* directive to the project's build, which fails on it.
 */
import { describe, expect, test } from 'vitest';
import { checkProgram } from '../src/check.ts';
import { allDiagnostics, legacyProgram, strictProgram } from './support.ts';

const LEGACY = 'function legacy(): string | null { return null; }\n';

function both(body: string) {
  const files = {
    'm.ts': `${LEGACY}/** @strict */\nfunction f(): number {\n${body}\n}\n`,
  };
  return {
    tool: checkProgram(strictProgram(files)).map((d) => d.code),
    build: allDiagnostics(legacyProgram(files)).map((d) => d.code),
  };
}

describe('silencing a strict-only error', () => {
  test('unsilenced, the tool reports it and the build does not', () => {
    expect(both('  return legacy().length;')).toEqual({ tool: [2531], build: [] });
  });

  test.each([
    ['a non-null assertion', '  return legacy()!.length;'],
    ['a narrowing check', '  const s = legacy();\n  return s === null ? 0 : s.length;'],
    ['@ts-ignore', '  // @ts-ignore\n  return legacy().length;'],
  ])('%s satisfies both builds', (_, body) => {
    expect(both(body)).toEqual({ tool: [], build: [] });
  });

  test('@ts-expect-error satisfies the tool and fails the project build', () => {
    expect(both('  // @ts-expect-error\n  return legacy().length;')).toEqual({
      tool: [],
      build: [2578],
    });
  });
});
