import { polygonBounds, type Bounds, type Polygon } from '../geometry/polygon';
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
  /** Whether the engine keeps it upright: it never turns. */
  readonly staysUpright: boolean;
  /** What it covers posed at `at`, in world coordinates. */
  bounds(at: Transform): Bounds;
  /** Where its feet are posed at `at`: the lowest y of its parts. */
  feet(at: Transform): number;
  /** Whether it stands upright posed at `at`: it walks only then; otherwise it is Tipped. */
  upright(at: Transform): boolean;
  /** How it climbs and is climbed, if it does: none for a shape that never climbs. */
  readonly climb?: ClimbShape;
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
    staysUpright: true,
    bounds: (at) => polygonBounds(transformPoints(outline, at)),
    feet: (at) => at.y + height / 2,
    upright: () => true,
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
