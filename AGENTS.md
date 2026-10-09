# AGENTS.md — ts-gradual-strict

A Node CLI that lets a non-strict TypeScript project adopt `strictNullChecks` one
declaration at a time: code marked `/** @strict */` is checked as if the flag were on, and
nothing else is. `README.md` has the longer version; `spec.md` is the contract.

**Design pillars** — what we trade other things away for:

- **Exactly `tsc`.** Inside a mark, the errors are the ones strict mode would report, from
  TypeScript's own checker. When everything is marked, the output *is*
  `tsc --strictNullChecks`. No second opinion about types, ever.
- **Local.** A mark's effect is confined to its text. Marks are additive and removing one
  never creates an error — stated as laws and checked as properties.
- **Deletable.** Marks are comments. The end state is a project where the flag is on and
  this tool and every mark are gone.

**Explicit non-goal: soundness at the boundary.** Legacy annotations are trusted, as `tsc`
trusts them; calls into marked code from unmarked code are not checked (`spec.md` §Semantics).

## Environment / build / test / run

Node ≥22.18, npm, ESM, **no build step**: the bin is `src/cli.ts`, run by Node's type
stripping (`decisions.md` 2026-10-08), which is why `erasableSyntaxOnly` is on. `typescript` 6.x is a dev dependency and a peer (`>=5.0 <7`): the tool
uses the project's compiler. Why not TypeScript 7: `decisions.md` 2026-10-08.

```sh
make check                              # biome + tsc + tests; ends in the baseline line
npx vitest run test/properties.test.ts  # the properties; PROPERTY_RUNS=2000 for depth
node src/cli.ts -p test/fixtures/legacy/tsconfig.json   # runs from source, no build
```

`src/ts.ts` is the only module that *constructs* compiler objects (config, host, program),
so a TypeScript 7 adapter is one file. Keep the tree warning-free and formatter-clean.

## The document map

Each document answers one question and refuses the others. When two seem right, the
tie-break is *which event updates it*.

| document | kind | holds |
|---|---|---|
| `README.md` | current-state | what this is and how to run it, for someone arriving cold |
| `spec.md` | current-state | marking, semantics, the command; worked examples, each run by a test |
| `testing.md` | current-state | test strategy, oracles, the generator, the property catalog |
| `decisions.md` | **append-only** | decisions, rationale, open questions |
| `notes/` | draft | the long form behind one open question; retired when it is decided |
| `docs/worklog.md` | **append-only** | session handoff, newest first |

**current-state** documents get rewritten to state present truth and never narrate the
change — point at the decision instead. **append-only** records are never rewritten;
history is their payload. Amending your own uncommitted entry is editing a draft.

No roadmap, bug tracker or audit script, deliberately (`decisions.md` 2026-10-08). Deferrals
live in `spec.md` §Not covered, next threads in the worklog's *Next up*. A new kind of
record means a new row here.

## Working style

**A new behaviour is designed in `decisions.md` and lands in `spec.md` finished.** Draft
its worked example — exact input, exact output — in the open question that argues for it;
move it into §Examples in the commit where its test passes. Every example ends with
`` Test: `examples › <title>` ``, and **no example means no feature**.

**Design-first.** Anything that changes what a user sees (marking rules, what is reported,
the command's output or exit codes), closes off an alternative, or costs more than a
session is staged as an open question, written so deciding takes a minute. Structure,
naming and anything reversible in one commit are yours. The tell: if resolving it needs a
non-obvious **Rejected** line, it is not yours.

**Four testing rules**, in full in `testing.md`: (1) a law ships as a **property**; (2)
every property has a **non-vacuity guard**; (3) **mutation-verify** before keeping — break
the code, watch it go red, restore, and record the mutation in the catalog; (4) widening
the generator needs a matching **acceptance** check. An oracle must not call the code it
checks — P1's first oracle did, and passed a mutation it existed to catch.

**Real projects are the experiment.** A property says the tool does what it claims; only
running it on a real legacy codebase says the claim is useful. Findings from such a run
go in the worklog and, if they change a rule, in `decisions.md`.

## Git

Solo, trunk-based, no PR gate. Commit directly on `trunk`, in small self-contained steps —
each builds, passes `make check`, is one coherent idea, and says *what* changed while
pointing at `decisions.md` for *why*. **Commit only when asked.**

## Session protocol

**Start:** `docs/worklog.md`, newest entry's *Next up*.

**End:** run `make check`; rewrite any current-state document whose truth changed; add a
worklog entry (Done / Decided / Removed / Next up) with the baseline line pasted, not
retyped; annotate any decision this session taught you something about. Raw transcripts
are saved by Claude Code under `~/.claude/projects/` — never commit them.
