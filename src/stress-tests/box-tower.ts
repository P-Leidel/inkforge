import type { Transform } from '../geometry/transform';
import type { ObjectView, SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { dragBox } from '../stroke/pointer-paths';
import { SettleWatch } from './settling';
import type { StressTest } from './stress-test';

const BOXES = 10;
const SIZE = 60;
/** Boxes are drawn this far apart, since Objects may not overlap when drawn. */
const GAP = 2;
const LEFT = 470;
const GROUND_Y = 880;
/**
 * The tower has fallen once a box is further than this (px) from where it
 * was drawn, or tilted more than MAX_TILT. Closing the gaps drops the top
 * box by 2 px per box, which is allowed for.
 */
const FALL_DISTANCE = 10 + BOXES * GAP;
const MAX_TILT = 0.1;

/**
 * Engine verdict check 2: a tower of 10 drawn boxes must settle within 2 s
 * with no visible jitter and stay standing for 60 s.
 */
export class BoxTower implements StressTest {
  readonly name = 'Box tower';
  private readonly ids: StrokeId[] = [];
  private readonly startedAt: number;
  private readonly settle = new SettleWatch();
  private readonly drawnPoses: Transform[];
  private settledPoses: Transform[] | null = null;
  /** Largest distance (px) any box has moved since the tower settled: jitter. */
  maxDrift = 0;
  /** Simulated time at which the tower fell, or null. */
  private fellAt: number | null = null;

  constructor(private readonly world: SandboxWorld) {
    for (let k = 0; k < BOXES; k++) {
      const bottom = GROUND_Y - GAP - k * (SIZE + GAP);
      const outcome = world.submitStroke(dragBox(LEFT, bottom - SIZE, SIZE, SIZE));
      if (outcome.kind === 'object') this.ids.push(outcome.id);
    }
    if (!world.isRunning) world.togglePause();
    for (const id of this.ids) world.release(id);
    this.startedAt = world.time;
    this.drawnPoses = this.boxes().map((b) => b.transform);
  }

  /** Seconds from release until the tower came to rest, or null. */
  get settleTime(): number | null {
    return this.settle.settledAt === null ? null : this.settle.settledAt - this.startedAt;
  }

  /** Seconds the tower has stood since it was released. */
  get standingFor(): number {
    return (this.fellAt ?? this.world.time) - this.startedAt;
  }

  get standing(): boolean {
    return this.fellAt === null;
  }

  private boxes(): ObjectView[] {
    const wanted = new Set(this.ids);
    return this.world.objects.filter((o) => wanted.has(o.id));
  }

  update(): void {
    const boxes = this.boxes();
    const fallen =
      boxes.length < BOXES ||
      boxes.some((box, i) => {
        const drawn = this.drawnPoses[i]!;
        const moved = Math.hypot(box.transform.x - drawn.x, box.transform.y - drawn.y);
        return moved > FALL_DISTANCE || Math.abs(box.transform.angle) > MAX_TILT;
      });
    if (fallen && this.fellAt === null) this.fellAt = this.world.time;
    this.settle.update(boxes, this.world.time);
    if (this.settle.settledAt === null) return;
    this.settledPoses ??= boxes.map((b) => b.transform);
    boxes.forEach((box, i) => {
      const pose = this.settledPoses![i]!;
      const drift = Math.hypot(box.transform.x - pose.x, box.transform.y - pose.y);
      this.maxDrift = Math.max(this.maxDrift, drift);
    });
  }

  status(): string {
    const state = this.standing
      ? `standing for ${this.standingFor.toFixed(0)} s`
      : `FELL after ${this.standingFor.toFixed(1)} s`;
    const settle = this.settleTime;
    if (settle === null) return `Box tower: ${this.ids.length} boxes, settling…, ${state}`;
    return `Box tower: settled in ${settle.toFixed(2)} s, jitter since ${this.maxDrift.toFixed(2)} px, ${state}`;
  }
}
