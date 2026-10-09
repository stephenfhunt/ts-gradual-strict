/**
 * The boundary report (`--report`, `spec.md` §The report): where marked code trusts
 * unmarked code, what each trusted declaration would cost to mark, and which marks are
 * closed. Output only — it never changes what `checkProgram` reports
 * (`decisions.md` 2026-10-08).
 */
import { relative } from 'node:path';
import ts from 'typescript';
import {
  inRegions,
  type Mark,
  type Span,
  strictMarks,
  strictRegions,
} from './regions.ts';

/** A position in a file. */
export interface Location {
  readonly file: ts.SourceFile;
  readonly pos: number;
}

/** An unmarked declaration that marked code references. */
export interface Target {
  readonly name: string;
  /** Where the declaration's name is. */
  readonly at: Location;
  /** The node a mark would go on: the declaration, or its variable statement. */
  readonly unit: ts.Node;
  /** Whether its type is declared, so its body cannot change what marked code sees. */
  readonly annotated: boolean;
  /** Strict diagnostics in the target's own text: what marking it would add (P11). */
  readonly strictErrors: number;
}

/** A reference from a mark to an unmarked target; one per mark and target. */
export interface Edge {
  readonly from: string;
  /** The first reference in the mark. */
  readonly site: Location;
  readonly target: Target;
}

export interface Report {
  readonly marks: number;
  readonly closed: number;
  /** Cheapest to mark first: by the target's strict errors, then by site. */
  readonly edges: readonly Edge[];
}

function isProjectFile(program: ts.Program, sf: ts.SourceFile): boolean {
  return !sf.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sf);
}

/** Under a `declare`: a type with no code behind it. */
function isAmbient(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n !== undefined; n = n.parent) {
    const declared = ts.canHaveModifiers(n)
      ? ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
      : false;
    if (declared === true) return true;
  }
  return false;
}

function hasDeclaredType(node: ts.Node): boolean {
  if (ts.isSetAccessorDeclaration(node)) return true;
  if (ts.isFunctionLike(node)) return node.type !== undefined;
  if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
    if (node.type !== undefined) return true;
    const init = node.initializer;
    return init !== undefined && ts.isFunctionLike(init) && init.type !== undefined;
  }
  return false;
}

/**
 * The node a mark would go on, for a declaration that can be an edge target: one with
 * code that could break its own type. Classes, interfaces, type aliases, parameters and
 * ambient declarations are not targets.
 */
function markableUnit(decl: ts.Declaration): ts.Node | undefined {
  if (isAmbient(decl)) return undefined;
  if (
    ts.isFunctionDeclaration(decl) ||
    ts.isMethodDeclaration(decl) ||
    ts.isGetAccessorDeclaration(decl) ||
    ts.isSetAccessorDeclaration(decl) ||
    ts.isPropertyDeclaration(decl)
  ) {
    return decl;
  }
  if (ts.isVariableDeclaration(decl)) {
    const statement = decl.parent.parent;
    return ts.isVariableStatement(statement) ? statement : undefined;
  }
  return undefined;
}

function nameOf(node: ts.Node): string {
  if (ts.isSourceFile(node))
    return node.fileName.slice(node.fileName.lastIndexOf('/') + 1);
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.map((d) => d.name.getText()).join(', ');
  }
  const name = ts.isConstructorDeclaration(node)
    ? 'constructor'
    : (ts.getNameOfDeclaration(node as ts.Declaration)?.getText() ?? '<anonymous>');
  const parent = node.parent;
  if (parent !== undefined && ts.isClassLike(parent) && parent.name !== undefined) {
    return `${parent.name.text}.${name}`;
  }
  return name;
}

function within(span: Span, pos: number): boolean {
  return span.start <= pos && pos < span.end;
}

