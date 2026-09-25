import { capsuleOverlapsPolygon } from '../geometry/overlap';
import { capsulePolygon, shortestWayOut } from '../geometry/separation';
import { polygonCentroid, polygonContainsPoint, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { transformPoints, type Transform } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillMass, outlineMass } from '../materials/mass';
import {
  createMaterialTable,
  TERRAIN_SURFACE,
  type MaterialTable,
} from '../materials/material-table';
import {
  createPhysicsWorld,
  type BodyId,
  type PhysicsWorld,
  type PhysicsWorldFactory,
} from '../physics';
import {
  processStroke,
  type RejectionReason,
  type StrokeContext,
  type StrokeResult,
} from '../stroke/stroke-pipeline';
import { SANDBOX_ARENA, type Arena } from './arena';
import { Debris, type DebrisParticle } from './debris';
import { durabilityLeft, MaterialRules, wear, type Party } from './material-rules';
import { Random } from './random';

/** Fixed physics step: 60 Hz. */
export const STEP_SECONDS = 1 / 60;
/** Gravity, px/s². */
export const GRAVITY = 1000;
/** Speed (px/s) at which a Line squeezes an Object off itself; Box2D's push-out cap. */
export const SLIDE_OUT_SPEED = 250;
/**
 * A Line crossing an Object less deeply than this (px) only touches it: a
 * moving Object resting on a Line sinks into it a little, and isn't squeezed.
 */
const SQUEEZE_TOLERANCE = 1;
/** Seed of the Debris' own random generator, apart from the simulation's. */
const DEBRIS_SEED = 0x0deb415;
/** At most this many steps per `advance`, so a long frame can't stall the game. */
const MAX_STEPS_PER_ADVANCE = 8;

export type StrokeId = number;

export interface LineView {
  readonly id: StrokeId;
  readonly colour: Colour;
  /** Capsule centre lines. */
  readonly segments: readonly Segment[];
  readonly thickness: number;
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

/** What a submitted Stroke became. */
export type StrokeOutcome =
  | { readonly kind: 'line'; readonly id: StrokeId }
  | { readonly kind: 'object'; readonly id: StrokeId }
  | { readonly kind: 'rejected'; readonly reason: RejectionReason; readonly path: readonly Vec2[] }
  | { readonly kind: 'dropped' };

/** What a Fill click did. */
export type FillOutcome =
  | { readonly kind: 'filled'; readonly id: StrokeId }
  | { readonly kind: 'already-filled'; readonly id: StrokeId }
  | { readonly kind: 'missed' };

export interface StrokeOptions {
  /** Overrides the Line thickness (the stress tests use a thinner Line). */
  readonly lineThickness?: number;
}

interface LineStroke extends LineView {
  readonly kind: 'line';
  readonly body: BodyId;
}

interface ObjectStroke {
  readonly kind: 'object';
  readonly id: StrokeId;
  readonly colour: Colour;
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
}

type Stroke = LineStroke | ObjectStroke;

/** One undo step: a Stroke, or the Fill of an Object. */
type Action = { readonly kind: 'stroke' | 'fill'; readonly id: StrokeId };

/** An Object's pose and motion when a snapshot is taken. */
interface ObjectMotion {
  readonly transform: Transform;
  readonly velocity: Vec2;
  readonly angularVelocity: number;
  readonly frozen: boolean;
  /** The displacement still to slide off a Line, or null. */
  readonly slide: Vec2 | null;
}

type SavedStroke =
  Omit<LineStroke, 'body'> | (Omit<ObjectStroke, 'body'> & { readonly motion: ObjectMotion });

/** Everything R brings back: the whole simulation when physics last started. */
interface Snapshot {
  readonly strokes: readonly SavedStroke[];
  readonly history: readonly Action[];
  readonly random: number;
  readonly time: number;
  /** Contacts touching when it was taken: they deal no damage until they separate. */
  readonly settled: readonly string[];
}

export interface SandboxWorldOptions {
  readonly seed?: number;
  readonly arena?: Arena;
  /** The material table to read; defaults to a fresh copy of the defaults. */
  readonly materials?: MaterialTable;
  readonly createPhysics?: PhysicsWorldFactory;
}

/**
 * The headless sandbox: the Arena, the Strokes drawn into it, the pause state
 * and undo. It has no rendering dependency, so it is the main testing seam.
 * Each Stroke is drawn in a Colour given with the command; the world holds no
 * selected Colour.
 */
export class SandboxWorld {
  readonly arena: Arena;
  readonly random: Random;
  readonly materials: MaterialTable;
  private readonly physics: PhysicsWorld;
  private readonly rules: MaterialRules;
  private readonly debris = new Debris(new Random(DEBRIS_SEED), GRAVITY);
  private terrainBody: BodyId;
  /** Taken whenever physics starts; R returns to it. */
  private snapshot: Snapshot | null = null;
  /** The material table as it was last applied to the physics world. */
  private appliedMaterials = '';
  /** Strokes in the order they were drawn. */
  private strokes: Stroke[] = [];
  /** Strokes and Fills in the order they were made, for undo. */
  private history: Action[] = [];
  private nextStrokeId = 1;
  private running = false;
  private accumulator = 0;
  private elapsed = 0;

