/**
 * Reading and writing the numbers of a nested table by their path of keys,
 * so the tuning panel can list and edit whatever the material table holds.
 */

type Path = readonly string[];

/** The paths of every number in `table`, depth first, in key order. */
export function numberPaths(table: object, prefix: Path = []): string[][] {
  const paths: string[][] = [];
  for (const [key, value] of Object.entries(table)) {
    const path = [...prefix, key];
    if (typeof value === 'number') paths.push(path);
    else if (value !== null && typeof value === 'object') paths.push(...numberPaths(value, path));
  }
  return paths;
}

function parentOf(table: object, path: Path): Record<string, unknown> | undefined {
  let node: unknown = table;
  for (const key of path.slice(0, -1)) node = (node as Record<string, unknown> | undefined)?.[key];
  return node as Record<string, unknown> | undefined;
}

/** The number at `path`, or undefined if `table` has none there (a list shorter than another's). */
export function readPath(table: object, path: Path): number | undefined {
  return parentOf(table, path)?.[path[path.length - 1]!] as number | undefined;
}

export function writePath(table: object, path: Path, value: number): void {
  parentOf(table, path)![path[path.length - 1]!] = value;
}
