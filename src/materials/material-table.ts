import type { Colour } from './colour';

/**
 * The material table: every Colour's numbers in each role, plus the shared
 * constants. Pure data. Every value is a starting value, tuned by feel.
 */

/** How a surface meets others. The engine combines the two sides of a contact. */
export interface SurfaceMaterial {
  /** Coulomb friction coefficient. */
  friction: number;
  /** Bounciness, 0 to below 1: nothing may gain energy from a bounce. */
  restitution: number;
}

export interface LineMaterial extends SurfaceMaterial {
  /** Damage each Piece of the Line takes before it breaks. */
  durability: number;
  /** Hits with a smaller impulse (mass × px/s) than this don't damage a Piece. */
  damageThreshold: number;
}

export interface OutlineMaterial extends SurfaceMaterial {
  /** Weight of its ink (length × Line thickness) relative to plain ink. */
  density: number;
  /** Damage an Object takes before it breaks. */
  durability: number;
  /** Hits with a smaller impulse (mass × px/s) than this don't damage the Object. */
  damageThreshold: number;
  /** An Object breaks on this many hits above its damage threshold; 0 for no limit. */
  impactLimit: number;
}

export interface FillMaterial {
  /** Weight of its ink (the Object's area) relative to plain ink. */
  density: number;
}

export interface ColourMaterial {
  /** As a Line. */
  line: LineMaterial;
  /** As the Outline of an Object. */
  outline: OutlineMaterial;
  /** As the Fill of an Object. */
  fill: FillMaterial;
}

export interface MaterialTable {
  colours: Record<Colour, ColourMaterial>;
  /**
   * Mass of 1 px² of ink at density 1. Set so that milestone 1's 60 px box,
   * a hollow grey shell now, keeps its milestone 1 mass of 1.44:
   * 1.44 / (4 × 60 px × 8 px).
   */
  inkMass: number;
  /**
   * Lines are split into equal Pieces as close to this long (px) as their
   * length allows: about one enemy wide.
   */
  pieceLength: number;
  /** Damage per unit of impulse above the receiver's damage threshold. */
  damagePerImpulse: number;
  /** Contacts approaching slower than this (px/s) don't bounce, whatever their restitution. */
  minBounceSpeed: number;
  /**
   * A hit wakes a Frozen Object when it would set it moving faster than this
   * (px/s), so a pebble can't wake a boulder. (1 + 0.1) × 150 / 2: grey
   * Objects of equal mass wake from 150 px/s, as in milestone 1.
   */
  wakeSpeed: number;
}

/**
 * The starting values. The F2 tuning panel's "Copy as JSON" gives a table in
 * this shape, to paste over it.
 */
export const DEFAULT_MATERIAL_TABLE: MaterialTable = {
  colours: {
    grey: {
      line: { friction: 0.6, restitution: 0.1, durability: 6000, damageThreshold: 400 },
      outline: {
        friction: 0.6,
        restitution: 0.1,
        density: 1,
        durability: 2400,
        damageThreshold: 400,
        impactLimit: 0,
      },
      fill: { density: 1 },
    },
    blue: {
      line: { friction: 0.1, restitution: 0.9, durability: 4000, damageThreshold: 200 },
      outline: {
        friction: 0.1,
        restitution: 0.9,
        density: 0.5,
        durability: 2000,
        damageThreshold: 200,
        impactLimit: 3,
      },
      fill: { density: 0.5 },
    },
    green: {
      line: { friction: 0.6, restitution: 0, durability: 6000, damageThreshold: 400 },
      outline: {
        friction: 0.6,
        restitution: 0,
        density: 1,
        durability: 2400,
        damageThreshold: 400,
        impactLimit: 0,
      },
      fill: { density: 1 },
    },
    black: {
      line: { friction: 1, restitution: 0, durability: 20000, damageThreshold: 2000 },
      outline: {
        friction: 1,
        restitution: 0,
        density: 3,
        durability: 20000,
        damageThreshold: 2000,
        impactLimit: 0,
      },
      fill: { density: 3 },
    },
    red: {
      line: { friction: 0.6, restitution: 0.1, durability: 250, damageThreshold: 300 },
      outline: {
        friction: 0.6,
        restitution: 0.1,
        density: 1,
        durability: 250,
        damageThreshold: 300,
        impactLimit: 0,
      },
      fill: { density: 1 },
    },
  },
  inkMass: 0.00075,
  pieceLength: 48,
  damagePerImpulse: 1,
  minBounceSpeed: 50,
  wakeSpeed: 82.5,
};

/** A fresh, editable copy of the default table. */
export function createMaterialTable(): MaterialTable {
  return structuredClone(DEFAULT_MATERIAL_TABLE);
}

/** Terrain is not ink: grey's friction, no bounce. */
export const TERRAIN_SURFACE: SurfaceMaterial = { friction: 0.6, restitution: 0 };
