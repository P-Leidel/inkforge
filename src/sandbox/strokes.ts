import { capsuleOverlapsPolygon } from '../geometry/overlap';
import { bandPolygon, capsulePolygon, shortestWayOut } from '../geometry/separation';
import { polygonBounds, polygonCentroid, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { applyTransform, transformPoints, type Transform } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillInk, lineInk, outlineInk } from '../materials/ink';
import { fillMass, lineMass, outlineMass } from '../materials/mass';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import { pieceCentre } from '../stroke/pieces';
import type { StrokeResult } from '../stroke/stroke-pipeline';
import type { ArenaBodies, ObjectBody } from './arena-bodies';
import { motionOf, type Kind, type Motion, type Poses } from './arena-contents';
import type { ArenaQuery, Capsule, LineTouches } from './arena-query';
import type { PartyId } from './contact-ledger';
import type { Happening, Why } from './happenings';
import type { Broken } from './material-rules';
import type { Breakable, Numbers } from './numbers';
import type { PreviousPoses } from './previous-poses';
import { WAITING, type StickState } from './sticking';

/** Speed (px/s) at which a Line squeezes an Object off itself; Box2D's push-out cap. */
export const SLIDE_OUT_SPEED = 250;
/**
 * A Line crossing an Object less deeply than this (px) only touches it: a
 * moving Object resting on a Line sinks into it a little, and isn't squeezed.
 */
const SQUEEZE_TOLERANCE = 1;
/**
 * How far (px) a squeezed Object ends up clear of the Lines it slides off.
 * Less than the engine's contact margin (1 px), so it restarts touching the
 * Line under it, rather than dropping onto it: a heavy Object dropping even
 * 1 px would hit a red Line hard enough to damage it.
 */
const SQUEEZE_MARGIN = 0.5;
/** How far (px) beyond a Line's edge a right-click still Releases it. */
const RELEASE_REACH = 4;
/** No pose: a Grounded Line's, whose own coordinates are the world's. */
const AT_ORIGIN: Transform = { x: 0, y: 0, angle: 0 };

export type StrokeId = number;

export interface PieceView {
  /** Its place along the Line when it was drawn, counting broken Pieces. */
  readonly index: number;
  /** Capsule centre lines, in its Line's own coordinates. */
  readonly segments: readonly Segment[];
  /** Damage it can still take before it breaks. */
  readonly durability: number;
  /** How near it is to breaking, from 0 (whole) to 1: what its cracks show. */
  readonly wear: number;
}

/**
 * A Line. Its segments are in its own coordinates; place them with
 * `transform`. A Grounded Line never moves, so its own coordinates are the
 * world's; one that isn't Grounded moves as one body.
 */
export interface LineView extends Poses {
  readonly id: StrokeId;
  readonly colour: Colour;
  /** Capsule centre lines of the Pieces still there. */
  readonly segments: readonly Segment[];
  readonly thickness: number;
  /** The Pieces still there, in order along the Line. */
  readonly pieces: readonly PieceView[];
  /** Whether it is Grounded: fixed where it was drawn. */
  readonly grounded: boolean;
  /** Whether it hangs Frozen: never for a Grounded one. */
  readonly frozen: boolean;
  /** Linear velocity, px/s: 0 for a Grounded one. */
  readonly velocity: Vec2;
}

export interface ObjectView extends Poses {
  readonly id: StrokeId;
  /** The Colour of its Outline. */
  readonly colour: Colour;
  /** Outline relative to the body's origin; place it with `transform`. */
  readonly outline: Polygon;
  /** Convex collider parts relative to the body's origin. */
  readonly parts: readonly Polygon[];
  /** Linear velocity, px/s. */
  readonly velocity: Vec2;
  readonly frozen: boolean;
  /** The Colour of its Fill, or null while it is hollow. */
  readonly fill: Colour | null;
  readonly mass: number;
  /** Damage it can still take before it breaks. */
  readonly durability: number;
  /** Hits above its damage threshold so far (blue breaks on its third). */
  readonly impacts: number;
  /** How near it is to breaking, from 0 (whole) to 1: what its cracks show. */
  readonly wear: number;
}

/** The Strokes in the Arena: `world.contents.strokes`. */
export interface StrokeViews {
  readonly lines: readonly LineView[];
  readonly objects: readonly ObjectView[];
}

