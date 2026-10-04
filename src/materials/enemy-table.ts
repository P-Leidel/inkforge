import type { Colour } from './colour';
import type { EnemyType } from './enemy-types';

/**
 * The enemy table: every Enemy type's numbers, plus the values they share.
 * Pure data, next to but apart from the material table: Enemies are not
 * Colours and have no role. Every value is a starting value, tuned by feel.
 */

/** How much Ink of one Colour (in Line length, px) a Drop holds: drawn evenly from `min` to `max`. */
export interface DropRange {
  min: number;
  max: number;
}

/**
 * An Enemy type's Belly: the one Colour of ink each Enemy carries, rolled
 * when it is sent in, and let out where it dies as a broken Object's Fill is.
 */
export interface BellyMaterial {
  /** The Ink (px²) a Belly holds, as a Fill's: it decides how much Rubble, Spill or Blast it lets out. */
  ink: number;
  /**
   * How often each Colour is rolled, against the others: a Colour's chance
   * is its weight over the sum of the weights of the Colours the Level has.
   */
  weights: Record<Colour, number>;
}

/** One Enemy type's numbers. */
export interface EnemyMaterial {
  /** Width (px) of its body: an upright rounded box, or the Siege Walker's hull and legs all told. */
  width: number;
  /** Height (px) of its body. */
  height: number;
  /** Weight of its body (the area of its shape) relative to plain ink. */
  density: number;
  /**
   * Coulomb friction coefficient. It walks by a force, not by its grip
   * (ADR 0010), so with none its walkForce alone decides what it climbs: a walkForce
   * of one weight climbs up to 45°.
   */
  friction: number;
  /** Bounciness, 0 to below 1: it still bounces off blue, whose own is high. */
  restitution: number;
  /** The speed (px/s) its walking force pushes it toward. */
  walkingSpeed: number;
  /** The most its walking force can be, in multiples of its own weight. */
  walkForce: number;
  /**
   * The most its climbing force can be, in multiples of its own weight: the
   * upward force it gets while it presses another Enemy or a wall low enough
   * to climb (`climbStep`). Above one weight it rises; 0 never climbs.
   */
  climb: number;
  /** Durability per second it wears off what it presses. */
  pressing: number;
  /** Damage it takes before it dies. */
  hp: number;
  /** Hits and Blasts with a smaller impulse (mass × px/s) than this don't damage it. */
  damageThreshold: number;
  /** HP the Ink Core loses when it reaches it. */
  coreDamage: number;
  /** The Ink of each Colour its Drop holds when it dies. */
  drop: Record<Colour, DropRange>;
  /** Its Belly: the ink it carries and lets out where it dies, on top of its Drop. */
  belly: BellyMaterial;
}

export interface EnemyTable {
  types: Record<EnemyType, EnemyMaterial>;
  /** What an Enemy stands on wears at this times its pressing rate. */
  floorWear: number;
  /**
   * The highest step an Enemy climbs, in its own heights: the top of the
   * Enemy it presses (and of whatever Enemies stand on that one), or of the
   * wall it presses, however steep, at most this far above its feet. Above
   * that, it just presses.
   */
  climbStep: number;
  /**
   * How much harder a stack presses: an Enemy wears what it presses at its
   * pressing rate times 1 plus this for each other Enemy in its stack (those
   * standing on it, those it stands on, and so on).
   */
  stackWear: number;
  /** The Ink Core's HP when it is whole. */
  coreHp: number;
}

/**
 * The starting values. The F2 tuning panel's "Copy as JSON" gives a table in
 * this shape under `enemies`, to paste over it.
 */
