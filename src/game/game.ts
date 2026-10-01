import { capsuleOverlapsPolygon } from '../geometry/overlap';
import type { Polygon } from '../geometry/polygon';
import { transformPoints } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import {
  SandboxWorld,
  type AddedStroke,
  type DropInk,
  type EnemyView,
  type Entry,
  type FillOutcome,
  type MadeStroke,
  type Reader,
  type SandboxWorldOptions,
  type StepHooks,
  type StrokeId,
  type StrokeOutcome,
} from '../sandbox/sandbox-world';
import {
  DefenceLoop,
  FIRST_INTERMISSION,
  isBar,
  type Bar,
  type BuildAction,
  type LoopPosition,
} from './defence-loop';
import type { StressTest } from '../stress-tests/stress-test';
import { checkArenaSize, type Level } from './level';
import { createInkTable, type InkTable, type ReadonlyInkTable } from './ink-table';
import { InkTanks, type TankReadings, type TanksState } from './ink-tanks';
import { createWaveTable, type WaveTable } from './wave-table';

/** What a Stroke the Game was asked for became. */
export type GameStrokeOutcome =
  | Exclude<StrokeOutcome, { readonly kind: 'declined' }>
  /**
   * It was refused for its Colour, so nothing was made: the Level doesn't
   * have it, or it cost more than its Tank holds. `path` is what it would have been.
   */
  | {
      readonly kind: 'refused';
      readonly reason: ColourRefusal;
      readonly colour: Colour;
      /** Its price, px². */
      readonly price: number;
      readonly path: readonly Vec2[];
    }
  /**
   * It was barred, so nothing was made: drawn once the Ink Core is
   * destroyed, in an Intermission or once the Level is cleared, or during a
   * Wave, too near an Enemy. `path` is what it would have been.
   */
  | { readonly kind: 'barred'; readonly reason: Bar; readonly path: readonly Vec2[] };

/** What a Fill click the Game was asked for did. */
export type GameFillOutcome =
  | Exclude<FillOutcome, { readonly kind: 'declined' }>
  /**
   * It was refused for its Colour, so the Object stays hollow: the Level
   * doesn't have it, or it cost more than its Tank holds. `outline` is where it is now.
   */
  | {
      readonly kind: 'refused';
      readonly reason: ColourRefusal;
      readonly id: StrokeId;
      readonly colour: Colour;
      /** Its price, px². */
      readonly price: number;
      readonly outline: Polygon;
    }
  /**
   * The click was barred (`reason`): once the Ink Core is destroyed, or with
   * Waves on, outside a Wave. The Object stays hollow.
   */
  | {
      readonly kind: 'barred';
      readonly reason: Bar;
      readonly id: StrokeId;
      readonly outline: Polygon;
    };

export type { Bar };

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
 * looked: the Ink it would take, what it would run into, and whether it
 * comes too near an Enemy. `prospect` prices it. Its readers keep it while
 * what was looked at stays the same.
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
    /** Whether a Stroke's raw samples come closer to an Enemy than its width; never for a Fill. */
    readonly nearEnemy: boolean;
  };

/** Why a Stroke or a Fill would be refused. */
export type Refusal =
  /** A closing Stroke's Object would overlap the Terrain or an Object. */
  'overlaps' | Bar | ColourRefusal;

/**
 * Why a Stroke or a Fill would be refused for its Colour: the Level doesn't
 * have it (its Tank maximum is 0), checked before the price; or it costs more
 * than its Colour's Tank holds.
 */
export type ColourRefusal = 'not-in-level' | 'not-enough';

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
 */
interface Paid {
  readonly colour: Colour | null;
  readonly price: number;
}

/** What a Stroke in the Arena paid: an Object for its Outline, a Line Piece by Piece. */
type Charge =
  | { readonly kind: 'object'; readonly paid: Paid }
  | {
      readonly kind: 'line';
      readonly colour: Colour | null;
      /** What each Piece still standing paid, by its index. */
      readonly pieces: Map<number, number>;
    };

/**
 * Everything R brings back of the Game: the Tanks, what was paid, the undo
 * history and where the Defence loop was. The Sandbox world keeps its own
 * snapshot, taken as physics starts, with this.
 */
interface Checkpoint {
  readonly tanks: TanksState;
  readonly strokes: ReadonlyMap<StrokeId, Charge>;
  readonly fills: ReadonlyMap<StrokeId, Paid>;
  readonly history: readonly Action[];
  readonly loop: LoopPosition;
}

