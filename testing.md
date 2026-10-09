# Testing strategy

How we know the tool does what `spec.md` says. Current-state: this describes the strategy
in force, not its history.

## Why property-based testing here

The tool's contract is a handful of **laws** over two inputs that vary independently — a
program and a marking — and laws are where properties beat examples:

- **An oracle that already exists.** With everything marked, the output must be what
  `tsc --strictNullChecks` says. `tsc` is a differential oracle for free.
- **Algebraic laws over markings.** Monotonicity (removing a mark never adds an error —
  the *gradual guarantee* of the gradual-typing literature), additivity
  (`diag(M1 ∪ M2) = diag(M1) ∪ diag(M2)`), and the identities at the empty and full marking.
- **A firewall law** that holds only under a condition, so its failure *without* the
  condition is itself checkable: behind annotations, unmarked bodies cannot change marked
  output.

**Stack:** `fast-check` for generation and shrinking, `vitest` as the runner.
`PROPERTY_RUNS=2000 npx vitest run test/properties.test.ts` runs a deeper sweep than the
default 150 per property.

One mechanical trap: a fast-check predicate must end in a *statement*.
`(v) => expect(f(v)).toBe(0)` returns vitest's assertion object, which fast-check reads as
a failure.

## The layers

1. **Worked examples** — `spec.md` §Examples, run verbatim by `test/examples.test.ts`,
   compared exactly. An example reaches the spec only once its test passes, and an example
   without a `Test:` line fails the harness.
2. **The command** — `test/cli.test.ts` runs `src/cli.ts` on fixture projects in
   `test/fixtures/`, one test per row of `spec.md` §The command's table, plus a
   solution-style monorepo root (`solution/`) and the no-files configs (`empty/`,
   `cycle/`). `test/consume.test.ts` installs the package via `file:` and runs its bin.
   `test/escape.test.ts` checks each way of silencing a strict error against both the tool
   and the project's own build.
3. **The marking table** — `test/marking.test.ts`, one row per construct that can carry a
   mark (its null error is reported, under its report name) and one per marker that marks
   nothing (it is a stray, with the fix in its message). This is the answer to "what can I
   mark?" as a test, and it was found by probing TypeScript rather than read off the spec.
4. **Properties** — this file's catalog, `test/properties.test.ts`.

**Not tested:** `--pretty` output (only `--no-pretty` is compared), Windows paths, and
JavaScript files.

## The four rules

1. **An equivalence or law claim ships as a property**, not a unit test.
2. **Every property carries a non-vacuity guard**: it counts what its runs reached (runs
   with diagnostics, runs where marks dropped something) and asserts a floor. A generator
   that drifted to programs with no errors would otherwise pass everything.
3. **Mutation-verify before keeping**: break the code the property covers, watch it go
   red, restore. The catalog records the mutation that reddened each.
4. **Widening the generator needs a matching acceptance check**, because a wider
   differential is not a wider check.

## Oracles

**A differential oracle** compares two implementations of one semantics. P1's is `tsc`,
built in `test/support.ts` with `ts.createProgram` and `strictNullChecks` stated there —
not through `src/ts.ts`. Its first version *did* call the tool's own program builder, and a
mutation removing the strict override passed P1, since both sides lost the flag together.

**An independent oracle** re-derives the rule rather than calling the implementation.
P5's region oracle is the generator's own bookkeeping: `render` records each slot's span as
it writes it, and P5 never asks `src/regions.ts` where a mark reaches. P12's is the same
kind: `callGraph` reads each slot's calls off the shape, and P12 never asks the checker
what a name resolves to.

## The generator

`test/arbitrary.ts`. A `Shape` is a program over the nullability lattice — return
annotations from `string`, `string | null`, `string | undefined` or none; parameters
`string`, `string | null`, `string | undefined`, optional; classes with methods, functions
and top-level consts; bodies that dereference (`.slice`, `.length`), coalesce, narrow on
`p`, and call any function or method in the program. A shared, `declare`d `box: Box` gives
every program an optional and a nullable property to read, with no code behind it, so it is
never a report edge.

Every declaration has a **slot**, filled with `/** @strict */` or `/** @loose  */` — the
same width, so a diagnostic has the same offset under every marking and properties compare
markings by position. P6 guards that invariant.

## Property catalog

`[x]` green and mutation-verified; `[ ]` not yet written. `make check` counts the boxes.

- [x] **P1 — full marking is plain `tsc --strictNullChecks`.** Reddened by: removing the
  strict override from `STRICT_OVERRIDES`.
- [x] **P2 — no marking, no output.** Reddened by: treating every file as wholly marked.
- [x] **P3 — monotonicity, the gradual guarantee.** Under the current engine this follows
  from the filter being pointwise; it is here as the guard on any future engine that
  treats unmarked signatures differently. Reddened by: inverting the filter (reporting
  outside marked spans), which fails the law itself.
- [x] **P4 — additivity.** Reddened by: disabling the region filter.
- [x] **P5 — output equals strict diagnostics inside marked spans.** The precise oracle;
  P1 and P2 are its corners. Reddened by: not descending into classes; ignoring a class's
  own mark; disabling the filter.
- [x] **P6 — marks are inert**: the legacy program's and the strict program's diagnostics
  are identical under every marking. Covers the assumption P3–P5 rest on, not `src/`.
  Reddened by: making the two slot fillers different widths.
- [x] **P7 — the annotation firewall.** With every signature annotated, swapping the
  bodies of uncovered functions and methods for fresh ones leaves marked output unchanged,
  named by slot and offset. *Acceptance:* without annotations fast-check must find a
  counterexample — the re-inference gap of `spec.md` §Semantics, found by search. Reddened
  by: letting the swap reach covered bodies.
- [x] **P10 — with full marking the report is empty**: no edges, and every mark is
  closed. Reddened by: treating declarations covered by another mark as edges.
- [x] **P11 — an edge's cost is exact.** Marking an edge's target grows the output by
  exactly the target's reported strict-error count. Reddened by: counting at most one
  error per target. Excluding errors that a nested mark already reports is out of the
  generator's reach, because it never nests a mark inside an unmarked function. That case
  is pinned by a spec example instead, which reddens under the same mutation.
- [x] **P12 — edges and closure follow the call graph.** The oracle is the generator's
  own `callGraph`, read off the shape rather than asked of the checker. Reddened by: not
  propagating openness between marks; treating covered targets as edges.
- [ ] **P8 — an independent nullability oracle.** A model of the lattice written from
  `spec.md`, predicting which returns, assignments and dereferences error, over a fragment
  of the generator. The only property that does not trust `tsc` to be right.
- [ ] **P9 — `@strictFile` equals marking every declaration** in that file.
