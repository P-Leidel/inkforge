import type { Polygon } from '../geometry/polygon';
import { pathLength, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import {
  SandboxWorld,
  type AddedStroke,
  type Entry,
  type FillOutcome,
  type MadeStroke,
  type Reader,
  type SandboxWorldOptions,
  type StrokeId,
  type StrokeOutcome,
} from '../sandbox/sandbox-world';
import { outlineInk } from '../materials/ink';
import { closeRing, isClosingStroke } from '../stroke/close-detection';
import type { StrokeResult } from '../stroke/stroke-pipeline';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { createInkTable, type InkTable, type ReadonlyInkTable } from './ink-table';
import { InkTanks, type TankReadings, type TanksState } from './ink-tanks';

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
    };

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
    };

/** What something would cost before it is made, and whether its Tank can pay for it. */
export interface CostEstimate {
  readonly colour: Colour;
  /** Its price, px². */
  readonly price: number;
  /** Whether it costs more than `colour`'s Tank holds, so it would be refused. */
  readonly over: boolean;
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

/** Everything R brings back of the Game: the Tanks, what was paid and the undo history. */
interface Snapshot {
  readonly tanks: TanksState;
  readonly strokes: ReadonlyMap<StrokeId, Charge>;
  readonly fills: ReadonlyMap<StrokeId, Paid>;
  readonly history: readonly Action[];
}

export interface GameOptions {
  /** Whether Strokes and Fills cost Ink. Off, Ink is unlimited. */
  readonly inkCosts: boolean;
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
  /** Taken whenever physics starts; R returns to it. */
  private snapshot: Snapshot | null = null;
  private readonly reader: Reader;

  constructor(options: GameOptions) {
    this.world = options.world ?? new SandboxWorld(options.worldOptions);
    this.table = options.ink ?? createInkTable();
    this.costs = options.inkCosts;
    this.inkTanks = new InkTanks(this.table);
    this.reader = this.world.happenings.reader();
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
      else for (const price of charge.pieces.values()) add({ colour: charge.colour, price });
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
   * pays for all of its Outline. A Stroke that costs more than the Tank holds
   * is refused whole.
   */
  submitStroke(samples: readonly Vec2[], colour: Colour): GameStrokeOutcome {
    this.catchUp();
    const outcome = this.world.submitStroke(samples, colour, {
      accept: (made) => this.affords(made.colour, this.priceOf(made)),
    });
    switch (outcome.kind) {
      case 'declined': {
        const { made, path } = outcome;
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
   * its Ink to `colour`'s Tank. A Fill that costs more than the Tank holds is
   * refused, and the Object stays hollow.
   */
  fillAt(point: Vec2, colour: Colour): GameFillOutcome {
    this.catchUp();
    const outcome = this.world.fillAt(point, colour, {
      accept: (fill) => this.affords(fill.colour, this.fillPrice(fill.ink)),
    });
    switch (outcome.kind) {
      case 'declined': {
        const { id, outline, ink } = outcome;
        return { kind: 'refused', id, colour, price: this.fillPrice(ink), outline };
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
   * What a Stroke would become if it were submitted now, without adding it:
   * drawing input shows a refused Object in red while drawing.
   */
  previewStroke(samples: readonly Vec2[]): StrokeResult {
    return this.world.previewStroke(samples);
  }

  /**
   * What a Stroke with these raw samples would cost in `colour`, estimated
   * without the Stroke pipeline: a closing Stroke as an Object, its ring's
   * Outline, anything else as a Line along the samples, but for the part
   * lying on another Line. Null with Ink costs off, or with too few samples
   * to be anything.
   */
  estimateStroke(samples: readonly Vec2[], colour: Colour): CostEstimate | null {
    if (!this.costs || samples.length < 2) return null;
    const ink = isClosingStroke(samples)
      ? outlineInk(closeRing(samples))
      : pathLength(samples) * LINE_THICKNESS - this.world.inkOnLinesAlong(samples);
    return this.estimate(colour, this.linePrice(Math.max(0, ink)));
  }

  /**
   * What a Fill clicked at `point` in `colour` would cost. Null with Ink
   * costs off, over nothing, or over an Object that is already filled.
   */
  estimateFill(point: Vec2, colour: Colour): CostEstimate | null {
    if (!this.costs) return null;
    const ink = this.world.fillInkAt(point);
    return ink === null ? null : this.estimate(colour, this.fillPrice(ink));
  }

  private estimate(colour: Colour, price: number): CostEstimate {
    return { colour, price, over: !this.affords(colour, price) };
  }

  /** Releases the Frozen Object under `point`, if physics is running. */
  releaseAt(point: Vec2): boolean {
    return this.world.releaseAt(point);
  }

  /**
   * The Eraser: removes what its brush passes over, and refunds what was
   * paid for it: an Object's Outline and Fill, a Piece's price. Rubble,
   * Droplets and Patches are a broken Fill's, and that Ink is spent.
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
   * broke, are gone from the history, so undo skips them.
   */
  undo(): void {
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
   * Starts or pauses physics. Every start takes a snapshot of the Tanks,
   * what was paid and the undo history, next to the Sandbox world's.
   */
  togglePause(): void {
    this.catchUp();
    this.world.togglePause();
    if (this.world.isRunning) this.snapshot = this.takeSnapshot();
  }

  /**
   * R: takes the world back to the moment physics last started, and the
   * Tanks, what was paid and the undo history with it. Does nothing before
   * the first start.
   */
  reset(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
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
   * left the world.
   */
  clear(build?: (world: SandboxWorld) => void): void {
    this.world.clear();
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
    if (this.world.isRunning) this.snapshot = this.takeSnapshot();
  }

  /** Advances by real elapsed time, as the Sandbox world does. Returns the steps taken. */
  advance(seconds: number): number {
    const steps = this.world.advance(seconds);
    this.catchUp();
    return steps;
  }

  /** Advances physics by one fixed step, if running. */
  step(): void {
    this.world.step();
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
   * already knows.
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
        // Something below the Game started over: nothing it knew of is left, as after a clear.
        this.inkTanks.fill();
        this.strokes.clear();
        this.fills.clear();
        this.undoHistory = [];
        return;
      case 'released':
      case 'burst':
      case 'exploded':
        // Neither makes nor takes away a Stroke or a Fill.
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
      this.strokes.set(what.id, { kind: 'line', colour: null, pieces: new Map([[what.index, 0]]) });
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
