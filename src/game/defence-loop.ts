import { COLOURS, type Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS, type StepHooks } from '../sandbox/sandbox-world';
import { arrivals, createWaveTable, type ReadonlyWaveTable, type WaveTable } from './wave-table';

/** What the Defence loop needs of the Sandbox world. The Sandbox world is one. */
export interface LoopWorld {
  readonly isRunning: boolean;
  /** How many Enemies are in the Arena. */
  readonly enemyCount: number;
  readonly inkCore: { readonly hp: number };
  /** Pauses physics, if running: as a Wave ends, once the Ink Core is destroyed, and on switching Waves on. */
  pause(): void;
  /** Whether an Enemy of `type` sent in now would stand at the lane's far end with nothing in its way. */
  spawnClear(type: EnemyType): boolean;
  spawn(type: EnemyType): unknown;
  /** Freezes again every Object at rest, while paused: the Aftermath. */
  freezeResting(): void;
}

/** What the Defence loop does to the Ink Tanks as an Intermission begins. */
export interface Refill {
  /** Fills every Tank to its maximum. */
  fill(): void;
}

/**
 * Where the Defence loop is, with Waves on: an Intermission, paused, before
 * a Wave; a Wave, paused or running; the Level cleared, after its last Wave;
 * or lost, once the Ink Core is destroyed, until R or Clear.
 */
export type Phase = 'intermission' | 'wave' | 'cleared' | 'lost';

/** What the player may ask to do to the Arena: draw a Stroke, fill, erase or undo. */
export type BuildAction = 'draw' | 'fill' | 'erase' | 'undo';

/** Why the player may not do something now, whatever it would cost. */
export type Bar =
  /** The Ink Core is destroyed: only R or Clear go on, Waves on or off. */
  | 'lost'
  /** With Waves on, it is not a Wave: an Intermission, or the Level cleared. */
  | 'not-now'
  /** During a Wave, a Stroke reaches closer to an Enemy than about the Enemy's width. */
  | 'near-enemy';

/** Whether `reason` is a Bar rather than another reason something is refused. */
export function isBar(reason: string | null): reason is Bar {
  return reason === 'lost' || reason === 'not-now' || reason === 'near-enemy';
}

/**
 * What Space asks of physics: start it (the Game takes its checkpoint just
 * before), run it on from a pause within a Wave, or pause it.
 */
export type SpaceVerb = 'start' | 'resume' | 'pause';

/** What a Wave came to: the rewards screen's summary. */
export interface WaveSummary {
  /** Which of the Level's Waves it was, from 1. */
  readonly wave: number;
  /** How many Enemies died in it. */
  readonly kills: number;
  /** The Ink Core's HP as it ended. */
  readonly coreHp: number;
  /** The Ink picked up from Drops into each Tank, px²: what didn't fit is not counted. */
  readonly ink: Readonly<Record<Colour, number>>;
}

/**
 * The rewards an Intermission offers for the Wave that ended: for now only
 * its summary. A choice of rewards (pick one of three) slots in here, and the
 * refill would then wait for the pick.
 */
export interface Rewards {
  readonly summary: WaveSummary;
}

/** The Defence loop as the HUD and the rewards screen read it. */
export interface DefenceReading {
  /** The Intermission, a Wave, the Level cleared or lost, with Waves on; null with Waves off. */
  readonly phase: Phase | null;
  /** The Wave under way, or the next to come in an Intermission, from 1; the last once cleared. */
  readonly wave: number;
  /** How many Waves the Level has. */
  readonly waves: number;
  /** How many of the Wave's Enemies are still to come: 0 outside a Wave. */
  readonly toCome: number;
  /** Whether the Ink Core's HP has run out, Waves on or off: physics stops, and only R or Clear go on. */
  readonly coreDestroyed: boolean;
  /** The rewards of the Wave that last ended, in an Intermission or once cleared; null before the first. */
  readonly rewards: Rewards | null;
}

/**
 * Where the Defence loop is, for R to go back to: which Wave comes next and
 * the rewards of those that ended. What it is in the middle of, and the Wave
 * tables, are not part of it.
 */
export interface LoopPosition {
  /** Which of the Level's Waves comes next, from 0. */
  readonly index: number;
  /** The rewards of each Wave that ended, by its index. */
  readonly ended: readonly Rewards[];
}

/** The first Wave's Intermission, with nothing ended: where a Level starts. */
export const FIRST_INTERMISSION: LoopPosition = { index: 0, ended: [] };

