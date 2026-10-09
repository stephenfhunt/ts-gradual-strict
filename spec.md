# ts-gradual-strict — specification

What the tool promises. Current-state: this states the contract in force; the reasons
behind it are in `decisions.md`, and this document points there rather than arguing.

## Marking

A **mark** is the JSDoc tag `@strict` on any code TypeScript attaches JSDoc to:

- **declarations**: functions (including `export default function`), classes, methods,
  constructors, accessors, class properties, variable statements (covering every
  declarator in them, and so the arrow functions they hold), object literal methods and
  properties, namespaces and enums;
- **statements**: `if`, a block, `return`, `throw`, loops, `switch`, `try`, and expression
  statements such as `app.get('/', (req, res) => { ... });`;
- **a function expression or arrow in argument position**:
  `on('data', /** @strict */ (chunk) => { ... })`.

```ts
/** @strict */
export function title(user: User): string { ... }
```

A mark covers its code **lexically**: its own text, from its JSDoc to its last token, and
everything nested inside it. A marked class covers its members, and a marked function
covers the closures it defines. A marked statement lets a large legacy function adopt
strict rules one block at a time. There is no way to unmark something nested inside a
mark.

A file is marked whole by `@strictFile` in a comment before its first token: above any
`import` or `'use strict'`, below a licence header if there is one. It is a separate
spelling because a leading `/** @strict */` is the JSDoc of the first declaration, and the
two readings could not be told apart.

The marks are comments, so they change nothing about how `tsc` compiles the project.

**A marker that marks nothing is an error.** These look like marks and check nothing, so
the command reports each one, names the fix, and exits 2 (§The command):

- `@strict` in a plain comment, `// @strict` or `/* @strict */`, since only JSDoc
  (`/** */`) is attached to code;
- `@strict` in a JSDoc comment that TypeScript attached to no code, such as one at the end
  of a file or one that isn't a tag at the start of a JSDoc line;
- `@strictFile` anywhere after the file's first token.

## Semantics

The tool builds a second program from the project's own files and options, overriding
only `strictNullChecks: true`. It reports that program's semantic diagnostics whose start
position lies inside a marked span, and nothing else.

Every consequence below follows from that one rule, and the examples show each:

- **Every declaration is read with strict meaning, marked or not.** A legacy
  `(): User | null` means what it says to marked callers, and an optional property is
  `T | undefined` when marked code reads it.
- **Marked code is held to its own signatures.** A marked function declared `: string`
  cannot return `null`, `undefined`, or anything typed as possibly either.
- **Errors located in unmarked code are dropped,** even when the cause is a marked
  declaration. Strictness is a property of where code is, not of what it calls.
- **Annotations are trusted.** A legacy function declared `: string` that returns `null`
  at runtime is believed, as it is by `tsc` under `strictNullChecks`.
- **Inferred types are re-inferred.** An unannotated legacy function's return type is
  inferred under strict rules, which can include `null` where the project's own build
  inferred something else.

When every declaration in a project is marked, the output is exactly what
`tsc --strictNullChecks` reports in those files: the endgame is a project with no output
here, at which point the flag can be turned on and the marks deleted.

## The command

```sh
ts-gradual-strict [-p <tsconfig.json>] [--pretty | --no-pretty] [--report]
```

`-p` defaults to `tsconfig.json` in the working directory and is read the way `tsc -p`
reads it, `extends` included. Its `references` are followed, transitively, and every
referenced project is checked too. A solution-style root (`"files": []` plus
`references`), as a monorepo often has, checks every project it names. Each project is
checked under its own options and answers for its own files: a file one project imports
from another is checked once, by the project that includes it. `--pretty` (the default on
a terminal) prints with colour and source context, as `tsc` does.

| outcome | output | exit |
|---|---|---|
| every marked region is clean | nothing | 0 |
| a marked region has errors | the diagnostics, then `Found N errors in @strict code.` | 1 |
| a marker marks nothing (§Marking) | each one, `Found N @strict markers that mark nothing.`, then any diagnostics | 2 |
| the tsconfig cannot be read, names no files (directly or through its references), or bad arguments | the config diagnostics, or usage | 2 |

