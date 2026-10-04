import { COLOURS, type Colour } from '../materials/colour';
import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-types';
import type { Level } from './level';
import { sentCounts, type ReadonlyWaveTable } from './wave-table';

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
 * what an earlier Level brought is not new again. The Level at `level`
 * sends what `waves` say, its Waves as they are being played (F2 edits
 * them), its own by default; earlier Levels, their own.
 */
export function newcomers(
  levels: readonly Level[],
  level: number,
  wave: number,
  waves: readonly ReadonlyWaveTable[] | undefined = levels[level]?.waves,
): Newcomer[] {
  const seen = new Set<Newcomer>();
  for (let l = 0; l < levels.length && l <= level; l++) {
    const sends = l === level ? waves : levels[l]!.waves;
    // A Level without Waves of its own still brings its Colours, in its one Wave.
    const last = l === level ? wave : Math.max(sends?.length ?? 0, 1) - 1;
    for (let w = 0; w <= last; w++) {
      const here = arrivingIn(levels[l]!, sends?.[w], w === 0).filter(
        (newcomer) => !seen.has(newcomer),
      );
      if (l === level && w === wave) return here;
      for (const newcomer of here) seen.add(newcomer);
    }
  }
  return [];
}

/**
 * What a Wave of `level` has, `table` its Wave table: the Level's Colours,
 * if it is its `first` Wave, the Enemy types it sends, and Bellies if it
 * sends any.
 */
function arrivingIn(
  level: Level,
  table: ReadonlyWaveTable | undefined,
  first: boolean,
): Newcomer[] {
  const colours = first ? COLOURS.filter((colour) => (level.tanks?.[colour] ?? 0) > 0) : [];
  const sent = table ? sentCounts(table) : {};
  const types = ENEMY_TYPES.filter((type) => sent[type] !== undefined);
  return [...colours, ...types, ...(types.length > 0 ? (['belly'] as const) : [])];
}

/**
 * The hint lines for what is new in that Wave (see `newcomers`, `waves`
 * included), one each, in the same order. A hint's text is the Level's own,
 * or failing that the first Level's in the Campaign that has one; a
 * newcomer no Level has a hint for gets none.
 */
export function hintLines(
  levels: readonly Level[],
  level: number,
  wave: number,
  waves: readonly ReadonlyWaveTable[] | undefined = levels[level]?.waves,
): string[] {
  return newcomers(levels, level, wave, waves).flatMap((newcomer) => {
    const hint =
      levels[level]?.hints?.[newcomer] ??
      levels.map((other) => other.hints?.[newcomer]).find((text) => text !== undefined);
    return hint === undefined ? [] : [hint];
  });
}
