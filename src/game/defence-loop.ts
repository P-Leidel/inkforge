import type { Bounds } from '../geometry/polygon';
import { distance, type Vec2 } from '../geometry/vec2';
import type { EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS, type StepHooks } from '../sandbox/sandbox-world';
import { arrivals, type ReadonlyWaveTable, type WaveTable } from './wave-table';

/** What the Defence loop needs of the Sandbox world. The Sandbox world is one. */
export interface LoopWorld {
  readonly isRunning: boolean;
  /** How many Enemies are in the Arena. */
  readonly enemyCount: number;
  readonly inkCore: { readonly hp: number; readonly bounds: Bounds };
  /** Starts physics, taking the world's own snapshot, or pauses it. */
  togglePause(): void;
  /** Runs physics on from where it was paused, without a snapshot. */
  resume(): void;
  pause(): void;
  /** Whether an Enemy of `type` sent in now would stand at the lane's far end with nothing in its way. */
  spawnClear(type: EnemyType): boolean;
  spawn(type: EnemyType): unknown;
}

/** What the Defence loop does to the Ink Tanks as a Wave starts and ends. */
export interface WaveLock {
  lock(): void;
  unlock(): void;
}

/**
 * Where the Defence loop is, with Waves on: the Build Phase, paused, where
 * the player builds, or a Wave, paused or running.
 */
export type Phase = 'build' | 'wave';

/** The Core Zone: the circle around the Ink Core, the only place to draw during a Wave. */
export interface CoreZone {
  readonly centre: Vec2;
  /** px */
  readonly radius: number;
}

/** The Defence loop as the HUD and the Core Zone drawing read it. */
export interface DefenceReading {
  /** The Build Phase or a Wave, with Waves on; null with Waves off. */
  readonly phase: Phase | null;
  /** How many of the Wave's Enemies are still to come: 0 outside a Wave. */
  readonly toCome: number;
  /** Whether the Ink Core's HP has run out: physics stops, and only R or Clear go on. */
  readonly coreDestroyed: boolean;
  /** Where the Core Zone is, whatever the phase: it holds only during a Wave. */
  readonly coreZone: CoreZone;
}

export interface DefenceLoopOptions {
  readonly world: LoopWorld;
  readonly tanks: WaveLock;
  /** The Wave table to read and edit. */
  readonly table: WaveTable;
  /** The Waves switch; off by default. */
  readonly waves?: boolean;
}

/** A Wave under way: the Enemies still to come, and when the next may. */
interface Wave {
  /** Which Wave it is, counting every Wave started: what was paid in it is known by it. */
  readonly number: number;
  /** Still to come, in the order they arrive. */
  readonly toCome: EnemyType[];
  /** Steps left before the next may arrive. */
  untilNext: number;
}

/**
 * The Defence loop (CONTEXT.md): which phase is under way, and what Space
 * does in it. With the Waves switch on, Space in the Build Phase starts a
 * Wave, which sends in the Wave table's Enemies from the Spawn and ends when
 * none is left to come and none is alive; the Tanks' contents are Locked Ink
 * until it ends, and during it only the Core Zone may be drawn in. Waves on
 * or off, once the Ink Core is destroyed physics stops and Space starts
 * nothing until R or Clear bring it back whole.
 *
 * It lives in the Game (ADR 0009) and reaches the Sandbox world through
 * `LoopWorld`, so it knows nothing of Box2D. The Game runs its hooks around
 * every step and asks it which Wave pays and whether something may be drawn.
 */
export class DefenceLoop {
  private readonly world: LoopWorld;
  private readonly tanks: WaveLock;
  private readonly waveTable: WaveTable;
  private on: boolean;
  /** The Wave under way, paused or running; null in the Build Phase. */
  private current: Wave | null = null;
  /** How many Waves were started in all, never taken back: R and Clear keep it. */
  private wavesStarted = 0;

  constructor(options: DefenceLoopOptions) {
    this.world = options.world;
    this.tanks = options.tanks;
    this.waveTable = options.table;
    this.on = options.waves ?? false;
  }

  /**
   * The Waves switch. Off, there are no phases: Space runs and pauses
   * physics, as in milestone 3. Turning it on puts the loop in the Build
   * Phase, pausing physics if it runs; turning it off ends a Wave under way
   * where it is, and physics stays as it is.
   */
  get waves(): boolean {
    return this.on;
  }

