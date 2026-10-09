/**
 * The check: the strict program's semantic diagnostics, kept only where they fall inside
 * a marked region (`spec.md` §Semantics, `decisions.md` 2026-10-08).
 */
import type ts from 'typescript';
import { inRegions, mayHaveRegions, strictRegions } from './regions.ts';
import { buildReport, type Report } from './report.ts';
import { createStrictProgram, loadProject } from './ts.ts';

export interface CheckResult {
  /** Diagnostics inside marked regions, in the order `tsc` would print them. */
  readonly diagnostics: readonly ts.Diagnostic[];
  /** Config-file errors. Non-empty means nothing was checked. */
  readonly configErrors: readonly ts.Diagnostic[];
  /** The boundary report, when asked for. */
  readonly report?: Report;
}

export interface CheckOptions {
  readonly report?: boolean;
}

/**
 * Check an already-built strict program. Only files whose text mentions `@strict` are
 * type-checked at all, which is what keeps the second program cheap on a codebase where
 * marks are still rare: the checker resolves what those files reach, not the whole tree.
 */
export function checkProgram(program: ts.Program): readonly ts.Diagnostic[] {
  const out: ts.Diagnostic[] = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || program.isSourceFileFromExternalLibrary(sf)) continue;
    if (!mayHaveRegions(sf)) continue;
    const regions = strictRegions(sf);
    if (regions.length === 0) continue;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (d.start !== undefined && inRegions(regions, d.start)) out.push(d);
    }
  }
  return out;
}

/** Check the project a tsconfig describes. */
export function checkProject(
  tsconfigPath: string,
  options: CheckOptions = {},
): CheckResult {
  const project = loadProject(tsconfigPath);
  if (project.errors.length > 0) {
    return { diagnostics: [], configErrors: project.errors };
  }
  const program = createStrictProgram(project.rootNames, project.options);
  const diagnostics = checkProgram(program);
  return options.report === true
    ? { diagnostics, configErrors: [], report: buildReport(program) }
    : { diagnostics, configErrors: [] };
}