/** What a Stroke makes, or would make: a Line or an Object, in its Colour, and the Ink (px²) it takes. */
export type MadeStroke =
  | {
      readonly kind: 'line';
      readonly colour: Colour;
      /** Its Ink as drawn. */
      readonly ink: number;
      /** Each Piece's Ink, in order along the Line: together they are `ink`. */
      readonly pieces: readonly number[];
      /**
       * Of each Piece's Ink, in the same order, what lies on a Line that was
       * standing when it was made: where its centre line is inside that
       * Line's band.
       */
      readonly onLines: readonly number[];
      /**
       * Whether it is, or would be, Grounded: it touches the Terrain, or a
       * Grounded Line, within the ground tolerance.
       */
      readonly grounded: boolean;
    }
  | {
      readonly kind: 'object';
      readonly colour: Colour;
      /** Its Outline's Ink. */
      readonly ink: number;
    };

/** What adding a Stroke made, under its new id. */
export type AddedStroke = MadeStroke & { readonly id: StrokeId };

/** A Fill that is added, or would be: its Colour and its Ink (px²). */
export interface MadeFill {
  readonly colour: Colour;
  readonly ink: number;
}

/** What a Fill click did. */
export type FillOutcome =
  /** The Object under the click took a Fill of `colour`, of `ink` px². */
  | ({ readonly kind: 'filled'; readonly id: StrokeId } & MadeFill)
  /**
   * The Fill was not accepted, so the Object stays hollow; `outline` is its
   * Outline where it is now.
   */
  | ({ readonly kind: 'declined'; readonly id: StrokeId; readonly outline: Polygon } & MadeFill)
  /** The Object under the click holds a Fill already; `outline` is its Outline where it is now. */
  | { readonly kind: 'already-filled'; readonly id: StrokeId; readonly outline: Polygon }
  | { readonly kind: 'missed' };

/** What taking back a Stroke took, in its Colour, and its Ink (px²). */
export type RemovedStroke =
  /** A Line, whatever is left of it: `ink` is what its Pieces still there hold. */
  | { readonly kind: 'line'; readonly id: StrokeId; readonly colour: Colour; readonly ink: number }
  /** An Object: its Outline's Ink, and its Fill's, if it had one, which went with it. */
  | {
      readonly kind: 'object';
      readonly id: StrokeId;
      readonly colour: Colour;
      readonly ink: number;
      readonly fill: MadeFill | null;
    }
  /** It was gone already: broken, erased, removed or taken back. */
  | { readonly kind: 'gone'; readonly id: StrokeId };

/** What taking back a Fill took: the Object stays. */
export type RemovedFill =
  | ({ readonly kind: 'fill'; readonly id: StrokeId } & MadeFill)
  /** The Object is gone, or holds no Fill. */
  | { readonly kind: 'gone'; readonly id: StrokeId };

/** What the Stroke pipeline made of a Stroke that is added. */
export type DrawnStroke = Extract<StrokeResult, { readonly kind: 'line' | 'object' }>;

/**
 * One Piece of a Line, with its own damage: a Grounded Line's is its own
 * fixed body; one that isn't Grounded is some of its Line's body.
 */
export interface Piece extends Breakable {
  readonly kind: 'piece';
  readonly lineId: StrokeId;
  readonly index: number;
  /** In its Line's own coordinates: the world's, for a Grounded Line. */
  readonly segments: readonly Segment[];
  /** Its Party id, the same after a rebuild. */
  readonly party: PartyId;
  readonly body: BodyId;
  /** True if its Line isn't Grounded. */
  readonly loose: boolean;
}

interface LineStroke {
  readonly kind: 'line';
  readonly id: StrokeId;
  /**
   * Its Party id. A Grounded Line has no body, but each of its Pieces'
   * Parties carries it as their Stroke; one that isn't Grounded has one body,
   * whose Parties its Pieces are.
   */
  readonly party: PartyId;
  readonly colour: Colour;
  readonly thickness: number;
  /** The Pieces still there, in order; broken ones are gone. */
  pieces: Piece[];
  /** Its one body if it isn't Grounded; null for a Grounded Line. */
  body: BodyId | null;
  /**
   * Whether it has fallen: it isn't Grounded, and was Released, hit or
   * blasted loose. It stays loose, and never becomes Grounded again.
   */
  fell: boolean;
}

export interface ObjectStroke extends Breakable {
  readonly kind: 'object';
  readonly id: StrokeId;
  /** Its Party id, the same after a rebuild. */
  readonly party: PartyId;
  readonly body: BodyId;
  readonly outline: Polygon;
  readonly parts: readonly Polygon[];
  fill: Colour | null;
  /** Its Outline's mass, set when it was drawn from the densities of the time. */
  readonly outlineMass: number;
  /** Its Fill's mass, set when it was filled. */
  fillMass: number;
  /** Damage taken so far. */
  damage: number;
  /** Hits above its damage threshold so far. */
  impacts: number;
  /** Where it is in sticking once, if its Outline sticks (green). */
  sticking: StickState;
}

