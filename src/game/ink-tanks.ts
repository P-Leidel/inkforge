import { COLOURS, type Colour } from '../materials/colour';
import { fromLineLength, inLineLength, type ReadonlyInkTable } from './ink-table';

/** Leeway for rounding when a price is set against what a Tank holds, px². */
const EPSILON = 1e-6;
/** Leeway for rounding when Ink is floored to whole units of Line length. */
const UNIT_EPSILON = 1e-6;

/** One Tank as the player reads it. */
export interface TankReading {
  /** The Ink it holds that can be spent now, px²: during a Wave, its Wave Ink. */
  readonly spendable: number;
  /** The Locked Ink it holds, px²: it takes room but can't be spent. 0 outside a Wave. */
  readonly locked: number;
  /** The most it holds, Locked Ink and all, px². */
  readonly maximum: number;
  /** `spendable` in whole units of Line length, as its gauge shows it. */
  readonly units: number;
}

/** Every Tank as the player reads it. */
export type TankReadings = Readonly<Record<Colour, TankReading>>;

/** What one Tank holds, px². */
export interface TankState {
  readonly spendable: number;
  readonly locked: number;
}

/** What every Tank holds: the Tanks' whole state, and a snapshot of it. */
export type TanksState = Readonly<Record<Colour, TankState>>;

/** Which part of a Tank Ink goes back to. */
export type TankPart = 'spendable' | 'locked';

/**
 * The Ink Tanks: each Colour's Ink, in px². The maximums are the Ink
 * table's, which the F2 tuning panel edits; the Tanks read them from it.
 * They own spending and refunds, whether a price can be paid, filling
 * every Tank and emptying one down to a lowered maximum. They know nothing
 * of prices or of the Ink costs switch: with costs off, the Game prices
 * everything at 0, which the Tanks can always pay and never spend.
 *
 * Each Tank holds spendable Ink and Locked Ink. Outside a Wave all of it is
 * spendable. `lock` turns it all into Locked Ink as a Wave starts; from then
 * on what is spendable is the Wave Ink, which Drops (`pickUp`) bring in, and
 * `unlock` makes the Locked Ink spendable again as the Wave ends. Locked Ink
 * still takes room: no Tank ever holds more than its maximum in all.
 */
export class InkTanks {
  private state: Record<Colour, TankState>;

  constructor(private readonly table: ReadonlyInkTable) {
    this.state = this.full();
  }

  /** Whether `colour`'s Tank can pay `price` from its spendable Ink, allowing for rounding. */
  canPay(colour: Colour, price: number): boolean {
    return price <= this.state[colour].spendable + EPSILON;
  }

  /** Takes `price` from `colour`'s spendable Ink, never below 0. */
  spend(colour: Colour, price: number): void {
    const { spendable, locked } = this.state[colour];
    this.state[colour] = { spendable: Math.max(0, spendable - price), locked };
  }

  /**
   * Gives `price` back to `colour`'s Tank, to its spendable Ink or its Locked
   * Ink, never beyond its maximum.
   */
  refund(colour: Colour, price: number, part: TankPart = 'spendable'): void {
    const tank = this.state[colour];
    const room = Math.max(0, this.maximum(colour) - tank.spendable - tank.locked);
    this.state[colour] = { ...tank, [part]: tank[part] + Math.min(room, Math.max(0, price)) };
  }

  /** Takes `amount` into `colour`'s spendable Ink: what doesn't fit is lost. A Drop. */
  pickUp(colour: Colour, amount: number): void {
    this.refund(colour, amount, 'spendable');
  }

  /** As a Wave starts: everything each Tank holds becomes Locked Ink. */
  lock(): void {
    this.state = this.map(({ spendable, locked }) => ({
      spendable: 0,
      locked: locked + spendable,
    }));
  }

  /** As a Wave ends: the Locked Ink is spendable again, and the Wave Ink stays. */
  unlock(): void {
    this.state = this.map(({ spendable, locked }) => ({
      spendable: spendable + locked,
      locked: 0,
    }));
  }

  /** Fills every Tank to its maximum, all of it spendable. */
  fill(): void {
    this.state = this.full();
  }

  /**
   * Empties each Tank down to its maximum if it holds more, Locked Ink first:
   * call it once the maximums were edited. A raised maximum leaves its Tank
   * as it is.
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
        const { spendable, locked } = this.state[colour];
        const units = Math.floor(inLineLength(spendable) + UNIT_EPSILON);
        return [colour, { spendable, locked, maximum: this.maximum(colour), units }];
      }),
    ) as Record<Colour, TankReading>;
  }

  private maximum(colour: Colour): number {
    return fromLineLength(this.table.tanks[colour]);
  }

  private full(): Record<Colour, TankState> {
    return Object.fromEntries(
      COLOURS.map((colour) => [colour, { spendable: this.maximum(colour), locked: 0 }]),
    ) as Record<Colour, TankState>;
  }

  /** Each Tank's state after `change`. */
  private map(change: (tank: TankState) => TankState): Record<Colour, TankState> {
    return Object.fromEntries(
      COLOURS.map((colour) => [colour, change(this.state[colour])]),
    ) as Record<Colour, TankState>;
  }

  private withinMaximums(tanks: TanksState): Record<Colour, TankState> {
    return Object.fromEntries(
      COLOURS.map((colour) => {
        const maximum = this.maximum(colour);
        const spendable = Math.max(0, Math.min(tanks[colour].spendable, maximum));
        const locked = Math.max(0, Math.min(tanks[colour].locked, maximum - spendable));
        return [colour, { spendable, locked }];
      }),
    ) as Record<Colour, TankState>;
  }
}
