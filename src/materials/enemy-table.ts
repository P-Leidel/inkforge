import type { Colour } from './colour';

/**
 * The enemy table: every Enemy type's numbers, plus the values they share.
 * Pure data, next to but apart from the material table: Enemies are not
 * Colours and have no role. Every value is a starting value, tuned by feel.
 */

/** The Enemy types, in the order Shift+1, Shift+2, ... send them in. */
export const ENEMY_TYPES = ['crawler', 'runner', 'heavy'] as const;

export type EnemyType = (typeof ENEMY_TYPES)[number];

/** How much Ink of one Colour (in Line length, px) a Drop holds: drawn evenly from `min` to `max`. */
export interface DropRange {
  min: number;
  max: number;
}

/** One Enemy type's numbers. */
export interface EnemyMaterial {
  /** Width (px) of its body, an upright rounded box. */
  width: number;
  /** Height (px) of its body. */
  height: number;
  /** Weight of its body (width × height) relative to plain ink. */
  density: number;
  /**
   * Coulomb friction coefficient. It walks by a force, not by its grip
   * (ADR 0010), so with none its push alone decides what it climbs: a push
   * of one weight climbs up to 45°.
   */
  friction: number;
  /** Bounciness, 0 to below 1: it still bounces off blue, whose own is high. */
  restitution: number;
  /** The speed (px/s) its walking force pushes it toward. */
  walkingSpeed: number;
  /** The most its walking force can be, in multiples of its own weight. */
  push: number;
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
}

export interface EnemyTable {
  types: Record<EnemyType, EnemyMaterial>;
  /** What an Enemy stands on wears at this times its pressing rate. */
  floorWear: number;
  /** The Ink Core's HP when it is whole. */
  coreHp: number;
  /** Diameter (px) of the Core Zone around the Ink Core (from #93). */
  coreZone: number;
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
      push: 1,
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
    },
    runner: {
      width: 32,
      height: 44,
      // About half a Crawler's weight.
      density: 0.57,
      friction: 0,
      restitution: 0,
      walkingSpeed: 180,
      push: 0.6,
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
    },
    heavy: {
      width: 64,
      height: 64,
      // About four Crawlers' weight.
      density: 1.5625,
      friction: 0,
      restitution: 0,
      walkingSpeed: 40,
      push: 3,
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
    },
  },
  floorWear: 1,
  coreHp: 10,
  coreZone: 480,
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
