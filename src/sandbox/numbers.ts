import type { Colour } from '../materials/colour';
import {
  createEnemyTable,
  type EnemyMaterial,
  type EnemyTable,
  type EnemyType,
} from '../materials/enemy-table';
import type { MaterialTable, SurfaceMaterial } from '../materials/material-table';

/**
 * What a thing's numbers are: the one answer, for every thing in the Arena
 * but the Terrain. A thing says what it is (its `ThingType`), and this says
 * how it meets others (its surface), whether it is fixed, and how it takes
 * damage and breaks. The Material rules read it to damage and break things,
 * and Arena bodies to set surfaces, and again after an F2 edit. It reads the
 * tables as they are now, so an edit counts from the next question.
 *
 * Ink things take their numbers from the material table, by their Colour.
 * Enemies take theirs from the enemy table, by their type: a second source,
 * and a second kind of `ThingType`.
 */

/** What an ink thing is: which of its Colour's numbers it takes. */
export interface InkThingType {
  readonly kind:
    /** A Piece of a Line: its Colour's Line numbers. */
    | 'piece'
    /** An Object: its Outline Colour's Outline numbers. */
    | 'object'
    /** Rubble: its Fill Colour's Outline surface. It never breaks. */
    | 'rubble'
    /** A Droplet: its Colour's Line surface. It never breaks. */
    | 'droplet'
    /** A Patch: its Colour's Line surface. It is used up, not broken. */
    | 'patch';
  readonly colour: Colour;
  /**
   * True for a Piece of a Line that isn't Grounded: it moves with its Line,
   * so it isn't fixed.
   */
  readonly loose?: boolean;
}

/** What an Enemy is: which of the enemy table's rows it takes. */
export interface EnemyThingType {
  readonly kind: 'enemy';
  readonly type: EnemyType;
}

/** What a thing is, as far as its numbers go. */
export type ThingType = InkThingType | EnemyThingType;

/** A thing that takes damage and breaks. */
export type BreakingType = ThingType & { readonly kind: 'piece' | 'object' };

/**
 * Something that takes damage and breaks, and how far it has got: an
 * Object, or a Piece of a Line.
 */
export interface Breakable {
  readonly kind: BreakingType['kind'];
  readonly colour: Colour;
  /** True for a Piece of a Line that isn't Grounded. */
  readonly loose?: boolean;
  /** Damage taken so far. */
  damage: number;
  /** Hits above its damage threshold so far (the blue counter). */
  impacts: number;
}

/** How a thing takes damage and breaks. */
export interface Toughness {
  /** Hits with a smaller impulse (mass × px/s) than this don't damage it. */
  readonly damageThreshold: number;
  /** Damage it takes before it breaks. */
  readonly durability: number;
  /** It breaks on this many hits above its damage threshold; 0 for no limit. */
  readonly impactLimit: number;
}

/** A thing's numbers. */
export interface ThingNumbers {
  /** How it meets others. */
  readonly surface: SurfaceMaterial;
  /** Whether it stays where it is: nothing pushes or wakes it, so a Blast only damages it. */
  readonly fixed: boolean;
  /** How it takes damage and breaks; null for a thing that never breaks. */
  readonly toughness: Toughness | null;
}

/** The numbers of a thing that breaks. */
export interface BreakingNumbers extends ThingNumbers {
  readonly toughness: Toughness;
}

/** The one answer to what a thing's numbers are, from the tables it reads. */
export class Numbers {
  constructor(
    private readonly materials: MaterialTable,
    /** The enemy table to read; a fresh copy of the defaults if none is given. */
    private readonly enemies: EnemyTable = createEnemyTable(),
  ) {}

  /** A thing's numbers, from the tables as they are now. */
  of(type: BreakingType): BreakingNumbers;
  of(type: ThingType): ThingNumbers;
  of(type: ThingType): ThingNumbers {
    if (type.kind === 'enemy') {
      // An Enemy's HP is its own, which the Material rules take damage off: it never breaks.
      return { surface: this.enemy(type.type), fixed: false, toughness: null };
    }
    const { line, outline } = this.materials.colours[type.colour];
    switch (type.kind) {
      case 'piece':
        // Pieces have no impact limit: blue's third-impact break is an Object's.
        return { surface: line, fixed: !type.loose, toughness: { ...line, impactLimit: 0 } };
      case 'object':
        return { surface: outline, fixed: false, toughness: outline };
      case 'rubble':
        return { surface: outline, fixed: false, toughness: null };
      case 'droplet':
      case 'patch':
        return { surface: line, fixed: false, toughness: null };
    }
  }

  /** An Enemy type's row of the enemy table, as it is now. */
  enemy(type: EnemyType): EnemyMaterial {
    return this.enemies.types[type];
  }

  /** What an Enemy stands on wears at this times its type's pressing rate, as it is now. */
  get floorWear(): number {
    return this.enemies.floorWear;
  }

  /** The highest step an Enemy climbs, in its own heights, as it is now. */
  get climbStep(): number {
    return this.enemies.climbStep;
  }

  /** What each other Enemy in a stack adds to an Enemy's pressing rate, as it is now. */
  get stackWear(): number {
    return this.enemies.stackWear;
  }

  /** A thing's surface, from the tables as they are now. */
  surface(type: ThingType): SurfaceMaterial {
    return this.of(type).surface;
  }

  /** How worn a Breakable is, from 0 (whole) to 1 (broken): damage or impacts, whichever is further. */
  wear(target: Breakable): number {
    const { durability, impactLimit } = this.of(target).toughness;
    const byDamage = durability > 0 ? target.damage / durability : 1;
    const byImpacts = impactLimit > 0 ? target.impacts / impactLimit : 0;
    return Math.min(1, Math.max(byDamage, byImpacts));
  }

  /** Durability a Breakable has left before it breaks. */
  durabilityLeft(target: Breakable): number {
    return Math.max(0, this.of(target).toughness.durability - target.damage);
  }
}
