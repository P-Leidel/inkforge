import { capsuleOverlapsPolygon } from '../geometry/overlap';
import { capsulePolygon, shortestWayOut } from '../geometry/separation';
import { polygonCentroid, type Polygon } from '../geometry/polygon';
import { transformPoints } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillInk, outlineInk } from '../materials/ink';
import { fillMass, outlineMass } from '../materials/mass';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import type { ArenaBodies, ObjectBody } from './arena-bodies';
import { motionOf, resting, type Kind, type Motion, type Poses } from './arena-contents';
import type { ArenaQuery, Capsule } from './arena-query';
import type { PartyId } from './contact-ledger';
import type { Happening, Why } from './happenings';
import type { Broken } from './material-rules';
import type { Breakable, Numbers } from './numbers';
import type { PreviousPoses } from './previous-poses';
import { WAITING, type StickState } from './sticking';
import type { StrokeId, StrokeTarget } from './stroke-id';

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

/** What taking back a Fill took: the Object stays. */
export type RemovedFill =
  | ({ readonly kind: 'fill'; readonly id: StrokeId } & MadeFill)
  /** The Object is gone, or holds no Fill. */
  | { readonly kind: 'gone'; readonly id: StrokeId };

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

/** An Object's pose and motion when a snapshot is taken. */
interface ObjectMotion extends Motion {
  readonly frozen: boolean;
  /** The displacement still to slide off a Line, or null. */
  readonly slide: Vec2 | null;
}

type SavedObject = Omit<ObjectStroke, 'body'> & { readonly motion: ObjectMotion };

/** The Objects' part of a snapshot. */
export interface SavedObjects {
  readonly objects: readonly SavedObject[];
}

/**
 * `saved` with every Object at rest Frozen again, where it is (`resting`),
 * unless it is sliding off a Line: the Objects' part of the Aftermath of a
 * Wave.
 */
export function freezeRestingObjects(saved: SavedObjects): SavedObjects {
  const still = { velocity: { x: 0, y: 0 }, angularVelocity: 0, frozen: true };
  return {
    objects: saved.objects.map((object) => {
      const { motion } = object;
      if (motion.frozen || !resting(motion) || motion.slide !== null) return object;
      return { ...object, motion: { ...motion, ...still } };
    }),
  };
}

/**
 * The Objects: closed Strokes, each a solid body, with their Fills, the
 * squeeze off Lines, Releasing and breaking them. Each Object is a Party to
 * the Contact ledger. A sibling of `Lines`; `Strokes` holds what goes for
 * both.
 */