  set waves(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.endWave();
    if (on) this.world.pause();
  }

  get reading(): DefenceReading {
    return {
      phase: this.phase,
      toCome: this.current?.toCome.length ?? 0,
      coreDestroyed: this.coreDestroyed,
      coreZone: this.coreZone,
    };
  }

  /** The Wave table: the Wave's list, its gap and the Core Zone's size. Edit it with `edit`. */
  get table(): ReadonlyWaveTable {
    return this.waveTable;
  }

  /**
   * Edits the Wave table, as the F2 tuning panel does. A Wave under way
   * keeps its list, and takes a new gap from its next arrival; the next Wave
   * takes the table as it is when it starts. The Core Zone takes a new size
   * at once.
   */
  edit(edit: (table: WaveTable) => void): void {
    edit(this.waveTable);
  }

  /** A circle centred on the Ink Core, as wide as the Wave table's `coreZone` says now. */
  private get coreZone(): CoreZone {
    const { minX, minY, maxX, maxY } = this.world.inkCore.bounds;
    const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    return { centre, radius: this.waveTable.coreZone / 2 };
  }

  /** Whether every one of `points` lies inside the Core Zone, its edge included, whatever the phase. */
  inside(points: readonly Vec2[]): boolean {
    const { centre, radius } = this.coreZone;
    return points.every((point) => distance(point, centre) <= radius);
  }

  /** Whether the Core Zone holds now: during a Wave, paused or running. */
  get zoned(): boolean {
    return this.current !== null;
  }

  /**
   * Whether something may be drawn at `points` now: anywhere outside a Wave,
   * and during one only wholly inside the Core Zone.
   */
  allows(points: readonly Vec2[]): boolean {
    return !this.zoned || this.inside(points);
  }

  private get coreDestroyed(): boolean {
    return this.world.inkCore.hp <= 0;
  }

  private get phase(): Phase | null {
    if (!this.on) return null;
    return this.current ? 'wave' : 'build';
  }

  /** The Wave under way, by its number, whose Wave Ink pays now; null outside a Wave. */
  get wave(): number | null {
    return this.current?.number ?? null;
  }

  /** Run just before and just after each step of physics, so a retry plays out the same. */
  readonly hooks: StepHooks = {
    before: () => this.arrive(),
    after: () => this.stopIfOver(),
  };

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
    wave.untilNext = Math.max(1, Math.round(this.waveTable.gap / STEP_SECONDS));
  }

  /**
   * After a step: once the Ink Core is destroyed, physics stops, Waves on or
   * off, and a Wave under way ends with it. A Wave also ends when none is
   * left to come and none is alive. Either way, physics stops and the loop
   * is back in the Build Phase.
   */
  private stopIfOver(): void {
    const wave = this.current;
    const over = wave !== null && wave.toCome.length === 0 && this.world.enemyCount === 0;
    if (!over && !this.coreDestroyed) return;
    this.world.pause();
    this.endWave();
  }

  /**
   * Ends a Wave under way, if any: its Locked Ink is spendable again, and
   * its Wave Ink stays in the Tanks. Nothing is Frozen again.
   */
  private endWave(): void {
    if (!this.current) return;
    this.current = null;
    this.tanks.unlock();
  }

  /**
   * R, Clear, or the world starting over below the Game: back to the Build
   * Phase with Waves on, with no Wave under way. The Game brings the Tanks
   * back itself, so they are left as they are. The count of Waves started
   * is kept, so what was paid in one Wave is never taken for another's.
   */
  reset(): void {
    this.current = null;
  }

  /**
   * Space. `beforeStart` runs just before physics starts, so the Game can
   * take its snapshot.
   */
  space(beforeStart: () => void): void {
    if (this.world.isRunning) return this.world.pause();
    if (this.current) return this.world.resume();
    if (this.coreDestroyed) return;
    beforeStart();
    this.world.togglePause();
    if (!this.on) return;
    this.current = { number: ++this.wavesStarted, toCome: arrivals(this.waveTable), untilNext: 0 };
    this.tanks.lock();
  }
}
