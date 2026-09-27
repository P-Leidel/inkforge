import {
  capsuleOverlapsPolygon,
  circleOverlapsPolygon,
  convexPolygonsOverlap,
} from '../geometry/overlap';
import {
  polygonBounds,
  polygonContainsPoint,
  type Bounds,
  type Polygon,
} from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { applyTransform, transformPoints, type Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { BodyId, NearBody, PhysicsWorld } from '../physics';
import { COLLIDER_TOLERANCE } from '../stroke/stroke-rules';
import type { ArenaBodies, Figure, Form } from './arena-bodies';
import { brushTouchesCapsules, brushTouchesCircle, brushTouchesPolygon, type Brush } from './brush';
import type { Thing } from './happenings';

/**
 * The Arena query: what is where. It answers every question about place,
 * over every body's shapes and every Patch's capsule, as Arena bodies holds
 * them, where they are now. The engine's broadphase is its index, so a
 * question costs what is near it, not what is in the Arena. It only reads:
 * a rule that moves bodies, like the Squeeze, asks it and moves them itself.
 *
 * Each question tests the shapes it always has: which Object is under a
 * point, and what the Eraser's brush touches, go by an Object's Outline;
 * where an Object may go, and what a Line crosses, go by its collider
 * parts, the Outline simplified by up to `COLLIDER_TOLERANCE`.
 */

/** What the query asks of the physics module. */
export type QueryPhysics = Pick<PhysicsWorld, 'shapesNear' | 'getTransform' | 'bodiesWithin'>;

/** An Object, as a query names it. */
export type FoundObject = Extract<Thing, { readonly thing: 'object' }>;

type ObjectForm = Extract<Form, { readonly kind: 'object' }>;

/** A capsule in world coordinates: a segment thickened by `radius`. */
export interface Capsule {
  readonly segment: Segment;
  readonly radius: number;
}

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
        default:
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
