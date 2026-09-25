import { polygonCentroid, polygonContainsPoint, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { transformPoints, type Transform } from '../geometry/transform';
import { sub, type Vec2 } from '../geometry/vec2';
import {
  createPhysicsWorld,
  type BodyId,
  type PhysicsWorld,
  type PhysicsWorldFactory,
} from '../physics';
import { processStroke, type RejectionReason, type StrokeContext } from '../stroke/stroke-pipeline';
import { SANDBOX_ARENA, type Arena } from './arena';
import { Random } from './random';

/** Fixed physics step: 60 Hz. */
export const STEP_SECONDS = 1 / 60;
/** Gravity, px/s². */
export const GRAVITY = 1000;
/** Approach speed (px/s) above which a moving body wakes a Frozen Object. Tuned by feel. */
export const WAKE_SPEED = 150;
/** At most this many steps per `advance`, so a long frame can't stall the game. */
const MAX_STEPS_PER_ADVANCE = 8;

export type StrokeId = number;

export interface LineView {
  readonly id: StrokeId;
  /** Capsule centre lines. */
  readonly segments: readonly Segment[];
  readonly thickness: number;
}

export interface ObjectView {
  readonly id: StrokeId;
  /** Outline relative to the body's origin; place it with `transform`. */
  readonly outline: Polygon;
  /** Convex collider pieces relative to the body's origin. */
  readonly pieces: readonly Polygon[];
  readonly transform: Transform;
  /** Linear velocity, px/s. */
  readonly velocity: Vec2;
  readonly frozen: boolean;
}

/** What a submitted Stroke became. */
export type StrokeOutcome =
  | { readonly kind: 'line'; readonly id: StrokeId }
  | { readonly kind: 'object'; readonly id: StrokeId }
  | { readonly kind: 'rejected'; readonly reason: RejectionReason; readonly path: readonly Vec2[] }
  | { readonly kind: 'dropped' };

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
  readonly body: BodyId;
  readonly outline: Polygon;
  readonly pieces: readonly Polygon[];
}

type Stroke = LineStroke | ObjectStroke;

export interface SandboxWorldOptions {
  readonly seed?: number;
  readonly arena?: Arena;
  readonly createPhysics?: PhysicsWorldFactory;
}

/**
 * The headless sandbox: the Arena, the Strokes drawn into it, the pause state
 * and undo. It has no rendering dependency, so it is the main testing seam.
 */
export class SandboxWorld {
  readonly arena: Arena;
  readonly random: Random;
  private readonly physics: PhysicsWorld;
  /** Strokes in the order they were drawn, for undo. */
  private strokes: Stroke[] = [];
  private nextStrokeId = 1;
  private running = false;
  private accumulator = 0;
  private elapsed = 0;

  constructor(options: SandboxWorldOptions = {}) {
    this.arena = options.arena ?? SANDBOX_ARENA;
    this.random = new Random(options.seed ?? 1);
    this.physics = (options.createPhysics ?? createPhysicsWorld)({
      gravity: { x: 0, y: GRAVITY },
      timeStep: STEP_SECONDS,
      wakeSpeed: WAKE_SPEED,
    });
    this.physics.addTerrain(this.arena.terrain);
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
    return this.strokes
      .filter((s): s is ObjectStroke => s.kind === 'object')
      .map((s) => this.viewObject(s));
  }

  private viewObject(stroke: ObjectStroke): ObjectView {
    return {
      id: stroke.id,
      outline: stroke.outline,
      pieces: stroke.pieces,
      transform: this.physics.getTransform(stroke.body),
      velocity: this.physics.getVelocity(stroke.body),
      frozen: this.physics.isFrozen(stroke.body),
    };
  }

  /** Turns one Stroke's raw pointer samples into a Line, an Object, a rejection or nothing. */
  submitStroke(samples: readonly Vec2[], options: StrokeOptions = {}): StrokeOutcome {
    const result = processStroke(samples, this.strokeContext(options));
    switch (result.kind) {
      case 'line': {
        const id = this.nextStrokeId++;
        const body = this.physics.addLine(result.segments, result.thickness);
        this.strokes.push({
          kind: 'line',
          id,
          body,
          segments: result.segments,
          thickness: result.thickness,
        });
        return { kind: 'line', id };
      }
      case 'object': {
        const id = this.nextStrokeId++;
        // The body's origin is the outline's centroid; shapes are stored relative to it.
        const origin = polygonCentroid(result.outline);
        const local = (polygon: Polygon) => polygon.map((p) => sub(p, origin));
        const pieces = result.pieces.map(local);
        const body = this.physics.addObject({ position: origin, pieces, frozen: true });
        this.strokes.push({ kind: 'object', id, body, outline: local(result.outline), pieces });
        return { kind: 'object', id };
      }
      case 'rejected':
        return { kind: 'rejected', reason: result.reason, path: result.path };
      case 'dropped':
        return result;
    }
  }

  private strokeContext(options: StrokeOptions): StrokeContext {
    return {
      terrain: this.arena.terrain,
      objects: [],
      ...(options.lineThickness !== undefined && { lineThickness: options.lineThickness }),
    };
  }

  /**
   * Releases the Frozen Object under `point`, if physics is running. Returns
   * whether an Object was Released.
   */
  releaseAt(point: Vec2): boolean {
    if (!this.running) return false;
    // The most recently drawn Object is on top.
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const stroke = this.strokes[i]!;
      if (stroke.kind !== 'object' || !this.physics.isFrozen(stroke.body)) continue;
      const outline = transformPoints(stroke.outline, this.physics.getTransform(stroke.body));
      if (polygonContainsPoint(outline, point)) return this.release(stroke.id);
    }
    return false;
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

  /** Removes the most recent Stroke. */
  undo(): void {
    const stroke = this.strokes.pop();
    if (stroke) this.physics.removeBody(stroke.body);
  }

  /** Removes every Stroke; the Terrain stays. */
  clear(): void {
    for (const stroke of this.strokes) this.physics.removeBody(stroke.body);
    this.strokes = [];
  }

  togglePause(): void {
    this.running = !this.running;
    this.accumulator = 0;
  }

  /** Advances physics by one fixed step, if running. */
  step(): void {
    if (!this.running) return;
    this.physics.step();
    this.elapsed += STEP_SECONDS;
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
