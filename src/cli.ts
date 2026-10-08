#!/usr/bin/env node
/**
 * `ts-gradual-strict -p tsconfig.json` — silent and exit 0 when every marked region is
 * clean under strict rules; tsc-style diagnostics and exit 1 when one is not; exit 2 when
 * the project or the arguments could not be read (`spec.md` §The command).
 */
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { checkProject } from './check.ts';

const USAGE = 'usage: ts-gradual-strict [-p <tsconfig.json>] [--pretty | --no-pretty]\n';

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => '\n',
};

function print(diagnostics: readonly ts.Diagnostic[], pretty: boolean): void {
  const text = pretty
    ? ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost)
    : ts.formatDiagnostics(diagnostics, formatHost);
  process.stdout.write(text);
}

function main(argv: readonly string[]): number {
  let values: { project?: string | undefined; pretty?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        project: { type: 'string', short: 'p' },
        pretty: { type: 'boolean' },
      },
      allowNegative: true,
    }));
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const project = values.project ?? 'tsconfig.json';
  const pretty = values.pretty ?? process.stdout.isTTY === true;
  const result = checkProject(project);
  if (result.configErrors.length > 0) {
    print(result.configErrors, pretty);
    return 2;
  }
  if (result.diagnostics.length === 0) return 0;
  print(result.diagnostics, pretty);
  const n = result.diagnostics.length;
  process.stdout.write(`\nFound ${n} error${n === 1 ? '' : 's'} in @strict code.\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
