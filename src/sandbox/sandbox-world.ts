import { createPhysicsWorld, type PhysicsWorld, type PhysicsWorldFactory } from '../physics';
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
