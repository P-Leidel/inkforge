import type { Colour } from '../materials/colour';
import type { Entry, RemovedFill, RemovedStroke, StrokeId } from '../sandbox/sandbox-world';
import type { InkTanks } from './ink-tanks';

/** One undo step: a Stroke, or the Fill of an Object. */
export interface Action {
  readonly kind: 'stroke' | 'fill';
  readonly id: StrokeId;
}

/**
 * Something just made, and what it costs, priced by the Game: an Object for
 * its Outline, a Line Piece by Piece, in order, a Fill for its Ink.
 */
export type Purchase =
  | {
      readonly kind: 'object';
      readonly id: StrokeId;
      readonly colour: Colour;
      readonly price: number;
    }
  | {
      readonly kind: 'line';
      readonly id: StrokeId;
      readonly colour: Colour;
      /** What each Piece costs, by its index. */
      readonly pieces: readonly number[];
    }
  | {
      readonly kind: 'fill';
      readonly id: StrokeId;
      readonly colour: Colour;
      readonly price: number;
    };

/** What undo takes back from: the Sandbox world, or a stand-in. */
export interface Undoable {
  removeStroke(id: StrokeId): Pick<RemovedStroke, 'kind'>;
  removeFill(id: StrokeId): Pick<RemovedFill, 'kind'>;
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

/** The ledger's whole state, and a snapshot of it: what was paid, and the undo history. */
export interface LedgerState {
  readonly strokes: ReadonlyMap<StrokeId, Charge>;
  readonly fills: ReadonlyMap<StrokeId, Paid>;
  readonly history: readonly Action[];
}

/**
 * The Ink ledger: what each Stroke and Fill still in the Arena paid, and
 * from which Tank, and the undo history. It charges the Tanks what the Game
 * priced, and gives back exactly what was paid, never more: undo refunds
 * what it takes back, and the Eraser what it erases, a Line's standing
 * Pieces' share only; what breaks, or is removed, is gone from it unrefunded.
 * It learns the rest by hearing what the Sandbox world says happened: what
 * is made below the Game (a demo, a stress test) joins the undo history at
 * price 0, and when the world starts over, it forgets everything. What each
 * thing paid is fixed when it is charged: a price edit, or the Line under a
 * free part going, changes no refund. It knows nothing of prices, Colours
 * on hand or the Defence loop: the Game decides what to charge and when.
 */
export class InkLedger {
  /** What each Stroke still in the Arena paid, by id. */
  private strokes = new Map<StrokeId, Charge>();
  /** What each Fill still in the Arena paid, by its Object's id. */
  private fills = new Map<StrokeId, Paid>();
  /** Strokes and Fills in the order they were made, for undo. */
  private undoHistory: Action[] = [];

  constructor(private readonly tanks: Pick<InkTanks, 'spend' | 'refund'>) {}

  /** The undo history, oldest first: what undo may take back. */
  get history(): readonly Action[] {
    return this.undoHistory;
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

  /** Charges what was just made its price, from its Colour's Tank, and adds it to the undo history. */
  charge(purchase: Purchase): void {
    const { id, colour } = purchase;
    switch (purchase.kind) {
      case 'object':
        this.tanks.spend(colour, purchase.price);
        this.strokes.set(id, { kind: 'object', paid: { colour, price: purchase.price } });
        this.undoHistory.push({ kind: 'stroke', id });
        return;
      case 'line': {
        const pieces = new Map(purchase.pieces.map((price, index) => [index, price]));
        for (const price of pieces.values()) this.tanks.spend(colour, price);
        this.strokes.set(id, { kind: 'line', colour, pieces });
        this.undoHistory.push({ kind: 'stroke', id });
        return;
      }
      case 'fill':
        this.tanks.spend(colour, purchase.price);
        this.fills.set(id, { colour, price: purchase.price });
        this.undoHistory.push({ kind: 'fill', id });
        return;
    }
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists from
   * `world`, and refunds exactly what was paid for it: a Fill's price, an
   * Object's Outline's and Fill's, or a Line's standing Pieces'. What is
   * gone already is skipped, and dropped from the history. Returns what it
   * took back, or null if nothing was left to.
   */
  undo(world: Undoable): Action | null {
    for (let action = this.undoHistory.pop(); action; action = this.undoHistory.pop()) {
      if (this.takeBack(action, world)) return action;
    }
    return null;
  }

  /**
   * Learns from what happened: a Stroke or a Fill made below the Game joins
   * the history at price 0, and one that broke, was erased or removed is
   * gone from it, the erased ones refunded. What undo took back, the ledger
   * already knows. When the world starts over, it forgets everything:
   * nothing paid, the undo history empty. Anything else changes nothing.
   */
  hear(entry: Entry): void {
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
        this.strokes.clear();
        this.fills.clear();
        this.undoHistory = [];
        return;
      case 'dropped':
      case 'released':
      case 'reformed':
      case 'burst':
      case 'popped':
      case 'exploded':
        // None makes or takes away a Stroke or a Fill.
        return;
    }
  }

  /** A copy of what was paid and the undo history, to `restore` later. */
  snapshot(): LedgerState {
    return {
      strokes: copyCharges(this.strokes),
      fills: new Map(this.fills),
      history: [...this.undoHistory],
    };
  }

  /** Goes back to `state`. The Tanks are the Game's to restore. */
  restore(state: LedgerState): void {
    this.strokes = copyCharges(state.strokes);
    this.fills = new Map(state.fills);
    this.undoHistory = [...state.history];
  }

  /** Takes back one undo step and refunds it; false if it was gone already. */
  private takeBack({ kind, id }: Action, world: Undoable): boolean {
    if (kind === 'fill') {
      const paid = this.fills.get(id);
      this.fills.delete(id);
      if (world.removeFill(id).kind === 'gone') return false;
      this.refund(paid);
      return true;
    }
    const charge = this.strokes.get(id);
    const gone = world.removeStroke(id).kind === 'gone';
    if (!gone) this.refundStroke(id, charge);
    this.forget(id);
    return !gone;
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

  /** Gives back what was paid, never filling a Tank beyond its maximum. */
  private refund(paid: Paid | undefined): void {
    if (!paid?.colour || paid.price === 0) return;
    this.tanks.refund(paid.colour, paid.price);
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
