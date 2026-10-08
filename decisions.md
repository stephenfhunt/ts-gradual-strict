# Decisions & open questions

**Append-only.** A decision records why today's code exists; rewriting it destroys the
one thing a future session cannot recover any other way. Amend in place with a marker
(`***Amended YYYY-MM-DD —***`, `Superseded`, `Resolved`, `Confirmed`), never rewrite — a
rationale that turned out wrong is the most useful entry here, because it shows where the
reasoning misleads. Annotate a decision when its consequences land, not only when it is
overturned.

Each entry is ~15 lines: what was decided, **Why**, **Rejected**, and **Guard** — what
breaks if the decision stops being true (`n/a — <why>` when nothing can). A decision that
needs more room wants its own file in `notes/` and a pointer from here.

Newest first. Everything outside this file states present truth and merely *points* here.

## Decisions

- **2026-10-08** — **Day one adopts the documents, not the audit** (process; `AGENTS.md`).
  - **Why:** `../working-discipline`'s own measurement was that the value is in the
    nouns — a document map, an append-only log, a worklog, one baseline line — and its
    audit machinery did not earn its keep as hoped. This repo takes the nouns and the
    `make check` baseline, and the one mechanical rule that costs nothing: the examples
    harness fails an example without its `Test:` line.
  - **Rejected:** copying `discipline-audit` and a `.discipline.json` in on day one.
    **Revisit when** a cap or the append-only rule is broken and nobody notices for a
    session — that is the incident that would earn the check.
  - **Guard:** `test/examples.test.ts` (an example without `Test:` fails); `make check`
    prints the baseline line even when red.

- **2026-10-08** — **TypeScript 6's in-process API; peer range `>=5.0 <7`** (`src/ts.ts`).
  - **Why:** TypeScript 7 (the Go port, 7.0.2 on npm today) exposes its API only as
    `typescript/unstable/*`, an IPC client to the native binary with no in-process
    `CompilerHost`. The property suite compiles thousands of small programs from memory,
    and legacy projects — the users — are on 5.x/6.x. The project's own compiler is used.
  - **Rejected:** building on the unstable TS 7 API now — it would tie the engine to a
    moving surface and make each generated program a round trip to a subprocess.
  - Every *construction* call (config, host, program) is in `src/ts.ts`, so a TS 7 adapter
    is one module. TS 6 reports old options (`target: es5`, `node10`) as errors; the second
    program sets `ignoreDeprecations` so a project that builds today is not failed here.
  - **Guard:** `test/cli.test.ts` runs a fixture whose tsconfig uses deprecated options.

- **2026-10-08** — **`strictNullChecks` is the only override, held in one constant**
  (`STRICT_OVERRIDES`, `src/ts.ts`).
  - **Why:** null and undefined are the migration the teams are stuck on, and the one
    whose errors are local to an expression. A later flag is one key here, plus the
    examples and properties that show its errors stay local too.
  - **Rejected:** shipping the whole strict family on day one — `noImplicitAny` and
    `strictPropertyInitialization` report at declarations whose locality has not been
    examined, and P1–P7 say nothing about them yet.
  - **Guard:** P1 compares against a program that states the flag itself, so removing it
    from `STRICT_OVERRIDES` reddens P1 (mutation-verified).

- **2026-10-08** — **A whole file is marked by `@strictFile`, not a leading `@strict`**
  (`src/regions.ts`; `spec.md` §Marking).
  - **Why:** a `/** @strict */` at the top of a file is also the JSDoc of its first
    declaration, and the two readings cannot be told apart. A separate spelling makes the
    common case — marking that first declaration — mean what it says.
  - **Rejected:** a leading `@strict` followed by a blank line meaning "file" — an
    invisible distinction an agent or a formatter could erase.
  - **Guard:** spec examples *the file marker covers the whole file* and *a leading
    @strict marks only the first declaration*.

- **2026-10-08** — **Marks are JSDoc `@strict` tags, not decorators** (`spec.md` §Marking).
  - **Why:** decorators attach only to classes and their members; the teams already
    write `/** @strict */` on functions and variables. A comment has no runtime, no
    compiler flag, and deletes cleanly at the end of the migration. TypeScript parses
    JSDoc into the AST its checker reads; the host forces `JSDocParsingMode.ParseAll`
    since TS 5.3+ lets a host skip it.
  - **Rejected:** a no-op `@strict` decorator alongside — a runtime dependency and an
    `experimentalDecorators` question in exchange for nothing a comment cannot say.
  - **Guard:** spec examples for a marked class, method closures and a variable statement.

- **2026-10-08** — **The engine is a second program with `strictNullChecks` on, filtered
  to marked spans by diagnostic start** (`src/check.ts`; `spec.md` §Semantics).
  - **Why:** TypeScript's own checker produces exactly the errors strict mode would, so
    nothing is reimplemented and nothing can disagree with `tsc`. Every signature is read
    with strict meaning whether marked or not, which is the semantics asked for: marked
    code trusts declared types and must narrow declared `| null`.
  - **Consequences accepted, each a spec example:** legacy annotations are trusted;
    errors located in unmarked code are dropped even when a marked parameter is the cause;
    an unannotated legacy function is re-inferred under strict rules (P7's acceptance test
    finds this as a counterexample on its own).
  - **Rejected:** a bespoke nullability checker over the AST (re-derives flow analysis
    and drifts from `tsc`); the subset tsconfig the teams run today (file granularity, and
    imported legacy files are checked too); widening unmarked declarations to `any` (would
    make marked code unable to see a declared `| null`, the opposite of what was asked).
  - **Guard:** P1 (full marking equals `tsc --strictNullChecks`), P5 (output equals strict
    diagnostics inside the generator's marked spans).

## Open questions

- **Should the tool say when marked code leans on an unannotated legacy function?**
  P7 shows annotations are a firewall: behind them, rewriting unmarked bodies never
  changes marked output; without them, a legacy body edit can add or remove errors in
  marked code through re-inference. A hint — "`pick` has no return annotation and is
  called from @strict code" — would turn that into a to-do list for the migration.
  Against: it is output that is not a strict-mode error, which the command currently
  never prints. Decide once a real project shows how often it happens. — `src/check.ts`.

- **Should calls *into* marked code be reported?** Legacy code passing `null` to a marked
  `(name: string)` is dropped today (spec example). A `--boundary` mode could report
  those sites as warnings, giving marked functions a guarded perimeter. Against: it
  reports in unmarked code, which breaks P2 by design and needs its own property. —
  `spec.md` §Not covered.

- **When does TypeScript 7 get an adapter?** When its API leaves `unstable/`, or when a
  real project needs to run this under 7 — whichever first. The question for that session
  is whether the property suite can stay in-process. — `src/ts.ts`.
