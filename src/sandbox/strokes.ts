import { capsuleOverlapsPolygon } from '../geometry/overlap';
import { capsulePolygon, shortestWayOut } from '../geometry/separation';
import { polygonCentroid, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { transformPoints } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillInk, lineInk, outlineInk } from '../materials/ink';
import { fillMass, outlineMass } from '../materials/mass';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import type { StrokeResult } from '../stroke/stroke-pipeline';
import type { ArenaBodies, ObjectBody } from './arena-bodies';
import { motionOf, type Kind, type Motion, type Poses } from './arena-contents';
import type { ArenaQuery, Capsule } from './arena-query';
import type { PartyId } from './contact-ledger';
import type { Happening, Why } from './happenings';
import type { Broken } from './material-rules';
import {
  Lines,
  type LineView,
  type Piece,
  type SavedLine,
  type SavedRun,
  type TakenLine,
} from './lines';
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

export type StrokeId = number;

export type { LineView, RunView, PieceView, Piece } from './lines';

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

/** A Line, as the drawing order keeps it: `Lines` has the rest. */
interface LineRef {
  readonly kind: 'line';
  readonly id: StrokeId;
}

type Stroke = LineRef | ObjectStroke;

/** What takes damage: an Object or a Piece. */
export type StrokeTarget = ObjectStroke | Piece;

/** An Object's pose and motion when a snapshot is taken. */
interface ObjectMotion extends Motion {
  readonly frozen: boolean;
  /** The displacement still to slide off a Line, or null. */
  readonly slide: Vec2 | null;
}

type SavedStroke = SavedLine | (Omit<ObjectStroke, 'body'> & { readonly motion: ObjectMotion });

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
 * `saved` with every Object, and every Run of a Line that isn't Grounded, at
 * rest Frozen again, where it is: one moving slower than `REST_SPEED` and
 * turning slower than `REST_SPIN`, and not sliding off a Line. The
 * Aftermath of a Wave.
 */
export function freezeResting(saved: SavedStrokes): SavedStrokes {
  const still = { velocity: { x: 0, y: 0 }, angularVelocity: 0, frozen: true };
  return {
    strokes: saved.strokes.map((stroke): SavedStroke => {
      if (stroke.kind === 'line') {
        const runs = stroke.runs.map((run): SavedRun => {
          const { form } = run;
          if (form.kind === 'grounded' || form.motion.frozen || !resting(form.motion)) return run;
          return { ...run, form: { ...form, motion: { ...form.motion, ...still } } };
        });
        return { ...stroke, runs };
      }
      const { motion } = stroke;
      if (motion.frozen || !resting(motion) || motion.slide !== null) return stroke;
      return { ...stroke, motion: { ...motion, ...still } };
    }),
  };
}

/**
 * The Strokes: Lines with their Pieces (`Lines`), Objects with their Fills,
 * taking them back, the squeeze, and breaking Objects and Pieces. Stroke ids
 * are never reused, not even after R or Clear. Each Object and each Piece
 * is a Party to the Contact ledger; each Line has a Party id too, which its
 * Pieces' Parties carry as their Stroke.
 */
