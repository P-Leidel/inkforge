import { capsuleOverlapsPolygon } from '../geometry/overlap';
import { bandPolygon, capsulePolygon, shortestWayOut } from '../geometry/separation';
import {
  polygonCentroid,
  polygonContainsPoint,
  polygonPerimeter,
  type Polygon,
} from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { transformPoints, type Transform } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillMass, outlineMass } from '../materials/mass';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import { pieceCentre } from '../stroke/pieces';
import type { StrokeResult } from '../stroke/stroke-pipeline';
import type { Arena } from './arena';
import { motionOf, type HostSurface, type Kind, type Motion, type Solids } from './arena-contents';
import type { PartyId, PartyIndex } from './contact-ledger';
import { durabilityLeft, wear, type Breakable } from './material-rules';
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

export type StrokeId = number;

export interface PieceView {
  /** Its place along the Line when it was drawn, counting broken Pieces. */
  readonly index: number;
  /** Capsule centre lines. */
  readonly segments: readonly Segment[];
  /** Damage it can still take before it breaks. */
  readonly durability: number;
  /** How near it is to breaking, from 0 (whole) to 1: what its cracks show. */
  readonly wear: number;
}

export interface LineView {
  readonly id: StrokeId;
  readonly colour: Colour;
  /** Capsule centre lines of the Pieces still there. */
  readonly segments: readonly Segment[];
  readonly thickness: number;
  /** The Pieces still there, in order along the Line. */
  readonly pieces: readonly PieceView[];
}

export interface ObjectView {
  readonly id: StrokeId;
  /** The Colour of its Outline. */
  readonly colour: Colour;
  /** Outline relative to the body's origin; place it with `transform`. */
  readonly outline: Polygon;
  /** Convex collider parts relative to the body's origin. */
  readonly parts: readonly Polygon[];
  readonly transform: Transform;
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

/** What a Fill click did. */
export type FillOutcome =
  | { readonly kind: 'filled'; readonly id: StrokeId }
  | { readonly kind: 'already-filled'; readonly id: StrokeId }
  | { readonly kind: 'missed' };

/** What the Stroke pipeline made of a Stroke that is added. */
export type DrawnStroke = Extract<StrokeResult, { readonly kind: 'line' | 'object' }>;

/** One Piece of a Line: its own fixed body, with its own damage. */
export interface Piece extends Breakable {
  readonly kind: 'piece';
  readonly lineId: StrokeId;
  readonly index: number;
  readonly role: 'line';
  readonly segments: readonly Segment[];
  /** Its Party id, the same after a rebuild. */
  readonly party: PartyId;
  readonly body: BodyId;
}

interface LineStroke {
  readonly kind: 'line';
  readonly id: StrokeId;
  /** Its Party id. It has no body, but each of its Pieces' Parties carries it as their Stroke. */
  readonly party: PartyId;
  readonly colour: Colour;
  readonly thickness: number;
  /** The Pieces still there, in order; broken ones are gone. */
  pieces: Piece[];
}

export interface ObjectStroke extends Breakable {
  readonly kind: 'object';
  readonly id: StrokeId;
  readonly role: 'outline';
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

/** One undo step: a Stroke, or the Fill of an Object. */
type Action = { readonly kind: 'stroke' | 'fill'; readonly id: StrokeId };

/** An Object's pose and motion when a snapshot is taken. */
interface ObjectMotion extends Motion {
  readonly frozen: boolean;
  /** The displacement still to slide off a Line, or null. */
  readonly slide: Vec2 | null;
}

type SavedPiece = Omit<Piece, 'body'>;

type SavedStroke =
  | (Omit<LineStroke, 'pieces'> & { readonly pieces: readonly SavedPiece[] })
  | (Omit<ObjectStroke, 'body'> & { readonly motion: ObjectMotion });

/** The Strokes' part of a snapshot. */
export interface SavedStrokes {
  readonly strokes: readonly SavedStroke[];
  readonly history: readonly Action[];
}

/** A broken Object's Fill, which comes out in the same step. */
export interface ReleasedFill {
  readonly colour: Colour;
  readonly mass: number;
  /** The Outline it fills, relative to the Object's origin. */
  readonly outline: Polygon;
  /** The Object's pose and motion as it broke. */
  readonly from: Motion;
}

/** A broken Object's Outline, which explodes if its Colour does. */
export interface BrokenOutline {
  readonly colour: Colour;
  /** Its length, px. */
  readonly length: number;
  /** The Object's centre (its body's origin) as it broke. */
  readonly centre: Vec2;
}

/** A broken Piece, which explodes if its Line Colour does. */
export interface BrokenPiece {
  readonly colour: Colour;
  /** Its centre, halfway along it. */
  readonly centre: Vec2;
}

/** What breaking a Piece or an Object lets out: the Material rules decide what follows. */
export interface Broken {
  /** What Debris bursts from: an Outline or band in world coordinates, moving and coloured so. */
  readonly debris: {
    readonly outline: Polygon;
    readonly velocity: Vec2;
    readonly colours: readonly Colour[];
  };
  /** A broken Object's Fill; null for a Piece or a hollow Object. */
  readonly fill: ReleasedFill | null;
  /** A broken Object's Outline; null for a Piece. */
  readonly outline: BrokenOutline | null;
  /** A broken Piece; null for an Object. */
  readonly piece: BrokenPiece | null;
}

/**
 * The Strokes: Lines with their Pieces, Objects with their Fills, the undo
 * history, the squeeze, and breaking Objects and Pieces. Stroke ids are
 * never reused, not even after R or Clear. Each Object and each Piece is a
 * Party to the Contact ledger; each Line has a Party id too, which its
 * Pieces' Parties carry as their Stroke.
 */
export class Strokes implements Kind<'strokes', SavedStrokes, StrokeViews> {
  readonly name = 'strokes';
  /** In the order they were drawn. */
  private strokes: Stroke[] = [];
  /** Strokes and Fills in the order they were made, for undo. */
  private history: Action[] = [];
  private nextId = 1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly materials: MaterialTable,
    private readonly arena: Arena,
    private readonly contacts: PartyIndex<StrokeTarget>,
  ) {}

