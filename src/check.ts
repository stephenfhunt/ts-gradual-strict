/**
 * The check: the strict program's semantic diagnostics, kept only where they fall inside
 * a marked region (`spec.md` §Semantics, `decisions.md` 2026-10-08).
 */
import ts from 'typescript';
import { inRegions, mayHaveRegions, strayMarkers, strictRegions } from './regions.ts';
import {
  buildReport,
  type Location,
  mergeReports,
  type Owns,
  projectFiles,
  type Report,
  where,
} from './report.ts';
import { createStrictProgram, loadProjects } from './ts.ts';

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
export function checkProgram(
  program: ts.Program,
  owns: Owns = projectFiles(program),
): readonly ts.Diagnostic[] {
  const out: ts.Diagnostic[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!owns(sf) || !mayHaveRegions(sf)) continue;
    const regions = strictRegions(sf);
    if (regions.length === 0) continue;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (d.start !== undefined && inRegions(regions, d.start)) out.push(d);
    }
  }
  return out;
}

/** Markers in the project's own files that mark nothing (`spec.md` §Marking). */
export function findStrays(
  program: ts.Program,
  owns: Owns = projectFiles(program),
): readonly StrayMarker[] {
  return program
    .getSourceFiles()
    .filter(owns)
    .flatMap((sf) =>
      strayMarkers(sf).map((s) => ({ at: { file: sf, pos: s.pos }, message: s.message })),
    );
}

/** Stray markers as the command prints them, one `file(line,col): error: …` line each. */
export function formatStrays(strays: readonly StrayMarker[], cwd: string): string {
  return strays.map((s) => `${where(s.at, cwd)}: error: ${s.message}\n`).join('');
}

/**
 * A tsconfig names no file to check, directly or through its references. TypeScript
 * reports the ordinary shapes of this itself (TS18002, TS18003); what reaches here is a
 * set of configs that reference only one another, which would otherwise check nothing and
 * exit 0.
 */
function noFiles(tsconfigPath: string): ts.Diagnostic {
  return {
    category: ts.DiagnosticCategory.Error,
    code: 18003,
    file: undefined,
    start: undefined,
    length: undefined,
    messageText:
      `No files to check: '${tsconfigPath}' and the projects it references include no ` +
      'source files.',
  };
}

function dedupe<T>(items: readonly T[], key: (t: T) => string): readonly T[] {
  const seen = new Map<string, T>();
  for (const t of items) if (!seen.has(key(t))) seen.set(key(t), t);
  return [...seen.values()];
}

/**
 * Check the project a tsconfig describes, and every project it references: one strict
 * program per project, each under that project's own options, each answering for its own
 * files (`spec.md` §The command).
 */
export function checkProject(
  tsconfigPath: string,
  options: CheckOptions = {},
): CheckResult {
  const projects = loadProjects(tsconfigPath);
  const configErrors = projects.flatMap((p) => p.errors);
  if (configErrors.length > 0) return { diagnostics: [], configErrors, strays: [] };
  const withFiles = projects.filter((p) => p.rootNames.length > 0);
  if (withFiles.length === 0) {
    return { diagnostics: [], configErrors: [noFiles(tsconfigPath)], strays: [] };
  }

  // A file is answered for by the project that includes it; a file no project includes
  // but some program imports is answered for by every such program, and deduplicated.
  const rootsOf = withFiles.map((p) => new Set(p.rootNames));
  const diagnostics: ts.Diagnostic[] = [];
  const strays: StrayMarker[] = [];
  const reports: Report[] = [];
  withFiles.forEach((project, i) => {
    const program = createStrictProgram(project.rootNames, project.options);
    const isProject = projectFiles(program);
    const owns: Owns = (sf) =>
      isProject(sf) &&
      (rootsOf[i]?.has(sf.fileName) === true ||
        !rootsOf.some((roots, j) => j !== i && roots.has(sf.fileName)));
    diagnostics.push(...checkProgram(program, owns));
    strays.push(...findStrays(program, owns));
    if (options.report === true) reports.push(buildReport(program, owns));
  });

  const result = {
    diagnostics: dedupe(
      diagnostics,
      (d) =>
        `${d.file?.fileName}:${d.start}:${d.code}:${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`,
    ),
    configErrors: [],
    strays: dedupe(strays, (s) => `${s.at.file.fileName}:${s.at.pos}`),
  };
  return options.report === true ? { ...result, report: mergeReports(reports) } : result;
}
