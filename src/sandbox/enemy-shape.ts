import { polygonArea, polygonBounds, type Bounds, type Polygon } from '../geometry/polygon';
import { transformPoints, type Transform } from '../geometry/transform';

/**
 * An Enemy's shape: what the Enemy rules, the Arena query and the renderer
 * ask of its body, wherever it is (ADR 0019). They never read a box off it:
 * a box is one shape (`boxShape`), the Crawler's, the Runner's and the
 * Heavy's; the Siege Walker's is another, one rigid body whose legs are
 * parts of it, that can tip.
 */
export interface EnemyShape {
  /** The convex parts it collides with, about its centre. */
  readonly parts: readonly Polygon[];
  /** Its outline about its centre: what is drawn, and what pops. */
  readonly outline: Polygon;
  /** The area (px²) it weighs, as ink of its type's density. */
  readonly area: number;
  /** Whether the engine keeps it upright: it never turns, so it is never Tipped. */
  readonly staysUpright: boolean;
  /** What it covers posed at `at`, in world coordinates. */
  bounds(at: Transform): Bounds;
  /** Where its feet are posed at `at`: the lowest y of its parts. */
  feet(at: Transform): number;
  /** How it climbs and is climbed, if it does: none for a shape that never climbs. */
  readonly climb?: ClimbShape;
  /** Its body and legs apart, for a shape whose legs are drawn walking; none for a box. */
  readonly limbs?: Limbs;
}

/**
 * A legged shape's body and legs apart, about its centre, standing: only
 * the drawing swings the legs (the gait), its parts stay as they stand.
 */
export interface Limbs {
  /** Its body, without its legs. */
  readonly hull: Polygon;
  /** Each leg, from the back (left) to the front, from its top left corner round; it swings about its top. */
  readonly legs: readonly Polygon[];
}

/** What climbing asks of an Enemy's shape (ADR 0011, ADR 0013). */
export interface ClimbShape {
  /** Its height (px): the climbing step is measured in it. */
  readonly height: number;
  /** The top of it posed at `at` (y): the top of the step it makes for a climber. */
  top(at: Transform): number;
  /**
   * The room it needs to stand just ahead of where it is posed at `at`,
   * walking toward `heading` (+1 or -1), with its feet at `feet` (y): a
   * convex polygon in world coordinates.
   */
  roomAhead(at: Transform, heading: number, feet: number): Polygon;
}

/**
 * Height (px) of the bevel at each bottom corner of a box, at most: taller
 * than a Line is thick, so it can ride up onto one lying on the ground.
 */
const BEVEL_HEIGHT = 12;
/**
 * The bevel's slope: 3 up in 4 across, about 37°, gentle enough that a
 * walkForce of one weight climbs it without friction.
 */
const BEVEL_RUN = 4 / 3;
/** Size (px) of the cut at each top corner. */
const TOP_CUT = 4;

/**
 * A box `width` × `height` about its centre: upright, with its top corners
 * cut and its bottom corners bevelled, so that it rides up onto a Line lying
 * on the ground, and over the seams of the Terrain, as a rounded box would.
 * One convex polygon.
 */
export function boxOutline(width: number, height: number): Polygon {
  const w = width / 2;
  const h = height / 2;
  // A narrow body keeps a flat bottom: the bevels together take at most 80% of its width.
  const rise = Math.min(BEVEL_HEIGHT, height / 4, (0.4 * width) / BEVEL_RUN);
  const run = rise * BEVEL_RUN;
  const cut = Math.min(TOP_CUT, w / 4, h / 4);
  return [
    { x: -w + cut, y: -h },
    { x: w - cut, y: -h },
    { x: w, y: -h + cut },
    { x: w, y: h - rise },
    { x: w - run, y: h },
    { x: -w + run, y: h },
    { x: -w, y: h - rise },
    { x: -w, y: -h + cut },
  ];
}

/** Box shapes made so far, by size: one shape for each, so two of a size are equal. */
const boxes = new Map<string, EnemyShape>();

/**
 * The shape of a box Enemy `width` × `height`: one convex part, its
 * outline, kept upright by the engine, so it is never Tipped. It climbs,
 * and is climbed, by its height.
 */
export function boxShape(width: number, height: number): EnemyShape {
  const key = `${width}x${height}`;
  let shape = boxes.get(key);
  if (!shape) boxes.set(key, (shape = newBoxShape(width, height)));
  return shape;
}

function newBoxShape(width: number, height: number): EnemyShape {
  const outline = boxOutline(width, height);
  return {
    parts: [outline],
    outline,
    // Its whole box, bevels and cuts included, as it has always weighed.
    area: width * height,
    staysUpright: true,
    bounds: (at) => polygonBounds(transformPoints(outline, at)),
    feet: (at) => at.y + height / 2,
    climb: {
      height,
      top: (at) => at.y - height / 2,
      roomAhead: (at, heading, feet) => {
        const near = at.x + (heading * width) / 2;
        const far = near + heading * width;
        const [minX, maxX] = [Math.min(near, far), Math.max(near, far)];
        const minY = feet - height;
        return [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: feet },
          { x: minX, y: feet },
        ];
      },
    },
  };
}

