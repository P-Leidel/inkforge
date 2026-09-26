import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import { pairKey, type Party, type PartyHit } from './contact-ledger';

/**
 * Material rules: everything Colour-specific that happens when things touch.
 * Headless and part of the Sandbox world; it reads the contacts that count
 * from the Contact ledger and never the engine. For now: impact damage,
 * durability and the blue impact counter.
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

export class MaterialRules {
  constructor(private readonly materials: MaterialTable) {}

  /**
   * Applies a step's hits, as the Contact ledger gives them: each party
   * takes the strongest hit of the step from each Stroke it hit (several
   * shapes of one body, or several Pieces of one Line, hitting at once are
   * one impact), and is damaged by it against its own threshold. Hits with
   * a harmless Party (a Droplet) deal no damage either way. Returns what
   * broke, in the order the hits first reached it.
   */
  applyStep<T extends Breakable>(hits: readonly PartyHit<T>[]): T[] {
    if (hits.length === 0) return [];
    // The strongest hit each target takes from each Stroke, in the order they came.
    const impacts = new Map<number, { target: T; impulse: number }>();
    const take = (receiver: Party<T>, other: Party<T>, impulse: number) => {
      if (!receiver.target) return;
      const key = pairKey(receiver.id, other.stroke);
      const current = impacts.get(key);
      if (!current) impacts.set(key, { target: receiver.target, impulse });
      else if (current.impulse < impulse) current.impulse = impulse;
    };
    for (const { a, b, hit } of hits) {
      if (a.harmless || b.harmless) continue;
      take(a, b, hit.impulse);
      take(b, a, hit.impulse);
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