  get views(): StrokeViews {
    return { lines: this.lines, objects: this.objects };
  }

  get lines(): readonly LineView[] {
    return this.lineStrokes().map((line) => ({
      id: line.id,
      colour: line.colour,
      thickness: line.thickness,
      segments: line.pieces.flatMap((piece) => piece.segments),
      pieces: line.pieces.map((piece) => ({
        index: piece.index,
        segments: piece.segments,
        durability: durabilityLeft(piece, this.materials),
        wear: wear(piece, this.materials),
      })),
    }));
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
      transform: this.physics.getTransform(stroke.body),
      velocity: this.physics.getVelocity(stroke.body),
      frozen: this.physics.isFrozen(stroke.body),
      fill: stroke.fill,
      mass: this.physics.getMass(stroke.body),
      durability: durabilityLeft(stroke, this.materials),
      impacts: stroke.impacts,
      wear: wear(stroke, this.materials),
    };
  }

  /**
   * Adds the Line or Object the Stroke pipeline made, in `colour`. While
   * physics is `running`, it squeezes what it crosses off the Lines at once.
   */
  add(result: DrawnStroke, colour: Colour, running: boolean): StrokeId {
    const id = this.nextId++;
    if (result.kind === 'line') {
      const { thickness } = result;
      const party = this.contacts.newId();
      const pieces = result.pieces.map((segments, index) =>
        this.addPiece(
          {
            kind: 'piece',
            lineId: id,
            index,
            colour,
            role: 'line',
            segments,
            party: this.contacts.newId(),
            damage: 0,
            impacts: 0,
          },
          thickness,
          party,
        ),
      );
      const line: LineStroke = { kind: 'line', id, party, colour, thickness, pieces };
      this.strokes.push(line);
      this.history.push({ kind: 'stroke', id });
      if (running) this.squeeze(this.objectStrokes(), [line]);
      return id;
    }
    // The body's origin is the outline's centroid; shapes are stored relative to it.
    const origin = polygonCentroid(result.outline);
    const local = (polygon: Polygon) => polygon.map((p) => sub(p, origin));
    const outline = local(result.outline);
    const parts = result.parts.map(local);
    const mass = outlineMass(outline, colour, this.materials);
    const body = this.physics.addObject({
      position: origin,
      parts,
      frozen: true,
      surface: this.materials.colours[colour].outline,
      mass,
    });
    const object: ObjectStroke = {
      kind: 'object',
      id,
      colour,
      role: 'outline',
      party: this.contacts.newId(),
      body,
      outline,
      parts,
      fill: null,
      outlineMass: mass,
      fillMass: 0,
      damage: 0,
      impacts: 0,
      sticking: WAITING,
    };
    this.registerObject(object);
    this.strokes.push(object);
    this.history.push({ kind: 'stroke', id });
    if (running) this.squeeze([object], this.lineStrokes());
    return id;
  }

  /** Adds a Piece's fixed body to the physics world. Its Party's Stroke is its Line's, `line`. */
  private addPiece(saved: SavedPiece, thickness: number, line: PartyId): Piece {
    const material = this.materials.colours[saved.colour].line;
    const piece = { ...saved, body: this.physics.addLine(saved.segments, thickness, material) };
    this.contacts.register({ id: piece.party, stroke: line, body: piece.body, target: piece });
    return piece;
  }

