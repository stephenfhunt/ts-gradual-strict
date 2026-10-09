# Worklog

Session handoff for chaining agentic sessions. Each session ends by adding an entry so the
next one orients in seconds without re-reading transcripts.

**Conventions**
- Newest entry on top.
- A curated summary, not a transcript. Don't paste raw output — except the baseline line,
  which is pasted, never retyped.
- Four fields: **Done**, **Decided**, **Removed**, **Next up**. *Removed* is the
  counterweight to every other field rewarding addition; "nothing" is fine once you looked.
- Entries stay under ~50 lines; this file keeps the most recent three. Older entries
  rotate verbatim into `docs/worklog-archive/YYYY-MM.md`.

---

## 2026-10-08 — every JSDoc-able construct can be marked, and a dud marker is an error

```
baseline: properties=10/12 green tests=61/61
```

**Done.**
- **Probed what can carry a mark** by putting a null error inside each construct. Marks
  are honoured on everything TypeScript attaches JSDoc to, statements and inline arrows
  included, which is more than `spec.md` said. Now documented, and pinned row by row in
  `test/marking.test.ts`, with each mark's report name (`if in render`, `C.constructor`).
- **Stray markers** (`strayMarkers`, `src/regions.ts`): `// @strict`, `/* @strict */`, a
  JSDoc `@strict` attached to nothing, and `@strictFile` after the first token. Each is
  reported with its fix and exits 2. A JSDoc at end of file attaches to the end-of-file
  token, which is now excluded from marks so that it counts as a stray.
- Three spec examples: a statement mark with its report, and two strays. One CLI test.
- `--report` committed (`c137024`).

**What the tests taught.**
- **The spec understated the tool.** The probe found `if`, loops, `return` and inline
  arrows already honoured. Nothing had tested them, because nothing had asked.
- **One mutation survived until messages were pinned.** Sending plain comments down the
  "unattached JSDoc" branch still produced a stray, just one that told the user to move
  the comment rather than add an asterisk. Each stray row now pins its fix.
- **A mark inside a legacy function trusts its locals**, so the statement example's
  report lists `out` as an edge. That's correct under the rules, and it's in the spec.

**Decided** (`decisions.md` 2026-10-08): statement marks documented, not restricted; a
marker that marks nothing is an error, exit 2.

**Removed.** Nothing. The oldest worklog entry was moved to `docs/worklog-archive/2026-10.md`.

**Next up.**
- **Run on a real legacy project**, now with `--report`. Watch whether locals of
  partially marked functions flood the report.
- P9 (`@strictFile`), P8 (independent nullability oracle).

## 2026-10-08 — `--report` lands; `--boundary` is declined

```
baseline: properties=10/12 green tests=32/32
```

**Done.**
- **`--report`** (`src/report.ts`): edges from marks to unmarked declarations that have
  code, each with annotated/inferred, the target's own strict-error count, and where the
  target is declared. Sorted cheapest first. Ends with a `marks: N, closed: M` line. It
  resolves imports and never changes the exit code.
- `src/regions.ts` now returns marks (node and span), so the report can name them.
- **`spec.md` §The report**, with four examples: cost order, closure, which declarations
  are edges, and nested marks. The examples harness reads `Flags: --report`, and
  `EXAMPLES_OUT=<file>` dumps actual output so a new example can be read before it's pinned.
- **P10–P12**, mutation-verified. P12's oracle is a call graph the generator reads off
  its own shape. The generator's `box` is now `declare`d, so it is never an edge.

**What the properties taught.**
- **One mutation survived all three properties**: counting errors that a nested mark
  inside the target already reports. The generator never nests a mark inside an unmarked
  function, so it can't reach that case. It's pinned by a spec example instead, and
  `testing.md` says so. If the generator grows to nest marks, that needs an acceptance
  check (rule 4).
- **A silent no-op edit:** biome had re-wrapped the prelude line, so my scripted replace
  did nothing. P10 and P12 caught it at once, because `box` showed up as an edge whose
  target lay outside every slot.

**Decided** (`decisions.md` 2026-10-08): `--report` as a flag; `--boundary` declined on
your call, because it sees only type-visible nulls and breaks P2.

**Removed.** `notes/boundary.md`. Part 1 is now in `spec.md`, and part 2 was declined.

**Next up.**
- **Run `--report` on a real legacy project.** Is the edge list a usable to-do list or
  noise? Variables and class properties may flood it, and the count of type-only
  declarations would show how much the exclusions matter.
- Unchanged: P9 (`@strictFile`), P8 (independent nullability oracle).

## 2026-10-08 — the boundary, staged: trust stays for errors and becomes visible in a report

```
baseline: properties=7/9 green tests=23/23
```

**Done.** A design session, prompted by the question of how data flows across a mark.
No code changed. Staged as an open question in `decisions.md`, with the long form and
three worked examples in `notes/boundary.md`. Each example's diagnostics come from today's
strict program, and the report sections are drafts.

**What the analysis found.**
- **Pessimistic unmarked signatures are ruled out by the properties, not by taste.** If
  unmarked returns were read as `T | null | undefined`, marking a callee would delete
  errors in its callers, which breaks P3 and P4. The laws already written are what decide
  this.
- **The strict program already knows when a trusted signature is false, and throws it
  away.** In the first draft example, legacy `nickname(): string` returns `null`. The
  strict program reports it, and the filter drops it. Surfacing that count per edge makes
  it the cost of marking the callee next, exactly (P11, from P4 and P5).
- **Inbound checking only sees nullability that is visible in types.** A `null` held in a
  legacy variable declared `string` passes into marked code unseen. The draft example
  pins that limit.

**Decided.** Nothing. Three choices are for you: `--report`, `--boundary`, and which
comes first.

**Removed.** Two open questions, folded by amendment into the new one.

**Next up.**
- **The boundary decision.** Once it's made, move its examples into `spec.md` with tests
  and delete `notes/boundary.md`.
- Unchanged from the previous entry: a real legacy project, P9, P8.

