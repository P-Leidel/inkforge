/** A frame over this long misses 50 fps, beyond vsync jitter at 60 Hz. */
export const SLOW_FRAME_MS = 20;
/** Milestone 2's exit criterion: no frame over this long. */
export const LONG_FRAME_MS = 33;

/** Frame times are binned this finely for the 1% low. */
const BIN_MS = 0.1;
/** Frames longer than this share the last bin. */
const MAX_BINNED_MS = 1000;

/**
 * Frame times since the world last started, for milestone 2's exit criterion
 * (60 fps on average, no frame over 33 ms): the average fps, the longest
 * frame, how many were slow or long, and the 1% low. The first frame after
 * each restart is left out, since it carries the work of building or
 * rebuilding the scene, not of playing it.
 */
export class FrameTimes {
  private count = 0;
  private totalMs = 0;
  private longest = 0;
  private slow = 0;
  private long = 0;
  private readonly bins = new Uint32Array(Math.round(MAX_BINNED_MS / BIN_MS) + 1);
  private skipNext = true;

  /** Forgets every frame so far and starts counting again. */
  restart(): void {
    this.count = 0;
    this.totalMs = 0;
    this.longest = 0;
    this.slow = 0;
    this.long = 0;
    this.bins.fill(0);
    this.skipNext = true;
  }

  /** Counts one frame that took `ms` milliseconds. */
  frame(ms: number): void {
    if (this.skipNext) {
      this.skipNext = false;
      return;
    }
    this.count++;
    this.totalMs += ms;
    this.longest = Math.max(this.longest, ms);
    if (ms > SLOW_FRAME_MS) this.slow++;
    if (ms > LONG_FRAME_MS) this.long++;
    this.bins[Math.min(Math.round(ms / BIN_MS), this.bins.length - 1)]!++;
  }

  /** Frames counted since the start. */
  get frames(): number {
    return this.count;
  }

  /** Frames counted ÷ the seconds they took; null before the first. */
  get averageFps(): number | null {
    return this.count > 0 && this.totalMs > 0 ? (this.count * 1000) / this.totalMs : null;
  }

  /** The longest frame counted, ms; null before the first. */
  get longestMs(): number | null {
    return this.count > 0 ? this.longest : null;
  }

  /** Frames over SLOW_FRAME_MS. */
  get slowFrames(): number {
    return this.slow;
  }

  /** Frames over LONG_FRAME_MS. */
  get longFrames(): number {
    return this.long;
  }

  /**
   * The fps that 99% of frames reach: 1000 ÷ the 99th percentile frame time,
   * to within 0.1 ms. Null before the first frame.
   */
  get onePercentLowFps(): number | null {
    if (this.count === 0) return null;
    const target = Math.ceil(this.count * 0.99);
    let seen = 0;
    for (let i = 0; i < this.bins.length; i++) {
      seen += this.bins[i]!;
      if (seen >= target) return 1000 / Math.max(i * BIN_MS, BIN_MS);
    }
    return null;
  }
}

/** One frame: how long it took and where the time went. */
export interface FrameRecord {
  /** From this frame's start to the next's, ms. */
  readonly ms: number;
  /** Sandbox world steps, ms. */
  readonly physicsMs: number;
  /** Fixed physics steps taken. */
  readonly steps: number;
  /** The scene's own drawing code: the world, preview, HUD and overlay, ms. */
  readonly drawMs: number;
  /** Phaser's render, from PRE_RENDER to POST_RENDER, ms. */
  readonly renderMs: number;
}

/** How a stretch of recent frames went. */
export interface RecentSummary {
  readonly frames: number;
  readonly fps: number;
  readonly longestMs: number;
  /** Mean and longest of each phase, ms. */
  readonly physicsMs: { readonly mean: number; readonly max: number };
  readonly drawMs: { readonly mean: number; readonly max: number };
  readonly renderMs: { readonly mean: number; readonly max: number };
  /**
   * Physics steps over these frames. A frame takes a whole number of fixed
   * steps, so above 60 fps most frames take none, and one frame says little.
   */
  readonly steps: number;
  /** Physics time per step over these frames, ms; null without a step. */
  readonly msPerStep: number | null;
}

/** The last `capacity` frames, oldest first, for the frame graph. */
export class RecentFrames {
  private readonly ring: FrameRecord[] = [];
  private next = 0;

  constructor(readonly capacity: number) {}

  push(record: FrameRecord): void {
    if (this.ring.length < this.capacity) this.ring.push(record);
    else this.ring[this.next] = record;
    this.next = (this.next + 1) % this.capacity;
  }

  /** The frames kept, oldest first. */
  get records(): FrameRecord[] {
    if (this.ring.length < this.capacity) return [...this.ring];
    return [...this.ring.slice(this.next), ...this.ring.slice(0, this.next)];
  }

  /** The newest frames that add up to `windowMs` (at least one); null with none. */
  summary(windowMs = 1000): RecentSummary | null {
    const records = this.records;
    const newest = records[records.length - 1];
    if (!newest) return null;
    let totalMs = 0;
    let frames = 0;
    let longestMs = 0;
    let steps = 0;
    let physicsTotal = 0;
    const physics = { mean: 0, max: 0 };
    const draw = { mean: 0, max: 0 };
    const render = { mean: 0, max: 0 };
    for (let i = records.length - 1; i >= 0 && totalMs < windowMs; i--) {
      const record = records[i]!;
      totalMs += record.ms;
      frames++;
      longestMs = Math.max(longestMs, record.ms);
      steps += record.steps;
      physicsTotal += record.physicsMs;
      for (const [phase, ms] of [
        [physics, record.physicsMs],
        [draw, record.drawMs],
        [render, record.renderMs],
      ] as const) {
        phase.mean += ms;
        phase.max = Math.max(phase.max, ms);
      }
    }
    for (const phase of [physics, draw, render]) phase.mean /= frames;
    return {
      frames,
      fps: totalMs > 0 ? (frames * 1000) / totalMs : 0,
      longestMs,
      physicsMs: physics,
      drawMs: draw,
      renderMs: render,
      steps,
      msPerStep: steps > 0 ? physicsTotal / steps : null,
    };
  }
}

/**
 * Collects each frame's timings as the scene runs them, and hands the whole
 * frame on once the next one starts and its length is known.
 */
export class FrameRecorder {
  /** Frames while the world runs, since it last started. */
  readonly sinceStart = new FrameTimes();
  readonly recent: RecentFrames;
  private current = { physicsMs: 0, steps: 0, drawMs: 0, renderMs: 0 };
  private currentCounted = false;
  private started = false;

  constructor(capacity = 240) {
    this.recent = new RecentFrames(capacity);
  }

  /**
   * Starts a frame. `previousMs`: how long the previous frame took, from its
   * start to this one's. `counted`: whether this frame counts towards
   * `sinceStart` (the world is running).
   */
  begin(previousMs: number, counted: boolean): void {
    if (this.started) {
      this.recent.push({ ms: previousMs, ...this.current });
      if (this.currentCounted) this.sinceStart.frame(previousMs);
    }
    this.started = true;
    this.current = { physicsMs: 0, steps: 0, drawMs: 0, renderMs: 0 };
    this.currentCounted = counted;
  }

  physics(ms: number, steps: number): void {
    this.current.physicsMs += ms;
    this.current.steps += steps;
  }

  draw(ms: number): void {
    this.current.drawMs += ms;
  }

  render(ms: number): void {
    this.current.renderMs += ms;
  }
}