  private registerObject(object: ObjectStroke): void {
    const { party, body } = object;
    this.contacts.register({ id: party, stroke: party, body, target: object });
  }

  /** Every body a Stroke has: an Object's one, or one per Piece still there. */
  private bodiesOf(stroke: Stroke): BodyId[] {
    return stroke.kind === 'line' ? stroke.pieces.map((piece) => piece.body) : [stroke.body];
  }

  private removeBody(body: BodyId): void {
    this.physics.removeBody(body);
    this.contacts.unregister(body);
  }

  /** Slides an Object `move` off the Lines; it is Squeezed until it arrives. */
  private slideOut(body: BodyId, move: Vec2): void {
    this.physics.slideOut(body, move, SLIDE_OUT_SPEED);
    this.contacts.squeezed(body);
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

  /** An Object's collider parts where the Object is now. */
  private worldParts(stroke: ObjectStroke): Polygon[] {
    const transform = this.physics.getTransform(stroke.body);
    return stroke.parts.map((part) => transformPoints(part, transform));
  }

  /** Squeezes every Object off the Lines crossing it, as physics starts. */
  squeezeAll(): void {
    this.squeeze(this.objectStrokes(), this.lineStrokes());
  }

  /**
   * Squeezes each of `objects` that one of `lines` crosses off the Lines
   * crossing it: drawing a Line through an Object, moving or Frozen, shoves
   * it. It slides the shortest way off at the push-out speed, passing
   * through Lines and Terrain, and then restarts from rest. (Box2D's own
   * push-out jams bodies made of several convex parts on a Line deep inside
   * them, since each part is pushed out on its own.) A sliding Object deals
   * and takes no damage.
   */
  private squeeze(objects: readonly ObjectStroke[], lines: readonly LineStroke[]): void {
    const capsulesOf = (line: LineStroke) =>
      line.pieces.flatMap((piece) =>
        piece.segments.map((segment) => ({ segment, radius: line.thickness / 2 })),
      );
    const trigger = lines.flatMap(capsulesOf);
    const capsules = this.lineStrokes().flatMap(capsulesOf);
    for (const object of objects) {
      const parts = this.worldParts(object);
      const crosses = ({ segment: { a, b }, radius }: (typeof capsules)[number]) =>
        parts.some((part) => capsuleOverlapsPolygon(a, b, radius - SQUEEZE_TOLERANCE, part));
      if (!trigger.some(crosses)) continue;
      const crossing = capsules.filter(crosses);
      const others = this.objectStrokes()
        .filter((o) => o !== object)
        .flatMap((o) => this.worldParts(o));
      const clearOf = capsules
        .filter((c) => !crossing.includes(c))
        .map((c) => capsulePolygon(c.segment, c.radius));
      const move = shortestWayOut(
        parts,
        crossing.map((c) => capsulePolygon(c.segment, c.radius)),
        [...this.arena.terrain, ...others, ...clearOf],
        SQUEEZE_MARGIN,
      );
      if (move) this.slideOut(object.body, move);
      else this.physics.release(object.body);
    }
  }

  /** The topmost (most recently drawn) Object under `point` where it is now, if any. */
  private objectAt(point: Vec2, accept: (stroke: ObjectStroke) => boolean = () => true) {
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const stroke = this.strokes[i]!;
      if (stroke.kind !== 'object' || !accept(stroke)) continue;
      const outline = transformPoints(stroke.outline, this.physics.getTransform(stroke.body));
      if (polygonContainsPoint(outline, point)) return stroke;
    }
    return null;
  }

  /** Releases the Frozen Object under `point`, if any. Returns whether one was Released. */
  releaseAt(point: Vec2): boolean {
    const object = this.objectAt(point, (s) => this.physics.isFrozen(s.body));
    return object ? this.release(object.id) : false;
  }

  /**
   * Fills the Object under `point` with `colour`: its mass becomes its
   * Outline's plus its Fill's. Works on Frozen and moving Objects, and never
   * wakes a Frozen one. An Object holds one Fill.
   */
  fillAt(point: Vec2, colour: Colour): FillOutcome {
    const object = this.objectAt(point);
    if (!object) return { kind: 'missed' };
    if (object.fill) return { kind: 'already-filled', id: object.id };
    this.setFill(object, colour);
    this.history.push({ kind: 'fill', id: object.id });
    return { kind: 'filled', id: object.id };
  }

  private setFill(object: ObjectStroke, fill: Colour | null): void {
    object.fill = fill;
    object.fillMass = fillMass(object.outline, fill, this.materials);
    this.physics.setMass(object.body, object.outlineMass + object.fillMass);
  }

