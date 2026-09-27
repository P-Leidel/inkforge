import { COLOURS, type Colour } from '../materials/colour';
import { fromLineLength, inLineLength, type ReadonlyInkTable } from './ink-table';

/** Leeway for rounding when a price is set against what a Tank holds, px². */
const EPSILON = 1e-6;
/** Leeway for rounding when Ink is floored to whole units of Line length. */
const UNIT_EPSILON = 1e-6;

/** One Tank as the player reads it. */
export interface TankReading {
  /** The Ink it holds that can be spent now, px². */
  readonly spendable: number;
  /** The most it holds, px². */
  readonly maximum: number;
  /** `spendable` in whole units of Line length, as its gauge shows it. */
  readonly units: number;
}

/** Every Tank as the player reads it. */
export type TankReadings = Readonly<Record<Colour, TankReading>>;

/** What every Tank holds, px²: the Tanks' whole state, and a snapshot of it. */
export type TanksState = Readonly<Record<Colour, number>>;

/**
 * The Ink Tanks: each Colour's Ink, in px². The maximums are the Ink
 * table's, which the F2 tuning panel edits; the Tanks read them from it.
 * They own spending and refunds, whether a price can be paid, filling
 * every Tank and emptying one down to a lowered maximum. They know nothing
 * of prices or of the Ink costs switch: with costs off, the Game prices
 * everything at 0, which the Tanks can always pay and never spend.
 */
export class InkTanks {
  private state: Record<Colour, number>;

  constructor(private readonly table: ReadonlyInkTable) {
    this.state = this.full();
  }

  /** Whether `colour`'s Tank can pay `price`, allowing for rounding. */
  canPay(colour: Colour, price: number): boolean {
    return price <= this.state[colour] + EPSILON;
  }

  /** Takes `price` from `colour`'s Tank, never below 0. */
  spend(colour: Colour, price: number): void {
    this.state[colour] = Math.max(0, this.state[colour] - price);
  }

  /** Gives `price` back to `colour`'s Tank, never beyond its maximum. */
  refund(colour: Colour, price: number): void {
    this.state[colour] = Math.min(this.maximum(colour), this.state[colour] + price);
  }

  /** Fills every Tank to its maximum. */
  fill(): void {
    this.state = this.full();
  }

  /**
   * Empties each Tank down to its maximum if it holds more: call it once the
   * maximums were edited. A raised maximum leaves its Tank as it is.
   */
  fitMaximums(): void {
    this.state = this.withinMaximums(this.state);
  }

  /** A copy of what every Tank holds, to `restore` later. */
  snapshot(): TanksState {
    return { ...this.state };
  }

  /** Goes back to `snapshot`, each Tank within its maximum now, lowered or not since. */
  restore(snapshot: TanksState): void {
    this.state = this.withinMaximums(snapshot);
  }

  /** Every Tank's reading, worked out now. */
  reading(): TankReadings {
    return Object.fromEntries(
      COLOURS.map((colour) => {
        const spendable = this.state[colour];
        const units = Math.floor(inLineLength(spendable) + UNIT_EPSILON);
        return [colour, { spendable, maximum: this.maximum(colour), units }];
      }),
    ) as Record<Colour, TankReading>;
  }

  private maximum(colour: Colour): number {
    return fromLineLength(this.table.tanks[colour]);
  }

  private full(): Record<Colour, number> {
    return Object.fromEntries(COLOURS.map((colour) => [colour, this.maximum(colour)])) as Record<
      Colour,
      number
    >;
  }

  private withinMaximums(tanks: TanksState): Record<Colour, number> {
    return Object.fromEntries(
      COLOURS.map((colour) => [colour, Math.max(0, Math.min(tanks[colour], this.maximum(colour)))]),
    ) as Record<Colour, number>;
  }
}
