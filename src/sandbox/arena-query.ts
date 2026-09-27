import { partsInsideCapsules } from '../geometry/clip';
import {
  capsuleOverlapsPolygon,
  circleOverlapsPolygon,
  convexPolygonsOverlap,
  type Capsule,
} from '../geometry/overlap';
import {
  polygonBounds,
  polygonContainsPoint,
  type Bounds,
  type Polygon,
} from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { capsulePolygon } from '../geometry/separation';
import { applyTransform, transformPoints, type Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { BodyId, NearBody, PhysicsWorld } from '../physics';
import { COLLIDER_TOLERANCE } from '../stroke/stroke-rules';
import type { ArenaBodies, Figure, Form } from './arena-bodies';
import { brushTouchesCapsules, brushTouchesCircle, brushTouchesPolygon, type Brush } from './brush';
import type { Thing } from './happenings';

export type { Capsule } from '../geometry/overlap';

/**
 * The Arena query: what is where. It answers every question about place,
 * over every body's shapes and every Patch's capsule, as Arena bodies holds
 * them, where they are now. The engine's broadphase is its index, so a
 * question costs what is near it, not what is in the Arena. It only reads:
 * a rule that moves bodies, like the Squeeze, asks it and moves them itself.
 *
 * Each question tests the shapes it always has: which Object is under a
 * point, and what the Eraser's brush touches, go by an Object's Outline;
 * where an Object may go, where a squeezed one may end, and what a Line
 * crosses, go by its collider parts, the Outline simplified by up to
 * `COLLIDER_TOLERANCE`; what lies on a Line goes by each Piece's band.
 *
 * It is the one answer to what a new Stroke meets: what cuts a new Line,
 * what blocks a new Object, and what a squeezed Object must end clear of.
 * Whatever kind of body Arena bodies holds takes part as its form says.
 */

/** What the query asks of the physics module. */
export type QueryPhysics = Pick<PhysicsWorld, 'shapesNear' | 'getTransform' | 'bodiesWithin'>;

/** An Object, as a query names it. */
export type FoundObject = Extract<Thing, { readonly thing: 'object' }>;

type ObjectForm = Extract<Form, { readonly kind: 'object' }>;

/**
 * How far (px) outside the engine's shapes what the query tests may reach:
 * an Object's Outline lies up to `COLLIDER_TOLERANCE` outside its collider
 * parts, and the engine rounds its shapes a little.
 */
const SLACK = COLLIDER_TOLERANCE + 2;

const grow = ({ minX, minY, maxX, maxY }: Bounds, by: number): Bounds => ({
  minX: minX - by,
  minY: minY - by,
  maxX: maxX + by,
  maxY: maxY + by,
});

/**
 * How far (px) a run of a path's segments may spread before the query looks
 * near it again: raw pointer samples are a pixel or two apart, and testing
 * a few more bands costs less than asking the broadphase at each of them.
 */
const RUN_SPAN = 32;

const ends = ({ a, b }: Segment): Vec2[] => [a, b];

/** A path's segments in runs of consecutive ones, each within `RUN_SPAN` px across. */
function runs(path: readonly Segment[]): Segment[][] {
  const found: Segment[][] = [];
  let run: Segment[] = [];
  let bounds: Bounds | null = null;
  for (const segment of path) {
    const { a, b } = segment;
    const grown: Bounds = {
      minX: Math.min(bounds?.minX ?? Infinity, a.x, b.x),
      minY: Math.min(bounds?.minY ?? Infinity, a.y, b.y),
      maxX: Math.max(bounds?.maxX ?? -Infinity, a.x, b.x),
      maxY: Math.max(bounds?.maxY ?? -Infinity, a.y, b.y),
    };
    const wide = Math.max(grown.maxX - grown.minX, grown.maxY - grown.minY) > RUN_SPAN;
    if (run.length > 0 && wide) {
      found.push(run);
      run = [];
      bounds = polygonBounds([a, b]);
    } else {
      bounds = grown;
    }
    run.push(segment);
  }
  if (run.length > 0) found.push(run);
  return found;
}

export class ArenaQuery {
  constructor(
    private readonly physics: QueryPhysics,
    private readonly bodies: Pick<ArenaBodies<unknown>, 'figures'>,
  ) {}

  /** Every body and Patch that may reach within `margin` px of `bounds`, oldest first. */
  private near(bounds: Bounds, margin: number): Figure[] {
    return this.bodies.figures(this.physics.shapesNear(grow(bounds, margin + SLACK)));
  }

  /** An Object's Outline where it is now. */
  private outline(body: BodyId, { outline }: ObjectForm): Polygon {
    return transformPoints(outline, this.physics.getTransform(body));
  }

  /** An Object's collider parts where it is now. */
  private parts(body: BodyId, { parts }: ObjectForm): Polygon[] {
    const transform: Transform = this.physics.getTransform(body);
    return parts.map((part) => transformPoints(part, transform));
  }

  /** A circle's centre where it is now. */
  private centre(body: BodyId): Vec2 {
    const { x, y } = this.physics.getTransform(body);
    return { x, y };
  }

  /**
   * Point: the Objects whose Outline, where it is now, holds `point`,
   * oldest first. The last is the topmost.
   */
  objectsAt(point: Vec2): FoundObject[] {
    const found: FoundObject[] = [];
    for (const { what, body, form } of this.near(polygonBounds([point]), 0)) {
      if (form.kind !== 'object' || what?.thing !== 'object') continue;
      if (polygonContainsPoint(this.outline(body, form), point)) found.push(what);
    }
    return found;
  }

  /**
   * Cutting: the convex polygons, in world coordinates, that a new Line
   * drawn along `path` is cut at, near it: the Terrain's. Objects, Lines,
   * Rubble, Droplets and Patches don't cut one.
   */
  lineCutters(path: readonly Vec2[]): Polygon[] {
    return this.near(polygonBounds(path), 0).flatMap(({ form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons;
        case 'object':
        case 'capsules':
        case 'circle':
        case 'capsule':
          return [];
      }
    });
  }

  /**
   * Overlap: whether a convex part of a new Object, in world coordinates,
   * overlaps something solid by more than `TOUCH_TOLERANCE`: the Terrain,
   * an Object's collider parts, or Rubble. Lines aren't solid (an Object
   * drawn over one is squeezed off it), nor are Droplets or Patches.
   */
  overlapsSolid(part: Polygon): boolean {
    return this.near(polygonBounds(part), 0).some(({ what, body, form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons.some((solid) => convexPolygonsOverlap(part, solid));
        case 'object':
          return this.parts(body, form).some((solid) => convexPolygonsOverlap(part, solid));
        case 'circle':
          if (what?.thing !== 'rubble') return false;
          return circleOverlapsPolygon({ centre: this.centre(body), radius: form.radius }, part);
        case 'capsules':
        case 'capsule':
          // Lines and Patches aren't solid.
          return false;
      }
    });
  }

  /**
   * Squeeze: whether a convex part of the Object with body `squeezed`,
   * moved to where a Squeeze would leave it, in world coordinates, overlaps
   * by more than `TOUCH_TOLERANCE` what it must end clear of: the Terrain,
   * another Object's collider parts, or a Line, each Piece's capsule as
   * `capsulePolygon` encloses it. Droplets and Patches don't count.
   */
  blocksSqueezed(part: Polygon, squeezed: BodyId): boolean {
    return this.near(polygonBounds(part), 0).some(({ body, form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons.some((solid) => convexPolygonsOverlap(part, solid));
        case 'object':
          if (body === squeezed) return false;
          return this.parts(body, form).some((solid) => convexPolygonsOverlap(part, solid));
        case 'capsules':
          return form.segments.some((segment) =>
            convexPolygonsOverlap(part, capsulePolygon(segment, form.radius)),
          );
        case 'circle':
        case 'capsule':
          // Rubble, Droplets and Patches don't count.
          return false;
      }
    });
  }

  /**
   * Crossing: the Objects whose collider parts, where they are now, one of
   * `capsules` overlaps by more than `TOUCH_TOLERANCE`, in drawing order.
   */
  objectsCrossing(capsules: readonly Capsule[]): FoundObject[] {
    // Each Object near a capsule, with the capsules it is near.
    const crossedBy = new Map<FoundObject, { parts: Polygon[]; capsules: Capsule[] }>();
    for (const capsule of capsules) {
      const { a, b } = capsule.segment;
      for (const { what, body, form } of this.near(polygonBounds([a, b]), capsule.radius)) {
        if (form.kind !== 'object' || what?.thing !== 'object') continue;
        let near = crossedBy.get(what);
        if (!near) {
          near = { parts: this.parts(body, form), capsules: [] };
          crossedBy.set(what, near);
        }
        near.capsules.push(capsule);
      }
    }
    const found = [...crossedBy].filter(([, { parts, capsules }]) =>
      capsules.some(({ segment: { a, b }, radius }) =>
        parts.some((part) => capsuleOverlapsPolygon(a, b, radius, part)),
      ),
    );
    return found.map(([what]) => what).sort((p, q) => p.id - q.id);
  }

  /**
   * Lying on a Line: the parts of `path`, centre lines in world coordinates,
   * that lie on a Line: inside a standing Piece's band, within half its
   * thickness of its centre line. Any Colour counts; the Terrain, Objects,
   * Rubble, Droplets and Patches don't. In order along `path`.
   */
  lyingOnLines(path: readonly Segment[]): Segment[] {
    const found: Segment[] = [];
    for (const run of runs(path)) {
      const bands: Capsule[] = [];
      for (const { what, form } of this.near(polygonBounds(run.flatMap(ends)), 0)) {
        if (form.kind !== 'capsules' || what?.thing !== 'piece') continue;
        for (const segment of form.segments) bands.push({ segment, radius: form.radius });
      }
      for (const { a, b } of run) found.push(...partsInsideCapsules(a, b, bands));
    }
    return found;
  }

  /**
   * Brush: everything the Eraser's brush touches, oldest first: Objects by
   * their Outline, Pieces, Rubble, Droplets and Patches. Never the Terrain.
   */
  touchedBy(brush: Brush): Thing[] {
    const bounds = polygonBounds(brush.path);
    const touched: Thing[] = [];
    for (const figure of this.near(bounds, brush.radius)) {
      if (figure.what && this.touches(brush, figure)) touched.push(figure.what);
    }
    return touched;
  }

  private touches(brush: Brush, { body, form }: Figure): boolean {
    switch (form.kind) {
      case 'terrain':
        return false;
      case 'object':
        return brushTouchesPolygon(brush, this.outline(body, form));
      case 'capsules':
        return brushTouchesCapsules(brush, form.segments, form.radius);
      case 'circle':
        return brushTouchesCircle(brush, this.centre(body), form.radius);
      case 'capsule': {
        const transform = this.physics.getTransform(body);
        const { a, b } = form.segment;
        const segment = { a: applyTransform(a, transform), b: applyTransform(b, transform) };
        return brushTouchesCapsules(brush, [segment], form.radius);
      }
    }
  }

  /**
   * Radius: every body with one of its own shapes, not a Patch, within
   * `radius` px of `centre`, measured to that shape's nearest point. In no
   * particular order.
   */
  bodiesWithin(centre: Vec2, radius: number): NearBody[] {
    return this.physics.bodiesWithin(centre, radius);
  }
}
