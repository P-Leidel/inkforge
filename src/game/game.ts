import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import {
  SandboxWorld,
  type AddedStroke,
  type DropInk,
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
  type Bar,
  type BuildAction,
  type LoopPosition,
  type Rules,
} from './defence-loop';
import type { StressTest } from '../stress-tests/stress-test';
import { checkArenaSize, type Level } from './level';
import { createInkTable, type InkTable, type ReadonlyInkTable } from './ink-table';
import { InkTanks, type TankReadings, type TanksState } from './ink-tanks';
import type { Refusal } from './refusal';
import { createWaveTable, type WaveTable } from './wave-table';

/** What a Stroke the Game was asked for became. */
export type GameStrokeOutcome =
  | Exclude<StrokeOutcome, { readonly kind: 'declined' }>
  /**
   * It was refused (`reason`), so nothing was made: drawn once the Ink Core
   * is destroyed, when the Defence loop bars drawing, too near an Enemy
   * during a Wave, in a Colour the Level doesn't have, or costing more than
   * its Tank holds. `path` is what it would have been.
   */
  | {
      readonly kind: 'refused';
      readonly reason: Refusal;
      readonly colour: Colour;
      /** Its price, px². */
      readonly price: number;
      readonly path: readonly Vec2[];
    };

/** What a Fill click the Game was asked for did. */
export type GameFillOutcome =
  | Exclude<FillOutcome, { readonly kind: 'declined' }>
  /**
   * It was refused (`reason`), so the Object stays hollow: once the Ink Core
   * is destroyed, when the Defence loop bars filling, in a Colour the Level
   * doesn't have, or costing more than its Tank holds. `outline` is where
   * it is now.
   */
  | {
      readonly kind: 'refused';
      readonly reason: Refusal;
      readonly id: StrokeId;
      readonly colour: Colour;
      /** Its price, px². */
      readonly price: number;
      readonly outline: Polygon;
    };

/** What the Eraser did along its path: removed something, found nothing there, or was refused. */
export type EraseOutcome =
  | { readonly kind: 'erased' }
  | { readonly kind: 'missed' }
  | { readonly kind: 'refused'; readonly reason: Refusal };

/** What undo did: took back a Stroke or a Fill, found nothing to take back, or was refused. */
export type UndoOutcome =
  | { readonly kind: 'undone'; readonly action: Action }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'refused'; readonly reason: Refusal };

/** What sending in an Enemy did: sent it in, or was refused. */
export type SpawnOutcome =
  { readonly kind: 'spawned' } | { readonly kind: 'refused'; readonly reason: Refusal };

/**
 * What the player may do now, the one reading of it: whether the sandbox
 * tools are on hand, and for each command that can be barred, the Bar that
 * stops it now, or null. Near an Enemy depends on a Stroke's samples, so it
 * is never here: it is in a Stroke's outcome and prospect. Release works
 * anywhere, and Space says what it does itself.
 */
export interface Allowed {
  /** Whether the Eraser is on hand: always, in the Campaign as in Free play. */
  readonly eraser: boolean;
  /** Whether sending in Enemies (Shift+1–3) is on hand: in Free play, never in a Campaign Level. */
  readonly spawning: boolean;
  readonly draw: Bar | null;
  readonly fill: Bar | null;
  readonly erase: Bar | null;
  readonly undo: Bar | null;
}

export type { Bar, Refusal };

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
  /**
   * A Stroke that doesn't close, as a Line along its raw samples, cut where
   * a new Line is, and whether it would be Grounded.
   */
  (
    | {
        readonly kind: 'line';
        readonly ink: number;
        readonly onLines: number;
        readonly grounded: boolean;
      }
    /** A closing Stroke, and whether its Object would overlap the Terrain or an Object. */
    | { readonly kind: 'object'; readonly ink: number; readonly overlaps: boolean }
    /** The Fill of the hollow Object under a point. */
    | { readonly kind: 'fill'; readonly ink: number }
  ) & {
    /** Whether a Stroke's raw samples come closer to an Enemy than its width; never for a Fill. */
    readonly nearEnemy: boolean;
  };

