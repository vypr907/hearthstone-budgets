/**
 * Move the item at `index` one slot up (`dir = -1`) or down (`dir = 1`).
 * Returns a new array; a no-op at the boundaries returns the same reference.
 */
export function move<T>(arr: readonly T[], index: number, dir: -1 | 1): T[] | readonly T[] {
  const target = index + dir;
  if (index < 0 || index >= arr.length || target < 0 || target >= arr.length) {
    return arr;
  }
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
