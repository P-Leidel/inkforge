import type { Vec2 } from '../geometry/vec2';
import { GRAVITY, type SandboxWorld, type StrokeId } from '../sandbox/sandbox-world';
import { dragPolygon } from '../stroke/pointer-paths';
import { SettleWatch, speedOf } from './settling';
import type { StressTest } from './stress-test';

const COLUMNS = 10;
const ROWS = 10;
const SPACING = 44;
const LEFT = 90;
const TOP = 150;
const GROUND_Y = 880;
const MIN_RADIUS = 14;
const MAX_RADIUS = 17;
/** Pebble outlines wobble by up to this fraction of their radius. */
const WOBBLE = 0.15;
const PEBBLE_VERTICES = 12;

/**
 * Engine verdict check 3 (and part of 4): drops 100 small, irregular drawn
 * Objects into a pile against the left wall. The frame rate is read from the
 * debug overlay; this readout tracks the fastest pebble against free fall.
 */
export class PebbleDrop implements StressTest {
  readonly name = 'Pebbles';
  private readonly ids: StrokeId[] = [];
  private readonly startedAt: number;
  private readonly settle = new SettleWatch();
  /** Pebbles the Stroke pipeline refused (should be none). */
  refused = 0;
  /** Fastest speed (px/s) any pebble has reached. */
  maxSpeed = 0;
  /** Speed (px/s) of a free fall from the top row to the ground. */
  readonly freeFallSpeed = Math.sqrt(2 * GRAVITY * (GROUND_Y - TOP));

  constructor(private readonly world: SandboxWorld) {
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const centre = { x: LEFT + column * SPACING, y: TOP + row * SPACING };
        const outcome = world.submitStroke(dragPolygon(this.pebbleOutline(centre)));
        if (outcome.kind === 'object') this.ids.push(outcome.id);
        else this.refused++;
      }
    }
    if (!world.isRunning) world.togglePause();
    for (const id of this.ids) world.release(id);
    this.startedAt = world.time;
  }

  /** An irregular pebble, from the world's seeded generator. */
  private pebbleOutline(centre: Vec2): Vec2[] {
    const random = this.world.random;
    const radius = random.range(MIN_RADIUS, MAX_RADIUS);
    return Array.from({ length: PEBBLE_VERTICES }, (_, k) => {
      const angle = (k / PEBBLE_VERTICES) * 2 * Math.PI;
      const r = radius * (1 + random.range(-WOBBLE, WOBBLE));
      return { x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle) };
    });
  }

  /** Seconds from release until the pile came to rest, or null. */
  get settleTime(): number | null {
    return this.settle.settledAt === null ? null : this.settle.settledAt - this.startedAt;
  }

  update(): void {
    const wanted = new Set(this.ids);
    const pebbles = this.world.objects.filter((o) => wanted.has(o.id));
    for (const pebble of pebbles) this.maxSpeed = Math.max(this.maxSpeed, speedOf(pebble));
    this.settle.update(pebbles, this.world.time);
  }

  status(): string {
    const settle = this.settleTime;
    const pile = settle === null ? 'settling…' : `settled after ${settle.toFixed(1)} s`;
    return (
      `Pebbles: ${this.ids.length} dropped, ${pile}, fastest ${this.maxSpeed.toFixed(0)} px/s ` +
      `(free fall ${this.freeFallSpeed.toFixed(0)} px/s)`
    );
  }
}
