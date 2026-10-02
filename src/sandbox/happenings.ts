import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { EnemyType } from '../materials/enemy-table';
import type { BlastSize } from './blasts';
import type { DropInk } from './drops';

/**
 * What happened: each step and each command of the Sandbox world appends,
 * in the order things happened, what came, what went and why, and what
 * changed its look. Its readers (the renderer, tests) each read every entry
 * once, through a reader of their own, instead of working out what changed
 * from the views. Poses and wear still come from the views.
 */

/** A thing with a body, or a shape on one, that comes and goes: what an entry names. */
export type Thing =
  /** A Piece, by its Line's id and its place along the Line. */
  | { readonly thing: 'piece'; readonly id: number; readonly index: number }
  | { readonly thing: 'object'; readonly id: number }
  | {
      readonly thing: 'rubble';
      readonly id: number;
      readonly colour: Colour;
      readonly radius: number;
    }
  | { readonly thing: 'droplet'; readonly id: number }
  | { readonly thing: 'enemy'; readonly id: number }
  /** A Patch, with its centre line in its host's own coordinates. */
  | {
      readonly thing: 'patch';
      readonly id: number;
      readonly colour: Colour;
      readonly segment: Segment;
      readonly thickness: number;
    };

/** Why a thing went. */
export type Why =
  | 'broke'
  | 'undone'
  /** `remove`, e.g. a spent stress-test ball. */
  | 'removed'
  | 'erased'
  /** The Rubble or Patch cap took the oldest. */
  | 'capped'
  /** Rubble's lifetime ran out: it despawned, having faded out. */
  | 'expired'
  /** A Droplet landed, and left a Patch. */
  | 'landed'
  /**
   * It left the Arena: a Droplet off any edge, or anything but an Enemy
   * wholly out of view below the screen or over the Spawn edge.
   */
  | 'left'
  /** An Enemy reached the Ink Core. */
  | 'reached'
  /** An Enemy died: its HP ran out, or it fell below the bottom of the screen. It popped. */
  | 'died'
  /** A Patch was used up. */
  | 'used-up'
  /** A Patch went with its host's body. */
  | 'with-host'
  /**
   * A Frozen Line that wasn't Grounded became Grounded: its Pieces come
   * back at once as fixed ones, where they hung.
   */
  | 'grounded'
  /**
   * A Grounded Line's Pieces were cut off from the Terrain: they come back
   * at once as a Line that falls, where they stood.
   */
  | 'cut-off';

export type Happening =
  | { readonly kind: 'added'; readonly what: Thing }
  | {
      readonly kind: 'went';
      readonly what: Thing;
      readonly why: Why;
      /** Where its body was as it went; a Patch's host's. */
      readonly transform: Transform;
      /** How its body moved as it went, px/s; a Patch's host's. */
      readonly velocity: Vec2;
    }
  /** An Object was filled, or undo took its Fill back (`fill` null). */
  | { readonly kind: 'filled'; readonly id: number; readonly fill: Colour | null }
  /**
   * Some of Line `id`'s Pieces, cut off from the Terrain, fall as a Line of
   * their own, `into`, keeping their places along the Line. It comes before
   * they are `added` under `into`.
   */
  | { readonly kind: 'split'; readonly id: number; readonly into: number }
  /** The player Released a Frozen Object. */
  | { readonly kind: 'released'; readonly id: number }
  /** Debris bursts from a broken Outline or band, in world coordinates. */
  | {
      readonly kind: 'burst';
      readonly outline: Polygon;
      readonly velocity: Vec2;
      readonly colours: readonly Colour[];
    }
  /**
   * An Enemy died and pops: a burst of its body, in world coordinates,
   * visual only. It goes (`died`) straight after.
   */
  | {
      readonly kind: 'popped';
      readonly id: number;
      readonly type: EnemyType;
      readonly outline: Polygon;
      readonly velocity: Vec2;
    }
  /**
   * An Enemy that died let out its Drop, from `at`, where its body was: the
   * Ink of every Colour, px². It comes straight after it went (`died`).
   */
  | {
      readonly kind: 'dropped';
      readonly id: number;
      readonly type: EnemyType;
      readonly at: Vec2;
      readonly ink: DropInk;
    }
  /** A Blast started. */
  | {
      readonly kind: 'exploded';
      readonly id: number;
      readonly centre: Vec2;
      readonly size: BlastSize;
    }
  /**
   * Everything went at once, and whatever is visual only with it: R, Clear
   * and loading a demo. What is there after it comes as `added`.
   */
  | { readonly kind: 'start-over' };

/** An entry: a Happening, and the simulated time it happened at, s. */
export type Entry = Happening & { readonly time: number };

/** One reader's place in the list. */
export interface Reader {
  /** Every entry since this reader last read, oldest first. */
  read(): readonly Entry[];
  /** Stops reading: the list no longer keeps entries for it. */
  close(): void;
}

/**
 * The list of what happened. It keeps each entry until every open reader
 * has read it, and nothing while no reader is open.
 */
export class Happenings {
  private entries: Entry[] = [];
  /** How many entries were dropped from the front of `entries`. */
  private dropped = 0;
  /** Each open reader's place: how many entries it has read in all. */
  private readonly places = new Map<object, number>();
  private quiet = 0;
  private count = 0;

  /** @param clock The simulated time now, s. */
  constructor(private readonly clock: () => number) {}

  /** How many happenings were said in all, kept or not: it goes up whenever anything happens. */
  get said(): number {
    return this.count;
  }

  /** Appends what happened, unless it happens quietly. */
  say(happening: Happening): void {
    this.count++;
    if (this.quiet > 0 || this.places.size === 0) return;
    this.entries.push({ ...happening, time: this.clock() });
  }

  /**
   * Runs `act`, saying nothing of what it does: a rebuild as physics starts
   * takes every body away and adds it again as it was.
   */
  quietly(act: () => void): void {
    this.quiet++;
    try {
      act();
    } finally {
      this.quiet--;
    }
  }

  /** A new reader, which reads from what happens next. */
  reader(): Reader {
    const key = {};
    this.places.set(key, this.dropped + this.entries.length);
    return {
      read: () => {
        const place = this.places.get(key);
        if (place === undefined) return [];
        const read = this.entries.slice(place - this.dropped);
        this.places.set(key, this.dropped + this.entries.length);
        this.trim();
        return read;
      },
      close: () => {
        this.places.delete(key);
        this.trim();
      },
    };
  }

  /** Drops the entries every reader has read. */
  private trim(): void {
    const least = Math.min(...this.places.values(), this.dropped + this.entries.length);
    if (least === this.dropped) return;
    this.entries = this.entries.slice(least - this.dropped);
    this.dropped = least;
  }
}
