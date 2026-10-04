import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-types';

/*
 * The Wave table: one Wave's list, the Enemies it sends in, and the gap
 * between them. Pure data, owned by the Game's Defence loop, which holds
 * one for each of the Level's Waves; F2's Wave section edits the current
 * Wave's. A Level can bring Waves of its own.
 */

/** Some Enemies of one type a Wave sends in, one after another. */
export interface WaveGroup {
  readonly type: EnemyType;
  /** How many: taken whole, never below 0. */
  count: number;
  /** Seconds before each of them arrives, at the least: the Wave's `gap` if left out. */
  gap?: number;
}

export interface WaveTable {
  /**
   * What the Wave sends in, group by group, in the order they arrive. A
   * Level's Waves name only what they send, and a Wave of single Enemies in
   * any order is a list of groups of one (ADR 0020).
   */
  sends: WaveGroup[];
  /** Seconds before each arrival, at the least, for a group without a gap of its own. */
  gap: number;
}

/** The Wave table, read only: the Game's is edited through its Defence loop's `edit`. */
export type ReadonlyWaveTable = {
  readonly sends: readonly Readonly<WaveGroup>[];
  readonly gap: number;
};

/**
 * The starting values. The F2 tuning panel's "Copy as JSON" gives a table in
 * this shape under `wave`, to paste over it.
 */
export const DEFAULT_WAVE_TABLE: ReadonlyWaveTable = {
  sends: [
    { type: 'crawler', count: 6 },
    { type: 'runner', count: 3 },
    { type: 'heavy', count: 2 },
  ],
  gap: 2,
};

/** A fresh, editable copy of `table`, the default Wave table if none. */
export function createWaveTable(table: ReadonlyWaveTable = DEFAULT_WAVE_TABLE): WaveTable {
  return structuredClone(table) as WaveTable;
}

/** One Enemy a Wave sends in: its type, and the group of its Wave's table it is one of. */
export interface Arrival {
  readonly type: EnemyType;
  /** Its group's place in the table's `sends`. */
  readonly group: number;
}

/** How many Enemies a group sends: its count taken whole, never below 0. */
function countOf({ count }: Readonly<WaveGroup>): number {
  const whole = Math.max(0, Math.floor(count));
  return Number.isFinite(whole) ? whole : 0;
}

/** The Enemies a Wave sends in, in the order they arrive: group by group. */
export function arrivals(table: Pick<ReadonlyWaveTable, 'sends'>): Arrival[] {
  return table.sends.flatMap((group, k) =>
    Array.from({ length: countOf(group) }, () => ({ type: group.type, group: k })),
  );
}

/** The seconds before an arrival from group `group` of `table`, at the least. */
export function gapBefore(table: ReadonlyWaveTable, group: number): number {
  return table.sends[group]?.gap ?? table.gap;
}

/**
 * How many of each Enemy type a Wave sends, summed over its groups: only the
 * types it sends, in the catalogue's order. Not the order they come in, nor
 * the gaps.
 */
export function sentCounts(
  table: Pick<ReadonlyWaveTable, 'sends'>,
): Partial<Record<EnemyType, number>> {
  const totals = new Map<EnemyType, number>();
  for (const group of table.sends) {
    totals.set(group.type, (totals.get(group.type) ?? 0) + countOf(group));
  }
  return Object.fromEntries(
    ENEMY_TYPES.filter((type) => (totals.get(type) ?? 0) > 0).map((type) => [
      type,
      totals.get(type)!,
    ]),
  );
}