type Stroke = LineStroke | ObjectStroke;

/** What takes damage: an Object or a Piece. */
export type StrokeTarget = ObjectStroke | Piece;

/** The middle of a Line's segments: the middle of their bounds. */
function middleOf(segments: readonly Segment[]): Vec2 {
  const { minX, minY, maxX, maxY } = polygonBounds(segments.flatMap(({ a, b }) => [a, b]));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** A Line's capsules, one per segment of each Piece still there, in order. */
function capsulesOf(line: LineStroke): Capsule[] {
  const radius = line.thickness / 2;
  return line.pieces.flatMap((piece) => piece.segments.map((segment) => ({ segment, radius })));
}

/** An Object's pose and motion when a snapshot is taken. */
interface ObjectMotion extends Motion {
  readonly frozen: boolean;
  /** The displacement still to slide off a Line, or null. */
  readonly slide: Vec2 | null;
}

/** A Line's that isn't Grounded, when a snapshot is taken: its pose, motion and mass. */
interface LineMotion extends Motion {
  readonly frozen: boolean;
  readonly mass: number;
}

type SavedPiece = Omit<Piece, 'body'>;

type SavedStroke =
  | (Omit<LineStroke, 'pieces' | 'body'> & {
      readonly pieces: readonly SavedPiece[];
      /** Null for a Grounded Line. */
      readonly motion: LineMotion | null;
    })
  | (Omit<ObjectStroke, 'body'> & { readonly motion: ObjectMotion });

/** The Strokes' part of a snapshot. */
export interface SavedStrokes {
  readonly strokes: readonly SavedStroke[];
}

/** The fastest an Object may move and still be at rest, to be Frozen again, px/s. */
const REST_SPEED = 5;
/** The fastest an Object may turn and still be at rest, rad/s. */
const REST_SPIN = 0.05;

/** Whether a body moving so is at rest: slower than `REST_SPEED`, turning slower than `REST_SPIN`. */
function resting({ velocity, angularVelocity }: Motion): boolean {
  return Math.hypot(velocity.x, velocity.y) < REST_SPEED && Math.abs(angularVelocity) < REST_SPIN;
}

/**
 * `saved` with every Object, and every Line that isn't Grounded, at rest
 * Frozen again, where it is: one moving slower than `REST_SPEED` and
 * turning slower than `REST_SPIN`, and not sliding off a Line. The
 * Aftermath of a Wave.
 */
export function freezeResting(saved: SavedStrokes): SavedStrokes {
  const still = { velocity: { x: 0, y: 0 }, angularVelocity: 0, frozen: true };
  return {
    strokes: saved.strokes.map((stroke): SavedStroke => {
      if (stroke.kind === 'line') {
        const { motion } = stroke;
        if (!motion || motion.frozen || !resting(motion)) return stroke;
        return { ...stroke, motion: { ...motion, ...still } };
      }
      const { motion } = stroke;
      if (motion.frozen || !resting(motion) || motion.slide !== null) return stroke;
      return { ...stroke, motion: { ...motion, ...still } };
    }),
  };
}

/**
 * The Strokes: Lines with their Pieces, Objects with their Fills, taking
 * them back, the squeeze, and breaking Objects and Pieces. Stroke ids are
 * never reused, not even after R or Clear. Each Object and each Piece is a
 * Party to the Contact ledger; each Line has a Party id too, which its
 * Pieces' Parties carry as their Stroke.
 */
export class Strokes implements Kind<'strokes', SavedStrokes, StrokeViews> {
  readonly name = 'strokes';
  /** In the order they were drawn. */
  private strokes: Stroke[] = [];
  private nextId = 1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly materials: MaterialTable,
    private readonly numbers: Numbers,
    private readonly bodies: ArenaBodies<StrokeTarget>,
    private readonly query: Pick<
      ArenaQuery,
      | 'objectsAt'
      | 'objectsCrossing'
      | 'lyingOnLines'
      | 'blocksSqueezed'
      | 'touchingLine'
      | 'touchedBy'
    >,
    private readonly poses: Pick<PreviousPoses, 'of'>,
    /** Appends to the list of what happened: a Fill and a Release. */
    private readonly say: (happening: Happening) => void,
  ) {}

  get views(): StrokeViews {
    return { lines: this.lines, objects: this.objects };
  }

  get lines(): readonly LineView[] {
    return this.lineStrokes().map((line) => {
      const { body } = line;
      return {
        id: line.id,
        colour: line.colour,
        thickness: line.thickness,
        segments: line.pieces.flatMap((piece) => piece.segments),
        pieces: line.pieces.map((piece) => ({
          index: piece.index,
          segments: piece.segments,
          durability: this.numbers.durabilityLeft(piece),
          wear: this.numbers.wear(piece),
        })),
        grounded: body === null,
        ...(body === null
          ? { transform: AT_ORIGIN, previousTransform: AT_ORIGIN }
          : this.poses.of(body)),
        frozen: body !== null && this.physics.isFrozen(body),
        velocity: body === null ? { x: 0, y: 0 } : this.physics.getVelocity(body),
      };
    });
  }

  get objects(): readonly ObjectView[] {
    return this.objectStrokes().map((s) => this.viewObject(s));
  }

  private viewObject(stroke: ObjectStroke): ObjectView {
    return {
      id: stroke.id,
      colour: stroke.colour,
      outline: stroke.outline,
      parts: stroke.parts,
      ...this.poses.of(stroke.body),
      velocity: this.physics.getVelocity(stroke.body),
      frozen: this.physics.isFrozen(stroke.body),
      fill: stroke.fill,
      mass: this.physics.getMass(stroke.body),
      durability: this.numbers.durabilityLeft(stroke),
      impacts: stroke.impacts,
      wear: this.numbers.wear(stroke),
    };
  }

  /**
   * What the Line or Object the Stroke pipeline made would be in `colour`,
   * and its Ink: a Line's Pieces' each, and how much of each lies on a Line
   * standing now.
   */
  measure(result: DrawnStroke, colour: Colour): MadeStroke {
    if (result.kind === 'object')
      return { kind: 'object', colour, ink: outlineInk(result.outline) };
    const { thickness } = result;
    return {
      kind: 'line',
      colour,
      ink: lineInk(result.segments, thickness),
      pieces: result.pieces.map((piece) => lineInk(piece, thickness)),
      onLines: result.pieces.map((piece) => lineInk(this.query.lyingOnLines(piece), thickness)),
      grounded: this.touches(result.segments, thickness).grounded,
    };
  }

  /** Whether a Line along `segments`, in world coordinates, would be Grounded. */
  grounds(segments: readonly Segment[], thickness: number): boolean {
    return this.touches(segments, thickness).grounded;
  }

  /** What a Line along `segments`, in world coordinates, would touch (`ArenaQuery.touchingLine`). */
  private touches(segments: readonly Segment[], thickness: number): LineTouches {
    const capsules = segments.map((segment) => ({ segment, radius: thickness / 2 }));
    return this.query.touchingLine(capsules, this.materials.groundTolerance);
  }

  /**
   * Adds the Line or Object the Stroke pipeline made, in `colour`, and says
   * how much Ink it took. A Line touching the Terrain, or a Grounded Line,
   * is Grounded, and fixed; one that isn't hangs Frozen, as an Object does,
   * and a Grounded one grounds the Frozen Lines it touches that haven't
   * fallen. While physics is `running`, it squeezes what it crosses off the
   * Lines at once.
   */
  add(result: DrawnStroke, colour: Colour, running: boolean): AddedStroke {
    const id = this.nextId++;
    // Measured before its Pieces are added, so that it never lies on itself.
    const made = this.measure(result, colour);
    if (result.kind === 'line') {
      const { thickness } = result;
      const touches = this.touches(result.segments, thickness);
      const party = this.bodies.newId();
      // A Line that isn't Grounded turns about its middle, as an Object turns
      // about its centroid: its Pieces are kept relative to it.
      const origin = touches.grounded ? AT_ORIGIN : { ...middleOf(result.segments), angle: 0 };
      const pieces: SavedPiece[] = result.pieces.map((segments, index) => ({
        kind: 'piece',
        lineId: id,
        index,
        colour,
        segments: segments.map(({ a, b }) => ({ a: sub(a, origin), b: sub(b, origin) })),
        party: this.bodies.newId(),
        damage: 0,
        impacts: 0,
        loose: !touches.grounded,
      }));
      const saved = { kind: 'line', id, party, colour, thickness, fell: false } as const;
      const line = touches.grounded
        ? this.addGrounded(saved, pieces)
        : this.addLoose(saved, pieces, {
            transform: origin,
            velocity: { x: 0, y: 0 },
            angularVelocity: 0,
            frozen: true,
            mass: lineMass(result.segments, thickness, colour, this.materials),
          });
      this.strokes.push(line);
      if (touches.grounded) this.groundTouched(touches.loose);
      if (running) this.squeeze(this.crossedBy([line]));
      return { ...made, id };
    }
    // The body's origin is the outline's centroid; shapes are stored relative to it.
    const origin = polygonCentroid(result.outline);
    const local = (polygon: Polygon) => polygon.map((p) => sub(p, origin));
    const outline = local(result.outline);
    const parts = result.parts.map(local);
    const mass = outlineMass(outline, colour, this.materials);
    const object = this.addObject(
      {
        kind: 'object',
        id,
        colour,
        party: this.bodies.newId(),
        outline,
        parts,
        fill: null,
        outlineMass: mass,
        fillMass: 0,
        damage: 0,
        impacts: 0,
        sticking: WAITING,
      },
      { position: origin, parts, frozen: true, mass },
    );
    this.strokes.push(object);
    if (running) this.squeeze([object]);
    return { ...made, id };
  }

  /** Adds a Grounded Line: each of its Pieces a fixed body of its own. */
  private addGrounded(
    line: Omit<LineStroke, 'pieces' | 'body'>,
    pieces: readonly SavedPiece[],
  ): LineStroke {
    return {
      ...line,
      body: null,
      pieces: pieces.map((piece) => this.addPiece(piece, line.thickness, line.party)),
    };
  }

  /**
   * Adds a Line that isn't Grounded: one moving body, as `motion` has it,
   * each of its Pieces some of its capsules and a Party of its own.
   */
  private addLoose(
    line: Omit<LineStroke, 'pieces' | 'body'>,
    saved: readonly SavedPiece[],
    motion: LineMotion,
  ): LineStroke {
    const { colour, thickness, party, id } = line;
    const type = { kind: 'piece', colour, loose: true } as const;
    const { transform, velocity, angularVelocity, frozen, mass } = motion;
    const pieces = this.bodies.addLooseLine(
      {
        position: { x: transform.x, y: transform.y },
        angle: transform.angle,
        thickness,
        mass,
        frozen,
        velocity,
        angularVelocity,
      },
      type,
      party,
      saved.map((piece) => ({
        segments: piece.segments,
        what: { thing: 'piece', id, index: piece.index },
        who: (body, shapes) => ({
          id: piece.party,
          stroke: party,
          body,
          shapes,
          target: { ...piece, body } as Piece,
        }),
      })),
    );
    return { ...line, body: pieces[0]!.body, pieces: pieces.map((p) => p.target) };
  }

  /**
   * Grounds the Lines with these ids, if they are Frozen and haven't fallen,
   * and the Frozen ones they touch in turn: a Grounded Line drawn to touch
   * them holds them. Each becomes fixed where it hangs, its Pieces' damage
   * and all; what was attached to it lets go, as if it went.
   */
  private groundTouched(ids: readonly StrokeId[]): void {
    const queue = [...ids];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const index = this.strokes.findIndex((s) => s.id === id);
      const line = this.strokes[index];
      if (line?.kind !== 'line' || line.body === null || this.hasFallen(line)) continue;
      const { body, pieces, ...rest } = line;
      const transform = this.physics.getTransform(body);
      const saved = pieces.map(({ body: _body, segments, ...piece }) => ({
        ...piece,
        segments: segments.map(({ a, b }) => ({
          a: applyTransform(a, transform),
          b: applyTransform(b, transform),
        })),
        loose: false,
      }));
      this.bodies.removeBody(body, 'grounded');
      const grounded = this.addGrounded(rest, saved);
      this.strokes[index] = grounded;
      const segments = saved.flatMap((piece) => piece.segments);
      queue.push(...this.touches(segments, grounded.thickness).loose);
    }
  }

  /**
   * Whether a Line that isn't Grounded has fallen: it has moved since it was
   * drawn, even if it is Frozen again now.
   */
  private hasFallen(line: LineStroke): boolean {
    if (line.body !== null && !line.fell && !this.physics.isFrozen(line.body)) line.fell = true;
    return line.fell;
  }

  /** Adds a Piece's fixed body. Its Party's Stroke is its Line's, `line`. */
  private addPiece(saved: SavedPiece, thickness: number, line: PartyId): Piece {
    const { segments, colour, party, lineId, index } = saved;
    const what = { thing: 'piece', id: lineId, index } as const;
    const type = { kind: 'piece', colour } as const;
    return this.bodies.addLine(segments, thickness, type, what, (body) => ({
      id: party,
      stroke: line,
      body,
      target: { ...saved, body },
    })).target;
  }

  /** Adds an Object's body, as `def` has it. */
  private addObject(saved: Omit<ObjectStroke, 'body'>, def: ObjectBody): ObjectStroke {
    const { colour, outline, party, id } = saved;
    const what = { thing: 'object', id } as const;
    const type = { kind: 'object', colour } as const;
    return this.bodies.addObject(def, type, outline, what, (body) => ({
      id: party,
      stroke: party,
      body,
      target: { ...saved, body },
    })).target;
  }

  /**
   * Every body a Stroke has: an Object's one, a Grounded Line's one per Piece
   * still there, or the one of a Line that isn't Grounded.
   */
  private bodiesOf(stroke: Stroke): BodyId[] {
    if (stroke.kind === 'object') return [stroke.body];
    return stroke.body !== null ? [stroke.body] : stroke.pieces.map((piece) => piece.body);
  }

  /** A Line's capsules where it is now, in world coordinates. */
  private worldCapsules(line: LineStroke): Capsule[] {
    const capsules = capsulesOf(line);
    if (line.body === null) return capsules;
    const transform = this.physics.getTransform(line.body);
    return capsules.map(({ segment: { a, b }, radius }) => ({
      segment: { a: applyTransform(a, transform), b: applyTransform(b, transform) },
      radius,
    }));
  }

  /** Every Piece still there, Line by Line in drawing order: what may glue. */
  *pieces(): Iterable<Piece> {
    for (const stroke of this.strokes) if (stroke.kind === 'line') yield* stroke.pieces;
  }

  /** Every Object, in drawing order: what may stick. */
  *objectRecords(): Iterable<ObjectStroke> {
    for (const stroke of this.strokes) if (stroke.kind === 'object') yield stroke;
  }

  private objectStrokes(): ObjectStroke[] {
    return this.strokes.filter((s): s is ObjectStroke => s.kind === 'object');
  }

  private lineStrokes(): LineStroke[] {
    return this.strokes.filter((s): s is LineStroke => s.kind === 'line');
  }

  private objectById(id: StrokeId): ObjectStroke | undefined {
    const stroke = this.strokes.find((s) => s.id === id);
    return stroke?.kind === 'object' ? stroke : undefined;
  }

  /** An Object's Outline where the Object is now. */
  private worldOutline(stroke: ObjectStroke): Polygon {
    return transformPoints(stroke.outline, this.physics.getTransform(stroke.body));
  }

  /** An Object's collider parts where the Object is now. */
  private worldParts(stroke: ObjectStroke): Polygon[] {
    const transform = this.physics.getTransform(stroke.body);
    return stroke.parts.map((part) => transformPoints(part, transform));
  }

  /** Squeezes every Object off the Lines crossing it, as physics starts. */
  squeezeAll(): void {
    this.squeeze(this.crossedBy(this.lineStrokes()));
  }

  /** The Objects one of `lines` crosses more deeply than it touches, in drawing order. */
  private crossedBy(lines: readonly LineStroke[]): ObjectStroke[] {
    const touching = lines
      .flatMap((line) => this.worldCapsules(line))
      .map(({ segment, radius }) => ({ segment, radius: radius - SQUEEZE_TOLERANCE }));
    return this.query.objectsCrossing(touching).flatMap(({ id }) => this.objectById(id) ?? []);
  }

  /**
   * Squeezes each of `objects` that a Line crosses off the Lines crossing
   * it: drawing a Line through an Object, moving or Frozen, shoves it. It
   * slides the shortest way off at the push-out speed, to a place the Arena
   * query says is clear, passing through Lines and Terrain, and then
   * restarts from rest. (Box2D's own push-out
   * jams bodies made of several convex parts on a Line deep inside them,
   * since each part is pushed out on its own.) A sliding Object deals and
   * takes no damage.
   */
  private squeeze(objects: readonly ObjectStroke[]): void {
    if (objects.length === 0) return;
    const capsules = this.lineStrokes().flatMap((line) => this.worldCapsules(line));
    for (const object of objects) {
      const parts = this.worldParts(object);
      const crosses = ({ segment: { a, b }, radius }: Capsule) =>
        parts.some((part) => capsuleOverlapsPolygon(a, b, radius - SQUEEZE_TOLERANCE, part));
      const crossing = capsules.filter(crosses);
      if (crossing.length === 0) continue;
      const move = shortestWayOut(
        parts,
        crossing.map((c) => capsulePolygon(c.segment, c.radius)),
        (part) => this.query.blocksSqueezed(part, object.body),
        SQUEEZE_MARGIN,
      );
      if (move) this.bodies.slideOut(object.body, move, SLIDE_OUT_SPEED);
      else this.physics.release(object.body);
    }
  }

  /** The topmost (most recently drawn) Object under `point` where it is now, if any. */
  private objectAt(point: Vec2, accept: (stroke: ObjectStroke) => boolean = () => true) {
    const under = this.query.objectsAt(point);
    for (let i = under.length - 1; i >= 0; i--) {
      const stroke = this.objectById(under[i]!.id);
      if (stroke && accept(stroke)) return stroke;
    }
    return null;
  }

  /**
   * The Ink a Fill clicked at `point` would take: the topmost Object under
   * it, if that Object is hollow. Null over nothing or over a filled Object.
   */
  fillInkAt(point: Vec2): number | null {
    const object = this.objectAt(point);
    return object && !object.fill ? fillInk(object.outline) : null;
  }

  /**
   * Releases the Frozen Object under `point`, if any, or else the Frozen
   * Line that isn't Grounded there, the most recently drawn first. Returns
   * whether one was Released.
   */
  releaseAt(point: Vec2): boolean {
    const object = this.objectAt(point, (s) => this.physics.isFrozen(s.body));
    if (object) return this.release(object.id);
    const near = this.query.touchedBy({ path: [point], radius: RELEASE_REACH });
    const ids = near.flatMap((thing) => (thing.thing === 'piece' ? [thing.id] : []));
    for (const id of [...new Set(ids)].sort((p, q) => q - p)) if (this.release(id)) return true;
    return false;
  }

  /**
   * Fills the Object under `point` with `colour`: its mass becomes its
   * Outline's plus its Fill's. Works on Frozen and moving Objects, and never
   * wakes a Frozen one. An Object holds one Fill. Says how much Ink the Fill
   * took. If `accept` turns the Fill down, the Object stays hollow.
   */
  fillAt(point: Vec2, colour: Colour, accept?: (fill: MadeFill) => boolean): FillOutcome {
    const object = this.objectAt(point);
    if (!object) return { kind: 'missed' };
    const { id } = object;
    if (object.fill) return { kind: 'already-filled', id, outline: this.worldOutline(object) };
    const made = { colour, ink: fillInk(object.outline) };
    if (accept && !accept(made)) {
      return { kind: 'declined', id, outline: this.worldOutline(object), ...made };
    }
    this.setFill(object, colour);
    return { kind: 'filled', id, ...made };
  }

  private setFill(object: ObjectStroke, fill: Colour | null): void {
    object.fill = fill;
    object.fillMass = fillMass(object.outline, fill, this.materials);
    this.physics.setMass(object.body, object.outlineMass + object.fillMass);
    this.say({ kind: 'filled', id: object.id, fill });
  }

  /**
   * Releases a Frozen Object, or a Frozen Line that isn't Grounded,
   * optionally setting it moving.
   */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const stroke = this.strokes.find((s) => s.id === id);
    const body = stroke?.kind === 'line' ? stroke.body : stroke?.body;
    if (!stroke || body == null || !this.physics.isFrozen(body)) return false;
    this.physics.release(body);
    if (stroke.kind === 'line') stroke.fell = true;
    if (velocity) this.physics.setVelocity(body, velocity);
    this.say({ kind: 'released', id });
    return true;
  }

  /** Removes one Stroke with its Fill, for `why`. */
  remove(id: StrokeId, why: Why): void {
    const index = this.strokes.findIndex((s) => s.id === id);
    if (index < 0) return;
    const [stroke] = this.strokes.splice(index, 1);
    for (const body of this.bodiesOf(stroke!)) this.bodies.removeBody(body, why);
  }

  /**
   * Removes Piece `index` of Line `lineId`, for `why`; the rest of the Line
   * stays where it is, fixed or as one body, and the Line goes with its last
   * Piece.
   */
  removePiece(lineId: StrokeId, index: number, why: Why): void {
    const line = this.lineStrokes().find((s) => s.id === lineId);
    const piece = line?.pieces.find((p) => p.index === index);
    if (line && piece) this.dropPiece(line, piece, why);
  }

  private dropPiece(line: LineStroke, piece: Piece, why: Why): void {
    if (line.pieces.length === 1) {
      this.remove(line.id, why);
      return;
    }
    if (line.body === null) this.bodies.removeBody(piece.body, why);
    else this.bodies.removePart(piece.party, why);
    line.pieces = line.pieces.filter((p) => p !== piece);
  }

  /**
   * Takes back what's left of a Stroke: an Object with its Fill, or a Line's
   * Pieces still there. Says what it took back and its Ink, or that the
   * Stroke was gone already.
   */
  removeStroke(id: StrokeId): RemovedStroke {
    const stroke = this.strokes.find((s) => s.id === id);
    if (!stroke) return { kind: 'gone', id };
    this.remove(id, 'undone');
    const { colour } = stroke;
    if (stroke.kind === 'object') {
      const { outline, fill } = stroke;
      const ink = outlineInk(outline);
      return {
        kind: 'object',
        id,
        colour,
        ink,
        fill: fill && { colour: fill, ink: fillInk(outline) },
      };
    }
    const segments = stroke.pieces.flatMap((piece) => piece.segments);
    return { kind: 'line', id, colour, ink: lineInk(segments, stroke.thickness) };
  }

  /**
   * Takes back an Object's Fill; the Object stays, hollow. Says what it took
   * back and its Ink, or that there was no Fill to take.
   */
  removeFill(id: StrokeId): RemovedFill {
    const object = this.objectById(id);
    const fill = object?.fill;
    if (!object || !fill) return { kind: 'gone', id };
    this.setFill(object, null);
    return { kind: 'fill', id, colour: fill, ink: fillInk(object.outline) };
  }

  /**
   * Breaks an Object or a Piece that the Material rules broke, and reports
   * what comes out of it. A broken Object's body is removed; its Debris and
   * its Fill come out where it was. A broken Piece's body is removed, and
   * the rest of its Line stays fixed where it is; the Line goes with its
   * last Piece.
   */
  break(target: StrokeTarget): Broken | null {
    return target.kind === 'piece' ? this.breakPiece(target) : this.breakObject(target);
  }

  private breakObject(object: ObjectStroke): Broken {
    const from = motionOf(this.physics, object.body);
    const outline = transformPoints(object.outline, from.transform);
    const colours = object.fill ? [object.colour, object.fill] : [object.colour];
    this.remove(object.id, 'broke');
    const { fill, fillMass, outline: local } = object;
    return {
      kind: 'object',
      debris: { outline, velocity: from.velocity, colours },
      outline: {
        colour: object.colour,
        ink: outlineInk(local),
        centre: { x: from.transform.x, y: from.transform.y },
      },
      fill: fill && { colour: fill, mass: fillMass, ink: fillInk(local), outline: local, from },
    };
  }

  private breakPiece(piece: Piece): Broken | null {
    const line = this.lineStrokes().find((s) => s.id === piece.lineId);
    if (!line) return null;
    const transform = line.body === null ? AT_ORIGIN : this.physics.getTransform(line.body);
    const velocity = line.body === null ? { x: 0, y: 0 } : this.physics.getVelocity(line.body);
    const segments = piece.segments.map(({ a, b }) => ({
      a: applyTransform(a, transform),
      b: applyTransform(b, transform),
    }));
    this.dropPiece(line, piece, 'broke');
    return {
      kind: 'piece',
      debris: {
        outline: bandPolygon(segments, line.thickness / 2),
        velocity,
        colours: [line.colour],
      },
      colour: line.colour,
      centre: pieceCentre(segments),
    };
  }

  save(): SavedStrokes {
    return {
      strokes: this.strokes.map((stroke): SavedStroke => {
        if (stroke.kind === 'line') {
          const { pieces, body, ...line } = stroke;
          const fell = this.hasFallen(stroke);
          return {
            ...line,
            fell,
            pieces: pieces.map(({ body: _body, ...piece }) => piece),
            motion: body === null ? null : this.lineMotion(body),
          };
        }
        const { body, ...object } = stroke;
        return {
          ...object,
          motion: {
            ...motionOf(this.physics, body),
            frozen: this.physics.isFrozen(body),
            slide: this.physics.getSlide(body),
          },
        };
      }),
    };
  }

  private lineMotion(body: BodyId): LineMotion {
    return {
      ...motionOf(this.physics, body),
      frozen: this.physics.isFrozen(body),
      mass: this.physics.getMass(body),
    };
  }

  /** Adds the Strokes again in the order they were drawn, each Line's Pieces in order. */
  restore(saved: SavedStrokes): void {
    this.strokes = saved.strokes.map((stroke): Stroke => {
      if (stroke.kind === 'line') {
        const { pieces, motion, ...line } = stroke;
        return motion === null
          ? this.addGrounded(line, pieces)
          : this.addLoose(line, pieces, motion);
      }
      const { motion, ...object } = stroke;
      const restored = this.addObject(object, {
        position: { x: motion.transform.x, y: motion.transform.y },
        angle: motion.transform.angle,
        parts: object.parts,
        frozen: motion.frozen || motion.slide !== null,
        mass: object.outlineMass + object.fillMass,
        velocity: motion.velocity,
        angularVelocity: motion.angularVelocity,
      });
      if (motion.slide) this.bodies.slideOut(restored.body, motion.slide, SLIDE_OUT_SPEED);
      return restored;
    });
  }

  /** Nothing of it is attached to anything else. */
  gone(): void {}

  clear(): void {
    this.strokes = [];
  }

  step(): void {}
}
