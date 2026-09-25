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

export interface ColourMaterial {
  /** As a Line. */
  line: SurfaceMaterial;
  /** As the Outline of an Object. */
  outline: SurfaceMaterial;
}

export interface MaterialTable {
  colours: Record<Colour, ColourMaterial>;
  /** Contacts approaching slower than this (px/s) don't bounce, whatever their restitution. */
  minBounceSpeed: number;
}

/** Friction of the plain material (grey), and of Terrain. */
const NORMAL_FRICTION = 0.6;

/** A Colour whose Line and Outline share one surface. */
function sameSurface(friction: number, restitution: number): ColourMaterial {
  return { line: { friction, restitution }, outline: { friction, restitution } };
}

export const DEFAULT_MATERIAL_TABLE: MaterialTable = {
  colours: {
    grey: sameSurface(NORMAL_FRICTION, 0.1),
    blue: sameSurface(0.1, 0.9),
    green: sameSurface(NORMAL_FRICTION, 0),
    black: sameSurface(1, 0),
    red: sameSurface(NORMAL_FRICTION, 0.1),
  },
  minBounceSpeed: 50,
};

/** A fresh, editable copy of the default table. */
export function createMaterialTable(): MaterialTable {
  return structuredClone(DEFAULT_MATERIAL_TABLE);
}

/** Terrain is not ink: plain friction, no bounce. */
export const TERRAIN_SURFACE: SurfaceMaterial = { friction: NORMAL_FRICTION, restitution: 0 };