`--report` appends the boundary report (§The report) after everything else, and never
changes the exit code.

Deprecated compiler options in the project's tsconfig are not errors here: the second
program sets `ignoreDeprecations`, since a project that builds with its own compiler must
not fail this check for being on an older one.

## The report

Marked code trusts the declared types of the unmarked code it uses (§Semantics). The
report makes that trust visible, without changing what is reported as an error.

An **edge** runs from a mark to an unmarked declaration that the mark references, when
that declaration has code that could break its own type: a function, method, accessor,
class property or variable, in the project's own source. Library and `node_modules`
declarations, `declare`d ones, classes, interfaces, type aliases and parameters are not
edges, with one exception: `new C(...)` is an edge to `C`'s explicit constructor, the
code that sets up what marked code then reads. There is one edge per mark and target,
located at the mark's first reference.

Each edge shows:

- **`annotated` or `inferred`**: whether the target declares its type. An inferred
  target is re-inferred under strict rules, so editing its body can change what marked
  code sees.
- **Its strict errors**: the strict program's diagnostics in the target's own text,
  which is exactly what marking the target would add to the output. `clean` means
  marking it is free. Writes to a variable or class property from elsewhere are not in
  its own text and are not counted: a field declared `owner: string` reads `clean` even
  when a constructor stores `undefined` in it. The constructor's own edge carries that
  error.
- **Where the target is declared.**

Edges are listed cheapest first: by strict errors, then by position.

A mark is named by its declaration (`greet`, `Directory.lookup`, `themeLength`), and a
`@strictFile` mark by its file. A statement or argument mark is named by its kind and the
nearest named code around it: `if in greet`, `arrow in Server.start`, `statement in
routes.ts`.

A mark is **closed** when it has no edges and every mark it references is closed. Inside
a closed mark strict mode holds outright: nothing it reaches is trusted. The last line
counts marks and closed marks. A marked class is one mark, as is a file marked with
`@strictFile`.

## Silencing an error

Inside a mark, silence a strict-only error with something both builds accept: a non-null
assertion (`user!.name`), a cast, a narrowing check, or `// @ts-ignore`.

**Not `// @ts-expect-error`.** Over an error that only strict rules report, the project's
own non-strict build sees no error there, so the directive is unused, and that build fails
with `TS2578: Unused '@ts-expect-error' directive`.

## Not covered

- Strict-family flags other than `strictNullChecks` (`noImplicitAny`,
  `strictPropertyInitialization`, `strictFunctionTypes`, …).
- Calls *into* marked code from unmarked code: no warning when legacy code passes `null`
  to a marked parameter (`decisions.md` 2026-10-08).
- An opt-out inside a mark.
- Editor integration: the diagnostics appear only from the command.
- TypeScript 7, whose compiler API is not yet stable. Nor is the supported range checked
  at run time: a project on a TypeScript outside `>=5.0 <7` fails with whatever error
  that version produces, not a message saying it is unsupported.
- JavaScript files (`allowJs`, `checkJs`): marks in `.js` files are untried.
- A suppression comment of the tool's own (`decisions.md` open question).
- Errors the project's own build already reports inside a mark are reported again here.
- Declarations a project reaches through a referenced project's built `.d.ts` are
  declarations, not code: they are trusted like a library's and are never report edges.

## Examples

Each example is one file, `example.ts`, in a project compiled with `strict: false` and
`target: es2022`. The output is what the command prints with `--no-pretty`, without its
summary lines. An example with a `Flags: --report` line runs with the report. A test runs every block below verbatim and compares exactly.

### A marked function cannot return null through a non-null signature

```ts
/** @strict */
function label(id: number): string {
  if (id < 0) return null;
  return `#${id}`;
}
```

```text
example.ts(3,15): error TS2322: Type 'null' is not assignable to type 'string'.
```

Test: `examples › a marked function cannot return null through a non-null signature`

### The same function unmarked is not reported

```ts
function label(id: number): string {
  if (id < 0) return null;
  return `#${id}`;
}
```

```text
```

Test: `examples › the same function unmarked is not reported`

### A nullable result from legacy code must be narrowed

```ts
function findUser(id: number): { name: string } | null {
  return id > 0 ? { name: 'ada' } : null;
}

