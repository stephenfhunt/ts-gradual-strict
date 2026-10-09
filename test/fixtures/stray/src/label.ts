// @strict
export function label(id: number): string {
  if (id < 0) return null;
  return `#${id}`;
}
