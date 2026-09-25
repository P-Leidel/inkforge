import { polygonCentroid, type Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { Random } from './random';

/** Seconds a Debris particle lives; it fades out over its life. */
export const DEBRIS_LIFETIME = 2;
/** One particle per this many px of a broken Outline, within the bounds below. */
const DEBRIS_SPACING = 10;
const MIN_PARTICLES = 8;
const MAX_PARTICLES = 30;
/** Speed (px/s) particles burst out at, on top of the broken thing's own velocity. */
const BURST_MIN = 60;
const BURST_MAX = 260;

export interface DebrisParticle {
  readonly colour: Colour;
  /** Side of its square, px. */
  readonly size: number;
  readonly position: Vec2;
  /** Radians. */
  readonly angle: number;
  /** 1 when it spawns, falling to 0 when it is gone. */
  readonly opacity: number;
}

interface Particle {
  readonly colour: Colour;
  readonly size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  readonly spin: number;
  age: number;
}

/**
 * Debris: purely visual particles that burst from something that broke.
 * They live outside the physics world, fall under gravity, collide with
 * nothing and fade out. They are not part of the Reset snapshot, and their
 * randomness is their own, so they never change how a run plays out.
 */
export class Debris {
  private particles: Particle[] = [];

  constructor(
    private readonly random: Random,
    private readonly gravity: number,
  ) {}

  get count(): number {
    return this.particles.length;
  }

  get views(): readonly DebrisParticle[] {
    return this.particles.map((p) => ({
      colour: p.colour,
      size: p.size,
      position: { x: p.x, y: p.y },
      angle: p.angle,
      opacity: Math.max(0, 1 - p.age / DEBRIS_LIFETIME),
    }));
  }

  /**
   * Bursts particles from along a broken Outline (world coordinates), moving
   * with `velocity`, in the given Colours taken in turn.
   */
  burst(outline: Polygon, velocity: Vec2, colours: readonly Colour[]): void {
    const perimeter = outline.reduce((sum, p, i) => {
      const q = outline[(i + 1) % outline.length]!;
      return sum + Math.hypot(q.x - p.x, q.y - p.y);
    }, 0);
    const count = Math.round(
      Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, perimeter / DEBRIS_SPACING)),
    );
    const centre = polygonCentroid(outline);
    for (let k = 0; k < count; k++) {
      const at = this.pointAlong(
        outline,
        perimeter,
        ((k + this.random.next()) / count) * perimeter,
      );
      const out = Math.atan2(at.y - centre.y, at.x - centre.x) + this.random.range(-0.6, 0.6);
      const speed = this.random.range(BURST_MIN, BURST_MAX);
      this.particles.push({
        colour: colours[k % colours.length]!,
        size: this.random.range(3, 8),
        x: at.x,
        y: at.y,
        vx: velocity.x + speed * Math.cos(out),
        vy: velocity.y + speed * Math.sin(out) - 80,
        angle: this.random.range(0, Math.PI),
        spin: this.random.range(-8, 8),
        age: 0,
      });
    }
  }

  private pointAlong(outline: Polygon, perimeter: number, distance: number): Vec2 {
    let left = distance % perimeter;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i]!;
      const q = outline[(i + 1) % outline.length]!;
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      if (left <= length && length > 0) {
        const t = left / length;
        return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
      }
      left -= length;
    }
    return outline[0]!;
  }

  /** Moves the particles on by `seconds`; spent ones disappear. */
  step(seconds: number): void {
    for (const p of this.particles) {
      p.vy += this.gravity * seconds;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.angle += p.spin * seconds;
      p.age += seconds;
    }
    this.particles = this.particles.filter((p) => p.age < DEBRIS_LIFETIME);
  }

  clear(): void {
    this.particles = [];
  }
}