/** @strict */
function greet(id: number): string {
  return `hello ${findUser(id).name}`;
}

/** @strict */
function greetSafely(id: number): string {
  const user = findUser(id);
  return user === null ? 'hello stranger' : `hello ${user.name}`;
}
```

```text
example.ts(7,19): error TS2531: Object is possibly 'null'.
```

Test: `examples › a nullable result from legacy code must be narrowed`

### A marked class covers its members and their closures

```ts
/** @strict */
class Directory {
  private names = new Map<number, string>();

  lookup(id: number): string {
    return this.names.get(id);
  }

  all(ids: number[]): number[] {
    return ids.map((id) => this.names.get(id).length);
  }
}
```

```text
example.ts(6,5): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
  Type 'undefined' is not assignable to type 'string'.
example.ts(10,28): error TS2532: Object is possibly 'undefined'.
```

Test: `examples › a marked class covers its members and their closures`

### A marked variable statement covers its initializer

```ts
const settings: { theme?: string } = {};

/** @strict */
const themeLength = () => settings.theme.length;

const legacyLength = () => settings.theme.length;
```

```text
example.ts(4,27): error TS18048: 'settings.theme' is possibly 'undefined'.
```

Test: `examples › a marked variable statement covers its initializer`

### The file marker covers the whole file

```ts
// @strictFile
function first(xs: string[]): string {
  return xs.length > 0 ? xs[0] : undefined;
}

function shout(s?: string): string {
  return s.toUpperCase();
}
```

```text
example.ts(3,34): error TS2322: Type 'undefined' is not assignable to type 'string'.
example.ts(7,10): error TS18048: 's' is possibly 'undefined'.
```

Test: `examples › the file marker covers the whole file`

### A leading @strict marks only the first declaration

```ts
/** @strict */
function first(xs: string[]): string {
  return xs.length > 0 ? xs[0] : undefined;
}

function shout(s?: string): string {
  return s.toUpperCase();
}
```

```text
example.ts(3,34): error TS2322: Type 'undefined' is not assignable to type 'string'.
```

Test: `examples › a leading @strict marks only the first declaration`

### Legacy annotations are trusted

```ts
function nickname(id: number): string {
  return id === 0 ? null : 'ace';
}

/** @strict */
function badge(id: number): number {
  return nickname(id).length;
}
```

```text
```

Test: `examples › legacy annotations are trusted`

### Legacy code may pass null into marked code

```ts
/** @strict */
function initials(name: string): string {
  return name.slice(0, 1);
}

function legacyCaller(): string {
  return initials(null);
}
```

```text
```

Test: `examples › legacy code may pass null into marked code`

### An unannotated legacy function is re-inferred under strict rules

```ts
function pick(flag: boolean) {
  return flag ? 'yes' : null;
}

/** @strict */
function pickLength(flag: boolean): number {
  return pick(flag).length;
}
```

```text
example.ts(7,10): error TS2531: Object is possibly 'null'.
```

Test: `examples › an unannotated legacy function is re-inferred under strict rules`

### The report lists trusted declarations, cheapest to mark first

Flags: --report

```ts
function nickname(id: number): string {
  return id === 0 ? null : 'ace';
}

function pick(flag: boolean) {
  return flag ? 'yes' : null;
}

/** @strict */
function badge(id: number): number {
  return nickname(id).length + pick(true).length;
}
```

```text
example.ts(11,32): error TS2531: Object is possibly 'null'.

@strict boundary: 2 edges from 1 mark
  example.ts(11,32): badge → pick      inferred   clean           example.ts(5,10)
  example.ts(11,10): badge → nickname  annotated  1 strict error  example.ts(1,10)
