import { COLOURS, type Colour } from '../materials/colour';
import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-table';
import type { Level } from './level';
import { arrivals } from './wave-table';

/**
 * What a first-appearance hint is about: a Colour, an Enemy type, or
 * `belly`, that Enemies are full of ink, which comes with the first Enemy.
 */
export type Newcomer = Colour | EnemyType | 'belly';

/**
 * What is new to the Campaign in the Wave at `wave` (from 0) of the Level at
 * `level` (from 0) of `levels`, in the Campaign's order: first the Colours,
 * palette order, then the Enemy types, then Bellies. A Colour is new in the
 * first Wave of the first Level that has it, a Tank maximum above 0; an
 * Enemy type in the first Wave that sends one in; Bellies in the first Wave
 * that sends in any Enemy. New to the Campaign, not just to the Level:
 * what an earlier Level brought is not new again.
 */
export function newcomers(levels: readonly Level[], level: number, wave: number): Newcomer[] {
  const seen = new Set<Newcomer>();
  for (let l = 0; l < levels.length && l <= level; l++) {
    // A Level without Waves of its own still brings its Colours, in its one Wave.
    const last = l === level ? wave : Math.max(levels[l]!.waves?.length ?? 0, 1) - 1;
    for (let w = 0; w <= last; w++) {
      const here = arrivingIn(levels[l]!, w).filter((newcomer) => !seen.has(newcomer));
      if (l === level && w === wave) return here;
      for (const newcomer of here) seen.add(newcomer);
    }
  }
  return [];
}

/**
 * What the Wave at `wave` of `level` has: the Level's Colours, if it is its
 * first Wave, the Enemy types it sends, and Bellies if it sends any.
 */
function arrivingIn(level: Level, wave: number): Newcomer[] {
  const colours = wave === 0 ? COLOURS.filter((colour) => (level.tanks?.[colour] ?? 0) > 0) : [];
  const table = level.waves?.[wave];
  const sent = new Set(table ? arrivals(table) : []);
  const types = ENEMY_TYPES.filter((type) => sent.has(type));
  return [...colours, ...types, ...(types.length > 0 ? (['belly'] as const) : [])];
}

/**
 * The hint lines for what is new in that Wave (see `newcomers`), one each,
 * in the same order. A hint's text is the Level's own, or failing that the
 * first Level's in the Campaign that has one; a newcomer no Level has a hint
 * for gets none.
 */
export function hintLines(levels: readonly Level[], level: number, wave: number): string[] {
  return newcomers(levels, level, wave).flatMap((newcomer) => {
    const hint =
      levels[level]?.hints?.[newcomer] ??
      levels.map((other) => other.hints?.[newcomer]).find((text) => text !== undefined);
    return hint === undefined ? [] : [hint];
  });
}
