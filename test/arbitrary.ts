/**
 * Generated programs over the nullability lattice (`testing.md` §The generator).
 *
 * A `Shape` is a program with its marks left open: every declaration has a *slot*, and
 * `render` fills each slot with `/** @strict *\/` or `/** @loose  *\/`. The two are the
 * same width, so a diagnostic sits at the same offset under every marking, and properties
 * compare markings by position without any mapping. `render` also reports each slot's span
 * from the generator's own bookkeeping, which is the region oracle: it never asks the tool
 * where a mark reaches.
 */
import fc from 'fast-check';
import type { Span } from '../src/regions.ts';

const MARK = '/** @strict */';
const NO_MARK = '/** @loose  */';

/** The lattice the generator draws annotations from. */
const ANNOTATIONS = ['string', 'string | null', 'string | undefined'] as const;
const PARAMS = ['p: string', 'p: string | null', 'p: string | undefined', 'p?: string'];

export interface Fn {
  readonly param: string;
  /** Return annotation, or `undefined` for an inferred return type. */
  readonly ret: string | undefined;
  readonly body: readonly string[];
}

export interface Shape {
  readonly classes: readonly (readonly Fn[])[];
  readonly fns: readonly Fn[];
  /** Top-level `const` statements, complete but for their slot. */
  readonly consts: readonly string[];
}

export interface Rendered {
  readonly text: string;
  /** One span per slot, in slot order; a class's span contains its methods'. */
  readonly spans: readonly Span[];
}

/** Shared declarations every program can read: an optional and a nullable property. */
const PRELUDE =
  'interface Box { v?: string; w: string | null; }\nconst box: Box = { w: null };\n';

export function slotCount(shape: Shape): number {
  return (
    shape.classes.reduce((n, ms) => n + 1 + ms.length, 0) +
    shape.fns.length +
    shape.consts.length
  );
}

export function render(shape: Shape, marks: readonly boolean[]): Rendered {
  let text = PRELUDE;
  const spans: Span[] = [];
  let slot = 0;
  const open = (indent: string): number => {
    const start = text.length + indent.length;
    text += `${indent}${marks[slot] === true ? MARK : NO_MARK}\n`;
    slot++;
    return start;
  };
  const signature = (name: string, fn: Fn): string =>
    `${name}(${fn.param})${fn.ret === undefined ? '' : `: ${fn.ret}`} {\n`;

  shape.classes.forEach((methods, k) => {
    const classSlot = spans.length;
    spans.push({ start: open(''), end: 0 });
    text += `class C${k} {\n`;
    methods.forEach((m, j) => {
      const start = open('  ');
      text += `  ${signature(`m${j}`, m)}${m.body.map((s) => `    ${s}\n`).join('')}  }`;
      spans.push({ start, end: text.length });
      text += '\n';
    });
    text += '}';
    spans[classSlot] = { start: spans[classSlot]?.start ?? 0, end: text.length };
    text += '\n';
  });
  shape.fns.forEach((fn, i) => {
    const start = open('');
    text += `function ${signature(`f${i}`, fn)}${fn.body.map((s) => `  ${s}\n`).join('')}}`;
    spans.push({ start, end: text.length });
    text += '\n';
  });
  for (const c of shape.consts) {
    const start = open('');
    text += c;
    spans.push({ start, end: text.length });
    text += '\n';
  }
  return { text, spans };
}

// ------------------------------------------------------------------ generation

interface Scope {
  readonly fns: number;
  readonly classes: readonly number[];
  /** Whether `p` is in scope. */
  readonly param: boolean;
}

function expr(scope: Scope, depth: number): fc.Arbitrary<string> {
  const leaves: fc.Arbitrary<string>[] = [
    fc.constantFrom('null', 'undefined', "'s'", 'box.v', 'box.w'),
  ];
  if (scope.param) leaves.push(fc.constant('p'));
  const leaf = fc.oneof(...leaves);
  if (depth === 0) return leaf;
  const sub = expr(scope, depth - 1);
  const compound: fc.Arbitrary<string>[] = [
    sub.map((e) => `(${e}).slice(1)`),
    fc.tuple(sub, sub).map(([a, b]) => `(${a} ?? ${b})`),
  ];
  if (scope.fns > 0) {
    compound.push(fc.tuple(fc.nat(scope.fns - 1), sub).map(([i, a]) => `f${i}(${a})`));
  }
  const withMethods = scope.classes.flatMap((n, k) => (n > 0 ? [[k, n] as const] : []));
  if (withMethods.length > 0) {
    compound.push(
      fc
        .tuple(fc.constantFrom(...withMethods), fc.nat(), sub)
        .map(([[k, n], j, a]) => `new C${k}().m${j % n}(${a})`),
    );
  }
  return fc.oneof({ depthSize: 'small' }, leaf, ...compound);
}

