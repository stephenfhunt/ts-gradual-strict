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

function hasStrictTag(node: ts.Node): boolean {
  return ts.getJSDocTags(node).some((tag) => tag.tagName.text === STRICT_TAG);
}

/**
 * The marked spans of a file, outermost only: once a node is marked its descendants are
 * covered and are not visited. A span runs from the node's full start, which includes the
 * JSDoc that marks it, to its end.
 */
export function strictRegions(sf: ts.SourceFile): readonly Span[] {
  if (!mayHaveRegions(sf)) return [];
  if (isStrictFile(sf)) return [{ start: 0, end: sf.end }];
  const spans: Span[] = [];
  const visit = (node: ts.Node): void => {
    if (hasStrictTag(node)) {
      spans.push({ start: node.pos, end: node.end });
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return spans;
}

export function inRegions(regions: readonly Span[], position: number): boolean {
  return regions.some((r) => r.start <= position && position < r.end);
}