export interface DefenceLoopOptions {
  readonly world: LoopWorld;
  readonly tanks: Refill;
  /** The Wave table of the Level's only Wave, until a Level brings its own list. */
  readonly table: WaveTable;
  /** The Waves switch; off by default. */
  readonly waves?: boolean;
}

/** A Wave under way: the Enemies still to come, when the next may, and its tally. */
interface Wave {
  /** Still to come, in the order they arrive. */
  readonly toCome: EnemyType[];
  /** Steps left before the next may arrive. */
  untilNext: number;
  kills: number;
  /** Ink picked up so far, px². */
  readonly ink: Record<Colour, number>;
}

/**
 * The Defence loop (CONTEXT.md): which phase is under way, and what Space
 * does in it. With the Waves switch on, a Level is played Wave by Wave from
 * its list: Space in an Intermission starts the next Wave, which sends in
 * its Wave table's Enemies from the Spawn and ends when none is left to come
 * and none is alive. Physics then pauses and the Intermission begins: its
 * rewards, then every Tank refilled, and every Object at rest Frozen again.
 * After the last Wave the Level is cleared. Waves on or off, once the Ink
 * Core is destroyed physics stops and Space starts nothing until R or Clear
 * bring it back whole.
 *
 * It lives in the Game (ADR 0009) and reaches the Sandbox world through
 * `LoopWorld`, so it knows nothing of Box2D. The Game runs its hooks around
 * every step, asks it whether drawing is allowed now, and carries out what
 * it says Space does. The Game's checkpoint holds its position, for R.
 */
export class DefenceLoop {
  private readonly world: LoopWorld;
  private readonly tanks: Refill;
  /** The Level's Waves, in order, each its own Wave table. */
  private tables: WaveTable[];
  private on: boolean;
  /** Which of `tables` is under way, or comes next; the last once cleared. */
  private index = 0;
  /** The Wave under way, paused or running, or the one lost; null in an Intermission or once cleared. */
  private current: Wave | null = null;
  private cleared = false;
  /** The rewards of each Wave that ended, by its index. */
  private ended: Rewards[] = [];

  constructor(options: DefenceLoopOptions) {
    this.world = options.world;
    this.tanks = options.tanks;
    this.tables = [options.table];
    this.on = options.waves ?? false;
  }

  /**
   * The Waves switch. Off, there are no phases: Space runs and pauses
   * physics, as in milestone 3. Turning it on puts the loop in an
   * Intermission before the Wave it is at, pausing physics if it runs;
   * turning it off ends a Wave under way where it is, and physics stays as
   * it is.
   */
  get waves(): boolean {
    return this.on;
  }

  set waves(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.current = null;
    if (on) this.world.pause();
  }

  get reading(): DefenceReading {
    return {
      phase: this.phase,
      wave: this.index + 1,
      waves: this.tables.length,
      toCome: this.current?.toCome.length ?? 0,
      coreDestroyed: this.coreDestroyed,
      rewards: this.ended[this.index - (this.cleared ? 0 : 1)] ?? null,
    };
  }

  /** The current Wave's table: its list and its gap. Edit it with `edit`. */
  get table(): ReadonlyWaveTable {
    return this.tables[this.index]!;
  }

  /** Every Wave's table, in order. */
  get list(): readonly ReadonlyWaveTable[] {
    return this.tables;
  }

  /**
   * Edits the current Wave's table, as the F2 tuning panel does. A Wave
   * under way keeps its list, and takes a new gap from its next arrival; a
   * Wave not yet started takes the table as it is when it starts.
   */
  edit(edit: (table: WaveTable) => void): void {
    edit(this.tables[this.index]!);
  }

  /**
   * Loading a Level, once it is built: the list becomes a copy of `waves`,
   * or without them, one Wave, the current Wave's table as it is. Back to
   * the first Wave's Intermission, with nothing ended; with Waves on, physics
   * pauses where the build left it, as the Waves switch does.
   */
  load(waves?: readonly ReadonlyWaveTable[]): void {
    this.tables =
      waves && waves.length > 0
        ? waves.map((table) => createWaveTable(table))
        : [createWaveTable(this.table)];
    this.restore(FIRST_INTERMISSION);
    if (this.on) this.world.pause();
  }

  /** Where the loop is now, to `restore` later: the Game's checkpoint holds it. */
  snapshot(): LoopPosition {
    return { index: this.index, ended: [...this.ended] };
  }

  /**
   * Goes back to `position`: R, or `FIRST_INTERMISSION` when everything
   * starts over. The loop is in the Intermission before the Wave it names,
   * with nothing under way and not cleared. The Wave tables stay as they
   * are: F2 edits survive R. Physics is left as it is.
   */
  restore(position: LoopPosition): void {
    this.index = position.index;
    this.ended = [...position.ended];
    this.current = null;
    this.cleared = false;
  }

