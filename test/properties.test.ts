/**
 * The property catalog in `testing.md`, one `test` per entry, each named by its catalog
 * number. Every property counts what its runs reached and asserts a floor afterwards — the
 * non-vacuity guard — because a generator that drifted to programs with no diagnostics
 * would make every property here pass while checking nothing.
 */
import fc from 'fast-check';
import type ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { checkProgram } from '../src/check.ts';
import type { Span } from '../src/regions.ts';
import { buildReport, type Report } from '../src/report.ts';
import {
  callGraph,
  classOf,
  type Fn,
  markedShape,
  marking,
  type Rendered,
  rebodied,
  render,
  type Shape,
  shape,
  slotCount,
} from './arbitrary.ts';
import {
  allDiagnostics,
  legacyProgram,
  strictProgram,
  tscStrictProgram,
} from './support.ts';

// `PROPERTY_RUNS=2000 npx vitest run test/properties.test.ts` for a deeper sweep.
const RUNS = Number(process.env.PROPERTY_RUNS ?? 150);

function key(d: ts.Diagnostic): string {
  return `${d.start}:${d.code}`;
}

function keys(ds: readonly ts.Diagnostic[]): Set<string> {
  return new Set(ds.map(key));
}

function reported(r: Rendered): readonly ts.Diagnostic[] {
  return checkProgram(strictProgram({ 'gen.ts': r.text }));
}

/** Slots covered by a mark: marked themselves, or inside a marked class. */
function covered(s: Shape, marks: readonly boolean[]): readonly boolean[] {
  const out: boolean[] = [];
  let slot = 0;
  for (const methods of s.classes) {
    const classMarked = marks[slot] === true;
    out.push(classMarked);
    slot++;
    for (let j = 0; j < methods.length; j++, slot++)
      out.push(classMarked || marks[slot] === true);
  }
  for (; slot < marks.length; slot++) out.push(marks[slot] === true);
  return out;
}

function within(spans: readonly Span[], pos: number | undefined): boolean {
  return pos !== undefined && spans.some((s) => s.start <= pos && pos < s.end);
}

