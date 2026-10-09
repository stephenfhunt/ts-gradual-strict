#!/usr/bin/env node
/**
 * `ts-gradual-strict -p tsconfig.json` — silent and exit 0 when every marked region is
 * clean under strict rules; tsc-style diagnostics and exit 1 when one is not; exit 2 when
 * the project or the arguments could not be read, or a marker marks nothing
 * (`spec.md` §The command). `--report`
 * appends the boundary report and never changes the exit code (`spec.md` §The report).
 */
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { checkProject, formatStrays } from './check.ts';
import { formatReport } from './report.ts';

const USAGE =
  'usage: ts-gradual-strict [-p <tsconfig.json>] [--pretty | --no-pretty] [--report]\n';

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
  let values: {
    project?: string | undefined;
    pretty?: boolean | undefined;
    report?: boolean | undefined;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        project: { type: 'string', short: 'p' },
        pretty: { type: 'boolean' },
        report: { type: 'boolean' },
      },
      allowNegative: true,
    }));
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const project = values.project ?? 'tsconfig.json';
  const pretty = values.pretty ?? process.stdout.isTTY === true;
  const result = checkProject(project, { report: values.report === true });
  if (result.configErrors.length > 0) {
    print(result.configErrors, pretty);
    return 2;
  }
  const strays = result.strays.length;
  if (strays > 0) {
    process.stdout.write(formatStrays(result.strays, process.cwd()));
    process.stdout.write(
      `\nFound ${strays} @strict marker${strays === 1 ? '' : 's'} that mark${strays === 1 ? 's' : ''} nothing.\n`,
    );
  }
  const n = result.diagnostics.length;
  if (n > 0) {
    if (strays > 0) process.stdout.write('\n');
    print(result.diagnostics, pretty);
    process.stdout.write(`\nFound ${n} error${n === 1 ? '' : 's'} in @strict code.\n`);
  }
  if (result.report !== undefined) {
    if (n > 0 || strays > 0) process.stdout.write('\n');
    process.stdout.write(formatReport(result.report, process.cwd()));
  }
  if (strays > 0) return 2;
  return n > 0 ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
