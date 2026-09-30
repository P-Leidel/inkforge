import type { Colour } from '../materials/colour';
import { ARENA_HEIGHT, ARENA_WIDTH, type Arena } from '../sandbox/arena';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import type { ReadonlyWaveTable } from './wave-table';

/**
 * A Level (CONTEXT.md): everything an Arena starts with. `Game.load` clears
 * the Arena and sets it up from one. The gallery demos, the stress tests,
 * the sandbox and the Campaign's Levels are all Levels.
 *
 * What a Level leaves out: without an Arena it is the sandbox Arena; without
 * a Wave or Tanks, the Wave table and the Tank maximums stay as they are, as
 * the F2 tuning panel left them.
 */
export interface Level {
  /** Its Arena: Terrain, Spawn and Ink Core. It must be one screen, as every Arena is. */
  readonly arena?: Arena;
  /** Its Wave: loading it makes the Wave table a copy of it. */
  readonly wave?: ReadonlyWaveTable;
  /** Each Ink Tank's maximum, in Line length: loading it sets them in the Ink table, and fills the Tanks. */
  readonly tanks?: Readonly<Record<Colour, number>>;
  /**
   * What is already built there, for free (ADR 0009): it runs on the Sandbox
   * world below the Game, and what it makes joins the undo history at price
   * 0. If it starts physics as its last act, R goes back to how it left the
   * world.
   */
  build?(world: SandboxWorld): void;
}

/** The sandbox: the sandbox Arena, empty, with the Wave and the Tanks as they are. */
export const SANDBOX_LEVEL: Level = {};

/** Throws unless `arena` is one screen, the size every Arena is. */
export function checkArenaSize(arena: Arena): void {
  if (arena.width !== ARENA_WIDTH || arena.height !== ARENA_HEIGHT)
    throw new Error(
      `an Arena is ${ARENA_WIDTH} × ${ARENA_HEIGHT}, not ${arena.width} × ${arena.height}`,
    );
}
