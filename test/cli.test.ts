/**
 * The command end to end, over fixture projects on disk: `spec.md` §The command's table,
 * one row per test. Runs `src/cli.ts` directly under Node's type stripping, which is also
 * a check that the source needs no build step to run.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function run(...args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(process.execPath, ['src/cli.ts', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('the command', () => {
  test('a marked region with errors prints them and exits 1', () => {
    const r = run('-p', 'test/fixtures/legacy/tsconfig.json', '--no-pretty');
    expect(r.stdout).toBe(
      [
        "test/fixtures/legacy/src/greet.ts(5,21): error TS2531: Object is possibly 'null'.",
        "test/fixtures/legacy/src/greet.ts(5,21): error TS2532: Object is possibly 'undefined'.",
        '',
        'Found 2 errors in @strict code.',
        '',
      ].join('\n'),
    );
    expect(r.status).toBe(1);
  });

  test('clean marked regions print nothing and exit 0', () => {
    const r = run('-p', 'test/fixtures/clean/tsconfig.json');
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  test('an unreadable tsconfig exits 2', () => {
    const r = run('-p', 'test/fixtures/missing/tsconfig.json', '--no-pretty');
    expect(r.stdout).toContain('TS5083');
    expect(r.status).toBe(2);
  });

  test('an unknown argument prints usage and exits 2', () => {
    const r = run('--bogus');
    expect(r.stderr).toContain('usage: ts-gradual-strict');
    expect(r.status).toBe(2);
  });
  test('--report follows imports and leaves the exit code alone', () => {
    const r = run('-p', 'test/fixtures/legacy/tsconfig.json', '--no-pretty', '--report');
    expect(r.stdout).toBe(
      [
        "test/fixtures/legacy/src/greet.ts(5,21): error TS2531: Object is possibly 'null'.",
        "test/fixtures/legacy/src/greet.ts(5,21): error TS2532: Object is possibly 'undefined'.",
        '',
        'Found 2 errors in @strict code.',
        '',
        '@strict boundary: 1 edge from 1 mark',
        '  test/fixtures/legacy/src/greet.ts(5,21): greet → findUser  annotated  clean  test/fixtures/legacy/src/users.ts(6,17)',
        'marks: 1, closed: 0',
        '',
      ].join('\n'),
    );
    expect(r.status).toBe(1);
  });

  test('--report on a clean project prints the report and exits 0', () => {
    const r = run('-p', 'test/fixtures/clean/tsconfig.json', '--no-pretty', '--report');
    expect(r.stdout).toContain('@strict boundary: 1 edge from 1 mark');
    expect(r.status).toBe(0);
  });
  test('a marker that marks nothing is named and exits 2', () => {
    const r = run('-p', 'test/fixtures/stray/tsconfig.json', '--no-pretty');
    expect(r.stdout).toBe(
      [
        'test/fixtures/stray/src/label.ts(1,4): error: `@strict` in a plain comment marks nothing: a mark is a JSDoc comment, `/** @strict */`.',
        '',
        'Found 1 @strict marker that marks nothing.',
        '',
      ].join('\n'),
    );
    expect(r.status).toBe(2);
  });
  test('a solution-style tsconfig checks every referenced project, each under its own options', () => {
    const r = run('-p', 'test/fixtures/solution/tsconfig.json', '--no-pretty');
    expect(r.stdout).toBe(
      [
        "test/fixtures/solution/lib/src/settings.ts(7,3): error TS2375: Type '{ theme: undefined; }' is not assignable to type 'Settings' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.",
        "  Types of property 'theme' are incompatible.",
        "    Type 'undefined' is not assignable to type 'string'.",
        "test/fixtures/solution/app/src/main.ts(5,10): error TS2532: Object is possibly 'undefined'.",
        '',
        'Found 2 errors in @strict code.',
        '',
      ].join('\n'),
    );
    expect(r.status).toBe(1);
  });

  test('a tsconfig that names no files is a config error, not a pass', () => {
    const empty = run('-p', 'test/fixtures/empty/tsconfig.json', '--no-pretty');
    expect(empty.stdout).toContain('TS18002');
    expect(empty.status).toBe(2);
    const cycle = run('-p', 'test/fixtures/cycle/tsconfig.json', '--no-pretty');
    expect(cycle.stdout).toContain('No files to check');
    expect(cycle.status).toBe(2);
  });
});
