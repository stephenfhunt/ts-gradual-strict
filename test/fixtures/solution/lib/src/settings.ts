export interface Settings {
  theme?: string;
}

/** @strict */
export function reset(): Settings {
  return { theme: undefined };
}

/** @strict */
export function firstLength(xs: string[]): number {
  return xs[0].length;
}
