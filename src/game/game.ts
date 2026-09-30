import type { Polygon } from '../geometry/polygon';
import { distance, type Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import {
  SandboxWorld,
  STEP_SECONDS,
  type AddedStroke,
  type DropInk,
  type Entry,
  type FillOutcome,
  type MadeStroke,
  type Reader,
  type SandboxWorldOptions,
  type StrokeId,
  type StrokeOutcome,
} from '../sandbox/sandbox-world';
import { createInkTable, type InkTable, type ReadonlyInkTable } from './ink-table';
import { InkTanks, type TankReadings, type TanksState } from './ink-tanks';
import { arrivals, createWaveTable, type ReadonlyWaveTable, type WaveTable } from './wave-table';

/** What a Stroke the Game was asked for became. */
export type GameStrokeOutcome =
  | Exclude<StrokeOutcome, { readonly kind: 'declined' }>
  /** It cost more than its Tank holds, so nothing was made: `path` is what it would have been. */
  | {
      readonly kind: 'refused';
      readonly colour: Colour;
      /** Its price, px². */
      readonly price: number;
      readonly path: readonly Vec2[];
    }
  /** During a Wave, it reached outside the Core Zone, so nothing was made: `path` is what it would have been. */
  | { readonly kind: 'outside'; readonly path: readonly Vec2[] };

/** What a Fill click the Game was asked for did. */
export type GameFillOutcome =
  | Exclude<FillOutcome, { readonly kind: 'declined' }>
  /** It cost more than its Tank holds, so the Object stays hollow; `outline` is where it is now. */
  | {
      readonly kind: 'refused';
      readonly id: StrokeId;
      readonly colour: Colour;
      /** Its price, px². */
      readonly price: number;
      readonly outline: Polygon;
    }
  /** During a Wave, the click was outside the Core Zone, so the Object stays hollow. */
  | { readonly kind: 'outside'; readonly id: StrokeId; readonly outline: Polygon };

/** The Core Zone: the circle around the Ink Core, the only place to draw during a Wave. */
export interface CoreZone {
  readonly centre: Vec2;
  /** px */
  readonly radius: number;
}

/** What something would cost before it is made, and whether its Tank can pay for it. */
export interface CostEstimate {
  readonly colour: Colour;
  /** Its price, px². */
  readonly price: number;
  /** Whether it costs more than `colour`'s Tank holds, so it would be refused. */
  readonly over: boolean;
}

/**
 * What a Stroke or a Fill would be, as the Sandbox world was when the Game
 * looked: the Ink it would take, what it would run into, and whether it lies
 * wholly inside the Core Zone. `prospect` prices it. Its readers keep it
 * while what was looked at stays the same.
 */
export type Look =
  /** A Stroke that doesn't close, as a Line along its raw samples, cut where a new Line is. */
  (
    | { readonly kind: 'line'; readonly ink: number; readonly onLines: number }
    /** A closing Stroke, and whether its Object would overlap the Terrain or an Object. */
    | { readonly kind: 'object'; readonly ink: number; readonly overlaps: boolean }
    /** The Fill of the hollow Object under a point. */
    | { readonly kind: 'fill'; readonly ink: number }
  ) & {
    /** Whether its raw samples, or the Fill's click, lie wholly inside the Core Zone. */
    readonly inside: boolean;
  };

/** Why a Stroke or a Fill would be refused. */
export type Refusal =
  /** A closing Stroke's Object would overlap the Terrain or an Object. */
  | 'overlaps'
  /** During a Wave, it reaches outside the Core Zone. */
  | 'outside'
  /** It costs more than its Colour's Tank holds. */
  | 'not-enough';

/** What a Stroke or a Fill would do if it were made now, without making it. */
export interface Prospect {
  /** What it would make: a Line, an Object (the Stroke closes) or a Fill. */
  readonly kind: Look['kind'];
  /** Why it would be refused, the first reason of those it runs into; null if it wouldn't be. */
  readonly refusal: Refusal | null;
  /** What it would cost, and whether its Tank can pay; null with Ink costs off. */
  readonly cost: CostEstimate | null;
}

/** One undo step: a Stroke, or the Fill of an Object. */
export interface Action {
  readonly kind: 'stroke' | 'fill';
  readonly id: StrokeId;
}

/**
 * What something still there paid, and from which Tank. `colour` is null for
 * what was made below the Game (a demo, a stress test), which paid nothing.
 * `wave` is the Wave it was paid in, whose Wave Ink paid for it; null for
 * what was paid outside a Wave.
 */
interface Paid {
  readonly colour: Colour | null;
  readonly price: number;
  readonly wave: number | null;
}

/** What a Stroke in the Arena paid: an Object for its Outline, a Line Piece by Piece. */
type Charge =
  | { readonly kind: 'object'; readonly paid: Paid }
  | {
      readonly kind: 'line';
      readonly colour: Colour | null;
      /** The Wave it was paid in, as for `Paid`. */
      readonly wave: number | null;
      /** What each Piece still standing paid, by its index. */
      readonly pieces: Map<number, number>;
    };

/** Everything R brings back of the Game: the Tanks, what was paid and the undo history. */
interface Snapshot {
  readonly tanks: TanksState;
  readonly strokes: ReadonlyMap<StrokeId, Charge>;
  readonly fills: ReadonlyMap<StrokeId, Paid>;
  readonly history: readonly Action[];
}

/**
 * Where the Game is, with Waves on: the Build Phase, paused, where the
 * player builds, or a Wave, paused or running.
 */
export type Phase = 'build' | 'wave';

/** A Wave under way: the Enemies still to come, and when the next may. */
interface Wave {
  /** Which Wave it is, counting every Wave started: what was paid in it is known by it. */
  readonly number: number;
  /** Still to come, in the order they arrive. */
  readonly toCome: EnemyType[];
  /** Steps left before the next may arrive. */
  untilNext: number;
}

export interface GameOptions {
  /** Whether Strokes and Fills cost Ink. Off, Ink is unlimited. */
  readonly inkCosts: boolean;
  /** Whether the Game has a Build Phase and Waves; off by default. */
  readonly waves?: boolean;
  /** The Wave table to read and edit; defaults to a fresh copy of the defaults. */
  readonly wave?: WaveTable;
  /** The Sandbox world to run; a new one from `worldOptions` by default. */
  readonly world?: SandboxWorld;
  readonly worldOptions?: SandboxWorldOptions;
  /** The Ink table to read and edit; defaults to a fresh copy of the defaults. */
  readonly ink?: InkTable;
}

/**
 * The Game: the rules layer over the Sandbox world (ADR 0009). It owns the
 * Ink Tanks, the Ink table and the Ink costs switch, what each Stroke, Piece
 * and Fill paid, the undo history, and the snapshot of all of these that R
 * goes back to. It issues the Sandbox world's commands, prices the Ink they
 * report and refuses what a Tank can't pay for, and reads the list of what
 * happened to learn what broke or was erased. It never measures Ink itself,
 * and leaves the Tank arithmetic to the Ink Tanks.
 *
 * Strokes and Fills made below it, by a demo or a stress test, join the
 * undo history at price 0 when it reads that they were added.
 *
 * With the Waves switch on, it also owns the phase: the Build Phase, and
 * the Wave that Space starts from it, which sends in the Wave table's
 * Enemies from the Spawn and ends when none is left to come and none is
 * alive, or the Ink Core is destroyed. The Sandbox world knows nothing of
 * phases. As a Wave starts, the Tanks' contents become Locked Ink, and until
 * it ends only Wave Ink is spent.
 *
 * Every kill's Drop, which the Sandbox world reports in the list of what
 * happened, goes into the Tanks as Wave Ink (ADR 0005), Waves on or off.
 *
 * During a Wave, paused or running, a Stroke must lie wholly inside the
 * Core Zone and a Fill click must be inside it, Ink costs on or off;
 * Releasing works anywhere.
 */
export class Game {
  readonly world: SandboxWorld;
  private readonly table: InkTable;
  private readonly inkTanks: InkTanks;
  private costs: boolean;
  /** What each Stroke still in the Arena paid, by id. */
  private strokes = new Map<StrokeId, Charge>();
  /** What each Fill still in the Arena paid, by its Object's id. */
  private fills = new Map<StrokeId, Paid>();
  /** Strokes and Fills in the order they were made, for undo. */
  private undoHistory: Action[] = [];
  /** Taken whenever physics starts, or with Waves on, as a Wave starts; R returns to it. */
  private snapshot: Snapshot | null = null;
  private readonly reader: Reader;
  private readonly waveTable: WaveTable;
  private wavesOn: boolean;
  /** The Wave under way, paused or running; null in the Build Phase. */
  private current: Wave | null = null;
  /** How many Waves were started in all, never taken back: R and Clear keep it. */
  private wavesStarted = 0;
  /** Sends in the Wave's Enemies before each step and ends it after, as `advance` steps. */
  private readonly around = {
    before: () => this.arrive(),
    after: () => this.endWaveIfOver(),
  };

  constructor(options: GameOptions) {
    this.world = options.world ?? new SandboxWorld(options.worldOptions);
    this.table = options.ink ?? createInkTable();
    this.costs = options.inkCosts;
    this.inkTanks = new InkTanks(this.table);
    this.reader = this.world.happenings.reader();
    this.waveTable = options.wave ?? createWaveTable();
    this.wavesOn = options.waves ?? false;
  }

  /**
   * The Waves switch. Off, the Game plays as in milestone 3. Turning it on
   * puts the Game in the Build Phase, pausing physics if it runs; turning it
   * off ends a Wave under way where it is, and physics stays as it is.
   */
  get waves(): boolean {
    return this.wavesOn;
  }

  set waves(on: boolean) {
    if (on === this.wavesOn) return;
    this.wavesOn = on;
    this.endWave();
    if (on) this.world.pause();
  }

  /** The Build Phase or a Wave, with Waves on; null with Waves off. */
  get phase(): Phase | null {
    if (!this.wavesOn) return null;
    return this.current ? 'wave' : 'build';
  }

  /** How many of the Wave's Enemies are still to come: 0 outside a Wave. */
  get toCome(): number {
    return this.current?.toCome.length ?? 0;
  }

  /** The Wave table: the Wave's list and gap. Edit it with `editWave`. */
  get wave(): ReadonlyWaveTable {
    return this.waveTable;
  }

  /**
   * Edits the Wave table, as the F2 tuning panel does. A Wave under way
   * keeps its list, and takes a new gap from its next arrival; the next Wave
   * takes the table as it is when it starts.
   */
  editWave(edit: (table: WaveTable) => void): void {
    edit(this.waveTable);
  }

  /**
   * The Core Zone: a circle centred on the Ink Core, as wide as the enemy
   * table's `coreZone` says now.
   */
  get coreZone(): CoreZone {
    const { minX, minY, maxX, maxY } = this.world.inkCore.bounds;
    const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    return { centre, radius: this.world.enemyTable.coreZone / 2 };
  }

  /** Whether every one of `points` lies inside the Core Zone, its edge included. */
  private insideCoreZone(points: readonly Vec2[]): boolean {
    const { centre, radius } = this.coreZone;
    return points.every((point) => distance(point, centre) <= radius);
  }

  /** Whether the Core Zone rule holds now: during a Wave, paused or running. */
  private get zoned(): boolean {
    return this.current !== null;
  }

  /** Whether Strokes and Fills cost Ink. Turning it off or on leaves the Tanks as they are. */
  get inkCosts(): boolean {
    return this.costs;
  }

  set inkCosts(on: boolean) {
    this.costs = on;
  }

  /** The Ink table: the prices and the Tank maximums. Edit it with `editInk`. */
  get ink(): ReadonlyInkTable {
    return this.table;
  }

  /**
   * Edits the Ink table, as the F2 tuning panel does. A new price applies to
   * the next Stroke or Fill: what was already charged keeps its price, so
   * undo refunds what was paid. Lowering a maximum empties the Tank down to
   * it at once; raising one leaves the Tank as it is.
   */
  editInk(edit: (table: InkTable) => void): void {
    edit(this.table);
    this.inkTanks.fitMaximums();
  }

  /** Each Tank as the player reads it: what it holds and its maximum, worked out now. */
  get tanks(): TankReadings {
    return this.inkTanks.reading();
  }

  /**
   * What the Strokes and Fills still in the Arena paid from `colour`'s Tank,
   * px²: all that undo and the Eraser could still give back.
   */
  paid(colour: Colour): number {
    let sum = 0;
    const add = (paid: Paid | undefined) => {
      if (paid?.colour === colour) sum += paid.price;
    };
    for (const charge of this.strokes.values()) {
      if (charge.kind === 'object') add(charge.paid);
      else for (const price of charge.pieces.values()) add({ ...charge, price });
    }
    for (const paid of this.fills.values()) add(paid);
    return sum;
  }

  /** The undo history, oldest first: what Ctrl+Z may take back. */
  get history(): readonly Action[] {
    return this.undoHistory;
  }

  get isRunning(): boolean {
    return this.world.isRunning;
  }

  /**
   * Turns one Stroke's raw pointer samples, drawn in `colour`, into a Line,
   * an Object, a rejection or nothing, and charges its price to `colour`'s
   * Tank: `linePrice` × its Ink, a Line's Piece by Piece. The parts of a Line
   * lying on another Line are free, found once, as it is made; an Object
   * pays for all of its Outline. During a Wave, a Stroke whose raw samples
   * reach outside the Core Zone is refused whole; so is one that costs more
   * than the Tank holds.
   */
  submitStroke(samples: readonly Vec2[], colour: Colour): GameStrokeOutcome {
    this.catchUp();
    // The Stroke pipeline keeps a Stroke within its samples, and the Core Zone is convex.
    const outside = this.zoned && !this.insideCoreZone(samples);
    const outcome = this.world.submitStroke(samples, colour, {
      accept: (made) => !outside && this.affords(made.colour, this.priceOf(made)),
    });
    switch (outcome.kind) {
      case 'declined': {
        const { made, path } = outcome;
        if (outside) return { kind: 'outside', path };
        return { kind: 'refused', colour: made.colour, price: this.priceOf(made), path };
      }
      case 'line':
      case 'object':
        this.charge(outcome);
        break;
      case 'rejected':
      case 'dropped':
        // Nothing was made, so nothing is charged.
        break;
    }
    this.catchUp();
    return outcome;
  }

  /**
   * Fills the Object under `point` with `colour`, and charges `fillPrice` ×
   * its Ink to `colour`'s Tank. During a Wave, a click outside the Core Zone
   * is refused; so is a Fill that costs more than the Tank holds. Refused,
   * the Object stays hollow.
   */
  fillAt(point: Vec2, colour: Colour): GameFillOutcome {
    this.catchUp();
    const outside = this.zoned && !this.insideCoreZone([point]);
    const outcome = this.world.fillAt(point, colour, {
      accept: (fill) => !outside && this.affords(fill.colour, this.fillPrice(fill.ink)),
    });
    switch (outcome.kind) {
      case 'declined': {
        const { id, outline, ink } = outcome;
        if (outside) return { kind: 'outside', id, outline };
        return { kind: 'refused', id, colour, price: this.fillPrice(ink), outline };
      }
      case 'filled': {
        const price = this.fillPrice(outcome.ink);
        this.inkTanks.spend(colour, price);
        this.fills.set(outcome.id, { colour, price, wave: this.paidIn });
        this.undoHistory.push({ kind: 'fill', id: outcome.id });
        break;
      }
      case 'already-filled':
      case 'missed':
        // Nothing was filled, so nothing is charged.
        break;
    }
    this.catchUp();
    return outcome;
  }

  /**
   * Looks at what a Stroke with these raw samples would be if it were
   * submitted now, without the Stroke pipeline but for a closing Stroke,
   * whose Object may overlap: the Sandbox world measures the samples as
   * drawn. Null with too few samples to be anything.
   */
  lookAtStroke(samples: readonly Vec2[]): Look | null {
    if (samples.length < 2) return null;
    const { closes, ink, onLines } = this.world.measureSamples(samples);
    const inside = this.insideCoreZone(samples);
    if (!closes) return { kind: 'line', ink, onLines, inside };
    const result = this.world.previewStroke(samples);
    const overlaps = result.kind === 'rejected' && result.reason === 'overlaps';
    return { kind: 'object', ink, overlaps, inside };
  }

  /**
   * Looks at the Fill a click at `point` would make now. Null over nothing,
   * or over an Object that is already filled.
   */
  lookAtFill(point: Vec2): Look | null {
    const ink = this.world.fillInkAt(point);
    return ink === null ? null : { kind: 'fill', ink, inside: this.insideCoreZone([point]) };
  }

  /**
   * What `look` would do in `colour`, priced now: an Object pays for all of
   * its Outline, a Line for the part not lying on another Line, a Fill for
   * its Ink. An overlap refuses it first, then, during a Wave, reaching
   * outside the Core Zone, then a price its Tank can't pay. The phase, the
   * Tanks, the Ink table and the Ink costs switch are read as they are now,
   * whenever the look was taken.
   */
  prospect(look: Look, colour: Colour): Prospect {
    const cost = this.costs ? this.estimate(colour, this.lookPrice(look)) : null;
    const overlaps = look.kind === 'object' && look.overlaps;
    const outside = this.zoned && !look.inside;
    const refusal = overlaps ? 'overlaps' : outside ? 'outside' : cost?.over ? 'not-enough' : null;
    return { kind: look.kind, refusal, cost };
  }

  private lookPrice(look: Look): number {
    switch (look.kind) {
      case 'line':
        return this.linePrice(Math.max(0, look.ink - look.onLines));
      case 'object':
        return this.linePrice(look.ink);
      case 'fill':
        return this.fillPrice(look.ink);
    }
  }

  private estimate(colour: Colour, price: number): CostEstimate {
    return { colour, price, over: !this.affords(colour, price) };
  }

  /** Releases the Frozen Object under `point`, if physics is running. */
  releaseAt(point: Vec2): boolean {
    return this.world.releaseAt(point);
  }

  /**
   * Sends in an Enemy of `type` from the Spawn, paused or running: Shift+1.
   * It costs nothing and is not in the undo history.
   */
  spawn(type: EnemyType): void {
    this.catchUp();
    this.world.spawn(type);
    this.catchUp();
  }

  /**
   * The Eraser: removes what its brush passes over, and refunds what was
   * paid for it: an Object's Outline and Fill, a Piece's price. Rubble,
   * Droplets and Patches are a broken Fill's, and that Ink is spent. During
   * a Wave, what was paid from its Wave Ink goes back to it, and what was
   * paid before it goes back as Locked Ink.
   */
  eraseAlong(path: readonly Vec2[], radius: number): void {
    this.catchUp();
    this.world.eraseAlong(path, radius);
    this.catchUp();
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists, and refunds
   * exactly what was paid for it: a Fill's price, an Object's Outline's, or
   * a Line's standing Pieces'. Broken Objects, and Lines whose every Piece
   * broke, are gone from the history, so undo skips them. During a Wave,
   * paused or running, it does nothing.
   */
  undo(): void {
    // A Wave's mistakes stay made.
    if (this.current) return;
    this.catchUp();
    for (let action = this.undoHistory.pop(); action; action = this.undoHistory.pop()) {
      if (this.takeBack(action)) break;
    }
    this.catchUp();
  }

  /** Takes back one undo step and refunds it; false if it was gone already. */
  private takeBack({ kind, id }: Action): boolean {
    if (kind === 'fill') {
      const paid = this.fills.get(id);
      this.fills.delete(id);
      if (this.world.removeFill(id).kind === 'gone') return false;
      this.refund(paid);
      return true;
    }
    const charge = this.strokes.get(id);
    if (this.world.removeStroke(id).kind === 'gone') {
      this.forget(id);
      return false;
    }
    this.refundStroke(id, charge);
    this.forget(id);
    return true;
  }

  /**
   * Space. With Waves off, starts or pauses physics, and every start takes a
   * snapshot of the Tanks, what was paid and the undo history, next to the
   * Sandbox world's. With Waves on, in the Build Phase it takes the snapshot,
   * turns every Tank's contents into Locked Ink and starts a Wave; during a
   * Wave it only pauses and runs, and it stays the Wave.
   */
  togglePause(): void {
    this.catchUp();
    if (this.current) {
      if (this.world.isRunning) this.world.pause();
      else this.world.resume();
      return;
    }
    this.world.togglePause();
    if (!this.world.isRunning) return;
    this.snapshot = this.takeSnapshot();
    if (!this.wavesOn) return;
    this.current = { number: ++this.wavesStarted, toCome: arrivals(this.waveTable), untilNext: 0 };
    this.inkTanks.lock();
  }

  /**
   * Ends a Wave under way, if any: its Locked Ink is spendable again, and
   * its Wave Ink stays in the Tanks.
   */
  private endWave(): void {
    if (!this.current) return;
    this.current = null;
    this.inkTanks.unlock();
  }

  /** The Wave what is paid now is paid in; null outside a Wave. */
  private get paidIn(): number | null {
    return this.current?.number ?? null;
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
    wave.untilNext = Math.max(1, Math.round(this.waveTable.gap / STEP_SECONDS));
  }

  /**
   * After a step of a Wave: it ends when none is left to come and none is
   * alive, or when the Ink Core is destroyed. Physics stops and the Game is
   * back in the Build Phase, with Locked Ink spendable again and the Wave
   * Ink kept; nothing is Frozen again. A kill's Drop in its last step is
   * picked up first, as Wave Ink.
   */
  private endWaveIfOver(): void {
    const wave = this.current;
    if (!wave) return;
    const over = wave.toCome.length === 0 && this.world.enemyCount === 0;
    if (!over && !this.world.coreDestroyed) return;
    this.catchUp();
    this.world.pause();
    this.endWave();
  }

  /**
   * R: takes the world back to the moment physics last started, and the
   * Tanks, what was paid and the undo history with it. With Waves on, that
   * is the Build Phase as it was when the last Wave started: its Enemies
   * are all to come again. Does nothing before the first start.
   */
  reset(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    this.current = null;
    this.world.reset();
    // Everything comes back as it was at the snapshot, which already knows it.
    this.reader.read();
    this.restore(snapshot);
  }

  /**
   * Removes every Stroke and Fill, the Rubble, Droplets, Patches and Blasts,
   * fills every Tank and empties the undo history. R has nothing to go back
   * to. Then `build`, if given, builds on the Sandbox world below the Game,
   * for free: a gallery demo or a stress test. What it makes joins the undo
   * history at price 0, and if it started physics, R goes back to how it
   * left the world. With Waves on, the Game is then in the Build Phase, and
   * a demo that started physics is paused where it left it. `wave`, if
   * given, is a demo's own Wave: the Wave table becomes a copy of it.
   * `terrain`, if given, is a demo's own Terrain; without it the Terrain is
   * the sandbox Arena's again.
   */
  clear(
    build?: (world: SandboxWorld) => void,
    wave?: ReadonlyWaveTable,
    terrain?: readonly Polygon[],
  ): void {
    if (wave) Object.assign(this.waveTable, createWaveTable(wave));
    this.current = null;
    this.world.clear(terrain);
    this.reader.read();
    this.inkTanks.fill();
    this.strokes.clear();
    this.fills.clear();
    this.undoHistory = [];
    this.snapshot = null;
    if (!build) return;
    build(this.world);
    this.catchUp();
    // A demo starts physics as its last act, so the world's snapshot is of now.
    if (!this.world.isRunning) return;
    this.snapshot = this.takeSnapshot();
    if (this.wavesOn) this.world.pause();
  }

  /**
   * Advances by real elapsed time, as the Sandbox world does, sending in a
   * Wave's Enemies and ending it step by step. Returns the steps taken.
   */
  advance(seconds: number): number {
    const steps = this.world.advance(seconds, this.around);
    this.catchUp();
    return steps;
  }

  /** Advances physics by one fixed step, if running, as `advance` does. */
  step(): void {
    if (this.world.isRunning) {
      this.around.before();
      this.world.step();
      this.around.after();
    }
    this.catchUp();
  }

  /** Stops reading the world, and frees it. */
  dispose(): void {
    this.reader.close();
    this.world.dispose();
  }

  /** What a Stroke costs: `linePrice` × its Ink, a Line's Piece by Piece; 0 with costs off. */
  private priceOf(made: MadeStroke): number {
    if (made.kind === 'object') return this.linePrice(made.ink);
    return this.piecePrices(made).reduce((sum, price) => sum + price, 0);
  }

  /**
   * What each Piece of a Line costs, in order: `linePrice` × its Ink that
   * doesn't lie on another Line. A Piece lying wholly on one costs nothing.
   */
  private piecePrices({ pieces, onLines }: Extract<MadeStroke, { kind: 'line' }>): number[] {
    return pieces.map((ink, index) => this.linePrice(Math.max(0, ink - onLines[index]!)));
  }

  private linePrice(ink: number): number {
    return this.costs ? this.table.linePrice * ink : 0;
  }

  private fillPrice(ink: number): number {
    return this.costs ? this.table.fillPrice * ink : 0;
  }

  /** Whether `colour`'s Tank can pay `price`; always with costs off, where every price is 0. */
  private affords(colour: Colour, price: number): boolean {
    return this.inkTanks.canPay(colour, price);
  }

  /**
   * Charges a Stroke just made its price, Piece by Piece for a Line, and adds
   * it to the history. What each paid is fixed now: undoing or breaking the
   * Line under a free part later charges nothing.
   */
  private charge(stroke: AddedStroke): void {
    const { id, colour } = stroke;
    const wave = this.paidIn;
    if (stroke.kind === 'object') {
      const price = this.linePrice(stroke.ink);
      this.inkTanks.spend(colour, price);
      this.strokes.set(id, { kind: 'object', paid: { colour, price, wave } });
    } else {
      const pieces = new Map(this.piecePrices(stroke).map((price, index) => [index, price]));
      for (const price of pieces.values()) this.inkTanks.spend(colour, price);
      this.strokes.set(id, { kind: 'line', colour, wave, pieces });
    }
    this.undoHistory.push({ kind: 'stroke', id });
  }

  /**
   * Gives back what was paid, never filling a Tank beyond its maximum: to
   * the part it was paid from. During a Wave, that is its Wave Ink for what
   * was paid in it, and Locked Ink for what was paid before it; outside a
   * Wave, all of it is spendable.
   */
  private refund(paid: Paid | undefined): void {
    if (!paid?.colour || paid.price === 0) return;
    const part = this.current && paid.wave !== this.current.number ? 'locked' : 'spendable';
    this.inkTanks.refund(paid.colour, paid.price, part);
  }

  /**
   * Takes a kill's Drop into the Tanks as Wave Ink: what doesn't fit is
   * lost. With Ink costs off, Ink is unlimited and a Drop changes nothing.
   */
  private pickUp(ink: DropInk): void {
    if (!this.costs) return;
    for (const colour of COLOURS) this.inkTanks.pickUp(colour, ink[colour]);
  }

  /** Refunds what a Stroke still there paid: an Object's Outline and Fill, a Line's Pieces. */
  private refundStroke(id: StrokeId, charge: Charge | undefined): void {
    if (charge?.kind === 'object') {
      this.refund(charge.paid);
      this.refund(this.fills.get(id));
    } else if (charge) {
      const { colour, wave } = charge;
      for (const price of charge.pieces.values()) this.refund({ colour, price, wave });
    }
  }

  /** Forgets a Stroke that is gone, with its Fill, and takes it out of the undo history. */
  private forget(id: StrokeId): void {
    this.strokes.delete(id);
    this.fills.delete(id);
    this.undoHistory = this.undoHistory.filter((action) => action.id !== id);
  }

  /** Reads what happened since it last read. */
  private catchUp(): void {
    for (const entry of this.reader.read()) this.hear(entry);
  }

  /**
   * Learns from what happened: a Stroke or a Fill made below the Game joins
   * the history at price 0, and one that broke, was erased or removed is
   * gone from it, the erased ones refunded. What undo took back, the Game
   * already knows.
   */
  private hear(entry: Entry): void {
    switch (entry.kind) {
      case 'added':
        return this.heardAdded(entry.what);
      case 'filled':
        if (entry.fill && !this.fills.has(entry.id)) {
          this.fills.set(entry.id, { colour: null, price: 0, wave: null });
          this.undoHistory.push({ kind: 'fill', id: entry.id });
        }
        return;
      case 'went':
        if (entry.why !== 'undone') this.heardWent(entry.what, entry.why === 'erased');
        return;
      case 'start-over':
        // Something below the Game started over: nothing it knew of is left, as after a clear.
        this.current = null;
        this.inkTanks.fill();
        this.strokes.clear();
        this.fills.clear();
        this.undoHistory = [];
        return;
      case 'dropped':
        return this.pickUp(entry.ink);
      case 'released':
      case 'burst':
      case 'popped':
      case 'exploded':
        // None makes or takes away a Stroke or a Fill.
        return;
    }
  }

  private heardAdded(what: Extract<Entry, { kind: 'added' }>['what']): void {
    if (what.thing === 'object' && !this.strokes.has(what.id)) {
      this.strokes.set(what.id, { kind: 'object', paid: { colour: null, price: 0, wave: null } });
      this.undoHistory.push({ kind: 'stroke', id: what.id });
    } else if (what.thing === 'piece') {
      const charge = this.strokes.get(what.id);
      if (charge?.kind === 'line') {
        if (charge.colour === null) charge.pieces.set(what.index, 0);
        return;
      }
      this.strokes.set(what.id, {
        kind: 'line',
        colour: null,
        wave: null,
        pieces: new Map([[what.index, 0]]),
      });
      this.undoHistory.push({ kind: 'stroke', id: what.id });
    }
  }

  /** A Piece or an Object went for good: broken, erased or removed. Only the erased is refunded. */
  private heardWent(what: Extract<Entry, { kind: 'went' }>['what'], erased: boolean): void {
    const charge = this.strokes.get(what.id);
    if (what.thing === 'object' && charge?.kind === 'object') {
      if (erased) this.refundStroke(what.id, charge);
      this.forget(what.id);
    } else if (what.thing === 'piece' && charge?.kind === 'line') {
      const price = charge.pieces.get(what.index);
      if (erased) this.refund({ colour: charge.colour, price: price ?? 0, wave: charge.wave });
      charge.pieces.delete(what.index);
      if (charge.pieces.size === 0) this.forget(what.id);
    }
  }

  private takeSnapshot(): Snapshot {
    return {
      tanks: this.inkTanks.snapshot(),
      strokes: copyCharges(this.strokes),
      fills: new Map(this.fills),
      history: [...this.undoHistory],
    };
  }

  private restore(snapshot: Snapshot): void {
    // A maximum lowered since the snapshot still holds: edits survive R.
    this.inkTanks.restore(snapshot.tanks);
    this.strokes = copyCharges(snapshot.strokes);
    this.fills = new Map(snapshot.fills);
    this.undoHistory = [...snapshot.history];
  }
}

/** A copy of what Strokes paid, with each Line's Pieces its own. */
function copyCharges(charges: ReadonlyMap<StrokeId, Charge>): Map<StrokeId, Charge> {
  return new Map(
    [...charges].map(([id, charge]) => [
      id,
      charge.kind === 'line' ? { ...charge, pieces: new Map(charge.pieces) } : charge,
    ]),
  );
}
