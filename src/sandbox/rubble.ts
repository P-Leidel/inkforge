import {
  polygonArea,
  polygonBounds,
  polygonContainsPoint,
  type Polygon,
} from '../geometry/polygon';
import type { Circle } from '../geometry/overlap';
import { distancePointToSegment } from '../geometry/segment';
import type { Transform } from '../geometry/transform';
import { rotate, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import { motionOf, type Kind, type Motion, type Solids } from './arena-contents';
import type { Party } from './material-rules';
import type { Random } from './random';

/**
 * Rubble: the pebbles or stones a grey or black Fill releases when its
 * Object breaks. Its generation (`packRubble`, `launchRubble`) is pure,
 * apart from the seeded generator it is handed; the `Rubble` kind below
 * holds what is loose in the Arena.
 */

/** One piece of Rubble packed inside an Outline, in the Outline's coordinates. */
export interface PackedRubble {
  readonly centre: Vec2;
  readonly radius: number;
  readonly mass: number;
}

/** A piece of Rubble set loose in the Arena. */
export interface LaunchedRubble {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly angularVelocity: number;
}

/** Room (px) kept between pieces, and between a piece and the Outline. */
const GAP = 1;
/** Grid of points searched for the deepest point of an Outline nothing fits in. */
const DEPTH_GRID = 32;
/** A piece never shrinks below this radius (px), however thin the Outline. */
const MIN_RADIUS = 0.5;

/**
 * Packs the Rubble a Fill releases inside its Object's Outline: about one
 * piece per `rubbleArea` of Fill, at least 1 and at most `rubbleMax`, as
 * circles on a hex grid that keep clear of the Outline and of each other.
 * The pieces are picked from the grid by `random`; if fewer fit, fewer come
 * out, and if none fits, one shrinks to fit at the deepest point. Together
 * they weigh `mass`, the Fill's, however much space the packing leaves.
 * A hollow Object, or a Fill that makes no Rubble, releases none.
 */
export function packRubble(
  outline: Polygon,
  fill: Colour | null,
  mass: number,
  table: MaterialTable,
  random: Random,
): PackedRubble[] {
  if (!fill) return [];
  const { rubbleMax, rubbleRadius, rubbleArea } = table.colours[fill].fill;
  if (rubbleMax < 1 || rubbleRadius <= 0) return [];
  const wanted =
    rubbleArea > 0 ? Math.round(polygonArea(outline) / rubbleArea) : Math.floor(rubbleMax);
  const count = Math.min(Math.floor(rubbleMax), Math.max(1, wanted));

  let radius = rubbleRadius;
  let spots = hexSpots(outline, radius);
  if (spots.length === 0) {
    const deepest = deepestPoint(outline);
    radius = Math.min(radius, Math.max(deepest.depth - GAP, deepest.depth / 2, MIN_RADIUS));
    spots = [deepest.point];
  }
  // Pick `count` spots at random: a partial Fisher-Yates shuffle.
  const picked = Math.min(count, spots.length);
  for (let k = 0; k < picked; k++) {
    const j = k + Math.floor(random.next() * (spots.length - k));
    [spots[k], spots[j]] = [spots[j]!, spots[k]!];
  }
  return spots.slice(0, picked).map((centre) => ({ centre, radius, mass: mass / picked }));
}

/**
 * Sets packed Rubble loose from an Object with the given pose and motion.
 * Each piece keeps the Object's velocity at its place (v + ω × r) and spin,
 * and is kicked outward from the centre at `kickSpeed`, turned by a random
 * angle of up to `spread` either way. A piece at the very centre is kicked
 * in a random direction.
 */
export function launchRubble(
  pieces: readonly PackedRubble[],
  from: {
    readonly transform: Transform;
    readonly velocity: Vec2;
    readonly angularVelocity: number;
  },
  kickSpeed: number,
  spread: number,
  random: Random,
): LaunchedRubble[] {
  const { transform, velocity, angularVelocity: w } = from;
  return pieces.map(({ centre }) => {
    const offset = rotate(centre, transform.angle);
    const distance = Math.hypot(offset.x, offset.y);
    const outward =
      distance > 1e-9
        ? { x: offset.x / distance, y: offset.y / distance }
        : rotate({ x: 1, y: 0 }, random.range(-Math.PI, Math.PI));
    const kick = rotate(outward, random.range(-spread, spread));
    return {
      position: { x: transform.x + offset.x, y: transform.y + offset.y },
      velocity: {
        x: velocity.x - w * offset.y + kick.x * kickSpeed,
        y: velocity.y + w * offset.x + kick.y * kickSpeed,
      },
      angularVelocity: w,
    };
  });
}

/** How far a point is from the Outline's nearest edge. */
function depthOf(outline: Polygon, p: Vec2): number {
  let nearest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    nearest = Math.min(nearest, distancePointToSegment(p, a, b));
  }
  return nearest;
}