/** What a Stroke or a Fill would do if it were made now, without making it. */
export interface Prospect {
  /** What it would make: a Line, an Object (the Stroke closes) or a Fill. */
  readonly kind: Look['kind'];
  /** For a Line, whether it would hang Frozen, not Grounded; false for anything else. */
  readonly pinned: boolean;
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
  /** Whether Strokes and Fills cost Ink. Off, Ink is unlimited and every Colour on hand. */
  readonly inkCosts: boolean;
  /** Whether the Game has Waves and Intermissions; off by default. */
  readonly waves?: boolean;
  /** PROVISIONAL: the rules switches, F2's; a fresh copy of the defaults by default (see `Rules`). */
  readonly rules?: Rules;
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
 * With Waves on, drawing, filling, erasing and undo happen during a Wave,
 * paused or running, Ink costs on or off; there, a Stroke may be drawn
 * anywhere but near an Enemy. PROVISIONAL: the rules switches (`rules`)
 * also allow them between Waves and while a Wave is paused, and undo during
 * a Wave, all on by default. Releasing works anywhere.
 *
 * The Eraser is always on hand. Sending in Enemies is the sandbox tool, on
 * hand or put away (`sandboxTools`): put away, as in the Campaign, spawning
 * is refused. What the player may do now is read in one place, `allowed`.
 *
 * A Level is loaded whole: what it leaves out, its Tank maximums or its
 * Waves, comes from Free play (F2's Ink table and Waves switch), never from
 * the last Level. Its own apply on top only while it is played.
 */
export class Game {
  readonly world: SandboxWorld;
  /** The phases: read it and edit its Wave table; the Waves switch and Space go through the Game. */
  readonly defence: DefenceLoop;
  /** F2's Ink table: Free play's prices and Tank maximums, kept across every load. */
  private readonly table: InkTable;
  /** This play's copy of the Level's own Tank maximums; null if it has none. */
  private levelTanks: Record<Colour, number> | null = null;
  /** The Ink table in force: F2's prices, and the Level's Tanks if it has them, else F2's. */
  private readonly inForce: InkTable;
  /** F2's Waves switch: Free play's, kept across every load. */
  private freePlayWaves: boolean;
  /** This play's Waves switch, for a Level with its own Waves; null if it has none. */
  private levelWaves: boolean | null = null;
  private readonly inkTanks: InkTanks;
  private costs: boolean;
  private toolsOnHand = true;
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
    const table = (this.table = options.ink ?? createInkTable());
    const levelTanks = () => this.levelTanks;
    this.inForce = {
      get linePrice() {
        return table.linePrice;
      },
      set linePrice(price) {
        table.linePrice = price;
      },
      get fillPrice() {
        return table.fillPrice;
      },
      set fillPrice(price) {
        table.fillPrice = price;
      },
      get tanks() {
        return levelTanks() ?? table.tanks;
      },
      set tanks(tanks) {
        Object.assign(levelTanks() ?? table.tanks, tanks);
      },
    };
    this.costs = options.inkCosts;
    // An Enemy's Belly is only ever a Colour this Level has.
    this.world.bellyColours = (colour) => this.has(colour);
    this.freePlayWaves = options.waves ?? false;
    this.inkTanks = new InkTanks(this.inForce);
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
      rules: options.rules,
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
   * PROVISIONAL: the rules switches the Defence loop reads, edited in place
   * by F2. Not a table: lost on reload, and kept by loading a Level.
   */
  get rules(): Rules {
    return this.defence.rules;
  }

  /**
   * Whether the sandbox tool, sending in Enemies, is on hand: the Session
   * puts it away for a Campaign Level and back for Free play. Put away,
   * `spawn` is refused ('not-on-hand'). On hand by default. The Eraser is
   * not one: it is on hand in the Campaign too.
   */
  get sandboxTools(): boolean {
    return this.toolsOnHand;
  }

  set sandboxTools(onHand: boolean) {
    this.toolsOnHand = onHand;
  }

  /**
   * What the player may do now: whether the Eraser and sending in Enemies
   * are on hand, and what bars drawing, filling, erasing and undo, as the
   * Defence loop says.
   * The palette, the HUD, the scene's keys and drawing input read it here.
   */
  get allowed(): Allowed {
    const { defence } = this;
    return {
      eraser: true,
      spawning: this.toolsOnHand,
      draw: defence.bar('draw'),
      fill: defence.bar('fill'),
      erase: defence.bar('erase'),
      undo: defence.bar('undo'),
    };
  }

  /**
   * The Waves switch in force, as the Defence loop has it: off, no Wave or
   * Intermission; turning it on pauses physics in an Intermission. A Level
   * with its own Waves is played with Waves on, and switching them here only
   * lasts this play, until Clear or the next load; a Level without them
   * plays as Free play's switch says, and switching them here is Free
   * play's, kept across every load.
   */
  get waves(): boolean {
    return this.defence.waves;
  }

  set waves(on: boolean) {
    if (this.levelWaves === null) this.freePlayWaves = on;
    else this.levelWaves = on;
    this.defence.waves = on;
  }

  /**
   * Free play's Ink table, F2's: the prices and the Tank maximums of every
   * Level without Tanks of its own. A Level's own Tanks never touch it.
   */
  get ink(): ReadonlyInkTable {
    return this.table;
  }

  /**
   * The Ink table in force: Free play's prices, and the Level's own Tank
   * maximums if it has them (this play's copy), else Free play's. The
   * Tanks read it; F2 shows and edits it with `editInk`.
   */
  get inkInForce(): ReadonlyInkTable {
    return this.inForce;
  }

  /**
   * Edits the Ink table in force, as the F2 tuning panel does: the prices
   * are Free play's; the maximums are this play's copy of the Level's own
   * Tanks if it has them, lost on Clear or the next load, else Free play's.
   * A new price applies to the next Stroke or Fill: what was already
   * charged keeps its price, so undo refunds what was paid. Lowering a
   * maximum empties the Tank down to it at once; raising one leaves the
   * Tank as it is.
   */
  editInk(edit: (table: InkTable) => void): void {
    edit(this.inForce);
    this.inkTanks.fitMaximums();
  }

  /**
   * Whether this Level has `colour`: with Ink costs on, a Tank maximum of 0
   * in force means it doesn't. With Ink costs off, every Colour is on hand.
   */
  has(colour: Colour): boolean {
    return !this.costs || this.inForce.tanks[colour] > 0;
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
   * pays for all of its Outline. It is refused whenever the Defence loop
   * bars drawing: once the Ink Core is destroyed, with Waves on outside a
   * Wave, and during one when its raw samples come too near an Enemy; and in
   * a Colour the Level doesn't have, or costing more than the Tank holds.
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
        // The world declines only what `accept` refused.
        const reason = refusal(made)!;
        return { kind: 'refused', reason, colour: made.colour, price: this.priceOf(made), path };
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
   * its Ink to `colour`'s Tank. It is refused whenever the Defence loop bars
   * filling, in a Colour the Level doesn't have, or costing more than the
   * Tank holds; the Object then stays hollow.
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
        // The world declines only what `accept` refused.
        const reason = refusal(ink)!;
        return { kind: 'refused', reason, id, colour, price: this.fillPrice(ink), outline };
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
   * submitted now. Its Ink is measured on the samples as drawn; whether a
   * Line would be Grounded, and whether an Object would overlap, are asked
   * of the Stroke pipeline, as submitting would. Null with too few samples
   * to be anything.
   */
  lookAtStroke(samples: readonly Vec2[]): Look | null {
    if (samples.length < 2) return null;
    const { closes, ink, onLines } = this.world.measureSamples(samples);
    const nearEnemy = this.nearEnemy(samples);
    if (!closes) {
      const grounded = this.world.groundsSamples(samples);
      return { kind: 'line', ink, onLines, grounded, nearEnemy };
    }
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
      pinned: look.kind === 'line' && !look.grounded,
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
    return this.world.nearEnemy(samples);
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

  /** Releases the Frozen Object, or Run of a Line, under `point`, if physics is running. */
  releaseAt(point: Vec2): boolean {
    return this.world.releaseAt(point);
  }

  /**
   * Sends in an Enemy of `type` from the Spawn, paused or running: Shift+1.
   * It costs nothing and is not in the undo history. A sandbox tool: refused
   * while the sandbox tools are put away.
   */
  spawn(type: EnemyType): SpawnOutcome {
    if (!this.toolsOnHand) return { kind: 'refused', reason: 'not-on-hand' };
    this.catchUp();
    this.world.spawn(type);
    this.catchUp();
    return { kind: 'spawned' };
  }

  /**
   * The Eraser: removes what its brush passes over, and refunds what was
   * paid for it: an Object's Outline and Fill, a Piece's price. Rubble,
   * Droplets and Patches are a broken Fill's, and that Ink is spent. It is
   * on hand in the Campaign too, and refused only while the Defence loop
   * bars erasing.
   */
  eraseAlong(path: readonly Vec2[], radius: number): EraseOutcome {
    const bar = this.defence.bar('erase');
    if (bar) return { kind: 'refused', reason: bar };
    this.catchUp();
    const erased = this.world.eraseAlong(path, radius);
    this.catchUp();
    return { kind: erased > 0 ? 'erased' : 'missed' };
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists, and refunds
   * exactly what was paid for it: a Fill's price, an Object's Outline's, or
   * a Line's standing Pieces'. Broken Objects, and Lines whose every Piece
   * broke, are gone from the history, so undo skips them. It is refused
   * while the Defence loop bars undo (see its PROVISIONAL `Rules`).
   */
  undo(): UndoOutcome {
    const bar = this.defence.bar('undo');
    if (bar) return { kind: 'refused', reason: bar };
    this.catchUp();
    let undone: Action | null = null;
    for (let action = this.undoHistory.pop(); action; action = this.undoHistory.pop()) {
      if (this.takeBack(action)) {
        undone = action;
        break;
      }
    }
    this.catchUp();
    return undone ? { kind: 'undone', action: undone } : { kind: 'nothing' };
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
   * (one Wave, Free play's table, if it has none) and puts this play's copy
   * of its Tank maximums in force (Free play's, F2's, if it has none). The world starts over, so the Game forgets
   * everything (see `hear`): every Tank filled, the undo history empty, R
   * with nothing to go back to. Then the Level's build, if it has one,
   * builds on the Sandbox world below the Game, for free: a gallery demo or
   * a stress test. What it makes joins the undo history at price 0, and if
   * it started physics, R goes back to how it left the world. A Level with
   * its own Waves is played with Waves on; one without, as Free play's
   * Waves switch says. Nothing of the last Level carries over.
   * The Defence loop then loads the Level's Waves: with Waves on, the Game
   * is in the first Wave's Intermission, and a build that started physics is
   * paused where it left it. Clear loads the Level again: back to Wave 1.
   * Returns what the build returned: a stress test's `StressTest`.
   */
  load(level: Level): StressTest | undefined {
    const { arena, waves, tanks, build } = level;
    if (arena) checkArenaSize(arena);
    this.levelTanks = tanks ? { ...tanks } : null;
    this.levelWaves = waves && waves.length > 0 ? true : null;
    this.world.clear(arena);
    const stressTest = build?.(this.world) ?? undefined;
    this.catchUp();
    // A build starts physics as its last act, so the world's snapshot is of now.
    const started = this.world.isRunning;
    this.defence.waves = this.levelWaves ?? this.freePlayWaves;
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
        // An Enemy that reached the Ink Core is gone for the Wave, as a kill is.
        if (entry.what.thing === 'enemy' && entry.why === 'reached') this.defence.killed();
        // Undo told the Game already.
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
      case 'reformed':
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
      const { id } = what;
      const charge = this.strokes.get(id);
      if (charge?.kind === 'line') {
        if (charge.colour === null) charge.pieces.set(what.index, 0);
        return;
      }
      this.strokes.set(id, {
        kind: 'line',
        colour: null,
        pieces: new Map([[what.index, 0]]),
      });
      this.undoHistory.push({ kind: 'stroke', id });
    }
  }

  /** A Piece or an Object went for good: broken, erased or removed. Only the erased is refunded. */
  private heardWent(what: Extract<Entry, { kind: 'went' }>['what'], erased: boolean): void {
    const { id } = what;
    const charge = this.strokes.get(id);
    if (what.thing === 'object' && charge?.kind === 'object') {
      if (erased) this.refundStroke(id, charge);
      this.forget(id);
    } else if (what.thing === 'piece' && charge?.kind === 'line') {
      const price = charge.pieces.get(what.index);
      if (erased) this.refund({ colour: charge.colour, price: price ?? 0 });
      charge.pieces.delete(what.index);
      if (charge.pieces.size === 0) this.forget(id);
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

/** A copy of what Strokes paid, with each Line's Pieces its own. */
function copyCharges(charges: ReadonlyMap<StrokeId, Charge>): Map<StrokeId, Charge> {
  return new Map(
    [...charges].map(([id, charge]) => [
      id,
      charge.kind === 'line' ? { ...charge, pieces: new Map(charge.pieces) } : charge,
    ]),
  );
}
