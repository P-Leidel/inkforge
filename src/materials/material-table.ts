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
  /**
   * Glue drag (ADR 0007): the force (mass × px/s²) per px/s of speed that
   * slows anything moving across a Piece, not scaled by the mover's mass, so
   * heavier things are slowed less. Its spin is slowed at the same rate. 0
   * for no glue.
   */
  glueDrag: number;
  /** Durability a Piece loses per unit of momentum (mass × px/s) its glue drag removes. */
  glueWear: number;
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
  /**
   * 1 if an Object sticks, once, to the first new thing it touches after it
   * starts moving (green); 0 if it never sticks.
   */
  sticks: number;
  /**
   * 1 if an Object's Outline explodes when the Object breaks (red): its ink,
   * its length × the Line thickness, goes into a Blast. 0 if it doesn't.
   */
  explodes: number;
}

export interface FillMaterial {
  /** Weight of its ink (the Object's area) relative to plain ink. */
  density: number;
  /**
   * Speed (px/s) at which what it releases is flung outward from the broken
   * Object's centre, on top of the Object's own velocity.
   */
  kickSpeed: number;
  /** Most pieces of Rubble it releases; 0 if it releases none. */
  rubbleMax: number;
  /** Radius (px) of each piece of Rubble. */
  rubbleRadius: number;
  /** Fill area (px²) per piece of Rubble, so the count grows with the Fill's area. */
  rubbleArea: number;
  /** 1 if a broken Object throws out a Spill of Droplets (blue, green); 0 if not. */
  spills: number;
  /**
   * Capacity a Patch of this Colour uses up per unit of impulse (mass × px/s)
   * of each hit it takes: blue wears by its bounces. 0 if hits don't wear it.
   * A Patch meets things with its Colour's Line surface and glue, and its glue
   * wears it by the Line's `glueWear`.
   */
  patchHitWear: number;
  /**
   * 1 if a Fill explodes when its Object breaks, however that happens (red):
   * its ink, the Object's area, goes into a Blast. 0 if it doesn't.
   */
  explodes: number;
}

/**
 * Blasts (ADR 0008): a ring spreading out from destroyed red ink, whose
 * reach R and strength S grow with the square root of the red ink (px²).
 * At distance d it acts at S × (1 − d/R)².
 */
export interface BlastMaterial {
  /** How fast the ring spreads (px/s). */
  speed: number;
  /** R per √ink. */
  radiusPerRootInk: number;
  radiusMin: number;
  radiusMax: number;
  /** S per √ink. */
  strengthPerRootInk: number;
  strengthMin: number;
  strengthMax: number;
  /**
   * The impulse (mass × px/s) a moving body gets per unit of strength,
   * outward from the Blast's centre. It also decides whether a Frozen
   * Object wakes: when this impulse over its mass beats the wake speed.
   */
  push: number;
  /**
   * A push never changes a body's speed by more than this (px/s), so light
   * pebbles and Droplets fly fast but don't vanish.
   */
  maxPushSpeed: number;
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
  /** Most Rubble at once; a release that would go over it fades out the oldest. */
  rubbleCap: number;
  /** A released piece is kicked up to this far (radians) either side of straight outward. */
  kickSpread: number;
  /** Fewest Droplets in a Spill. */
  dropletsMin: number;
  /** Most Droplets in a Spill. */
  dropletsMax: number;
  /** Radius (px) of a Droplet. */
  dropletRadius: number;
  /** Mass of a Droplet; it deals no damage, so it only has to be small. */
  dropletMass: number;
  /** Total length (px) of a Spill's Patches per px² of Fill, shared among its Droplets. */
  patchLengthPerArea: number;
  /** Thickness (px) of a Patch: it stands proud of its host's surface by half of it. */
  patchThickness: number;
  /** Wear a Patch takes per px of its length before it wears out. */
  patchCapacity: number;
  /** Most Patches at once; a new one over it removes the oldest. */
  patchCap: number;
  blast: BlastMaterial;
}

/**
 * The starting values. The F2 tuning panel's "Copy as JSON" gives a table in
 * this shape, to paste over it.
 */
