import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-table';

/*
 * The Wave table: the Wave's list, the Enemies a Wave sends in and the gap
 * between them, and the size of the Core Zone. Pure data, owned by the
 * Game's Defence loop, edited in F2's Wave section.
 * A gallery demo can bring a Wave of its own.
 */

export interface WaveTable {
  /** How many of each Enemy type the Wave sends in. */
  counts: Record<EnemyType, number>;
  /** Seconds between one arrival and the next, at the least. */
  gap: number;
  /** Diameter (px) of the Core Zone around the Ink Core, the only place to draw during a Wave. */
  coreZone: number;
}

/** The Wave table, read only: the Game's is edited through its Defence loop's `edit`. */
export type ReadonlyWaveTable = { readonly [K in keyof WaveTable]: Readonly<WaveTable[K]> };

/**
 * The starting values. The F2 tuning panel's "Copy as JSON" gives a table in
 * this shape under `wave`, to paste over it.
 */
export const DEFAULT_WAVE_TABLE: ReadonlyWaveTable = {
  counts: {
    crawler: 6,
    runner: 3,
    heavy: 2,
  },
  gap: 2,
  coreZone: 480,
};

/** A fresh, editable copy of `table`, the default Wave table if none. */
export function createWaveTable(table: ReadonlyWaveTable = DEFAULT_WAVE_TABLE): WaveTable {
  return structuredClone(table) as WaveTable;
}

/**
 * The Enemies a Wave sends in, in the order they arrive: every Crawler,
 * then every Runner, then every Heavy. A count is taken whole, never below 0.
 */
export function arrivals(table: Pick<ReadonlyWaveTable, 'counts'>): EnemyType[] {
  return ENEMY_TYPES.flatMap((type) => {
    const count = Math.max(0, Math.floor(table.counts[type]));
    return Array.from({ length: Number.isFinite(count) ? count : 0 }, () => type);
  });
}