export const DEFAULT_ENEMY_TABLE: EnemyTable = {
  types: {
    crawler: {
      width: 40,
      height: 40,
      density: 1,
      friction: 0,
      restitution: 0,
      walkingSpeed: 60,
      walkForce: 1,
      climb: 1.2,
      pressing: 300,
      hp: 3000,
      damageThreshold: 300,
      coreDamage: 1,
      drop: {
        grey: { min: 40, max: 100 },
        blue: { min: 0, max: 40 },
        green: { min: 0, max: 40 },
        black: { min: 0, max: 15 },
        red: { min: 0, max: 10 },
      },
      belly: { ink: 1200, weights: { grey: 4, blue: 2, green: 2, black: 1, red: 1 } },
    },
    runner: {
      width: 32,
      height: 44,
      // About half a Crawler's weight.
      density: 0.57,
      friction: 0,
      restitution: 0,
      walkingSpeed: 180,
      walkForce: 0.6,
      climb: 1.2,
      pressing: 150,
      hp: 1500,
      damageThreshold: 200,
      coreDamage: 1,
      drop: {
        grey: { min: 20, max: 60 },
        blue: { min: 20, max: 60 },
        green: { min: 0, max: 40 },
        black: { min: 0, max: 10 },
        red: { min: 0, max: 10 },
      },
      belly: { ink: 800, weights: { grey: 3, blue: 3, green: 2, black: 1, red: 1 } },
    },
    heavy: {
      width: 64,
      height: 64,
      // About four Crawlers' weight.
      density: 1.5625,
      friction: 0,
      restitution: 0,
      walkingSpeed: 40,
      walkForce: 3,
      // Heavies never climb, though they can be climbed.
      climb: 0,
      pressing: 1500,
      hp: 12000,
      damageThreshold: 1500,
      coreDamage: 3,
      drop: {
        grey: { min: 60, max: 150 },
        blue: { min: 0, max: 40 },
        green: { min: 20, max: 60 },
        black: { min: 20, max: 60 },
        red: { min: 10, max: 40 },
      },
      belly: { ink: 3000, weights: { grey: 2, blue: 1, green: 1, black: 4, red: 2 } },
    },
    siegeWalker: {
      // A hull 220 × 110 on four legs 20 × 90, outer foot to outer foot 180.
      width: 220,
      height: 200,
      // About twenty Crawlers' weight.
      density: 1,
      friction: 0,
      restitution: 0,
      walkingSpeed: 30,
      walkForce: 2,
      // It never climbs, and is never a step.
      climb: 0,
      pressing: 4000,
      // Three or four good answers: a 100 px black box dropped 400 px onto it deals about 24000.
      hp: 85000,
      // Just above a 60 px grey box dropped 300 px onto it.
      damageThreshold: 4000,
      coreDamage: 8,
      // About three times a Heavy's.
      drop: {
        grey: { min: 180, max: 450 },
        blue: { min: 0, max: 120 },
        green: { min: 60, max: 180 },
        black: { min: 60, max: 180 },
        red: { min: 30, max: 120 },
      },
      // About four times a Heavy's ink, leaning hard to red: most kills end in a large Blast.
      belly: { ink: 12000, weights: { grey: 1, blue: 1, green: 1, black: 3, red: 5 } },
    },
  },
  floorWear: 1,
  climbStep: 1.2,
  stackWear: 0.5,
  coreHp: 10,
};

/** Each table's revision, by the table, so it is never among the table's numbers. */
const revisions = new WeakMap<EnemyTable, number>();

/**
 * The table's revision: how many times `editEnemies` has edited it. The
 * Sandbox world compares it each step to see an edit.
 */
export function enemiesRevision(table: EnemyTable): number {
  return revisions.get(table) ?? 0;
}

/**
 * Edits the table, as the F2 tuning panel does, and bumps its revision, so
 * the Sandbox world applies new surfaces from its next step. Every other
 * number is read where it is used; an Enemy's size and weight are set when
 * it is sent in.
 */
export function editEnemies(table: EnemyTable, edit: (table: EnemyTable) => void): void {
  edit(table);
  revisions.set(table, enemiesRevision(table) + 1);
}

/** A fresh, editable copy of the default table. */
export function createEnemyTable(): EnemyTable {
  return structuredClone(DEFAULT_ENEMY_TABLE);
}
