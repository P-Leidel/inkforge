import type { ArenaContents } from './sandbox-world';

/** How many views one list of `world.contents` holds, e.g. `lines` or `rubble`. */
export interface ContentCount {
  readonly name: string;
  readonly count: number;
}

/**
 * How many views each list of `world.contents` holds, in kind order, found
 * by walking it: a kind's views are one list, or lists by name. A kind added to the world shows here
 * without a change.
 */
export function contentCounts(contents: ArenaContents): ContentCount[] {
  const counts: ContentCount[] = [];
  const walk = (name: string, views: unknown): void => {
    if (Array.isArray(views)) counts.push({ name, count: views.length });
    else if (typeof views === 'object' && views !== null)
      for (const [key, value] of Object.entries(views)) walk(key, value);
  };
  for (const [name, views] of Object.entries(contents)) walk(name, views);
  return counts;
}
