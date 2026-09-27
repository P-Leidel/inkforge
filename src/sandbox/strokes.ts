import { capsuleOverlapsPolygon } from '../geometry/overlap';
import { bandPolygon, capsulePolygon, shortestWayOut } from '../geometry/separation';
import { polygonCentroid, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { transformPoints } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillInk, lineInk, outlineInk } from '../materials/ink';
import { fillMass, outlineMass } from '../materials/mass';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, ObjectBodyDef, PhysicsWorld } from '../physics';
import { pieceCentre } from '../stroke/pieces';
import type { StrokeResult } from '../stroke/stroke-pipeline';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import type { Arena } from './arena';
import type { ArenaBodies } from './arena-bodies';
import { motionOf, type Kind, type Motion, type Poses } from './arena-contents';
import type { ArenaQuery, Capsule } from './arena-query';
import type { PartyId } from './contact-ledger';
import type { Happening, Why } from './happenings';
import { durabilityLeft, wear, type Breakable } from './material-rules';
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

type SavedPiece = Omit<Piece, 'body'>;

type SavedStroke =
  | (Omit<LineStroke, 'pieces'> & { readonly pieces: readonly SavedPiece[] })
  | (Omit<ObjectStroke, 'body'> & { readonly motion: ObjectMotion });

/** The Strokes' part of a snapshot. */
export interface SavedStrokes {
  readonly strokes: readonly SavedStroke[];
}

/** A broken Object's Fill, which comes out in the same step. */
export interface ReleasedFill {
  readonly colour: Colour;
  readonly mass: number;
  /** Its Ink, px². */
  readonly ink: number;
  /** The Outline it fills, relative to the Object's origin. */
  readonly outline: Polygon;
  /** The Object's pose and motion as it broke. */
  readonly from: Motion;
}