export const DEFAULT_MATERIAL_TABLE: MaterialTable = {
  colours: {
    grey: {
      line: {
        friction: 0.6,
        restitution: 0.1,
        durability: 6000,
        damageThreshold: 400,
        glueDrag: 0,
        glueWear: 0,
      },
      outline: {
        friction: 0.6,
        restitution: 0.1,
        density: 1,
        durability: 2400,
        damageThreshold: 400,
        impactLimit: 0,
        sticks: 0,
        explodes: 0,
      },
      fill: {
        density: 1,
        kickSpeed: 200,
        rubbleMax: 18,
        rubbleRadius: 6,
        rubbleArea: 250,
        spills: 0,
        patchHitWear: 0,
        explodes: 0,
      },
    },
    blue: {
      line: {
        friction: 0.1,
        restitution: 0.9,
        durability: 4000,
        damageThreshold: 200,
        glueDrag: 0,
        glueWear: 0,
      },
      outline: {
        friction: 0.1,
        restitution: 0.9,
        density: 0.5,
        durability: 2000,
        damageThreshold: 200,
        impactLimit: 3,
        sticks: 0,
        explodes: 0,
      },
      fill: {
        density: 0.5,
        kickSpeed: 400,
        rubbleMax: 0,
        rubbleRadius: 0,
        rubbleArea: 0,
        spills: 1,
        patchHitWear: 1,
        explodes: 0,
      },
    },
    green: {
      line: {
        friction: 0.6,
        restitution: 0,
        durability: 6000,
        damageThreshold: 400,
        glueDrag: 4,
        glueWear: 2,
      },
      outline: {
        friction: 0.6,
        restitution: 0,
        density: 1,
        durability: 2400,
        damageThreshold: 400,
        impactLimit: 0,
        sticks: 1,
        explodes: 0,
      },
      fill: {
        density: 1,
        kickSpeed: 300,
        rubbleMax: 0,
        rubbleRadius: 0,
        rubbleArea: 0,
        spills: 1,
        patchHitWear: 0,
        explodes: 0,
      },
    },
    black: {
      line: {
        friction: 1,
        restitution: 0,
        durability: 20000,
        damageThreshold: 2000,
        glueDrag: 0,
        glueWear: 0,
      },
      outline: {
        friction: 1,
        restitution: 0,
        density: 3,
        durability: 20000,
        damageThreshold: 2000,
        impactLimit: 0,
        sticks: 0,
        explodes: 0,
      },
      fill: {
        density: 3,
        kickSpeed: 200,
        rubbleMax: 8,
        rubbleRadius: 8.5,
        rubbleArea: 450,
        spills: 0,
        patchHitWear: 0,
        explodes: 0,
      },
    },
    red: {
      line: {
        friction: 0.6,
        restitution: 0.1,
        durability: 250,
        damageThreshold: 300,
        glueDrag: 0,
        glueWear: 0,
      },
      outline: {
        friction: 0.6,
        restitution: 0.1,
        density: 1,
        durability: 140,
        damageThreshold: 250,
        impactLimit: 0,
        sticks: 0,
        explodes: 1,
      },
      fill: {
        density: 1,
        kickSpeed: 0,
        rubbleMax: 0,
        rubbleRadius: 0,
        rubbleArea: 0,
        spills: 0,
        patchHitWear: 0,
        explodes: 1,
      },
    },
  },
  inkMass: 0.00075,
  pieceLength: 48,
  damagePerImpulse: 1,
  minBounceSpeed: 50,
  wakeSpeed: 82.5,
  rubbleCap: 150,
  kickSpread: 0.35,
  dropletsMin: 10,
  dropletsMax: 15,
  dropletRadius: 3,
  dropletMass: 0.02,
  patchLengthPerArea: 0.04,
  patchThickness: 3,
  patchCapacity: 250,
  patchCap: 200,
  blast: {
    speed: 800,
    radiusPerRootInk: 3.8,
    radiusMin: 40,
    radiusMax: 300,
    strengthPerRootInk: 38,
    strengthMin: 400,
    strengthMax: 3000,
    push: 1,
    maxPushSpeed: 1200,
  },
};

/** A fresh, editable copy of the default table. */
export function createMaterialTable(): MaterialTable {
  return structuredClone(DEFAULT_MATERIAL_TABLE);
}

/** Terrain is not ink: grey's friction, no bounce. */
export const TERRAIN_SURFACE: SurfaceMaterial = { friction: 0.6, restitution: 0 };
