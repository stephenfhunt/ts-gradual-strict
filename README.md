# ts-gradual-strict

Adopt `strictNullChecks` in an existing TypeScript project one declaration at a time.

Turning the flag on in a large, older codebase produces thousands of errors at once, and
a separate "strict subset" tsconfig breaks every time an import crosses the line. This
tool takes a different route: mark what is meant to be null-safe, and only that is held to
strict rules.

```ts
function findUser(id: number): User | null { ... }   // legacy, untouched

/** @strict */
export function greet(id: number): string {
  return `hello ${findUser(id).name}`;
  //              ~~~~~~~~~~~~ error TS2531: Object is possibly 'null'.
}
```

```sh
npx ts-gradual-strict -p tsconfig.json
```

Point `-p` at a monorepo's solution-style root tsconfig and every referenced project is
checked, each under its own options.

Silent with exit 0 when every marked region is clean; `tsc`-style errors and exit 1 when
one is not — so it drops into CI next to the normal build and keeps marked code from
regressing.

## How it works

The tool compiles the project a second time with `strictNullChecks` on and reports only
the errors that fall inside marked code. Every type in the project is read with its strict
meaning, so marked code must narrow a legacy `User | null` and cannot return `null`
through its own `: string`. Unmarked code is never reported.

- `/** @strict */` marks a function, class, method, variable, or a single statement such
  as one `if` block inside a legacy function, and everything nested inside it.
- `// @strictFile` before a file's first token marks the whole file.
- A marker that marks nothing, such as `// @strict` (not JSDoc) or `@strictFile` below an
  import, is an error, so a mark can never pass silently.

`--report` adds a list of the places where marked code trusts unmarked code. For each
one it shows how many strict errors marking that declaration would add, cheapest first,
and it counts the marks where strict mode holds outright because nothing they reach is
trusted.

When everything is marked and the tool is silent, turn `strictNullChecks` on in tsconfig
and delete the marks: the output with everything marked is exactly what `tsc` reports.

To silence one strict error inside a mark, use `!`, a cast, or `// @ts-ignore`, **not**
`// @ts-expect-error`: the project's own non-strict build sees nothing to expect and fails.

`spec.md` is the full contract, with a worked example for every rule — including what the
tool deliberately does not catch.

## Requirements

Node 22.18+, and TypeScript 5.x or 6.x in the project. There is no build step: the command
runs its TypeScript source directly under Node's type stripping, so it can be used straight
from a checkout as a `file:` or workspace dependency:

```json
"devDependencies": { "ts-gradual-strict": "file:../tools/ts-gradual-strict" }
```

Node will not strip types under `node_modules`, so the package must be linked (npm, pnpm and
Yarn workspaces all link), not copied: `npm pack` tarballs and Yarn Plug'n'Play will not work. TypeScript 7's compiler API is not yet
stable; see `decisions.md`.

## Development

```sh
npm install
make check
```

`AGENTS.md` is the working guide; `testing.md` describes the property-based test suite.