  constructor(options: SandboxWorldOptions = {}) {
    this.arena = options.arena ?? SANDBOX_ARENA;
    this.random = new Random(options.seed ?? 1);
    this.materials = options.materials ?? createMaterialTable();
    this.physics = (options.createPhysics ?? createPhysicsWorld)({
      gravity: { x: 0, y: GRAVITY },
      timeStep: STEP_SECONDS,
      wakeSpeed: this.materials.wakeSpeed,
      minBounceSpeed: this.materials.minBounceSpeed,
    });
    this.terrainBody = this.physics.addTerrain(this.arena.terrain, TERRAIN_SURFACE);
    this.rules = new MaterialRules(this.materials);
  }

  /** Whether physics is running (stands in for the Wave) rather than paused (the Build Phase). */
  get isRunning(): boolean {
    return this.running;
  }

  /** Simulated seconds since the world was created. */
  get time(): number {
    return this.elapsed;
  }

  get bodyCount(): number {
    return this.physics.bodyCount;
  }

  get lines(): readonly LineView[] {
    return this.strokes.filter((s): s is LineStroke => s.kind === 'line');
  }

  get objects(): readonly ObjectView[] {
    return this.objectStrokes().map((s) => this.viewObject(s));
  }

  /** Debris particles in flight. */
  get debrisParticles(): readonly DebrisParticle[] {
    return this.debris.views;
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
   * Turns one Stroke's raw pointer samples, drawn in `colour`, into a Line,
   * an Object, a rejection or nothing. Every Colour follows the same drawing
   * rules; only the material differs.
   */
  submitStroke(
    samples: readonly Vec2[],
    colour: Colour,
    options: StrokeOptions = {},
  ): StrokeOutcome {
    const result = processStroke(samples, this.strokeContext(options));
    const material = this.materials.colours[colour];
    switch (result.kind) {
      case 'line': {
        const id = this.nextStrokeId++;
        const body = this.physics.addLine(result.segments, result.thickness, material.line);
        const line: LineStroke = {
          kind: 'line',
          id,
          colour,
          body,
          segments: result.segments,
          thickness: result.thickness,
        };
        this.strokes.push(line);
        this.history.push({ kind: 'stroke', id });
        if (this.running) this.squeeze(this.objectStrokes(), [line]);
        return { kind: 'line', id };
      }
      case 'object': {
        const id = this.nextStrokeId++;
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
          surface: material.outline,
          mass,
        });
        const object: ObjectStroke = {
          kind: 'object',
          id,
          colour,
          body,
          outline,
          parts,
          fill: null,
          outlineMass: mass,
          fillMass: 0,
          damage: 0,
          impacts: 0,
        };
        this.strokes.push(object);
        this.history.push({ kind: 'stroke', id });
        if (this.running) this.squeeze([object], this.lineStrokes());
        return { kind: 'object', id };
      }
      case 'rejected':
        return { kind: 'rejected', reason: result.reason, path: result.path };
      case 'dropped':
        return result;
    }
  }

  /**
   * What a Stroke would become if it were submitted now, without adding it.
   * The scene uses this to show a refused Object in red while drawing.
   */
  previewStroke(samples: readonly Vec2[]): StrokeResult {
    return processStroke(samples, this.strokeContext({}));
  }