/**
 * The Siege Walker's proportions, for a body 220 wide and 200 tall: a hull
 * 110 tall on four legs 20 wide and 90 tall, outer foot to outer foot 180.
 * Its shape scales them to the width and height its numbers give.
 */
const WALKER_WIDTH = 220;
const WALKER_HEIGHT = 200;
const HULL_HEIGHT = 110;
const LEG_WIDTH = 20;
const FOOTPRINT = 180;
const LEGS = 4;
/**
 * The bevel at each side of a foot, in its own leg's widths across and
 * px up: taller than a Line is thick, so a foot rides up onto one lying on
 * the ground rather than catching on it.
 */
const FOOT_RUN = 0.35;
const FOOT_RISE = 12;
/** How far (px) above the ground its middle legs stop colliding: higher than the top of a slope rises under them. */
const MIDDLE_LIFT = 20;

/** Siege Walker shapes made so far, by size. */
const walkers = new Map<string, EnemyShape>();

/**
 * The Siege Walker's shape, `width` × `height` all told: a hull on four
 * legs, one rigid body that can tip (ADR 0019), about the centre of its box.
 * The hull and the legs are its convex parts, but the middle legs collide
 * only down to `MIDDLE_LIFT` above the ground (ADR 0023). Its weight is high, on a footprint narrower
 * than it is tall, so it can be tipped. It never climbs, and is never a
 * step.
 */
export function siegeWalkerShape(width: number, height: number): EnemyShape {
  const key = `${width}x${height}`;
  let shape = walkers.get(key);
  if (!shape) walkers.set(key, (shape = newSiegeWalkerShape(width, height)));
  return shape;
}

function newSiegeWalkerShape(width: number, height: number): EnemyShape {
  const sx = width / WALKER_WIDTH;
  const w = width / 2;
  const h = height / 2;
  // Where the hull's underside is, and the legs' tops.
  const knee = -h + (HULL_HEIGHT * height) / WALKER_HEIGHT;
  const cut = Math.min(TOP_CUT, w / 4);
  const hull = [
    { x: -w + cut, y: -h },
    { x: w - cut, y: -h },
    { x: w, y: -h + cut },
    { x: w, y: knee },
    { x: -w, y: knee },
    { x: -w, y: -h + cut },
  ];
  const legWidth = LEG_WIDTH * sx;
  const outer = (FOOTPRINT * sx - legWidth) / 2;
  const run = FOOT_RUN * legWidth;
  const rise = Math.min(FOOT_RISE, (h - knee) / 4);
  // Each leg from the back (left) to the front, from its top left corner round.
  const legs: Polygon[] = Array.from({ length: LEGS }, (_, k) => {
    const middle = -outer + (2 * outer * k) / (LEGS - 1);
    const [left, right] = [middle - legWidth / 2, middle + legWidth / 2];
    return [
      { x: left, y: knee },
      { x: right, y: knee },
      { x: right, y: h - rise },
      { x: right - run, y: h },
      { x: left + run, y: h },
      { x: left, y: h - rise },
    ];
  });
  // Its silhouette: round the hull's top, then along its underside from the
  // front back, down and up each leg on the way.
  const outline: Polygon = [
    ...hull.slice(0, 4),
    ...[...legs].reverse().flatMap((leg) => [1, 2, 3, 4, 5, 0].map((k) => leg[k]!)),
    ...hull.slice(4),
  ];
  // Its middle legs collide only down to a little above the ground: reaching
  // it, they would catch the corner at the top of a slope as a bar under
  // them and trip it (ADR 0023). It still weighs them whole.
  const lift = (MIDDLE_LIFT * height) / WALKER_HEIGHT;
  const lifted = (leg: Polygon): Polygon => [
    leg[0]!,
    leg[1]!,
    { x: leg[1]!.x, y: h - lift },
    { x: leg[0]!.x, y: h - lift },
  ];
  const parts = [hull, ...legs.map((leg, k) => (k === 0 || k === LEGS - 1 ? leg : lifted(leg)))];
  const posed = (at: Transform) => parts.flatMap((part) => transformPoints(part, at));
  return {
    parts,
    outline,
    area: [hull, ...legs].reduce((sum, part) => sum + polygonArea(part), 0),
    staysUpright: false,
    bounds: (at) => polygonBounds(posed(at)),
    feet: (at) => polygonBounds(posed(at)).maxY,
    limbs: { hull, legs },
  };
}
