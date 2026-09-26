import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, ContactPair, PhysicsWorld } from '../physics';
import type { ContactLedger, Party, PartyId } from './contact-ledger';

/**
 * Sticking, one of the Material rules: an Object whose Outline sticks
 * (green) sticks once, to the first contact that begins after it starts
 * moving, and never again. It reads new contacts from the Contact ledger,
 * which has already left out Settled pairs and Squeezed Objects.
 *
 * An Object starts moving when it turns free: Released, woken by a hit or a
 * Blast, or at the end of a slide off a Line. The engine only finds what a
 * newly free body rests on (a Line, the Terrain, a Frozen Object) in the
 * step after, so it has to spend a whole step free before it may stick; what
 * it touches then is what it started moving with, and doesn't count. It
 * counts again only once the two have been apart for `FORGET_SECONDS`: a
 * green box sliding down a Line doesn't stick to its next Piece, even when
 * it hops over the seam between two (ADR 0001's ghost collisions).
 */

/** How long a sticky Object must be apart from a Stroke it started moving with before it may stick to it. */
export const FORGET_SECONDS = 0.25;

/** A Stroke a sticky Object started moving with, by its Party's `stroke`. */
export interface Touched {
  readonly stroke: PartyId;
  /** Seconds since the two last touched: 0 while they touch. */
  readonly apart: number;
}

/** Where a sticky Object is in sticking once. Replaced, never changed, so snapshots can share it. */
export type StickState =
  /** Frozen or sliding, or free for less than a whole step; `free` if it was free after the last step. */
  | { readonly state: 'waiting'; readonly free: boolean }
  /**
   * Moving: it sticks to its first new contact with a Stroke not in
   * `touched`, the Strokes it started moving with and hasn't forgotten.
   */
  | { readonly state: 'moving'; readonly touched: readonly Touched[] }
  /** It stuck. It never sticks again, whether or not it is still stuck. */
  | { readonly state: 'done' };

/** Where every Object starts. */
export const WAITING: StickState = { state: 'waiting', free: false };

/** An Object that may stick, by its Outline's Colour. */
export interface Sticker {
  readonly colour: Colour;
  readonly body: BodyId;
  sticking: StickState;
}

/** An Object sticking to what it touched: bond them where `pair` touched. */
export interface Stick<S> {
  readonly sticker: S;
  readonly host: Party<unknown>;
  readonly pair: ContactPair;
}

export class Sticking {
  constructor(
    private readonly materials: MaterialTable,
    private readonly physics: Pick<PhysicsWorld, 'isFree'>,
    private readonly contacts: Pick<ContactLedger<unknown>, 'newContacts' | 'touching'>,
  ) {}

  /**
   * Moves each of `stickers` whose Outline sticks on by the last step, of
   * `seconds`, and returns the ones that stick now, each to its first new
   * contact in the engine's report order.
   */
  step<S extends Sticker>(stickers: Iterable<S>, seconds: number): Stick<S>[] {
    const sticks: Stick<S>[] = [];
    for (const sticker of stickers) {
      if (this.materials.colours[sticker.colour].outline.sticks <= 0) continue;
      const { sticking } = sticker;
      if (sticking.state === 'done') continue;
      const free = this.physics.isFree(sticker.body);
      if (sticking.state === 'moving' && free) {
        const host = this.firstNew(sticker.body, sticking.touched);
        if (host) {
          sticks.push({ sticker, ...host });
          sticker.sticking = { state: 'done' };
        } else {
          this.forget(sticker, sticking.touched, seconds);
        }
        continue;
      }
      // Waiting, or squeezed while moving: the end of its slide is a new start.
      if (free && sticking.state === 'waiting' && sticking.free) {
        const touched = this.touchedStrokes(sticker.body).map((stroke) => ({ stroke, apart: 0 }));
        sticker.sticking = { state: 'moving', touched };
      } else if (sticking.state === 'moving' || sticking.free !== free) {
        sticker.sticking = { state: 'waiting', free };
      }
    }
    return sticks;
  }

  /** Counts how long it has been apart from each Stroke it started with, and forgets the ones long gone. */
  private forget(sticker: Sticker, touched: readonly Touched[], seconds: number): void {
    if (touched.length === 0) return;
    const still = this.touchedStrokes(sticker.body);
    if (touched.every(({ stroke, apart }) => apart === 0 && still.includes(stroke))) return;
    sticker.sticking = {
      state: 'moving',
      touched: touched
        .map(({ stroke, apart }) => ({
          stroke,
          apart: still.includes(stroke) ? 0 : apart + seconds,
        }))
        .filter(({ apart }) => apart < FORGET_SECONDS),
    };
  }

  /** The Strokes a body touches now, by their Party's `stroke`, each once. */
  private touchedStrokes(body: BodyId): PartyId[] {
    const strokes: PartyId[] = [];
    for (const { party } of this.contacts.touching(body)) {
      if (!strokes.includes(party.stroke)) strokes.push(party.stroke);
    }
    return strokes;
  }

  /** The body's first new contact this step with a Stroke not in `touched`; Droplets don't count. */
  private firstNew(body: BodyId, touched: readonly Touched[]) {
    for (const { a, b, pair } of this.contacts.newContacts) {
      const host = a.body === body ? b : b.body === body ? a : null;
      if (host && !host.harmless && !touched.some(({ stroke }) => stroke === host.stroke))
        return { host, pair };
    }
    return null;
  }
}