export class Objects implements Kind<'objects', SavedObjects, readonly ObjectView[]> {
  readonly name = 'objects';
  /** In the order they were drawn. */
  private objects: ObjectStroke[] = [];

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly materials: MaterialTable,
    private readonly numbers: Numbers,
    private readonly bodies: ArenaBodies<StrokeTarget>,
    private readonly query: Pick<ArenaQuery, 'objectsAt' | 'objectsCrossing' | 'blocksSqueezed'>,
    private readonly poses: Pick<PreviousPoses, 'of'>,
    /** Appends to the list of what happened: a Fill. */
    private readonly say: (happening: Happening) => void,
  ) {}

  get views(): readonly ObjectView[] {
    return this.objects.map((object) => this.view(object));
  }

  private view(stroke: ObjectStroke): ObjectView {
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

  has(id: StrokeId): boolean {
    return this.byId(id) !== undefined;
  }

  /**
   * Adds an Object the Stroke pipeline made, its `outline` and convex
   * `parts` in world coordinates, in `colour`, under `id`: hollow, and
   * Frozen where it was drawn.
   */
  add(
    id: StrokeId,
    drawn: { readonly outline: Polygon; readonly parts: readonly Polygon[] },
    colour: Colour,
  ): ObjectStroke {
    // The body's origin is the outline's centroid; shapes are stored relative to it.
    const origin = polygonCentroid(drawn.outline);
    const local = (polygon: Polygon) => polygon.map((p) => sub(p, origin));
    const outline = local(drawn.outline);
    const parts = drawn.parts.map(local);
    const mass = outlineMass(outline, colour, this.materials);
    const object = this.addBody(
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
    this.objects.push(object);
    return object;
  }

  /** Adds an Object's body, as `def` has it. */
  private addBody(saved: Omit<ObjectStroke, 'body'>, def: ObjectBody): ObjectStroke {
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

  /** Every Object, in drawing order: what may stick. */
  records(): Iterable<ObjectStroke> {
    return this.objects;
  }

  private byId(id: StrokeId): ObjectStroke | undefined {
    return this.objects.find((object) => object.id === id);
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

  /** The Objects `capsules`, a Line's, cross more deeply than they touch, in drawing order. */
  crossedBy(capsules: readonly Capsule[]): ObjectStroke[] {
    const touching = capsules.map(({ segment, radius }) => ({
      segment,
      radius: radius - SQUEEZE_TOLERANCE,
    }));
    return this.query.objectsCrossing(touching).flatMap(({ id }) => this.byId(id) ?? []);
  }

  /**
   * Squeezes each of `objects` that a Line crosses off the Lines crossing
   * it, `lines` being every Line's capsules: drawing a Line through an
   * Object, moving or Frozen, shoves it. It slides the shortest way off at
   * the push-out speed, to a place the Arena query says is clear, passing
   * through Lines and Terrain, and then restarts from rest. (Box2D's own
   * push-out jams bodies made of several convex parts on a Line deep inside
   * them, since each part is pushed out on its own.) A sliding Object deals
   * and takes no damage.
   */
  squeeze(objects: readonly ObjectStroke[], lines: readonly Capsule[]): void {
    for (const object of objects) {
      const parts = this.worldParts(object);
      const crosses = ({ segment: { a, b }, radius }: Capsule) =>
        parts.some((part) => capsuleOverlapsPolygon(a, b, radius - SQUEEZE_TOLERANCE, part));
      const crossing = lines.filter(crosses);
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
  private at(point: Vec2, accept: (object: ObjectStroke) => boolean = () => true) {
    const under = this.query.objectsAt(point);
    for (let i = under.length - 1; i >= 0; i--) {
      const object = this.byId(under[i]!.id);
      if (object && accept(object)) return object;
    }
    return null;
  }

  /** The topmost Frozen Object under `point`, if any. */
  frozenAt(point: Vec2): ObjectStroke | null {
    return this.at(point, (object) => this.physics.isFrozen(object.body));
  }

  /**
   * The Ink a Fill clicked at `point` would take: the topmost Object under
   * it, if that Object is hollow. Null over nothing or over a filled Object.
   */
  fillInkAt(point: Vec2): number | null {
    const object = this.at(point);
    return object && !object.fill ? fillInk(object.outline) : null;
  }

  /**
   * Fills the Object under `point` with `colour`: its mass becomes its
   * Outline's plus its Fill's. Works on Frozen and moving Objects, and never
   * wakes a Frozen one. An Object holds one Fill. Says how much Ink the Fill
   * took. If `accept` turns the Fill down, the Object stays hollow.
   */
  fillAt(point: Vec2, colour: Colour, accept?: (fill: MadeFill) => boolean): FillOutcome {
    const object = this.at(point);
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

  /** Releases Object `id` if it is Frozen, optionally setting it moving; returns whether it did. */
  release(id: StrokeId, velocity?: Vec2): boolean {
    const object = this.byId(id);
    if (!object || !this.physics.isFrozen(object.body)) return false;
    this.physics.release(object.body);
    if (velocity) this.physics.setVelocity(object.body, velocity);
    return true;
  }

  /** Removes Object `id` with its Fill, for `why`, and says what it was, if it was there. */
  remove(id: StrokeId, why: Why): ObjectStroke | null {
    const index = this.objects.findIndex((object) => object.id === id);
    if (index < 0) return null;
    const [object] = this.objects.splice(index, 1);
    this.bodies.removeBody(object!.body, why);
    return object!;
  }

  /**
   * Takes back an Object's Fill; the Object stays, hollow. Says what it took
   * back and its Ink, or that there was no Fill to take.
   */
  removeFill(id: StrokeId): RemovedFill {
    const object = this.byId(id);
    const fill = object?.fill;
    if (!object || !fill) return { kind: 'gone', id };
    this.setFill(object, null);
    return { kind: 'fill', id, colour: fill, ink: fillInk(object.outline) };
  }

  /**
   * Breaks an Object that the Material rules broke, and reports what comes
   * out of it: its body is removed, and its Debris and its Fill come out
   * where it was.
   */
  break(object: ObjectStroke): Broken {
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

  save(): SavedObjects {
    return {
      objects: this.objects.map(({ body, ...object }) => ({
        ...object,
        motion: {
          ...motionOf(this.physics, body),
          frozen: this.physics.isFrozen(body),
          slide: this.physics.getSlide(body),
        },
      })),
    };
  }

  /** Adds the Objects again in the order they were drawn. */
  restore(saved: SavedObjects): void {
    this.objects = saved.objects.map(({ motion, ...object }) => {
      const restored = this.addBody(object, {
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
    this.objects = [];
  }

  /** Nothing to do in a step. */
  step(): void {}
}
