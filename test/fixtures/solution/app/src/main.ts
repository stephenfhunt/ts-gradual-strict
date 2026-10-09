import { firstLength, reset } from '../../lib/src/settings';

/** @strict */
export function themeLength(): number {
  return reset().theme.length;
}

/** @strict */
export function first(): number {
  return firstLength(['a']);
}
