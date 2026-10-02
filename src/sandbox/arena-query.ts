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
import { distanceSegmentToSegment, type Segment } from '../geometry/segment';
import { capsulePolygon } from '../geometry/separation';
import { applyTransform, transformPoints, type Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { BodyId, NearBody, NearShape, PhysicsWorld } from '../physics';
import { COLLIDER_TOLERANCE } from '../stroke/stroke-rules';
import { spawnEdgeX, type Arena } from './arena';
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
 * Beyond the Spawn edge, the screen's edge on the Arena's Spawn side, is out
 * of reach of drawing: a new Line is cut there, and a new Object may not
 * reach past it.
 */

/** What the query asks of the physics module. */
export type QueryPhysics = Pick<
  PhysicsWorld,
  'shapesNear' | 'getTransform' | 'bodiesWithin' | 'shapesWithin'
>;

/** An Object, as a query names it. */
export type FoundObject = Extract<Thing, { readonly thing: 'object' }>;

type ObjectForm = Extract<Form, { readonly kind: 'object' }>;
type CapsulesForm = Extract<Form, { readonly kind: 'capsules' }>;
type EnemyForm = Extract<Form, { readonly kind: 'enemy' }>;

/** What a new Line touches (`ArenaQuery.touchingLine`). */
export interface LineTouches {
  /** Whether it touches the Terrain, the Ink Core or a fixed (Grounded) Piece. */
  readonly grounded: boolean;
  /** The Lines that aren't Grounded whose Pieces it touches, by id, oldest first. */
  readonly loose: readonly number[];
}

/** What the query reads of the Arena: where its Spawn edge is. */
export type SpawnEdge = Pick<Arena, 'spawnSide' | 'width'>;

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

/** Far enough (px) to stand for "without end" around the Arena. */
const FAR = 1e5;

/** Everything beyond the Spawn edge, out of view, as a region of the Arena. */
function beyondSpawnEdge(arena: SpawnEdge): Bounds {
  const edge = spawnEdgeX(arena);
  return arena.spawnSide === 'left'
    ? { minX: -FAR, minY: -FAR, maxX: edge, maxY: FAR }
    : { minX: edge, minY: -FAR, maxX: FAR, maxY: FAR };
}

/**
 * Everything beyond the Spawn edge, out of view: out of reach of drawing,
 * so it cuts a new Line like the Terrain and blocks a new Object.
 */
function beyondSpawnEdgePolygon(arena: SpawnEdge): Polygon {
  const { minX, minY, maxX, maxY } = beyondSpawnEdge(arena);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

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
    /** The Arena as it is now, for its Spawn edge. */
    private readonly arena: () => SpawnEdge,
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

  /**
   * A Piece's capsule centre lines where it is now: a fixed Piece's never
   * move, and a Piece of a Line that isn't Grounded moves with its body.
   */
  private segments(body: BodyId, form: CapsulesForm): readonly Segment[] {
    if (!form.moves) return form.segments;
    const transform = this.physics.getTransform(body);
    if (transform.x === 0 && transform.y === 0 && transform.angle === 0) return form.segments;
    return form.segments.map(({ a, b }) => ({
      a: applyTransform(a, transform),
      b: applyTransform(b, transform),
    }));
  }

  /** A circle's centre where it is now. */
  private centre(body: BodyId): Vec2 {
    const { x, y } = this.physics.getTransform(body);
    return { x, y };
  }

  /** An Enemy's outline where it is now: it never rotates. */
  private enemyOutline(body: BodyId, { outline }: EnemyForm): Polygon {
    return transformPoints(outline, this.physics.getTransform(body));
  }

  /**
   * What a figure covers where it is now, in world coordinates; null for a
   * Patch, which goes with its host.
   */
  private extent({ body, form }: Figure): Bounds | null {
    switch (form.kind) {
      case 'terrain':
        return polygonBounds(form.polygons.flat());
      case 'object':
        return polygonBounds(this.outline(body, form));
      case 'enemy':
        return polygonBounds(this.enemyOutline(body, form));
      case 'capsules':
        return grow(polygonBounds(this.segments(body, form).flatMap(ends)), form.radius);
      case 'circle': {
        const { x, y } = this.centre(body);
        return {
          minX: x - form.radius,
          minY: y - form.radius,
          maxX: x + form.radius,
          maxY: y + form.radius,
        };
      }
      case 'capsule':
        return null;
    }
  }

  /** What there is, not a Patch, whose extent near `region` passes `test`, oldest first. */
  private wholly(region: Bounds, test: (extent: Bounds) => boolean): Thing[] {
    const found: Thing[] = [];
    for (const figure of this.near(region, 0)) {
      if (!figure.what) continue;
      const extent = this.extent(figure);
      if (extent && test(extent)) found.push(figure.what);
    }
    return found;
  }

  /**
   * Out over the Spawn edge: everything, but the Terrain, the Ink Core and
   * the Patches on things, that lies wholly beyond the Spawn edge, out of
   * view. Oldest first.
   */
  beyondSpawnEdge(): Thing[] {
    const arena = this.arena();
    const edge = spawnEdgeX(arena);
    const beyond =
      arena.spawnSide === 'left'
        ? ({ maxX }: Bounds) => maxX < edge
        : ({ minX }: Bounds) => minX > edge;
    return this.wholly(beyondSpawnEdge(arena), beyond);
  }

  /**
   * Below the screen: everything, but the Terrain, the Ink Core and the
   * Patches on things, that lies wholly below `bottom`, the bottom of the
   * screen. Oldest first.
   */
  below(bottom: number): Thing[] {
    const region = { minX: -FAR, minY: bottom, maxX: FAR, maxY: FAR };
    return this.wholly(region, ({ minY }) => minY > bottom);
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
   * drawn along `path` is cut at, near it: the Terrain's, the Ink Core's,
   * each Enemy's outline where it is now, and everything beyond the Spawn
   * edge. Objects, Lines, Rubble, Droplets and Patches don't cut one.
   */
  lineCutters(path: readonly Vec2[]): Polygon[] {
    const near = this.near(polygonBounds(path), 0).flatMap(({ body, form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons;
        case 'enemy':
          return [this.enemyOutline(body, form)];
        case 'object':
        case 'capsules':
        case 'circle':
        case 'capsule':
          return [];
      }
    });
    return [...near, beyondSpawnEdgePolygon(this.arena())];
  }

  /**
   * Overlap: whether a convex part of a new Object, in world coordinates,
   * overlaps something solid by more than `TOUCH_TOLERANCE`: the Terrain,
   * the Ink Core, an Object's collider parts, Rubble, an Enemy, or what
   * lies beyond the Spawn edge. Lines aren't solid (an Object drawn over one
   * is squeezed off it), nor are Droplets or Patches.
   */
  overlapsSolid(part: Polygon): boolean {
    if (convexPolygonsOverlap(part, beyondSpawnEdgePolygon(this.arena()))) return true;
    return this.near(polygonBounds(part), 0).some(({ what, body, form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons.some((solid) => convexPolygonsOverlap(part, solid));
        case 'object':
          return this.parts(body, form).some((solid) => convexPolygonsOverlap(part, solid));
        case 'circle':
          if (what?.thing !== 'rubble') return false;
          return circleOverlapsPolygon({ centre: this.centre(body), radius: form.radius }, part);
        case 'enemy':
          return convexPolygonsOverlap(part, this.enemyOutline(body, form));
        case 'capsules':
        case 'capsule':
          // Lines and Patches aren't solid.
          return false;
      }
    });
  }

  /**
   * Room for an Enemy: whether its body, a convex polygon in world
   * coordinates, would overlap by more than `TOUCH_TOLERANCE` the Terrain,
   * the Ink Core, an Object's collider parts, Rubble or another Enemy.
   * Lines, Droplets and Patches don't count.
   */
  blocksEnemy(outline: Polygon): boolean {
    return this.near(polygonBounds(outline), 0).some(({ what, body, form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons.some((solid) => convexPolygonsOverlap(outline, solid));
        case 'object':
          return this.parts(body, form).some((solid) => convexPolygonsOverlap(outline, solid));
        case 'enemy':
          return convexPolygonsOverlap(outline, this.enemyOutline(body, form));
        case 'circle':
          if (what?.thing !== 'rubble') return false;
          return circleOverlapsPolygon({ centre: this.centre(body), radius: form.radius }, outline);
        case 'capsules':
        case 'capsule':
          return false;
      }
    });
  }

  /**
   * Room over a step: whether `room`, a convex polygon in world coordinates,
   * is filled by more than `TOUCH_TOLERANCE` with what an Enemy climbs: the
   * Terrain, the Ink Core, an Object's collider parts or a Line, each
   * Piece's capsule as `capsulePolygon` encloses it. Enemies climb each
   * other by their own rule, and Rubble, Droplets and Patches don't count.
   */
  blocksClimb(room: Polygon): boolean {
    return this.near(polygonBounds(room), 0).some(({ body, form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons.some((solid) => convexPolygonsOverlap(room, solid));
        case 'object':
          return this.parts(body, form).some((solid) => convexPolygonsOverlap(room, solid));
        case 'capsules':
          return this.segments(body, form).some((segment) =>
            convexPolygonsOverlap(room, capsulePolygon(segment, form.radius)),
          );
        case 'enemy':
        case 'circle':
        case 'capsule':
          return false;
      }
    });
  }

  /**
   * Squeeze: whether a convex part of the Object with body `squeezed`,
   * moved to where a Squeeze would leave it, in world coordinates, overlaps
   * by more than `TOUCH_TOLERANCE` what it must end clear of: the Terrain,
   * another Object's collider parts, Rubble, or a Line, each Piece's capsule
   * as `capsulePolygon` encloses it. Droplets and Patches don't count.
   */
  blocksSqueezed(part: Polygon, squeezed: BodyId): boolean {
    return this.near(polygonBounds(part), 0).some(({ what, body, form }) => {
      switch (form.kind) {
        case 'terrain':
          return form.polygons.some((solid) => convexPolygonsOverlap(part, solid));
        case 'object':
          if (body === squeezed) return false;
          return this.parts(body, form).some((solid) => convexPolygonsOverlap(part, solid));
        case 'capsules':
          return this.segments(body, form).some((segment) =>
            convexPolygonsOverlap(part, capsulePolygon(segment, form.radius)),
          );
        case 'circle':
          if (what?.thing !== 'rubble') return false;
          return circleOverlapsPolygon({ centre: this.centre(body), radius: form.radius }, part);
        case 'enemy':
        case 'capsule':
          // Enemies move out of its way, and Patches don't count.
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
      for (const { what, body, form } of this.near(polygonBounds(run.flatMap(ends)), 0)) {
        if (form.kind !== 'capsules' || what?.thing !== 'piece') continue;
        for (const segment of this.segments(body, form))
          bands.push({ segment, radius: form.radius });
      }
      for (const { a, b } of run) found.push(...partsInsideCapsules(a, b, bands));
    }
    return found;
  }

  /**
   * Grounding: what a new Line, the capsules `capsules` in world
   * coordinates, touches within `tolerance` px of its surface: whether it
   * touches the Terrain, the Ink Core or a fixed Piece (one of a Grounded
   * Line), and which Lines that aren't Grounded it touches. Objects, Rubble,
   * Enemies, Droplets and Patches never ground a Line.
   */
  touchingLine(capsules: readonly Capsule[], tolerance: number): LineTouches {
    let grounded = false;
    const loose = new Set<number>();
    for (const { segment, radius } of capsules) {
      const { a, b } = segment;
      const reach = radius + tolerance;
      for (const { what, body, form } of this.near(polygonBounds([a, b]), reach)) {
        switch (form.kind) {
          case 'terrain':
            if (!grounded)
              grounded = form.polygons.some((solid) =>
                capsuleOverlapsPolygon(a, b, reach, solid, 0),
              );
            break;
          case 'capsules': {
            if (what?.thing !== 'piece' || (!form.moves && grounded)) break;
            if (form.moves && loose.has(what.id)) break;
            const touches = this.segments(body, form).some(
              (other) => distanceSegmentToSegment(a, b, other.a, other.b) <= reach + form.radius,
            );
            if (!touches) break;
            if (form.moves) loose.add(what.id);
            else grounded = true;
            break;
          }
          case 'object':
          case 'enemy':
          case 'circle':
          case 'capsule':
            break;
        }
      }
    }
    return { grounded, loose: [...loose].sort((p, q) => p - q) };
  }

  /**
   * Near an Enemy: whether a path along `samples`, in world coordinates,
   * comes within an Enemy body's width of its outline, where it is now:
   * every body an Enemy has counts, each by its own width. `widest` is at
   * least the widest Enemy body's width, how far around the path to look.
   */
  nearEnemy(samples: readonly Vec2[], widest: number): boolean {
    if (samples.length === 0) return false;
    const path: Segment[] =
      samples.length === 1
        ? [{ a: samples[0]!, b: samples[0]! }]
        : samples.slice(1).map((b, k) => ({ a: samples[k]!, b }));
    return this.near(polygonBounds(samples), widest).some(({ body, form }) => {
      if (form.kind !== 'enemy') return false;
      const outline = this.enemyOutline(body, form);
      const { minX, maxX } = polygonBounds(outline);
      return path.some(({ a, b }) => capsuleOverlapsPolygon(a, b, maxX - minX, outline, 0));
    });
  }

  /**
   * Brush: everything the Eraser's brush touches, oldest first: Objects by
   * their Outline, Pieces, Rubble, Droplets and Patches. Never the Terrain,
   * the Ink Core or an Enemy.
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
      case 'enemy':
        return false;
      case 'object':
        return brushTouchesPolygon(brush, this.outline(body, form));
      case 'capsules':
        return brushTouchesCapsules(brush, this.segments(body, form), form.radius);
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

  /**
   * Radius, shape by shape: every body's own shape, not a Patch, within
   * `radius` px of `centre`, measured to its nearest point. In no
   * particular order.
   */
  shapesWithin(centre: Vec2, radius: number): NearShape[] {
    return this.physics.shapesWithin(centre, radius);
  }
}