export interface GameOptions {
  /** Whether Strokes and Fills cost Ink. Off, Ink is unlimited. */
  readonly inkCosts: boolean;
  /** Whether the Game has Waves and Intermissions; off by default. */
  readonly waves?: boolean;
  /** PROVISIONAL: whether the player may build outside a Wave too; on by default (see `DefenceLoopOptions`). */
  readonly buildBetweenWaves?: boolean;
  /** The Wave table of the only Wave until a Level brings its own; defaults to a fresh copy of the defaults. */
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
 * and Fill paid, the undo history, and the checkpoint of all of these and
 * of the Defence loop's position that R goes back to. It issues the Sandbox
 * world's commands, prices the Ink they report and refuses what a Tank can't
 * pay for, and reads the list of what happened to learn what broke or was
 * erased. It never measures Ink itself, and leaves the Tank arithmetic to
 * the Ink Tanks.
 *
 * Strokes and Fills made below it, by a demo or a stress test, join the
 * undo history at price 0 when it reads that they were added.
 *
 * Its Defence loop owns the phases: with the Waves switch on, the Level's
 * Waves, each started by Space from an Intermission, which refills the
 * Tanks; and Waves on or off, what Space does and stopping once the Ink Core
 * is destroyed. The Sandbox world knows nothing of phases.
 *
 * Every kill's Drop, which the Sandbox world reports in the list of what
 * happened, goes straight into the Tanks, Waves on or off (ADR 0012).
 *
 * With Waves on, drawing, filling, erasing and undo happen only during a
 * Wave, paused or running, Ink costs on or off; there, a Stroke may be drawn
 * anywhere but near an Enemy. Releasing works anywhere.
 */
export class Game {
  readonly world: SandboxWorld;
  /** The phases: read it and edit its Wave table; the Waves switch and Space go through the Game. */
  readonly defence: DefenceLoop;
  private readonly table: InkTable;
  private readonly inkTanks: InkTanks;
  private costs: boolean;
  /** What each Stroke still in the Arena paid, by id. */
  private strokes = new Map<StrokeId, Charge>();
  /** What each Fill still in the Arena paid, by its Object's id. */
  private fills = new Map<StrokeId, Paid>();
  /** Strokes and Fills in the order they were made, for undo. */
  private undoHistory: Action[] = [];
  /**
   * Taken whenever physics starts, as the world takes its own snapshot: with
   * Waves on, as a Wave starts. R returns to it.
   */
  private checkpoint: Checkpoint | null = null;
  private readonly reader: Reader;
  /** The Defence loop's hooks, with what happened in the step read in between. */
  private readonly hooks: StepHooks;

  constructor(options: GameOptions) {
    this.world = options.world ?? new SandboxWorld(options.worldOptions);
    this.table = options.ink ?? createInkTable();
    this.costs = options.inkCosts;
    this.inkTanks = new InkTanks(this.table);
    this.reader = this.world.happenings.reader();
    this.hooks = {
      before: () => this.defence.hooks.before?.(),
      // The Drops of the step's kills count for the Wave before it can end.
      after: () => {
        this.catchUp();
        this.defence.hooks.after?.();
      },
    };
    this.defence = new DefenceLoop({
      world: this.world,
      tanks: this.inkTanks,
      table: options.wave ?? createWaveTable(),
      waves: options.waves ?? false,
      buildBetweenWaves: options.buildBetweenWaves,
    });
  }

  /** Whether Strokes and Fills cost Ink. Turning it off or on leaves the Tanks as they are. */
  get inkCosts(): boolean {
    return this.costs;
  }

  set inkCosts(on: boolean) {
    this.costs = on;
  }

  /**
   * The Waves switch, as the Defence loop has it: off, no Wave or
   * Intermission; turning it on pauses physics in an Intermission. Loading
   * a Level with its own Waves turns it on.
   */
  get waves(): boolean {
    return this.defence.waves;
  }

