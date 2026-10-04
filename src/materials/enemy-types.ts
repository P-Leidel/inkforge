/**
 * The Enemy types: what each is called, in the one order every list of them
 * follows (Shift+1, Shift+2, ... send them in that order; the Analysis and
 * F2 list them so). What each type's numbers are is the enemy table's; how
 * it looks, the renderer's; its shape, the sandbox's. Each of those is a
 * record by type, so a new type here is a row the compiler asks of each.
 */

/** The Enemy types, in order. */
export const ENEMY_TYPES = ['crawler', 'runner', 'heavy'] as const;

export type EnemyType = (typeof ENEMY_TYPES)[number];

/** What each type is called: one of it, and more. */
const NAMES: Readonly<Record<EnemyType, readonly [string, string]>> = {
  crawler: ['Crawler', 'Crawlers'],
  runner: ['Runner', 'Runners'],
  heavy: ['Heavy', 'Heavies'],
};

/** What `count` Enemies of `type` are called: "Crawler" for one, "Crawlers" otherwise. */
export function enemyName(type: EnemyType, count: number): string {
  const [one, more] = NAMES[type];
  return count === 1 ? one : more;
}