  /** Releases a Frozen Object, optionally setting it moving. */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const stroke = this.strokes.find((s) => s.id === id);
    if (stroke?.kind !== 'object' || !this.physics.isFrozen(stroke.body)) return false;
    this.physics.release(stroke.body);
    if (velocity) this.physics.setVelocity(stroke.body, velocity);
    return true;
  }

  /** Removes one Stroke with its Fill. */
  remove(id: StrokeId): void {
    const index = this.strokes.findIndex((s) => s.id === id);
    if (index < 0) return;
    const [stroke] = this.strokes.splice(index, 1);
    for (const body of this.bodiesOf(stroke!)) this.removeBody(body);
    this.history = this.history.filter((action) => action.id !== id);
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists: what's left
   * of a Line goes as a whole. Broken Objects, and Lines whose every Piece
   * broke, are gone from the history, so undo skips them.
   */
  undo(): void {
    const action = this.history.pop();
    if (!action) return;
    if (action.kind === 'stroke') {
      this.remove(action.id);
      return;
    }
    const object = this.objectStrokes().find((s) => s.id === action.id);
    if (object) this.setFill(object, null);
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
    this.remove(object.id);
    const { fill, fillMass, outline: local } = object;
    return {
      debris: { outline, velocity: from.velocity, colours },
      fill: fill && { colour: fill, mass: fillMass, outline: local, from },
      outline: {
        colour: object.colour,
        length: polygonPerimeter(local),
        centre: { x: from.transform.x, y: from.transform.y },
      },
      piece: null,
    };
  }

  private breakPiece(piece: Piece): Broken | null {
    const line = this.lineStrokes().find((s) => s.id === piece.lineId);
    if (!line) return null;
    this.removeBody(piece.body);
    line.pieces = line.pieces.filter((p) => p !== piece);
    if (line.pieces.length === 0) this.remove(line.id);
    return {
      debris: {
        outline: bandPolygon(piece.segments, line.thickness / 2),
        velocity: { x: 0, y: 0 },
        colours: [line.colour],
      },
      fill: null,
      outline: null,
      piece: { colour: line.colour, centre: pieceCentre(piece.segments) },
    };
  }

  save(): SavedStrokes {
    return {
      strokes: this.strokes.map((stroke): SavedStroke => {
        if (stroke.kind === 'line') {
          const { pieces, ...line } = stroke;
          return { ...line, pieces: pieces.map(({ body: _body, ...piece }) => piece) };
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
      history: [...this.history],
    };
  }

  /** Adds the Strokes again in the order they were drawn, each Line's Pieces in order. */
  restore(saved: SavedStrokes): void {
    this.strokes = saved.strokes.map((stroke): Stroke => {
      if (stroke.kind === 'line') {
        return {
          ...stroke,
          pieces: stroke.pieces.map((piece) =>
            this.addPiece(piece, stroke.thickness, stroke.party),
          ),
        };
      }
      const { motion, ...object } = stroke;
      const body = this.physics.addObject({
        position: { x: motion.transform.x, y: motion.transform.y },
        angle: motion.transform.angle,
        parts: object.parts,
        frozen: motion.frozen || motion.slide !== null,
        surface: this.materials.colours[object.colour].outline,
        mass: object.outlineMass + object.fillMass,
        velocity: motion.velocity,
        angularVelocity: motion.angularVelocity,
      });
      const restored: ObjectStroke = { ...object, body };
      this.registerObject(restored);
      if (motion.slide) this.slideOut(body, motion.slide);
      return restored;
    });
    this.history = [...saved.history];
  }

  /** Nothing of it is attached to anything else. */
  gone(): void {}

  dropVisuals(): void {}

  clear(): void {
    for (const body of this.strokes.flatMap((stroke) => this.bodiesOf(stroke))) {
      this.removeBody(body);
    }
    this.strokes = [];
    this.history = [];
  }

  /** Objects are solid; Lines aren't (an Object drawn over one is squeezed off it). */
  solids(): Solids {
    return { polygons: this.objectStrokes().map((s) => this.worldParts(s)), circles: [] };
  }

  /** An Object's Outline, or the sides of a Piece's capsules (in the world, where its body is). */
  surfaceOf(party: PartyId): HostSurface | null {
    for (const stroke of this.strokes) {
      if (stroke.kind === 'object') {
        if (stroke.party === party) return { kind: 'polygons', polygons: [stroke.outline] };
        continue;
      }
      const piece = stroke.pieces.find((p) => p.party === party);
      if (piece)
        return { kind: 'capsules', segments: piece.segments, radius: stroke.thickness / 2 };
    }
    return null;
  }

  applySurfaces(): void {
    for (const stroke of this.strokes) {
      const material = this.materials.colours[stroke.colour];
      const surface = stroke.kind === 'line' ? material.line : material.outline;
      for (const body of this.bodiesOf(stroke)) this.physics.setSurface(body, surface);
    }
  }

  step(): void {}
}
