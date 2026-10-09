/**
 * Where strict rules apply: the spans of a source file covered by a `@strict` mark
 * (`spec.md` §Marking). A diagnostic counts when its start falls inside one.
 */
import ts from 'typescript';

/** A half-open character span `[start, end)` of a source file. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** The JSDoc tag that marks one declaration and everything nested in it. */
const STRICT_TAG = 'strict';

/**
 * The marker that makes a whole file strict. A separate spelling rather than `@strict` at
 * the top of the file, because a leading `/** @strict *\/` is also the JSDoc of the first
 * declaration and the two readings would be indistinguishable (`decisions.md` 2026-10-08).
 */
const FILE_MARKER = /@strictFile\b/;

/** Cheap pre-filter: a file whose text never says `@strict` has no regions. */
export function mayHaveRegions(sf: ts.SourceFile): boolean {
  return sf.text.includes('@strict');
}

function isStrictFile(sf: ts.SourceFile): boolean {
  const comments = ts.getLeadingCommentRanges(sf.text, 0) ?? [];
  return comments.some((c) => FILE_MARKER.test(sf.text.slice(c.pos, c.end)));
}

/** `@strict` tags TypeScript attached to this node — none for the end-of-file token. */
function strictTags(node: ts.Node): readonly ts.JSDocTag[] {
  if (node.kind === ts.SyntaxKind.EndOfFileToken) return [];
  return ts.getJSDocTags(node).filter((tag) => tag.tagName.text === STRICT_TAG);
}

function hasStrictTag(node: ts.Node): boolean {
  return strictTags(node).length > 0;
}

/**
 * One mark: the marked node (the file itself, for `@strictFile`) and the span it covers.
 * A span runs from the node's full start, which includes the JSDoc that marks it, to its
 * end.
 */
export interface Mark {
  readonly node: ts.Node;
  readonly span: Span;
}

/**
 * The marks of a file, outermost only: once a node is marked its descendants are covered
 * and are not visited, so a marked class is one mark however many members it has.
 */
export function strictMarks(sf: ts.SourceFile): readonly Mark[] {
  if (!mayHaveRegions(sf)) return [];
  if (isStrictFile(sf)) return [{ node: sf, span: { start: 0, end: sf.end } }];
  const marks: Mark[] = [];
  const visit = (node: ts.Node): void => {
    if (hasStrictTag(node)) {
      marks.push({ node, span: { start: node.pos, end: node.end } });
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return marks;
}

/** The spans of a file's marks. */
export function strictRegions(sf: ts.SourceFile): readonly Span[] {
  return strictMarks(sf).map((m) => m.span);
}

export function inRegions(regions: readonly Span[], position: number): boolean {
  return regions.some((r) => r.start <= position && position < r.end);
}

/** A `@strict` or `@strictFile` in a comment that marks nothing (`spec.md` §Marking). */
export interface Stray {
  /** Where the `@` is. */
  readonly pos: number;
  readonly message: string;
}

const MARKER = /@strict(File)?\b/g;

function isJSDocNode(node: ts.Node): boolean {
  return (
    node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode
  );
}

/** Every comment in a file, by start position. */
function comments(sf: ts.SourceFile): readonly ts.CommentRange[] {
  const found = new Map<number, ts.CommentRange>();
  const add = (ranges: readonly ts.CommentRange[] | undefined): void => {
    for (const c of ranges ?? []) found.set(c.pos, c);
  };
  const visit = (node: ts.Node): void => {
    if (isJSDocNode(node)) return;
    add(ts.getLeadingCommentRanges(sf.text, node.pos));
    add(ts.getTrailingCommentRanges(sf.text, node.end));
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return [...found.values()].sort((a, b) => a.pos - b.pos);
}

/**
 * Markers the tool does not honour: `@strict` in a plain comment, or in a JSDoc comment
 * TypeScript did not attach to any code, and `@strictFile` after the file's first token.
 * Each one looks like a mark and checks nothing, which is why they are errors.
 */
export function strayMarkers(sf: ts.SourceFile): readonly Stray[] {
  if (!mayHaveRegions(sf)) return [];
  const fileComments = new Set(
    (ts.getLeadingCommentRanges(sf.text, 0) ?? []).map((c) => c.pos),
  );
  // The JSDoc comments whose `@strict` tag is attached to code, by their start.
  const attached = new Set<number>();
  const visit = (node: ts.Node): void => {
    for (const tag of strictTags(node)) attached.add(tag.parent.pos);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  const strays: Stray[] = [];
  for (const c of comments(sf)) {
    const text = sf.text.slice(c.pos, c.end);
    const isJSDoc = text.startsWith('/**') && text !== '/**/';
    for (const m of text.matchAll(MARKER)) {
      const pos = c.pos + (m.index ?? 0);
      if (m[1] === 'File') {
        if (!fileComments.has(c.pos)) {
          strays.push({
            pos,
            message:
              '`@strictFile` marks nothing here: it must be in a comment before the ' +
              "file's first token, above any import or 'use strict'.",
          });
        }
      } else if (!isJSDoc) {
        strays.push({
          pos,
          message:
            '`@strict` in a plain comment marks nothing: a mark is a JSDoc comment, ' +
            '`/** @strict */`.',
        });
      } else if (!attached.has(c.pos)) {
        strays.push({
          pos,
          message:
            '`@strict` marks nothing here: it must be a JSDoc tag directly above the code ' +
            'it marks.',
        });
      }
    }
  }
  return strays;
}
