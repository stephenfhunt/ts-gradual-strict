/**
 * In-memory projects for tests. Every test program is compiled as a legacy project would
 * be — `strict: false` — so what the tool adds is exactly the strict program on top.
 */
import ts from 'typescript';
import { createHost, createStrictProgram, strictOptions } from '../src/ts.ts';

export const ROOT = '/project';

/** The options of the legacy project every in-memory test pretends to be. */
export const LEGACY_OPTIONS: ts.CompilerOptions = {
  strict: false,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts'],
  noEmit: true,
};

function inMemory(files: Readonly<Record<string, string>>): Map<string, string> {
  return new Map(Object.entries(files).map(([name, text]) => [`${ROOT}/${name}`, text]));
}

/** The second program, as the tool builds it, over in-memory files. */
export function strictProgram(files: Readonly<Record<string, string>>): ts.Program {
  const map = inMemory(files);
  return createStrictProgram(
    [...map.keys()],
    LEGACY_OPTIONS,
    createHost(strictOptions(LEGACY_OPTIONS), map),
  );
}

/** The project's own program, as its build sees it. */
export function legacyProgram(files: Readonly<Record<string, string>>): ts.Program {
  const map = inMemory(files);
  return ts.createProgram(
    [...map.keys()],
    LEGACY_OPTIONS,
    createHost(LEGACY_OPTIONS, map),
  );
}

/**
 * The oracle for P1: what `tsc --strictNullChecks` reports, built with `ts.createProgram`
 * and the flag stated here. It shares nothing with `src/ts.ts` but the host that serves
 * file text, so a change to what the tool calls "strict" cannot change what this calls it.
 */
export function tscStrictProgram(files: Readonly<Record<string, string>>): ts.Program {
  const options = { ...LEGACY_OPTIONS, strictNullChecks: true };
  const map = inMemory(files);
  return ts.createProgram([...map.keys()], options, createHost(options, map));
}

/** Every semantic diagnostic in the given files: what plain `tsc` would report. */
export function allDiagnostics(program: ts.Program): readonly ts.Diagnostic[] {
  return program
    .getSourceFiles()
    .filter((sf) => sf.fileName.startsWith(`${ROOT}/`))
    .flatMap((sf) => program.getSemanticDiagnostics(sf));
}

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => ROOT,
  getNewLine: () => '\n',
};

/** Diagnostics as the command prints them with `--no-pretty`. */
export function format(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, formatHost);
}
