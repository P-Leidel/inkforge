import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, ContactPair, StepReport } from '../physics';

/**
 * Material rules: everything Colour-specific that happens when things touch.
 * Headless and part of the Sandbox world; it reads the physics module's step
 * reports and never the engine. For now: impact damage, durability and the
 * blue impact counter.
 */

/**
 * Something that takes damage and breaks: an Object, by its Outline's
 * numbers, or a Piece of a Line, by its Line's.
 */
export interface Breakable {
  readonly colour: Colour;
  /** Which of its Colour's roles it takes its numbers from. */
  readonly role: 'line' | 'outline';
  /** Damage taken so far. */
  damage: number;
  /** Hits above its damage threshold so far (the blue counter). */
  impacts: number;
}

/** One side of a contact, as the Sandbox world sees it. */
export interface Party<T extends Breakable = Breakable> {
  /** Which Stroke or Piece, or the Terrain; the same after a rebuild. */
  readonly key: string;
  /**
   * The Stroke it is part of, if that isn't `key` (a Piece's Line). What one
   * Stroke hits in one step is one impact, however many of its Pieces hit.
   */
  readonly stroke?: string;
  /** What takes damage on this side, or null (Terrain). */
  readonly target: T | null;
  /** Being squeezed off a Line: it deals and takes no damage. */
  readonly sliding: boolean;
}

/** Damage an impact deals to a receiver: the impulse above its threshold, times k. */
export function impactDamage(impulse: number, threshold: number, damagePerImpulse: number): number {
  return impulse > threshold ? (impulse - threshold) * damagePerImpulse : 0;
}

/** A Breakable's numbers: its Colour's as a Line or as an Outline. Pieces have no impact limit. */
function numbersOf(target: Breakable, table: MaterialTable) {
  const material = table.colours[target.colour];
  return target.role === 'line' ? { ...material.line, impactLimit: 0 } : material.outline;
}

/** How worn a Breakable is, from 0 (whole) to 1 (broken): damage or impacts, whichever is further. */
export function wear(target: Breakable, table: MaterialTable): number {
  const { durability, impactLimit } = numbersOf(target, table);
  const byDamage = durability > 0 ? target.damage / durability : 1;
  const byImpacts = impactLimit > 0 ? target.impacts / impactLimit : 0;
  return Math.min(1, Math.max(byDamage, byImpacts));
}

/** Durability left before it breaks. */
export function durabilityLeft(target: Breakable, table: MaterialTable): number {
  return Math.max(0, numbersOf(target, table).durability - target.damage);
}

type PartyOf<T extends Breakable> = (body: BodyId) => Party<T> | null;

const keyOf = (a: Party<Breakable>, b: Party<Breakable>) =>
  a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;

export class MaterialRules {
  /**
   * Pairs that were touching when physics started. They deal no damage until
   * they have stopped touching: pressing play doesn't break a build.
   */
  private settled = new Set<string>();

  constructor(private readonly materials: MaterialTable) {}

  /** The settled pairs, to keep in a snapshot. */
  get settledPairs(): readonly string[] {
    return [...this.settled];
  }

  /** Replaces the settled pairs. */
  settle(keys: Iterable<string>): void {
    this.settled = new Set(keys);
  }

  /** The keys of the pairs of parties touching in `pairs`. */
  pairKeys<T extends Breakable>(pairs: readonly ContactPair[], partyOf: PartyOf<T>): string[] {
    const keys: string[] = [];
    for (const pair of pairs) {
      const a = partyOf(pair.bodyA);
      const b = partyOf(pair.bodyB);
      if (a && b) keys.push(keyOf(a, b));
    }
    return keys;
  }

  /**
   * Applies a step: each party takes the strongest hit of the step from each
   * Stroke it hit (several shapes of one body, or several Pieces of one Line,
   * hitting at once are one impact), and is damaged by it against its own
   * threshold. `touching` gives every pair touching after the step. Returns
   * what broke.
   */
  applyStep<T extends Breakable>(
    report: StepReport,
    touching: () => readonly ContactPair[],
    partyOf: PartyOf<T>,
  ): T[] {
    if (this.settled.size > 0) {
      const still = new Set(this.pairKeys(touching(), partyOf));
      for (const key of this.settled) if (!still.has(key)) this.settled.delete(key);
    }

    // The strongest hit each target takes from each Stroke.
    const impacts = new Map<string, { target: T; impulse: number }>();
    for (const hit of report.hits) {
      const a = partyOf(hit.bodyA);
      const b = partyOf(hit.bodyB);
      if (!a || !b || a.sliding || b.sliding) continue;
      if (this.settled.has(keyOf(a, b))) continue;
      for (const [receiver, other] of [
        [a, b],
        [b, a],
      ] as const) {
        if (!receiver.target) continue;
        const key = `${receiver.key}|${other.stroke ?? other.key}`;
        const current = impacts.get(key);
        if (!current || current.impulse < hit.impulse)
          impacts.set(key, { target: receiver.target, impulse: hit.impulse });
      }
    }

    const broken: T[] = [];
    for (const { target, impulse } of impacts.values()) {
      if (this.receive(target, impulse) && !broken.includes(target)) broken.push(target);
    }
    return broken;
  }

  /** Damages a target by an impact; returns whether it is broken. */
  private receive(target: Breakable, impulse: number): boolean {
    const { damageThreshold } = numbersOf(target, this.materials);
    if (impulse > damageThreshold) {
      target.impacts++;
      target.damage += impactDamage(impulse, damageThreshold, this.materials.damagePerImpulse);
    }
    return wear(target, this.materials) >= 1;
  }
}