/** A broken Object's Outline, which explodes if its Colour does. */
export interface BrokenOutline {
  readonly colour: Colour;
  /** Its Ink, px². */
  readonly ink: number;
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
    private readonly arena: Arena,
    private readonly bodies: ArenaBodies<StrokeTarget>,
    private readonly query: Pick<ArenaQuery, 'objectsAt' | 'objectsCrossing' | 'lyingOnLines'>,
    private readonly poses: Pick<PreviousPoses, 'of'>,
    /** Appends to the list of what happened: a Fill and a Release. */
    private readonly say: (happening: Happening) => void,
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
      ...this.poses.of(stroke.body),
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
    };
  }

  /**
   * The Ink of the part of a Line along raw pointer `samples`, in the Line
   * thickness, that would lie on a standing Line: without the Stroke
   * pipeline, to estimate what a Stroke costs while it is drawn.
   */
  inkOnLinesAlong(samples: readonly Vec2[]): number {
    const path = samples.slice(1).map((b, k) => ({ a: samples[k]!, b }));
    return lineInk(this.query.lyingOnLines(path), LINE_THICKNESS);
  }

  /**
   * Adds the Line or Object the Stroke pipeline made, in `colour`, and says
   * how much Ink it took. While physics is `running`, it squeezes what it
   * crosses off the Lines at once.
   */
  add(result: DrawnStroke, colour: Colour, running: boolean): AddedStroke {
    const id = this.nextId++;
    // Measured before its Pieces are added, so that it never lies on itself.
    const made = this.measure(result, colour);
    if (result.kind === 'line') {
      const { thickness } = result;
      const party = this.bodies.newId();
      const pieces = result.pieces.map((segments, index) =>
        this.addPiece(
          {
            kind: 'piece',
            lineId: id,
            index,
            colour,
            role: 'line',
            segments,
            party: this.bodies.newId(),
            damage: 0,
            impacts: 0,
          },
          thickness,
          party,
        ),
      );
      const line: LineStroke = { kind: 'line', id, party, colour, thickness, pieces };
      this.strokes.push(line);
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
        role: 'outline',
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

  /** Adds a Piece's fixed body. Its Party's Stroke is its Line's, `line`. */
  private addPiece(saved: SavedPiece, thickness: number, line: PartyId): Piece {
    const { segments, colour, party, lineId, index } = saved;
    const what = { thing: 'piece', id: lineId, index } as const;
    return this.bodies.addLine(segments, thickness, colour, what, (body) => ({
      id: party,
      stroke: line,
      body,
      target: { ...saved, body },
    })).target;
  }

  /** Adds an Object's body, as `def` has it. */
  private addObject(
    saved: Omit<ObjectStroke, 'body'>,
    def: Omit<ObjectBodyDef, 'surface'>,
  ): ObjectStroke {
    const { colour, outline, party, id } = saved;
    const what = { thing: 'object', id } as const;
    return this.bodies.addObject(def, colour, outline, what, (body) => ({
      id: party,
      stroke: party,
      body,
      target: { ...saved, body },
    })).target;
  }

  /** Every body a Stroke has: an Object's one, or one per Piece still there. */
  private bodiesOf(stroke: Stroke): BodyId[] {
    return stroke.kind === 'line' ? stroke.pieces.map((piece) => piece.body) : [stroke.body];
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
      .flatMap(capsulesOf)
      .map(({ segment, radius }) => ({ segment, radius: radius - SQUEEZE_TOLERANCE }));
    return this.query.objectsCrossing(touching).flatMap(({ id }) => this.objectById(id) ?? []);
  }

  /**
   * Squeezes each of `objects` that a Line crosses off the Lines crossing
   * it: drawing a Line through an Object, moving or Frozen, shoves it. It
   * slides the shortest way off at the push-out speed, passing through
   * Lines and Terrain, and then restarts from rest. (Box2D's own push-out
   * jams bodies made of several convex parts on a Line deep inside them,
   * since each part is pushed out on its own.) A sliding Object deals and
   * takes no damage.
   */
  private squeeze(objects: readonly ObjectStroke[]): void {
    if (objects.length === 0) return;
    const capsules = this.lineStrokes().flatMap(capsulesOf);
    for (const object of objects) {
      const parts = this.worldParts(object);
      const crosses = ({ segment: { a, b }, radius }: Capsule) =>
        parts.some((part) => capsuleOverlapsPolygon(a, b, radius - SQUEEZE_TOLERANCE, part));
      const crossing = capsules.filter(crosses);
      if (crossing.length === 0) continue;
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

  /** Releases the Frozen Object under `point`, if any. Returns whether one was Released. */
  releaseAt(point: Vec2): boolean {
    const object = this.objectAt(point, (s) => this.physics.isFrozen(s.body));
    return object ? this.release(object.id) : false;
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

  /** Releases a Frozen Object, optionally setting it moving. */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const stroke = this.strokes.find((s) => s.id === id);
    if (stroke?.kind !== 'object' || !this.physics.isFrozen(stroke.body)) return false;
    this.physics.release(stroke.body);
    if (velocity) this.physics.setVelocity(stroke.body, velocity);
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
   * stays fixed where it is, and the Line goes with its last Piece.
   */
  removePiece(lineId: StrokeId, index: number, why: Why): void {
    const line = this.lineStrokes().find((s) => s.id === lineId);
    const piece = line?.pieces.find((p) => p.index === index);
    if (line && piece) this.dropPiece(line, piece, why);
  }

  private dropPiece(line: LineStroke, piece: Piece, why: Why): void {
    this.bodies.removeBody(piece.body, why);
    line.pieces = line.pieces.filter((p) => p !== piece);
    if (line.pieces.length === 0) this.remove(line.id, why);
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
      debris: { outline, velocity: from.velocity, colours },
      fill: fill && { colour: fill, mass: fillMass, ink: fillInk(local), outline: local, from },
      outline: {
        colour: object.colour,
        ink: outlineInk(local),
        centre: { x: from.transform.x, y: from.transform.y },
      },
      piece: null,
    };
  }

  private breakPiece(piece: Piece): Broken | null {
    const line = this.lineStrokes().find((s) => s.id === piece.lineId);
    if (!line) return null;
    this.dropPiece(line, piece, 'broke');
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