export function buildReport(program: ts.Program): Report {
  const checker = program.getTypeChecker();

  const marksOf = new Map<ts.SourceFile, readonly Mark[]>();
  const marksIn = (sf: ts.SourceFile): readonly Mark[] => {
    let ms = marksOf.get(sf);
    if (ms === undefined) {
      ms = strictMarks(sf);
      marksOf.set(sf, ms);
    }
    return ms;
  };

  const all: { readonly sf: ts.SourceFile; readonly mark: Mark }[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!isProjectFile(program, sf)) continue;
    for (const mark of marksIn(sf)) all.push({ sf, mark });
  }
  const indexOf = new Map(all.map((m, i) => [m.mark, i]));

  const targets = new Map<ts.Node, Target>();
  const targetFor = (decl: ts.Declaration, unit: ts.Node): Target => {
    let t = targets.get(unit);
    if (t === undefined) {
      const sf = unit.getSourceFile();
      const regions = strictRegions(sf);
      const span = { start: unit.pos, end: unit.end };
      const strictErrors = program
        .getSemanticDiagnostics(sf)
        .filter(
          (d) =>
            d.start !== undefined &&
            within(span, d.start) &&
            !inRegions(regions, d.start),
        ).length;
      const nameNode = ts.getNameOfDeclaration(decl) ?? decl;
      t = {
        name: nameOf(ts.isVariableDeclaration(decl) ? decl : unit),
        at: { file: sf, pos: nameNode.getStart(sf) },
        unit,
        annotated: hasDeclaredType(decl),
        strictErrors,
      };
      targets.set(unit, t);
    }
    return t;
  };

  const edges = new Map<string, Edge>();
  const refs = all.map(() => new Set<number>());
  const hasEdge = all.map(() => false);

  all.forEach(({ sf, mark }, i) => {
    const from = nameOf(mark.node);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        let symbol = checker.getSymbolAtLocation(node);
        if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
          symbol = checker.getAliasedSymbol(symbol);
        }
        const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        const dsf = decl?.getSourceFile();
        if (decl !== undefined && dsf !== undefined && isProjectFile(program, dsf)) {
          const unit = markableUnit(decl);
          const declPos = decl.getStart(dsf);
          const owner = marksIn(dsf).find((m) => within(m.span, declPos));
          if (owner !== undefined) {
            const j = indexOf.get(owner);
            if (j !== undefined && j !== i) refs[i]?.add(j);
          } else if (unit !== undefined) {
            hasEdge[i] = true;
            const key = `${i}:${dsf.fileName}:${unit.pos}`;
            if (!edges.has(key)) {
              edges.set(key, {
                from,
                site: { file: sf, pos: node.getStart(sf) },
                target: targetFor(decl, unit),
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(mark.node);
  });

  // A mark is open if it has an edge or references an open mark; closed otherwise.
  const open = [...hasEdge];
  for (let changed = true; changed; ) {
    changed = false;
    refs.forEach((rs, i) => {
      if (open[i] !== true && [...rs].some((j) => open[j] === true)) {
        open[i] = true;
        changed = true;
      }
    });
  }

  const sorted = [...edges.values()].sort(
    (a, b) =>
      a.target.strictErrors - b.target.strictErrors ||
      a.site.file.fileName.localeCompare(b.site.file.fileName) ||
      a.site.pos - b.site.pos,
  );
  return { marks: all.length, closed: open.filter((o) => !o).length, edges: sorted };
}

function where(loc: Location, cwd: string): string {
  const { line, character } = loc.file.getLineAndCharacterOfPosition(loc.pos);
  return `${relative(cwd, loc.file.fileName)}(${line + 1},${character + 1})`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The report as the command prints it, aligned in columns. */
export function formatReport(report: Report, cwd: string): string {
  const lines: string[] = [];
  if (report.edges.length === 0) {
    lines.push('@strict boundary: no edges');
  } else {
    const sources = new Set(report.edges.map((e) => e.from)).size;
    lines.push(
      `@strict boundary: ${plural(report.edges.length, 'edge')} from ${plural(sources, 'mark')}`,
    );
    const rows = report.edges.map((e) => [
      `${where(e.site, cwd)}:`,
      `${e.from} → ${e.target.name}`,
      e.target.annotated ? 'annotated' : 'inferred',
      e.target.strictErrors === 0
        ? 'clean'
        : plural(e.target.strictErrors, 'strict error'),
      where(e.target.at, cwd),
    ]);
    const widths = rows[0]?.map((_, c) =>
      Math.max(...rows.map((r) => r[c]?.length ?? 0)),
    );
    for (const r of rows) {
      const cells = r.map((cell, c) =>
        c === r.length - 1 ? cell : cell.padEnd(widths?.[c] ?? 0),
      );
      lines.push(`  ${cells[0]} ${cells.slice(1).join('  ')}`);
    }
  }
  lines.push(`marks: ${report.marks}, closed: ${report.closed}`);
  return `${lines.join('\n')}\n`;
}