  private strokeContext(options: StrokeOptions): StrokeContext {
    return {
      terrain: this.arena.terrain,
      objects: this.objectStrokes().map((s) => this.worldParts(s)),
      ...(options.lineThickness !== undefined && { lineThickness: options.lineThickness }),
    };
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
      line.segments.map((segment) => ({ segment, radius: line.thickness / 2 }));
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
      );
      if (move) this.physics.slideOut(object.body, move, SLIDE_OUT_SPEED);
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

  /**
   * Releases the Frozen Object under `point`, if physics is running. Returns
   * whether an Object was Released.
   */
  releaseAt(point: Vec2): boolean {
    if (!this.running) return false;
    const object = this.objectAt(point, (s) => this.physics.isFrozen(s.body));
    return object ? this.release(object.id) : false;
  }

  /**
   * Fills the Object under `point` with `colour`: its mass becomes its
   * Outline's plus its Fill's. Works paused and running, on Frozen and moving
   * Objects, and never wakes a Frozen one. An Object holds one Fill.
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

  /**
   * Releases a Frozen Object, optionally setting it moving (the stress tests
   * launch balls this way). Only while physics is running.
   */
  release(id: StrokeId, velocity?: Vec2): boolean {
    if (!this.running) return false;
    const stroke = this.strokes.find((s) => s.id === id);
    if (stroke?.kind !== 'object' || !this.physics.isFrozen(stroke.body)) return false;
    this.physics.release(stroke.body);
    if (velocity) this.physics.setVelocity(stroke.body, velocity);
    return true;
  }