/**
 * Centres of circles of `radius` on a hex grid, each inside the Outline and
 * at least `radius + GAP` from its edges, with `GAP` between neighbours. Of a
 * few shifts of the grid, the one that fits the most.
 */
function hexSpots(outline: Polygon, radius: number): Vec2[] {
  const bounds = polygonBounds(outline);
  const margin = radius + GAP;
  const dx = 2 * radius + GAP;
  const dy = (dx * Math.sqrt(3)) / 2;
  let best: Vec2[] = [];
  for (const shiftX of [0, 0.25, 0.5, 0.75]) {
    for (const shiftY of [0, 0.5]) {
      const spots: Vec2[] = [];
      let row = 0;
      for (let y = bounds.minY + margin + shiftY * dy; y <= bounds.maxY - margin; y += dy, row++) {
        const x0 = bounds.minX + margin + ((shiftX + (row % 2) / 2) % 1) * dx;
        for (let x = x0; x <= bounds.maxX - margin; x += dx) {
          const p = { x, y };
          if (polygonContainsPoint(outline, p) && depthOf(outline, p) >= margin) spots.push(p);
        }
      }
      if (spots.length > best.length) best = spots;
    }
  }
  return best;
}

/** The point inside the Outline farthest from its edges, on a fine grid, and how far that is. */
function deepestPoint(outline: Polygon): { point: Vec2; depth: number } {
  const bounds = polygonBounds(outline);
  const stepX = (bounds.maxX - bounds.minX) / DEPTH_GRID;
  const stepY = (bounds.maxY - bounds.minY) / DEPTH_GRID;
  let best = { point: outline[0]!, depth: 0 };
  for (let i = 0; i < DEPTH_GRID; i++) {
    for (let j = 0; j < DEPTH_GRID; j++) {
      const point = { x: bounds.minX + (i + 0.5) * stepX, y: bounds.minY + (j + 0.5) * stepY };
      if (!polygonContainsPoint(outline, point)) continue;
      const depth = depthOf(outline, point);
      if (depth > best.depth) best = { point, depth };
    }
  }
  return best;
}

/** Seconds Rubble removed by the cap takes to fade out. */
const FADE_SECONDS = 0.5;

export interface RubbleView {
  readonly id: number;
  /** The Colour of the Fill it came from. */
  readonly colour: Colour;
  readonly radius: number;
  readonly mass: number;
  /** Its centre and rotation. */
  readonly transform: Transform;
  /** Linear velocity, px/s. */
  readonly velocity: Vec2;
}

/** Rubble the cap removed, fading out where it was. It has no body. */
export interface FadingRubbleView {
  readonly id: number;
  readonly colour: Colour;
  readonly radius: number;
  readonly transform: Transform;
  /** From 1 as it is removed down to 0. */
  readonly opacity: number;
}

/** A piece of Rubble set loose from a broken Object's Fill. */
export interface LooseRubble {
  /** The Colour of the Fill it came from. */
  readonly colour: Colour;
  readonly radius: number;
  readonly mass: number;
  readonly motion: Motion;
}

/** A piece of Rubble: a moving circle that never breaks. */
interface RubbleRecord {
  readonly id: number;
  readonly colour: Colour;
  readonly radius: number;
  readonly mass: number;
  readonly body: BodyId;
}

type SavedRubble = Omit<RubbleRecord, 'body'> & { readonly motion: Motion };

interface FadingRubble {
  readonly id: number;
  readonly colour: Colour;
  readonly radius: number;
  readonly transform: Transform;
  /** Seconds since the cap removed it. */
  age: number;
}