function statement(scope: Scope): fc.Arbitrary<string> {
  const e = expr(scope, 2);
  return fc.oneof(
    fc.tuple(fc.constantFrom(...ANNOTATIONS), e).map(([t, v]) => `const v: ${t} = ${v};`),
    e.map((v) => `(${v}).length;`),
    e.map((v) => `if (p != null) return ${v};`),
    e.map((v) => `if (p === null) return ${v};`),
  );
}

function body(scope: Scope): fc.Arbitrary<readonly string[]> {
  return fc
    .tuple(fc.array(statement(scope), { maxLength: 2 }), expr(scope, 2))
    .map(([stmts, ret]) => {
      // At most one `const v` per body, so a second does not redeclare it.
      const seen = new Set<string>();
      const kept = stmts.filter((s) => {
        const key = s.startsWith('const v') ? 'v' : s;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...kept, `return ${ret};`];
    });
}

function fn(scope: Scope, annotated: boolean): fc.Arbitrary<Fn> {
  const ret = annotated
    ? fc.constantFrom<string | undefined>(...ANNOTATIONS)
    : fc.constantFrom<string | undefined>(...ANNOTATIONS, undefined);
  return fc.record({ param: fc.constantFrom(...PARAMS), ret, body: body(scope) });
}

function constStatement(scope: Scope, annotated: boolean): fc.Arbitrary<string> {
  const top: Scope = { ...scope, param: false };
  const value = fc
    .tuple(fc.constantFrom(...ANNOTATIONS), expr(top, 2))
    .map(([t, v]) => `const k: ${t} = ${v};`);
  const arrowRet = annotated
    ? fc.constantFrom(...ANNOTATIONS).map((t) => `: ${t}`)
    : fc.constantFrom('', ...ANNOTATIONS.map((t) => `: ${t}`));
  const arrow = fc
    .tuple(fc.constantFrom(...PARAMS), arrowRet, expr(scope, 2))
    .map(([p, r, v]) => `const a = (${p})${r} => ${v};`);
  return fc.oneof(value, arrow);
}

export interface ShapeOptions {
  /** Every function, method and arrow carries a return annotation. */
  readonly annotated?: boolean;
}

/** A program's size first, then its contents in a scope that can call anything in it. */
export function shape(options: ShapeOptions = {}): fc.Arbitrary<Shape> {
  const annotated = options.annotated ?? false;
  return fc
    .record({
      fns: fc.integer({ min: 1, max: 3 }),
      classes: fc.array(fc.integer({ min: 1, max: 2 }), { maxLength: 2 }),
      consts: fc.integer({ min: 0, max: 2 }),
    })
    .chain((size) => {
      const scope: Scope = { fns: size.fns, classes: size.classes, param: true };
      const constNames = (cs: readonly string[]): readonly string[] =>
        // Each const statement declares `k` or `a`; number them so none collide.
        cs.map((c, i) => c.replace(/^const (k|a)\b/, `const $1${i}`));
      return fc.record({
        classes: fc.tuple(
          ...size.classes.map((n) =>
            fc.array(fn(scope, annotated), { minLength: n, maxLength: n }),
          ),
        ),
        fns: fc.array(fn(scope, annotated), { minLength: size.fns, maxLength: size.fns }),
        consts: fc
          .array(constStatement(scope, annotated), {
            minLength: size.consts,
            maxLength: size.consts,
          })
          .map(constNames),
      });
    });
}

/** A marking for a shape: one boolean per slot. */
export function marking(shape: Shape): fc.Arbitrary<readonly boolean[]> {
  const n = slotCount(shape);
  return fc.array(fc.boolean(), { minLength: n, maxLength: n });
}

/** A shape with a marking. */
export function markedShape(options: ShapeOptions = {}) {
  return shape(options).chain((s) => marking(s).map((m) => ({ shape: s, marks: m })));
}

/** The same program with fresh bodies under unchanged signatures, for swapping in. */
export function rebodied(s: Shape): fc.Arbitrary<Shape> {
  const scope: Scope = {
    fns: s.fns.length,
    classes: s.classes.map((ms) => ms.length),
    param: true,
  };
  const fresh = (f: Fn): fc.Arbitrary<Fn> => body(scope).map((b) => ({ ...f, body: b }));
  return fc.record({
    classes: fc.tuple(...s.classes.map((ms) => fc.tuple(...ms.map(fresh)))),
    fns: fc.tuple(...s.fns.map(fresh)),
    consts: fc.constant(s.consts),
  });
}