  /** Removes one Stroke with its Fill, e.g. a spent stress-test ball. */
  remove(id: StrokeId): void {
    const index = this.strokes.findIndex((s) => s.id === id);
    if (index < 0) return;
    const [stroke] = this.strokes.splice(index, 1);
    this.physics.removeBody(stroke!.body);
    this.history = this.history.filter((action) => action.id !== id);
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists. Broken
   * Objects are gone from the history, so undo skips them.
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
   * Removes every Stroke and Fill and the Debris; the Terrain stays. R has
   * nothing to go back to.
   */
  clear(): void {
    for (const stroke of this.strokes) this.physics.removeBody(stroke.body);
    this.strokes = [];
    this.history = [];
    this.snapshot = null;
    this.rules.settle([]);
    this.debris.clear();
  }

  /** Breaks an Object: its body is removed and Debris bursts from it. */
  private breakObject(object: ObjectStroke): void {
    const outline = transformPoints(object.outline, this.physics.getTransform(object.body));
    const colours = object.fill ? [object.colour, object.fill] : [object.colour];
    this.debris.burst(outline, this.physics.getVelocity(object.body), colours);
    this.remove(object.id);
  }

  /**
   * Starts or pauses physics. Box2D can't save its own state, and a world
   * rebuilt from scratch doesn't play out like one that wasn't, so every
   * start takes a snapshot for R and rebuilds the world from it: the first
   * run and every retry play out identically.
   */
  togglePause(): void {
    this.running = !this.running;
    this.accumulator = 0;
    if (!this.running) return;
    this.snapshot = this.takeSnapshot();
    this.rebuild(this.snapshot);
    this.squeeze(this.objectStrokes(), this.lineStrokes());
  }

  /**
   * Takes the world back to the moment physics last started, damage and all,
   * and pauses. Strokes and Fills made since are gone, and undo carries on
   * from the history of that moment. Does nothing before the first start.
   */
  reset(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    this.rebuild(snapshot);
    this.debris.clear();
    this.history = [...snapshot.history];
    this.random.state = snapshot.random;
    this.elapsed = snapshot.time;
    this.running = false;
    this.accumulator = 0;
  }

  private takeSnapshot(): Snapshot {
    return {
      strokes: this.strokes.map((stroke): SavedStroke => {
        if (stroke.kind === 'line') {
          const { id, colour, segments, thickness } = stroke;
          return { kind: 'line', id, colour, segments, thickness };
        }
        const { body, ...object } = stroke;
        return { ...object, motion: this.motionOf(body) };
      }),
      history: [...this.history],
      random: this.random.state,
      time: this.elapsed,
      settled: this.settledPairs(),
    };
  }

  /**
   * The pairs touching now. Straight after a rebuild (R, or a start not yet
   * stepped) the engine hasn't found any contacts yet, so the pairs settled
   * at the last start still count until they have stepped apart.
   */
  private settledPairs(): string[] {
    const touching = this.rules.pairKeys(this.physics.touchingPairs(), this.partyFinder());
    return [...new Set([...this.rules.settledPairs, ...touching])];
  }

  /** Who each body is to the Material rules. */
  private partyFinder(): (body: BodyId) => Party<ObjectStroke> | null {
    const byBody = new Map(this.strokes.map((stroke) => [stroke.body, stroke]));
    return (body) => {
      if (body === this.terrainBody) return { key: 'terrain', target: null, sliding: false };
      const stroke = byBody.get(body);
      if (!stroke) return null;
      return {
        key: `stroke ${stroke.id}`,
        target: stroke.kind === 'object' ? stroke : null,
        sliding: this.physics.getSlide(body) !== null,
      };
    };
  }

  private motionOf(body: BodyId): ObjectMotion {
    return {
      transform: this.physics.getTransform(body),
      velocity: this.physics.getVelocity(body),
      angularVelocity: this.physics.getAngularVelocity(body),
      frozen: this.physics.isFrozen(body),
      slide: this.physics.getSlide(body),
    };
  }

  /**
   * Applies edits to the material table from the next step. Densities are
   * left out: an Object's mass is set when it is drawn or filled.
   */
  private applyMaterials(): void {
    const materials = JSON.stringify(this.materials);
    if (materials === this.appliedMaterials) return;
    this.appliedMaterials = materials;
    this.physics.setWakeSpeed(this.materials.wakeSpeed);
    this.physics.setMinBounceSpeed(this.materials.minBounceSpeed);
    for (const stroke of this.strokes) {
      const material = this.materials.colours[stroke.colour];
      this.physics.setSurface(
        stroke.body,
        stroke.kind === 'line' ? material.line : material.outline,
      );
    }
  }

  /** Rebuilds the physics world from a snapshot's Strokes, from a fresh engine state. */
  private rebuild(snapshot: Snapshot): void {
    this.physics.reset();
    this.terrainBody = this.physics.addTerrain(this.arena.terrain, TERRAIN_SURFACE);
    this.rules.settle(snapshot.settled);
    this.strokes = snapshot.strokes.map((saved): Stroke => {
      const material = this.materials.colours[saved.colour];
      if (saved.kind === 'line') {
        return {
          ...saved,
          body: this.physics.addLine(saved.segments, saved.thickness, material.line),
        };
      }
      const { motion, ...object } = saved;
      const body = this.physics.addObject({
        position: { x: motion.transform.x, y: motion.transform.y },
        angle: motion.transform.angle,
        parts: object.parts,
        frozen: motion.frozen || motion.slide !== null,
        surface: material.outline,
        mass: object.outlineMass + object.fillMass,
        velocity: motion.velocity,
        angularVelocity: motion.angularVelocity,
      });
      if (motion.slide) this.physics.slideOut(body, motion.slide, SLIDE_OUT_SPEED);
      return { ...object, body };
    });
  }

  /** Advances physics by one fixed step, if running. */
  step(): void {
    if (!this.running) return;
    this.applyMaterials();
    const report = this.physics.step();
    this.elapsed += STEP_SECONDS;
    this.debris.step(STEP_SECONDS);
    const broken = this.rules.applyStep(
      report,
      () => this.physics.touchingPairs(),
      this.partyFinder(),
    );
    for (const object of broken) this.breakObject(object);
  }

  /** Advances by real elapsed time, in whole fixed steps; the remainder carries over. */
  advance(seconds: number): void {
    if (!this.running) return;
    this.accumulator += seconds;
    let steps = 0;
    // A small tolerance so that e.g. 100 ms of frames gives exactly 6 steps.
    while (this.accumulator >= STEP_SECONDS - 1e-9 && steps < MAX_STEPS_PER_ADVANCE) {
      this.step();
      this.accumulator -= STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_ADVANCE) this.accumulator = 0;
  }

  /** Frees the physics world. */
  dispose(): void {
    this.physics.destroy();
  }
}