  set waves(on: boolean) {
    this.defence.waves = on;
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

  /** Whether this Level has `colour`: a Tank maximum of 0 means it doesn't, Ink costs on or off. */
  has(colour: Colour): boolean {
    return this.table.tanks[colour] > 0;
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
   * pays for all of its Outline. It is barred whenever the Defence loop bars
   * drawing: once the Ink Core is destroyed, with Waves on outside a Wave,
   * and during one when its raw samples come too near an Enemy. One that
   * costs more than the Tank holds is refused.
   */
  submitStroke(samples: readonly Vec2[], colour: Colour): GameStrokeOutcome {
    this.catchUp();
    // The Stroke pipeline keeps a Stroke within its samples.
    const nearEnemy = this.nearEnemy(samples);
    const refusal = (made: MadeStroke) =>
      this.refusal('draw', false, nearEnemy, made.colour, this.priceOf(made));
    const outcome = this.world.submitStroke(samples, colour, {
      accept: (made) => refusal(made) === null,
    });
    switch (outcome.kind) {
      case 'declined': {
        const { made, path } = outcome;
        const reason = refusal(made);
        if (isBar(reason)) return { kind: 'barred', reason, path };
        return {
          kind: 'refused',
          reason: reason === 'not-in-level' ? reason : 'not-enough',
          colour: made.colour,
          price: this.priceOf(made),
          path,
        };
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
   * its Ink to `colour`'s Tank. It is barred whenever the Defence loop bars
   * filling; a Fill that costs more than the Tank holds is refused. Either
   * way, the Object stays hollow.
   */
  fillAt(point: Vec2, colour: Colour): GameFillOutcome {
    this.catchUp();
    const refusal = (ink: number) =>
      this.refusal('fill', false, false, colour, this.fillPrice(ink));
    const outcome = this.world.fillAt(point, colour, {
      accept: (fill) => refusal(fill.ink) === null,
    });
    switch (outcome.kind) {
      case 'declined': {
        const { id, outline, ink } = outcome;
        const reason = refusal(ink);
        if (isBar(reason)) return { kind: 'barred', reason, id, outline };
        return {
          kind: 'refused',
          reason: reason === 'not-in-level' ? reason : 'not-enough',
          id,
          colour,
          price: this.fillPrice(ink),
          outline,
        };
      }
      case 'filled': {
        const price = this.fillPrice(outcome.ink);
        this.inkTanks.spend(colour, price);
        this.fills.set(outcome.id, { colour, price });
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
    const nearEnemy = this.nearEnemy(samples);
    if (!closes) return { kind: 'line', ink, onLines, nearEnemy };
    const result = this.world.previewStroke(samples);
    const overlaps = result.kind === 'rejected' && result.reason === 'overlaps';
    return { kind: 'object', ink, overlaps, nearEnemy };
  }

  /**
   * Looks at the Fill a click at `point` would make now. Null over nothing,
   * or over an Object that is already filled.
   */
  lookAtFill(point: Vec2): Look | null {
    const ink = this.world.fillInkAt(point);
    return ink === null ? null : { kind: 'fill', ink, nearEnemy: false };
  }

  /**
   * What `look` would do in `colour`, priced now: an Object pays for all of
   * its Outline, a Line for the part not lying on another Line, a Fill for
   * its Ink. It is barred first, as the Defence loop says, then an overlap
   * refuses it, then a price its Tank can't pay. The phase, the Tanks, the
   * Ink table and the Ink costs switch are read as they are now, whenever
   * the look was taken.
   */
  prospect(look: Look, colour: Colour): Prospect {
    const price = this.lookPrice(look);
    const cost = this.costs ? this.estimate(colour, price) : null;
    const overlaps = look.kind === 'object' && look.overlaps;
    return {
      kind: look.kind,
      refusal: this.refusal(
        look.kind === 'fill' ? 'fill' : 'draw',
        overlaps,
        look.nearEnemy,
        colour,
        price,
      ),
      cost,
    };
  }

  /**
   * Why `action` would be refused now, the first reason of those it runs
   * into: whatever the Defence loop bars it for (`nearEnemy` says whether a
   * Stroke comes too near an Enemy); an overlap; a Colour the Level doesn't
   * have; then a price `colour`'s Tank can't pay. Null if it wouldn't be.
   */
  private refusal(
    action: BuildAction,
    overlaps: boolean,
    nearEnemy: boolean,
    colour: Colour,
    price: number,
  ): Refusal | null {
    const bar = this.defence.bar(action, { nearEnemy });
    if (bar) return bar;
    if (overlaps) return 'overlaps';
    if (!this.has(colour)) return 'not-in-level';
    return this.affords(colour, price) ? null : 'not-enough';
  }

  /**
   * Whether a Stroke along `samples` comes closer to any Enemy than about
   * that Enemy's width: so close it would be drawn onto it.
   */
  private nearEnemy(samples: readonly Vec2[]): boolean {
    if (samples.length === 0) return false;
    return this.world.enemies.some((enemy) => strokeNear(samples, enemy));
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
   * Droplets and Patches are a broken Fill's, and that Ink is spent. It
   * erases nothing while the Defence loop bars erasing.
   */
  eraseAlong(path: readonly Vec2[], radius: number): void {
    if (this.defence.bar('erase')) return;
    this.catchUp();
    this.world.eraseAlong(path, radius);
    this.catchUp();
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists, and refunds
   * exactly what was paid for it: a Fill's price, an Object's Outline's, or
   * a Line's standing Pieces'. Broken Objects, and Lines whose every Piece
   * broke, are gone from the history, so undo skips them. It does nothing
   * while the Defence loop bars undo (see its PROVISIONAL note).
   */
  undo(): void {
    if (this.defence.bar('undo')) return;
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
   * Space, as the Defence loop says: with Waves off, starts or pauses
   * physics; with Waves on, starts the next Wave from an Intermission, and
   * during a Wave only pauses and runs. Every start takes the checkpoint of
   * the Tanks, what was paid, the undo history and the Defence loop's
   * position, then starts the Sandbox world, which takes its own snapshot:
   * with Waves on, the Intermission right after the refill. Once the Ink
   * Core is destroyed, or the Level is cleared, it starts nothing until R or
   * Clear.
   */
  togglePause(): void {
    this.catchUp();
    switch (this.defence.space()) {
      case 'start':
        this.checkpoint = this.takeCheckpoint();
        return this.world.togglePause();
      case 'resume':
        return this.world.resume();
      case 'pause':
        return this.world.pause();
      case null:
        return;
    }
  }

  /**
   * R: takes the world back to the moment physics last started, and the
   * Tanks, what was paid, the undo history and the Defence loop with it.
   * With Waves on, that retries the Wave started then: the Intermission
   * before it, right after the refill, with its Enemies all to come again.
   * Does nothing before the first start.
   */
  reset(): void {
    const checkpoint = this.checkpoint;
    if (!checkpoint) return;
    this.world.reset();
    // Everything comes back as it was at the checkpoint, which already knows
    // it: hearing the start-over would forget the checkpoint itself.
    this.reader.read();
    this.restore(checkpoint);
  }

  /**
   * Loads `level` (CONTEXT.md): removes every Stroke and Fill, the Rubble,
   * Droplets, Patches and Blasts, puts the world on the Level's Arena (the
   * sandbox Arena if it has none), makes the Wave list a copy of its Waves
   * (one Wave, the current table, if it has none) and sets its Tank
   * maximums, if it has them. The world starts over, so the Game forgets
   * everything (see `hear`): every Tank filled, the undo history empty, R
   * with nothing to go back to. Then the Level's build, if it has one,
   * builds on the Sandbox world below the Game, for free: a gallery demo or
   * a stress test. What it makes joins the undo history at price 0, and if
   * it started physics, R goes back to how it left the world. A Level with
   * its own Waves turns the Waves switch on; one without leaves it as it is.
   * The Defence loop then loads the Level's Waves: with Waves on, the Game
   * is in the first Wave's Intermission, and a build that started physics is
   * paused where it left it. Clear loads the Level again: back to Wave 1.
   * Returns what the build returned: a stress test's `StressTest`.
   */
  load(level: Level): StressTest | undefined {
    const { arena, waves, tanks, build } = level;
    if (arena) checkArenaSize(arena);
    if (tanks) this.table.tanks = { ...tanks };
    this.world.clear(arena);
    const stressTest = build?.(this.world) ?? undefined;
    this.catchUp();
    // A build starts physics as its last act, so the world's snapshot is of now.
    const started = this.world.isRunning;
    if (waves && waves.length > 0) this.defence.waves = true;
    this.defence.load(waves);
    if (started) this.checkpoint = this.takeCheckpoint();
    return stressTest;
  }

  /**
   * Advances by real elapsed time, as the Sandbox world does, sending in a
   * Wave's Enemies and ending it step by step. Returns the steps taken.
   */
  advance(seconds: number): number {
    const steps = this.world.advance(seconds, this.hooks);
    this.catchUp();
    return steps;
  }

  /** Advances physics by one fixed step, if running, as `advance` does. */
  step(): void {
    this.world.step(this.hooks);
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
    if (stroke.kind === 'object') {
      const price = this.linePrice(stroke.ink);
      this.inkTanks.spend(colour, price);
      this.strokes.set(id, { kind: 'object', paid: { colour, price } });
    } else {
      const pieces = new Map(this.piecePrices(stroke).map((price, index) => [index, price]));
      for (const price of pieces.values()) this.inkTanks.spend(colour, price);
      this.strokes.set(id, { kind: 'line', colour, pieces });
    }
    this.undoHistory.push({ kind: 'stroke', id });
  }

  /** Gives back what was paid, never filling a Tank beyond its maximum. */
  private refund(paid: Paid | undefined): void {
    if (!paid?.colour || paid.price === 0) return;
    this.inkTanks.refund(paid.colour, paid.price);
  }

  /**
   * Takes a kill's Drop straight into the Tanks: what doesn't fit is lost.
   * With Ink costs off, Ink is unlimited and a Drop changes nothing. The
   * Defence loop counts the kill, and what the Tanks took, for the Wave.
   */
  private pickUp(ink: DropInk): void {
    const taken = Object.fromEntries(
      COLOURS.map((colour) => [colour, this.costs ? this.inkTanks.pickUp(colour, ink[colour]) : 0]),
    ) as Record<Colour, number>;
    this.defence.killed(taken);
  }

  /** Refunds what a Stroke still there paid: an Object's Outline and Fill, a Line's Pieces. */
  private refundStroke(id: StrokeId, charge: Charge | undefined): void {
    if (charge?.kind === 'object') {
      this.refund(charge.paid);
      this.refund(this.fills.get(id));
    } else if (charge) {
      const { colour } = charge;
      for (const price of charge.pieces.values()) this.refund({ colour, price });
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
   * already knows. When the world starts over, the Game forgets everything,
   * the one place it does: every Tank filled, nothing paid, the undo history
   * empty, no checkpoint, and the Defence loop in the first Wave's
   * Intermission.
   */
  private hear(entry: Entry): void {
    switch (entry.kind) {
      case 'added':
        return this.heardAdded(entry.what);
      case 'filled':
        if (entry.fill && !this.fills.has(entry.id)) {
          this.fills.set(entry.id, { colour: null, price: 0 });
          this.undoHistory.push({ kind: 'fill', id: entry.id });
        }
        return;
      case 'went':
        if (entry.why !== 'undone') this.heardWent(entry.what, entry.why === 'erased');
        return;
      case 'start-over':
        // The world was cleared (Clear, or below the Game) or reset below the
        // Game: nothing the Game knew of is left, nor anything to go back to.
        // R hears none of its own.
        this.inkTanks.fill();
        this.strokes.clear();
        this.fills.clear();
        this.undoHistory = [];
        this.checkpoint = null;
        this.defence.restore(FIRST_INTERMISSION);
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
      this.strokes.set(what.id, { kind: 'object', paid: { colour: null, price: 0 } });
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
      if (erased) this.refund({ colour: charge.colour, price: price ?? 0 });
      charge.pieces.delete(what.index);
      if (charge.pieces.size === 0) this.forget(what.id);
    }
  }

  private takeCheckpoint(): Checkpoint {
    return {
      tanks: this.inkTanks.snapshot(),
      strokes: copyCharges(this.strokes),
      fills: new Map(this.fills),
      history: [...this.undoHistory],
      loop: this.defence.snapshot(),
    };
  }

  private restore(checkpoint: Checkpoint): void {
    // A maximum lowered since the checkpoint still holds: edits survive R, as
    // F2 edits to the Wave tables do.
    this.inkTanks.restore(checkpoint.tanks);
    this.strokes = copyCharges(checkpoint.strokes);
    this.fills = new Map(checkpoint.fills);
    this.undoHistory = [...checkpoint.history];
    this.defence.restore(checkpoint.loop);
  }
}

/**
 * Whether a Stroke along `samples` reaches closer to `enemy` than the
 * Enemy's width, from its outline where it is now.
 */
function strokeNear(samples: readonly Vec2[], enemy: EnemyView): boolean {
  const outline = transformPoints(enemy.outline, enemy.transform);
  if (samples.length === 1) {
    return capsuleOverlapsPolygon(samples[0]!, samples[0]!, enemy.width, outline, 0);
  }
  for (let k = 1; k < samples.length; k++) {
    if (capsuleOverlapsPolygon(samples[k - 1]!, samples[k]!, enemy.width, outline, 0)) return true;
  }
  return false;
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