marks: 1, closed: 0
```

Test: `examples › the report lists trusted declarations, cheapest to mark first`

### A mark is closed when everything it reaches is marked

Flags: --report

```ts
/** @strict */
function nickname(id: number): string | null {
  return id === 0 ? null : 'ace';
}

/** @strict */
function badge(id: number): number {
  return nickname(id)?.length ?? 0;
}

/** @strict */
function label(id: number): string {
  return `${legacyName(id)}#${badge(id)}`;
}

function legacyName(id: number): string {
  return String(id);
}
```

```text
@strict boundary: 1 edge from 1 mark
  example.ts(13,13): label → legacyName  annotated  clean  example.ts(16,10)
marks: 3, closed: 2
```

Test: `examples › a mark is closed when everything it reaches is marked`

### Methods and variables are edges; types and declarations are not

Flags: --report

```ts
interface User {
  name: string;
  nick?: string;
}
declare const current: User;

class Legacy {
  label(): string {
    return null;
  }
}
const fallback = 'n/a';

/** @strict */
function describe(l: Legacy): string {
  return (current.nick ?? l.label() ?? fallback).toUpperCase();
}
```

```text
@strict boundary: 2 edges from 1 mark
  example.ts(16,40): describe → fallback      inferred   clean           example.ts(12,7)
  example.ts(16,29): describe → Legacy.label  annotated  1 strict error  example.ts(8,3)
marks: 1, closed: 0
```

Test: `examples › methods and variables are edges; types and declarations are not`

### A target's strict errors leave out what its nested marks already report

Flags: --report

```ts
function legacy(): string {
  /** @strict */
  const size = (s: string | null): number => s.length;
  return null;
}

/** @strict */
function caller(): number {
  return legacy().length;
}
```

```text
example.ts(3,46): error TS18047: 's' is possibly 'null'.

@strict boundary: 1 edge from 1 mark
  example.ts(9,10): caller → legacy  annotated  1 strict error  example.ts(1,10)
marks: 2, closed: 1
```

Test: `examples › a target's strict errors leave out what its nested marks already report`

### A statement can be marked inside a legacy function

Flags: --report

```ts
function findUser(id: number): { name: string } | null {
  return id > 0 ? { name: 'ada' } : null;
}

function render(id: number, verbose: boolean): string {
  let out = 'user: ';
  /** @strict */
  if (verbose) {
    out += findUser(id).name;
  }
  return out + findUser(id).name;
}
```

```text
example.ts(9,12): error TS2531: Object is possibly 'null'.

@strict boundary: 2 edges from 1 mark
  example.ts(9,5):  if in render → out       inferred   clean  example.ts(6,7)
  example.ts(9,12): if in render → findUser  annotated  clean  example.ts(1,10)
marks: 1, closed: 0
```

Test: `examples › a statement can be marked inside a legacy function`

### A plain comment marks nothing, and says so

```ts
// @strict
function label(id: number): string {
  if (id < 0) return null;
  return `#${id}`;
}
```

```text
example.ts(1,4): error: `@strict` in a plain comment marks nothing: a mark is a JSDoc comment, `/** @strict */`.
```

Test: `examples › a plain comment marks nothing, and says so`

### @strictFile below an import marks nothing, and says so

```ts
import { helper } from './helper';
// @strictFile

function shout(s?: string): string {
  return s.toUpperCase();
}
```

```text
example.ts(2,4): error: `@strictFile` marks nothing here: it must be in a comment before the file's first token, above any import or 'use strict'.
```

Test: `examples › @strictFile below an import marks nothing, and says so`

### Constructing a class trusts its constructor

Flags: --report

```ts
class Account {
  owner: string;
  constructor(owner?: string) {
    this.owner = owner;
  }
}

/** @strict */
function ownerLength(name: string): number {
  return new Account(name).owner.length;
}
```

```text
@strict boundary: 2 edges from 1 mark
  example.ts(10,28): ownerLength → Account.owner        annotated  clean           example.ts(2,3)
  example.ts(10,14): ownerLength → Account.constructor  annotated  1 strict error  example.ts(3,3)
marks: 1, closed: 0
```

Test: `examples › constructing a class trusts its constructor`
