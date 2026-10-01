import type { Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import { ARENA_HEIGHT, ARENA_WIDTH, type Arena } from '../sandbox/arena';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import type { StressTest } from '../stress-tests/stress-test';
import type { ReadonlyWaveTable } from './wave-table';

/**
 * A Level (CONTEXT.md): everything an Arena starts with. `Game.load` clears
 * the Arena and sets it up from one. The gallery demos, the stress tests,
 * the sandbox and the Campaign's Levels are all Levels.
 *
 * What a Level leaves out: without an Arena it is the sandbox Arena; without
 * Waves, it has one Wave, the current Wave table as the F2 tuning panel left
 * it, and the Waves switch stays as it is; without Tanks, the Tank maximums
 * stay as they are.
 */
export interface Level {
  /** What the player sees it called: on the toolbar, in the Gallery, in F1's readings. */
  readonly name?: string;
  /** Its Arena: Terrain, Spawn and Ink Core. It must be one screen, as every Arena is. */
  readonly arena?: Arena;
  /**
   * Its Waves, in the order they come, each a Wave table: loading it makes
   * the Defence loop's list a copy of them, starting at the first, and turns
   * the Waves switch on.
   */
  readonly waves?: readonly ReadonlyWaveTable[];
  /** Each Ink Tank's maximum, in Line length: loading it sets them in the Ink table, and fills the Tanks. */
  readonly tanks?: Readonly<Record<Colour, number>>;
  /**
   * A Campaign Level's hints: one line for each Colour and Enemy type it is
   * the first to bring, shown when it first appears.
   */
  readonly hints?: Readonly<Partial<Record<Colour | EnemyType, string>>>;
  /**
   * What is already built there, for free (ADR 0009): it runs on the Sandbox
   * world below the Game, and what it makes joins the undo history at price
   * 0. If it starts physics as its last act, R goes back to how it left the
   * world. A stress test's returns its `StressTest`, which measures it from
   * then on; a demo's returns nothing.
   */
  build?(world: SandboxWorld): StressTest | void;
}

/** The sandbox: the sandbox Arena, empty, with one Wave and the Tanks as they are. */
export const SANDBOX_LEVEL = { name: 'Sandbox' } as const satisfies Level;

/** Throws unless `arena` is one screen, the size every Arena is. */
export function checkArenaSize(arena: Arena): void {
  if (arena.width !== ARENA_WIDTH || arena.height !== ARENA_HEIGHT)
    throw new Error(
      `an Arena is ${ARENA_WIDTH} × ${ARENA_HEIGHT}, not ${arena.width} × ${arena.height}`,
    );
}
