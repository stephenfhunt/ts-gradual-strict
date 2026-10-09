/**
 * The package as a consumer gets it: installed into a throwaway project as a `file:`
 * devDependency and run through its `bin`, shebang and all. There is no build step, so
 * this is the check that the source is what ships and that Node will run it from where
 * npm puts it — a link out of `node_modules`, since Node refuses to strip types inside it
 * (`decisions.md` 2026-10-08).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'ts-gradual-strict-consumer-'));
// The bin's shebang finds `node` on PATH: make that the node running this suite, so the
// check is of the version under test rather than whatever the shell has.
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
};

beforeAll(() => {
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      private: true,
      devDependencies: { 'ts-gradual-strict': `file:${ROOT}` },
    }),
  );
  const install = spawnSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--prefer-offline'],
    {
      cwd: consumer,
      encoding: 'utf8',
      env,
    },
  );
  expect(install.status, install.stderr).toBe(0);
}, 120_000);

afterAll(() => {
  rmSync(consumer, { recursive: true, force: true });
});

test('the installed bin runs the source and checks a project', () => {
  const r = spawnSync(
    join(consumer, 'node_modules', '.bin', 'ts-gradual-strict'),
    ['-p', join(ROOT, 'test/fixtures/legacy/tsconfig.json'), '--no-pretty'],
    { cwd: consumer, encoding: 'utf8', env },
  );
  expect(r.stderr).toBe('');
  expect(r.stdout).toContain("error TS2531: Object is possibly 'null'.");
  expect(r.stdout).toContain('Found 2 errors in @strict code.');
  expect(r.status).toBe(1);
});
