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

export interface OutlineMaterial extends SurfaceMaterial {
  /** Weight of its ink (length × Line thickness) relative to plain ink. */
  density: number;
}

export interface FillMaterial {
  /** Weight of its ink (the Object's area) relative to plain ink. */
  density: number;
}

export interface ColourMaterial {
  /** As a Line. */
  line: SurfaceMaterial;
  /** As the Outline of an Object. */
  outline: OutlineMaterial;
  /** As the Fill of an Object. */
  fill: FillMaterial;
}

export interface MaterialTable {
  colours: Record<Colour, ColourMaterial>;
  /**
   * Mass of 1 px² of ink at density 1. Set so that milestone 1's 60 px box,
   * a hollow grey shell now, keeps its milestone 1 mass of 1.44.
   */
  inkMass: number;
  /** Contacts approaching slower than this (px/s) don't bounce, whatever their restitution. */
  minBounceSpeed: number;
  /**
   * A hit wakes a Frozen Object when it would set it moving faster than this
   * (px/s), so a pebble can't wake a boulder. (1 + 0.1) × 150 / 2: grey
   * Objects of equal mass wake from 150 px/s, as in milestone 1.
   */
  wakeSpeed: number;
}

/** Friction of the plain material (grey), and of Terrain. */
const NORMAL_FRICTION = 0.6;

/** A Colour whose Line and Outline share one surface, and whose Outline and Fill one density. */
function material(friction: number, restitution: number, density: number): ColourMaterial {
  return {
    line: { friction, restitution },
    outline: { friction, restitution, density },
    fill: { density },
  };
}

export const DEFAULT_MATERIAL_TABLE: MaterialTable = {
  colours: {
    grey: material(NORMAL_FRICTION, 0.1, 1),
    blue: material(0.1, 0.9, 0.5),
    green: material(NORMAL_FRICTION, 0, 1),
    black: material(1, 0, 3),
    red: material(NORMAL_FRICTION, 0.1, 1),
  },
  // 1.44 / (4 × 60 px × 8 px)
  inkMass: 0.00075,
  minBounceSpeed: 50,
  wakeSpeed: 82.5,
};

/** A fresh, editable copy of the default table. */
export function createMaterialTable(): MaterialTable {
  return structuredClone(DEFAULT_MATERIAL_TABLE);
}

/** Terrain is not ink: plain friction, no bounce. */
export const TERRAIN_SURFACE: SurfaceMaterial = { friction: NORMAL_FRICTION, restitution: 0 };
