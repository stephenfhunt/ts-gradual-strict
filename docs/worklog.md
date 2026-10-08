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

## 2026-10-08 — the engine works, and the properties found its one real gap on their own

```
baseline: properties=7/9 green tests=23/23
```

**Done.** Project from an empty repo, on the workflow of `../tsdl` and `../llmlogic`.
- **The engine**: a second program with `strictNullChecks` on, its diagnostics filtered to
  `@strict` spans by start position (`src/check.ts`, `src/regions.ts`, `src/ts.ts`). Only
  files mentioning `@strict` are checked, and lib files are parsed once per process.
- **`spec.md`**: marking, semantics, the command, and ten worked examples run verbatim,
  three of them the known gaps (trusted annotations, inbound `null`, re-inference).
- **The command** (`src/cli.ts`) with exit codes 0/1/2, on fixtures in `test/fixtures/`.
  The `legacy` fixture uses `target: es5` and `node10`, which TS 6's own `tsc` rejects;
  the tool checks it anyway.
- **Properties P1–P7** over a generator of programs on the nullability lattice. Marker
  slots are fixed-width so markings compare by position. Each one was mutation-verified;
  the catalog in `testing.md` records which mutation reddened which.

**What the properties taught.**
- **P1's first oracle was not independent**: it built its "plain tsc" program through
  `src/ts.ts`, so deleting the strict override passed P1. Rebuilt in `test/support.ts`
  with the flag stated there; the same mutation is now red.
- **P7 rediscovered the re-inference gap without being told**: with unannotated
  signatures, fast-check finds an unmarked body edit that changes marked output. Kept as
  an acceptance test; the annotated version holds. Annotations are the firewall.
- **P3–P4 are near-tautologies under this engine** (the filter is pointwise). They stay
  as the guard on any engine that treats unmarked code differently.

**Decided** (`decisions.md` 2026-10-08): the second-program engine; JSDoc marks, not
decorators; `@strictFile` for whole files; TS 6's in-process API (TS 7's is
`unstable/` IPC); `strictNullChecks` only; the workflow documents without the audit script.

**Removed.** Nothing — first session.

**Next up.**
- **Run it on a real legacy project.** The first question that matters: are the errors
  in marked code the ones people expect, and what does the second program cost? Record
  time with and without the `@strict` pre-filter.
- **P9** (`@strictFile` ≡ marking every declaration) — small; widen the generator to emit
  the file marker, with its acceptance check.
- **P8**, the independent nullability oracle — the one property that does not trust `tsc`.
- The open question on hinting at unannotated legacy functions called from marked code;
  the real-project run is what decides it.
