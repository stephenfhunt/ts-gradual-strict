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

- **2026-10-08** — **No build step: the bin is `src/cli.ts`, run by Node's type
  stripping; `engines` is `>=22.18`** (`package.json`; `test/consume.test.ts`).
  - **Why:** the tool is meant to be consumed from a monorepo as a `file:` or workspace
    dependency, not from npm. Node 22.18 and 23.6+ strip types by default. The source was
    already erasable-only with `.ts` specifiers, so a build added only a way to ship a stale
    `dist/`, and `bin` did point at a git-ignored `dist/cli.js` that a fresh clone would
    lack. The old `>=26` was copied from tsdl's `package.json` and never checked against
    this code.
  - **Floor, measured with `npx -p node@<v>`:** 22.18.0 runs the CLI and passes all 62
    tests, the consumer test included. 22.17.0 fails with `ERR_UNKNOWN_FILE_EXTENSION`.
  - **Constraint accepted:** Node refuses to strip types under `node_modules`, so the
    package must be linked, not copied (npm, pnpm and Yarn workspaces link). `npm pack`
    and Yarn Plug'n'Play are out.
  - **Rejected:** keeping `tsconfig.build.json` for a published `dist/`. Nothing publishes,
    and a build nobody runs is how `bin` came to point at a missing file.
  - **Guard:** `test/consume.test.ts` installs via `file:` and runs the bin through its
    shebang. It reddens when `bin` points at `dist/` (mutation-verified).

- **2026-10-08** — **A marker that marks nothing is an error, exit 2** (`strayMarkers`,
  `src/regions.ts`; `spec.md` §Marking).
  - **Why:** `// @strict`, `/* @strict */`, a JSDoc `@strict` attached to nothing, and
    `@strictFile` below an import all looked like marks and checked nothing. To the person
    who wrote them, the silence read as *their code passed*. Each is now reported with
    the fix in its message. Exit 2 (bad input) rather than 1, so CI cannot go green on a
    mark that does nothing.
  - **Rejected:** a warning that leaves the exit code alone, which is the same silence
    with extra output. Also rejected: honouring `// @strict` as a mark. A line comment
    has no attachment in the AST, so what it covers would be a guess.
  - **Guard:** `test/marking.test.ts`'s stray rows, which pin each message's fix: a
    mutation that sent plain comments down the wrong branch kept them strays and reddened
    only once the messages were pinned. Plus `test/cli.test.ts`'s exit-2 row.

- **2026-10-08** — **Anything TypeScript attaches JSDoc to can be marked, statements
  included** (`spec.md` §Marking; names in `src/report.ts`).
  - **Why:** found by probing, not designed: the engine already honoured `@strict` on
    `if` blocks, loops, `return`, expression statements and inline arrows, because
    TypeScript attaches JSDoc to them. Kept and documented, because marking one block of
    a 500-line legacy function is the gradual step this tool exists for. In the report,
    such marks are named by kind and enclosing code (`if in render`).
  - **Rejected:** restricting marks to declarations and treating the rest as strays.
    That throws away the finest-grained step for a tidier list.
  - **Consequence, pinned by a spec example:** a mark inside a legacy function trusts that
    function's locals, so they appear as report edges.
  - **Guard:** `test/marking.test.ts`, one row per construct, including its report name.

- **2026-10-08** — **`--report` shows the boundary; inbound checking (`--boundary`) is
  declined** (`src/report.ts`; `spec.md` §The report).
  - **Why:** errors keep trusting signatures. Reading unmarked signatures pessimistically
    would make marking a callee delete its callers' errors, which breaks P3 and P4. The
    report makes that trust visible instead. Each edge carries the target's own strict
    errors, which the strict program already computed and the filter discarded. By P4
    and P5 that number is exactly what marking the target would add (P11), so sorted
    cheapest first the report is a migration to-do list. Closure tells you where strict
    mode actually holds.
  - **Rejected:** `--boundary`. Your call: it does not add enough value. It sees only
    nullability that is visible in types — a `null` in a legacy variable declared
    `string` passes into marked code unseen — and it would break P2 by design. Also
    rejected: a separate `report` subcommand. A flag composes with a CI run that already
    checks.
  - **Guard:** P10–P12; the spec example on nested marks (the one rule the generator
    cannot reach); `test/cli.test.ts` for imports and the unchanged exit code.

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

- **How should the boundary between marked and unmarked code be reported?** Errors stay
  as they are: trusted signatures, no inbound checks. Changing that breaks P3/P4 or the
  endgame (`notes/boundary.md` §The problem). The proposal adds output only, with worked
  examples in `notes/boundary.md`. Three parts, each decidable separately:
  1. **`--report`**: outbound edges from marked to unmarked code, each with
     annotated/inferred, the target's own strict-error count (= the cost of marking it
     next, P11), and a `closed` count of marks. Recommend: yes, as a flag that never
     changes the exit code. Alternative: a separate `report` subcommand.
  2. **`--boundary`**: also report errors in unmarked code whose target (argument → marked
     parameter, assignment → marked property) is marked. Recommend: yes, as errors with
     exit 1, because the user opted in. Alternative: warnings that leave the exit code
     alone. Callbacks are deferred.
  3. **Which comes first?** Recommend `--report`. It changes no semantics, and its
     strict-error count is information the tool already computes and discards.
  — `src/check.ts`; `spec.md` §Not covered.
  - ***Resolved 2026-10-08*** — `--report` is built as proposed. `--boundary` is declined.
    See the decision of that date. The long-form note was retired with it.

- **Should the tool say when marked code leans on an unannotated legacy function?**
  P7 shows annotations are a firewall: behind them, rewriting unmarked bodies never
  changes marked output; without them, a legacy body edit can add or remove errors in
  marked code through re-inference. A hint — "`pick` has no return annotation and is
  called from @strict code" — would turn that into a to-do list for the migration.
  Against: it is output that is not a strict-mode error, which the command currently
  never prints. Decide once a real project shows how often it happens. — `src/check.ts`.
  - ***Amended 2026-10-08 — folded into the boundary question above.*** The hint became
    the `inferred` kind of an outbound edge, in a report that never changes the exit code
    — which answers the objection that it is not a strict-mode error.

- **Should calls *into* marked code be reported?** Legacy code passing `null` to a marked
  `(name: string)` is dropped today (spec example). A `--boundary` mode could report
  those sites as warnings, giving marked functions a guarded perimeter. Against: it
  reports in unmarked code, which breaks P2 by design and needs its own property. —
  `spec.md` §Not covered.
  - ***Amended 2026-10-08 — folded into the boundary question above*** as its part 2,
    with the property it needs (P13) and a worked example showing what it cannot see: a
    `null` held in a variable declared `string`.

- **When does TypeScript 7 get an adapter?** When its API leaves `unstable/`, or when a
  real project needs to run this under 7 — whichever first. The question for that session
  is whether the property suite can stay in-process. — `src/ts.ts`.
