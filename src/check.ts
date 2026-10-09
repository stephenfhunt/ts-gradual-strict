/**
 * The check: the strict program's semantic diagnostics, kept only where they fall inside
 * a marked region (`spec.md` §Semantics, `decisions.md` 2026-10-08).
 */
import type ts from 'typescript';
import { inRegions, mayHaveRegions, strayMarkers, strictRegions } from './regions.ts';
import { buildReport, type Location, type Report, where } from './report.ts';
import { createStrictProgram, loadProject } from './ts.ts';

export interface CheckResult {
  /** Diagnostics inside marked regions, in the order `tsc` would print them. */
  readonly diagnostics: readonly ts.Diagnostic[];
  /** Config-file errors. Non-empty means nothing was checked. */
  readonly configErrors: readonly ts.Diagnostic[];
  /** Markers that mark nothing. Non-empty means the marks are not what they look like. */
  readonly strays: readonly StrayMarker[];
  /** The boundary report, when asked for. */
  readonly report?: Report;
}

export interface StrayMarker {
  readonly at: Location;
  readonly message: string;
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

/** Markers in the project's own files that mark nothing (`spec.md` §Marking). */
export function findStrays(program: ts.Program): readonly StrayMarker[] {
  return program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sf))
    .flatMap((sf) =>
      strayMarkers(sf).map((s) => ({ at: { file: sf, pos: s.pos }, message: s.message })),
    );
}

/** Stray markers as the command prints them, one `file(line,col): error: …` line each. */
export function formatStrays(strays: readonly StrayMarker[], cwd: string): string {
  return strays.map((s) => `${where(s.at, cwd)}: error: ${s.message}\n`).join('');
}

/** Check the project a tsconfig describes. */
export function checkProject(
  tsconfigPath: string,
  options: CheckOptions = {},
): CheckResult {
  const project = loadProject(tsconfigPath);
  if (project.errors.length > 0) {
    return { diagnostics: [], configErrors: project.errors, strays: [] };
  }
  const program = createStrictProgram(project.rootNames, project.options);
  const result = {
    diagnostics: checkProgram(program),
    configErrors: [],
    strays: findStrays(program),
  };
  return options.report === true ? { ...result, report: buildReport(program) } : result;
}