  /**
   * Why the player may not `action` now, or null if they may. Once the Ink
   * Core is destroyed, nothing, Waves on or off. With Waves on, nothing
   * outside a Wave, and during one, no Stroke whose samples come near an
   * Enemy (`nearEnemy`). With Waves off, anything.
   */
  bar(
    action: BuildAction,
    { nearEnemy = false }: { readonly nearEnemy?: boolean } = {},
  ): Bar | null {
    if (this.coreDestroyed) return 'lost';
    if (!this.on) return null;
    if (this.current === null) return 'not-now';
    // PROVISIONAL, for manual testing (ADR 0012): during a Wave, undo (with
    // its full refund) and every action while the Wave is paused stay
    // allowed. Either may go once playing shows whether Ink scarcity holds
    // without them: undo by barring it here, pausing by asking the world.
    if (action === 'draw' && nearEnemy) return 'near-enemy';
    return null;
  }

  private get coreDestroyed(): boolean {
    return this.world.inkCore.hp <= 0;
  }

  private get phase(): Phase | null {
    if (!this.on) return null;
    if (this.coreDestroyed) return 'lost';
    if (this.current) return 'wave';
    return this.cleared ? 'cleared' : 'intermission';
  }

  /** Run just before and just after each step of physics, so a retry plays out the same. */
  readonly hooks: StepHooks = {
    before: () => this.arrive(),
    after: () => this.stopIfOver(),
  };

  /**
   * A kill during a Wave, and the Ink its Drop put in the Tanks, px²: the
   * Wave's tally, for its summary. Outside a Wave it counts for nothing.
   */
  killed(ink: Readonly<Record<Colour, number>>): void {
    const wave = this.current;
    if (!wave) return;
    wave.kills++;
    for (const colour of COLOURS) wave.ink[colour] += ink[colour];
  }

  /**
   * Before a step of a Wave: sends in the next Enemy on its list once the
   * gap since the last one is over and the lane's far end is free. The
   * first comes as the Wave starts.
   */
  private arrive(): void {
    const wave = this.current;
    if (!wave) return;
    if (wave.untilNext > 0) wave.untilNext--;
    const next = wave.toCome[0];
    if (next === undefined || wave.untilNext > 0 || !this.world.spawnClear(next)) return;
    wave.toCome.shift();
    this.world.spawn(next);
    wave.untilNext = Math.max(1, Math.round(this.table.gap / STEP_SECONDS));
  }

  /**
   * After a step: once the Ink Core is destroyed, physics stops, Waves on or
   * off, and a Wave under way is lost where it was, with its tally. A Wave
   * also ends when none is left to come and none is alive, and the
   * Intermission begins.
   */
  private stopIfOver(): void {
    if (this.coreDestroyed) return this.world.pause();
    const wave = this.current;
    if (wave === null || wave.toCome.length > 0 || this.world.enemyCount > 0) return;
    this.world.pause();
    this.endWave(wave);
  }

  /**
   * Ends a Wave the Ink Core survived: its rewards, then every Tank refilled
   * and every Object at rest Frozen again (the Aftermath). Everything else
   * stays as it ended, damage included. The loop moves on to the next Wave's
   * Intermission, or after the last, the Level is cleared.
   */
  private endWave(wave: Wave): void {
    this.current = null;
    const summary = {
      wave: this.index + 1,
      kills: wave.kills,
      coreHp: this.world.inkCore.hp,
      ink: { ...wave.ink },
    };
    this.ended[this.index] = { summary };
    this.tanks.fill();
    this.world.freezeResting();
    if (this.index + 1 < this.tables.length) this.index++;
    else this.cleared = true;
  }

  /**
   * Space: what physics should do now, which the Game carries out. A running
   * world pauses. Once the Ink Core is destroyed, or with Waves on once the
   * Level is cleared, nothing (null) until R or Clear. A paused Wave resumes.
   * Otherwise physics starts, and with Waves on the next Wave starts with it,
   * its Enemies as its table is now.
   */
  space(): SpaceVerb | null {
    if (this.world.isRunning) return 'pause';
    if (this.coreDestroyed || (this.on && this.cleared)) return null;
    if (this.current) return 'resume';
    if (this.on) {
      this.current = {
        toCome: arrivals(this.table),
        untilNext: 0,
        kills: 0,
        ink: Object.fromEntries(COLOURS.map((colour) => [colour, 0])) as Record<Colour, number>,
      };
    }
    return 'start';
  }
}
