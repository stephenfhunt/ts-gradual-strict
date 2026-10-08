# ts-gradual-strict — specification

What the tool promises. Current-state: this states the contract in force; the reasons
behind it are in `decisions.md`, and this document points there rather than arguing.

## Marking

A **mark** is the JSDoc tag `@strict` on a declaration that can carry JSDoc: a function,
method, constructor, accessor, class, or variable statement (which covers every
declarator in it, and so the arrow functions they hold).

```ts
/** @strict */
export function title(user: User): string { ... }
```

A mark covers its declaration **lexically**: the declaration's own text, from its JSDoc
to its last token, and everything nested inside it. A marked class covers its members;
a marked function covers the closures it defines. There is no way to unmark something
nested inside a mark.

A file is marked whole by `@strictFile` in a comment before its first token. It is a
separate spelling because a leading `/** @strict */` is the JSDoc of the first
declaration, and the two readings could not be told apart.

The marks are comments, so they change nothing about how `tsc` compiles the project.

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
ts-gradual-strict [-p <tsconfig.json>] [--pretty | --no-pretty]
```

`-p` defaults to `tsconfig.json` in the working directory and is read the way `tsc -p`
reads it, `extends` included. `--pretty` (the default on a terminal) prints with colour
and source context, as `tsc` does.

| outcome | output | exit |
|---|---|---|
| every marked region is clean | nothing | 0 |
| a marked region has errors | the diagnostics, then `Found N errors in @strict code.` | 1 |
| the tsconfig cannot be read, or bad arguments | the config diagnostics, or usage | 2 |

Deprecated compiler options in the project's tsconfig are not errors here: the second
program sets `ignoreDeprecations`, since a project that builds with its own compiler must
not fail this check for being on an older one.

## Not covered

- Strict-family flags other than `strictNullChecks` (`noImplicitAny`,
  `strictPropertyInitialization`, `strictFunctionTypes`, …).
- Calls *into* marked code from unmarked code: no warning when legacy code passes `null`
  to a marked parameter.
- An opt-out inside a mark.
- Editor integration: the diagnostics appear only from the command.
- TypeScript 7, whose compiler API is not yet stable.

## Examples

Each example is one file, `example.ts`, in a project compiled with `strict: false` and
`target: es2022`. The output is what the command prints with `--no-pretty`, without its
summary line. A test runs every block below verbatim and compares exactly.

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