describe('properties', () => {
  test('P1 — with every declaration marked, the output is plain strictNullChecks tsc', () => {
    let nonEmpty = 0;
    fc.assert(
      fc.property(shape(), (s) => {
        const r = render(s, Array(slotCount(s)).fill(true));
        const ours = checkProgram(strictProgram({ 'gen.ts': r.text })).map(key);
        const tsc = allDiagnostics(tscStrictProgram({ 'gen.ts': r.text })).map(key);
        if (tsc.length > 0) nonEmpty++;
        expect(ours).toEqual(tsc);
      }),
      { numRuns: RUNS },
    );
    expect(nonEmpty).toBeGreaterThan(RUNS * 0.5);
  });

  test('P2 — with nothing marked, there is no output', () => {
    let strictErrors = 0;
    fc.assert(
      fc.property(shape(), (s) => {
        const r = render(s, Array(slotCount(s)).fill(false));
        const program = strictProgram({ 'gen.ts': r.text });
        if (allDiagnostics(program).length > 0) strictErrors++;
        expect(checkProgram(program)).toEqual([]);
      }),
      { numRuns: RUNS },
    );
    expect(strictErrors).toBeGreaterThan(RUNS * 0.5);
  });

  test('P3 — removing a mark never adds a diagnostic (the gradual guarantee)', () => {
    let strictlyFewer = 0;
    fc.assert(
      fc.property(
        shape().chain((s) =>
          fc.tuple(fc.constant(s), marking(s), marking(s)).map(([sh, big, mask]) => ({
            s: sh,
            big,
            small: big.map((b, i) => b && mask[i] === true),
          })),
        ),
        ({ s, big, small }) => {
          const more = keys(reported(render(s, big)));
          const fewer = keys(reported(render(s, small)));
          if (fewer.size < more.size) strictlyFewer++;
          for (const k of fewer) expect(more.has(k)).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
    expect(strictlyFewer).toBeGreaterThan(RUNS * 0.2);
  });

  test('P4 — marks are additive: diag(M1 ∪ M2) = diag(M1) ∪ diag(M2)', () => {
    let bothContribute = 0;
    fc.assert(
      fc.property(
        shape().chain((s) => fc.tuple(fc.constant(s), marking(s), marking(s))),
        ([s, m1, m2]) => {
          const union = m1.map((b, i) => b || m2[i] === true);
          const a = keys(reported(render(s, m1)));
          const b = keys(reported(render(s, m2)));
          const both = keys(reported(render(s, union)));
          if (a.size > 0 && b.size > 0 && [...b].some((k) => !a.has(k))) bothContribute++;
          expect([...both].sort()).toEqual([...new Set([...a, ...b])].sort());
        },
      ),
      { numRuns: RUNS },
    );
    expect(bothContribute).toBeGreaterThan(RUNS * 0.1);
  });

  test('P5 — the output is exactly the strict diagnostics inside marked spans', () => {
    let dropped = 0;
    let kept = 0;
    fc.assert(
      fc.property(markedShape(), ({ shape: s, marks }) => {
        const r = render(s, marks);
        const marked = r.spans.filter((_, i) => marks[i] === true);
        const program = strictProgram({ 'gen.ts': r.text });
        const all = allDiagnostics(program);
        const expected = all.filter((d) => within(marked, d.start)).map(key);
        const ours = checkProgram(program).map(key);
        if (expected.length > 0) kept++;
        if (expected.length < all.length) dropped++;
        expect(ours).toEqual(expected);
      }),
      { numRuns: RUNS },
    );
    expect(kept).toBeGreaterThan(RUNS * 0.3);
    expect(dropped).toBeGreaterThan(RUNS * 0.3);
  });

  test('P6 — marks change neither the legacy build nor the strict program', () => {
    let legacyErrors = 0;
    fc.assert(
      fc.property(markedShape(), ({ shape: s, marks }) => {
        const none = render(s, Array(slotCount(s)).fill(false)).text;
        const some = render(s, marks).text;
        const legacyNone = allDiagnostics(legacyProgram({ 'gen.ts': none })).map(key);
        if (legacyNone.length > 0) legacyErrors++;
        expect(allDiagnostics(legacyProgram({ 'gen.ts': some })).map(key)).toEqual(
          legacyNone,
        );
        expect(allDiagnostics(strictProgram({ 'gen.ts': some })).map(key)).toEqual(
          allDiagnostics(strictProgram({ 'gen.ts': none })).map(key),
        );
      }),
      { numRuns: RUNS },
    );
    // Legacy-mode errors exist in generated programs (calls into classes declared later,
    // mostly); the guard is that the comparison is not always between two empty lists.
    expect(legacyErrors).toBeGreaterThan(0);
  });

  describe('P7 — behind annotations, unmarked bodies cannot change marked output', () => {
    /** Diagnostics named by the covered slot they fall in and their offset within it. */
    function located(s: Shape, marks: readonly boolean[]): readonly string[] {
      const r = render(s, marks);
      const cover = covered(s, marks);
      return reported(r)
        .map((d) => {
          // The innermost covered span: the last one containing the start, since a class's
          // slot precedes its methods'.
          const i = r.spans.findLastIndex(
            (sp, j) =>
              cover[j] === true && d.start !== undefined && within([sp], d.start),
          );
          const sp = r.spans[i];
          return `${i}+${(d.start ?? 0) - (sp?.start ?? 0)}:${d.code}`;
        })
        .sort();
    }

    /** `s` with every uncovered function and method body taken from `alt` instead. */
    function swapUncovered(s: Shape, alt: Shape, marks: readonly boolean[]): Shape {
      const cover = covered(s, marks);
      let slot = 0;
      const pick = (mine: Fn, theirs: Fn | undefined): Fn => {
        const keep = cover[slot] === true || theirs === undefined;
        slot++;
        return keep ? mine : { ...mine, body: theirs.body };
      };
      const classes = s.classes.map((methods, k) => {
        slot++;
        return methods.map((m, j) => pick(m, alt.classes[k]?.[j]));
      });
      const fns = s.fns.map((f, i) => pick(f, alt.fns[i]));
      return { ...s, classes, fns };
    }

    /** A shape, a marking, and the same shape with fresh bodies to take from. */
    function scenario(annotated: boolean) {
      return shape({ annotated }).chain((s) =>
        fc.tuple(fc.constant(s), marking(s), rebodied(s)),
      );
    }

    test('holds when every signature is annotated', () => {
      let reachedOutput = 0;
      fc.assert(
        fc.property(scenario(true), ([s, marks, alt]) => {
          const before = located(s, marks);
          if (before.length > 0) reachedOutput++;
          expect(located(swapUncovered(s, alt, marks), marks)).toEqual(before);
        }),
        { numRuns: RUNS },
      );
      expect(reachedOutput).toBeGreaterThan(RUNS * 0.3);
    });

    test('acceptance: it fails without annotations, through re-inference', () => {
      const result = fc.check(
        fc.property(scenario(false), ([s, marks, alt]) => {
          expect(located(swapUncovered(s, alt, marks), marks)).toEqual(located(s, marks));
        }),
        { numRuns: 500 },
      );
      expect(result.failed).toBe(true);
    });
  });
  describe('the report', () => {
    function reportFor(s: Shape, marks: readonly boolean[]) {
      const r = render(s, marks);
      return { r, report: buildReport(strictProgram({ 'gen.ts': r.text })) };
    }

    /** The outermost marked slot covering each slot — its mark — or undefined. */
    function unitOf(
      s: Shape,
      marks: readonly boolean[],
    ): readonly (number | undefined)[] {
      const cls = classOf(s);
      return marks.map((m, i) => {
        const k = cls[i];
        if (k !== undefined && marks[k] === true) return k;
        return m ? i : undefined;
      });
    }

    /** The slot whose span holds a position: innermost, since methods follow their class. */
    function slotAt(r: Rendered, pos: number): number {
      return r.spans.findLastIndex((sp) => within([sp], pos));
    }

    /** The tool's edges as `mark->target` slot pairs. */
    function toolEdges(s: Shape, marks: readonly boolean[], r: Rendered, report: Report) {
      const units = unitOf(s, marks);
      return report.edges
        .map((e) => {
          const u = r.spans.findIndex(
            (sp, j) => units[j] === j && within([sp], e.site.pos),
          );
          return `${u}->${slotAt(r, e.target.at.pos)}`;
        })
        .sort();
    }

    test('P10 — with every declaration marked, there are no edges and every mark is closed', () => {
      let partialEdges = 0;
      fc.assert(
        fc.property(markedShape(), ({ shape: s, marks }) => {
          const { report } = reportFor(s, Array(slotCount(s)).fill(true));
          expect(report.edges).toEqual([]);
          expect(report.closed).toBe(report.marks);
          if (reportFor(s, marks).report.edges.length > 0) partialEdges++;
        }),
        { numRuns: RUNS },
      );
      expect(partialEdges).toBeGreaterThan(RUNS * 0.3);
    });

    test("P11 — an edge's strict-error count is what marking its target adds", () => {
      let costly = 0;
      fc.assert(
        fc.property(markedShape(), fc.nat(), ({ shape: s, marks }, n) => {
          const { r, report } = reportFor(s, marks);
          const e = report.edges[n % Math.max(report.edges.length, 1)];
          if (e === undefined) return;
          const t = slotAt(r, e.target.at.pos);
          const after = marks.map((m, i) => m || i === t);
          if (e.target.strictErrors > 0) costly++;
          const grew = reported(render(s, after)).length - reported(r).length;
          expect(grew).toBe(e.target.strictErrors);
        }),
        { numRuns: RUNS },
      );
      expect(costly).toBeGreaterThan(RUNS * 0.1);
    });

    test("P12 — edges and closed marks follow the generator's own call graph", () => {
      let someClosed = 0;
      let someOpen = 0;
      fc.assert(
        fc.property(markedShape(), ({ shape: s, marks }) => {
          const units = unitOf(s, marks);
          const classSlots = new Set(classOf(s).filter((k) => k !== undefined));
          const graph = callGraph(s);
          const edges = new Set<string>();
          const refs = new Map<number, Set<number>>();
          graph.forEach((targets, i) => {
            const u = units[i];
            if (u === undefined) return;
            if (!refs.has(u)) refs.set(u, new Set());
            for (const t of targets) {
              const tu = units[t];
              if (tu === undefined) {
                if (!classSlots.has(t)) edges.add(`${u}->${t}`);
              } else if (tu !== u) {
                refs.get(u)?.add(tu);
              }
            }
          });
          const open = new Set([...edges].map((e) => Number(e.split('->')[0])));
          for (let changed = true; changed; ) {
            changed = false;
            for (const [u, rs] of refs) {
              if (!open.has(u) && [...rs].some((v) => open.has(v))) {
                open.add(u);
                changed = true;
              }
            }
          }
          const { r, report } = reportFor(s, marks);
          expect(toolEdges(s, marks, r, report)).toEqual([...edges].sort());
          expect(report.marks).toBe(refs.size);
          expect(report.closed).toBe(refs.size - open.size);
          if (report.closed > 0 && open.size > 0) someClosed++;
          if (open.size > report.closed) someOpen++;
        }),
        { numRuns: RUNS },
      );
      expect(someClosed).toBeGreaterThan(RUNS * 0.1);
      expect(someOpen).toBeGreaterThan(RUNS * 0.1);
    });
  });
});