export class Strokes implements Kind<'strokes', SavedStrokes, StrokeViews> {
  readonly name = 'strokes';
  /** In the order they were drawn. */
  private strokes: Stroke[] = [];
  private nextId = 1;
  private readonly lineForms: Lines;

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
      | 'holding'
      | 'touchedBy'
    >,
    private readonly poses: Pick<PreviousPoses, 'of'>,
    /** Appends to the list of what happened: a Fill and a Release, and how Lines change form. */
    private readonly say: (happening: Happening) => void,
    /** Runs `act`, saying nothing of what it does. */
    quietly: (act: () => void) => void,
    /**
     * Runs `act`, which takes away the bodies of Parties `parties` and adds
     * them again under the same Parties, keeping what is stuck to them.
     */
    rehost: (parties: ReadonlySet<PartyId>, act: () => void) => void,
  ) {
    this.lineForms = new Lines({
      physics,
      materials,
      numbers,
      bodies,
      query,
      poses,
      say,
      quietly,
      rehost,
    });
  }

  get views(): StrokeViews {
    return { lines: this.lines, objects: this.objects };
  }

  get lines(): readonly LineView[] {
    return this.lineForms.views;
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
      grounded: this.lineForms.grounds(result.segments, thickness),
    };
  }

  /** Whether a Line along `segments`, in world coordinates, would be Grounded. */
  grounds(segments: readonly Segment[], thickness: number): boolean {
    return this.lineForms.grounds(segments, thickness);
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
      this.lineForms.add(id, result.pieces, result.thickness, colour);
      this.strokes.push({ kind: 'line', id });
      if (running) this.squeeze(this.crossedBy(this.lineForms.worldCapsules(id)));
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

  /** Every Piece still there, Line by Line in drawing order: what may glue. */
  pieces(): Iterable<Piece> {
    return this.lineForms.pieces();
  }

  /** Every Object, in drawing order: what may stick. */
  *objectRecords(): Iterable<ObjectStroke> {
    for (const stroke of this.strokes) if (stroke.kind === 'object') yield stroke;
  }

  private objectStrokes(): ObjectStroke[] {
    return this.strokes.filter((s): s is ObjectStroke => s.kind === 'object');
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
    this.squeeze(this.crossedBy(this.lineForms.worldCapsules()));
  }

  /** The Objects `capsules`, a Line's, cross more deeply than they touch, in drawing order. */
  private crossedBy(capsules: readonly Capsule[]): ObjectStroke[] {
    const touching = capsules.map(({ segment, radius }) => ({
      segment,
      radius: radius - SQUEEZE_TOLERANCE,
    }));
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
    const capsules = this.lineForms.worldCapsules();
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
   * Releases the Frozen Object under `point`, if any, or else the Frozen Run
   * of a Line there, the most recently drawn Line's first: only that Run,
   * not the rest of its Line. Returns whether one was Released.
   */
  releaseAt(point: Vec2): boolean {
    const object = this.objectAt(point, (s) => this.physics.isFrozen(s.body));
    if (object) return this.release(object.id);
    const near = this.query.touchedBy({ path: [point], radius: RELEASE_REACH });
    const pieces = near.flatMap((thing) => (thing.thing === 'piece' ? [thing] : []));
    for (const { id, index } of pieces.sort((p, q) => q.id - p.id || p.index - q.index)) {
      if (!this.lineForms.releasePiece(id, index)) continue;
      this.say({ kind: 'released', id });
      return true;
    }
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
   * Releases a Frozen Object, or every Frozen Run of a Line, optionally
   * setting it moving.
   */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const object = this.objectById(id);
    if (object) {
      if (!this.physics.isFrozen(object.body)) return false;
      this.physics.release(object.body);
      if (velocity) this.physics.setVelocity(object.body, velocity);
    } else if (!this.lineForms.release(id, velocity)) return false;
    this.say({ kind: 'released', id });
    return true;
  }

  /**
   * Removes one Stroke with its Fill, for `why`. What a Grounded Line held
   * up falls at the end of the `together` this runs in.
   */
  remove(id: StrokeId, why: Why): void {
    this.take(id, why);
  }

  /** Removes Stroke `id`, and says what of it was left, if it was there. */
  private take(id: StrokeId, why: Why): ObjectStroke | TakenLine | null {
    const index = this.strokes.findIndex((s) => s.id === id);
    if (index < 0) return null;
    const [stroke] = this.strokes.splice(index, 1);
    if (stroke!.kind === 'line') return this.lineForms.remove(id, why);
    this.bodies.removeBody(stroke!.body, why);
    return stroke!;
  }

  /**
   * Removes Piece `index` of Line `lineId`, for `why`; the rest of the Line
   * stays where it is, fixed or as one body, and the Line goes with its last
   * Piece. What a fixed one held up falls at the end of the `together` this
   * runs in.
   */
  removePiece(lineId: StrokeId, index: number, why: Why): void {
    this.lineForms.together(() => {
      this.lineForms.removePiece(lineId, index, why);
      if (!this.lineForms.has(lineId)) this.strokes = this.strokes.filter((s) => s.id !== lineId);
    });
  }

  /**
   * Runs `act`, which may take Pieces away, and then lets what they held up
   * fall, once (Collapse): every command that takes Pieces away does so.
   */
  together<T>(act: () => T): T {
    return this.lineForms.together(act);
  }

  /**
   * Takes back what's left of a Stroke: an Object with its Fill, or a Line's
   * Pieces still there. Says what it took back and its Ink, or that the
   * Stroke was gone already.
   */
  removeStroke(id: StrokeId): RemovedStroke {
    const taken = this.together(() => this.take(id, 'undone'));
    if (!taken) return { kind: 'gone', id };
    const { colour } = taken;
    if ('kind' in taken) {
      const { outline, fill } = taken;
      const ink = outlineInk(outline);
      return {
        kind: 'object',
        id,
        colour,
        ink,
        fill: fill && { colour: fill, ink: fillInk(outline) },
      };
    }
    return { kind: 'line', id, colour, ink: taken.ink };
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
   * the rest of its Line stays where it is until the step's Collapse; the
   * Line goes with its last Piece.
   */
  break(target: StrokeTarget): Broken | null {
    if (target.kind === 'object') return this.breakObject(target);
    const broken = this.lineForms.breakPiece(target);
    if (!this.lineForms.has(target.lineId))
      this.strokes = this.strokes.filter((s) => s.id !== target.lineId);
    return broken;
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

  save(): SavedStrokes {
    return {
      strokes: this.strokes.map((stroke): SavedStroke => {
        if (stroke.kind === 'line') return this.lineForms.save(stroke.id);
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
    this.lineForms.clear();
    this.strokes = saved.strokes.map((stroke): Stroke => {
      if (stroke.kind === 'line') {
        this.lineForms.restore(stroke);
        return { kind: 'line', id: stroke.id };
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
    this.lineForms.clear();
  }

  /** What a fixed Piece that broke this step held up falls. */
  step(): void {
    this.lineForms.step();
  }
}