/**
 * The Rubble in the Arena, oldest first, and the cap on it. Rubble ids, like
 * Stroke ids, are never reused, not even after R or Clear. Rubble the cap
 * removes leaves a fading ghost that is visual only, like Debris: it isn't
 * in the snapshot, and R and Clear drop it.
 */
export class Rubble implements Kind<'rubble', readonly SavedRubble[], readonly RubbleView[]> {
  readonly name = 'rubble';
  /** Oldest first. */
  private rubble: RubbleRecord[] = [];
  /** The Rubble each body is. */
  private byBody = new Map<BodyId, RubbleRecord>();
  private fading: FadingRubble[] = [];
  private nextId = 1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly materials: MaterialTable,
  ) {}

  /** Rubble, oldest first. */
  get views(): readonly RubbleView[] {
    return this.rubble.map(({ id, colour, radius, mass, body }) => ({
      id,
      colour,
      radius,
      mass,
      transform: this.physics.getTransform(body),
      velocity: this.physics.getVelocity(body),
    }));
  }

  /** Rubble the cap removed, fading out. */
  get fadingViews(): readonly FadingRubbleView[] {
    return this.fading.map(({ id, colour, radius, transform, age }) => ({
      id,
      colour,
      radius,
      transform,
      opacity: Math.max(0, 1 - age / FADE_SECONDS),
    }));
  }

  /** Sets Rubble loose, in order, then applies the cap. */
  add(loose: readonly LooseRubble[]): void {
    for (const { motion, ...rubble } of loose)
      this.addBody({ id: this.nextId++, ...rubble }, motion);
    this.cap();
  }

  private addBody(rubble: Omit<RubbleRecord, 'body'>, motion: Motion): void {
    const body = this.physics.addCircle({
      position: { x: motion.transform.x, y: motion.transform.y },
      angle: motion.transform.angle,
      radius: rubble.radius,
      mass: rubble.mass,
      surface: this.materials.colours[rubble.colour].outline,
      velocity: motion.velocity,
      angularVelocity: motion.angularVelocity,
    });
    const record = { ...rubble, body };
    this.rubble.push(record);
    this.byBody.set(body, record);
  }

  /** Over the Rubble cap, the oldest Rubble goes at once and fades out where it was. */
  private cap(): void {
    const cap = Math.max(0, this.materials.rubbleCap);
    while (this.rubble.length > cap) {
      const { body, ...oldest } = this.rubble.shift()!;
      this.fading.push({ ...oldest, transform: this.physics.getTransform(body), age: 0 });
      this.physics.removeBody(body);
      this.byBody.delete(body);
    }
  }

  save(): readonly SavedRubble[] {
    return this.rubble.map(({ body, ...rubble }) => ({
      ...rubble,
      motion: motionOf(this.physics, body),
    }));
  }

  /** Adds the Rubble again, oldest first. */
  restore(saved: readonly SavedRubble[]): void {
    this.rubble = [];
    this.byBody = new Map();
    for (const { motion, ...rubble } of saved) this.addBody(rubble, motion);
  }

  dropVisuals(): void {
    this.fading = [];
  }

  clear(): void {
    for (const { body } of this.rubble) this.physics.removeBody(body);
    this.rubble = [];
    this.byBody = new Map();
    this.fading = [];
  }

  /** Rubble deals damage but never takes any. Each piece is its own hitter. */
  partyOf(body: BodyId): Party<never> | null {
    const rubble = this.byBody.get(body);
    return rubble ? { key: `rubble ${rubble.id}`, target: null, sliding: false } : null;
  }

  /** Rubble is solid: an Object drawn over it is refused. */
  solids(): Solids {
    const circles = this.rubble.map(({ body, radius }): Circle => {
      const { x, y } = this.physics.getTransform(body);
      return { centre: { x, y }, radius };
    });
    return { polygons: [], circles };
  }

  applySurfaces(): void {
    for (const { body, colour } of this.rubble) {
      this.physics.setSurface(body, this.materials.colours[colour].outline);
    }
  }

  /** The ghosts fade. */
  step(seconds: number): void {
    for (const ghost of this.fading) ghost.age += seconds;
    this.fading = this.fading.filter((ghost) => ghost.age < FADE_SECONDS);
  }
}
