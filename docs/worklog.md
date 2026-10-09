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

## 2026-10-08 — monorepo roots are checked, not passed; the known gaps are written down

```
baseline: properties=10/12 green tests=70/70
```

**Done.** The gaps listed in answer to "what is missing":
- **Project references** (`loadProjects`, `checkProject`). A solution-style root had
  checked nothing and exited 0, which an experiment confirmed before the fix. Now there is
  one strict program per project, each answering for its own files under its own options,
  with results merged and duplicates removed. A no-files set of configs is exit 2.
  Fixtures: `solution/`, `empty/`, `cycle/`.
- **Constructor edges**: `new C()` is a report edge to `C`'s explicit constructor. You
  asked what "classes are excluded" meant, and it turned out to hide the code that fills
  the fields.
- **`@ts-expect-error` trap**: confirmed by experiment (TS2578 in the project build),
  pinned in `test/escape.test.ts` against both builds, and documented in §Silencing an
  error. A tool-specific `@strict-expect-error` is staged as an open question.
- **Not covered** gained: runtime TS-version check, `allowJs`, duplicate errors, built
  `.d.ts` across references. `testing.md` lists what is untested.
- The suite passes on Node 22.18.0 as well as 26.

**What the tests taught.**
- **The first solution fixture couldn't tell options apart.** Letting every program check
  every file passed it, because `lib`'s file had no extra errors under `app`'s options and
  deduplication hid the rest. `app` now turns on `noUncheckedIndexedAccess`, which would
  make `lib`'s marked code an error if `lib`'s file were checked under `app`'s options,
  and the mutation goes red.
- **The "no files" error is almost unreachable.** TypeScript already rejects every
  ordinary shape. Only a reference cycle reached it, so a fixture pins that case.

**Decided** (`decisions.md` 2026-10-08): references followed, one program per project;
`new` targets the constructor.

**Removed.** Nothing. One worklog entry was moved to the archive.

**Next up.** A real legacy project: first as a monorepo devDependency, then pointed at the
solution root with `--report`. Watch for `@ts-expect-error` (it decides the open question)
and for locals flooding the report. Then P9 and P8.

## 2026-10-08 — no build step; Node 22.18 is the measured floor

```
baseline: properties=10/12 green tests=62/62
```

**Done.**
- The bin is now `src/cli.ts`, run by Node's type stripping, and `files` ships `src`.
  Removed `tsconfig.build.json` and `make build`.
- `test/consume.test.ts` installs the package into a throwaway project as a `file:`
  devDependency and runs the installed bin through its shebang. It reddens when `bin`
  points at `dist/`.
- **Verified with `npx -p node@<version>`:** 22.18.0 runs the CLI and passes all 62
  tests. 22.17.0 fails with `ERR_UNKNOWN_FILE_EXTENSION`. `engines` is now `>=22.18`.
- README: how to depend on the tool from a monorepo, and why it must be linked.

**What this taught.**
- **`bin` pointed at a git-ignored `dist/`.** It only worked here because of a stale local
  build. No test went through the installed package, and now one does.
- **The `>=26` floor was copied from tsdl, not measured.** A number in the setup that
  nobody derived is worth one question.

**Decided** (`decisions.md` 2026-10-08): no build step, `engines >=22.18`, and the
package must be linked, not copied.

**Removed.** `tsconfig.build.json`, `make build`, `dist/` from `.gitignore`. The oldest
worklog entry was moved to the archive.

**Next up.** Unchanged: a real legacy project, now as a monorepo devDependency; P9; P8.

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

