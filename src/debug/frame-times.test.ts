import { describe, expect, it } from 'vitest';
import { FrameRecorder, FrameTimes, RecentFrames, type FrameRecord } from './frame-times';

describe('Frame times', () => {
  it('averages the fps over the frames since the start and keeps the longest frame', () => {
    const times = new FrameTimes();
    times.restart();

    for (const ms of [50, 10, 20, 30, 20]) times.frame(ms); // the first carries the loading

    expect(times.frames).toBe(4);
    expect(times.averageFps).toBeCloseTo(4 / 0.08);
    expect(times.longestMs).toBe(30);
  });

  it('starts again from nothing on restart', () => {
    const times = new FrameTimes();
    times.restart();
    for (const ms of [16, 40, 16]) times.frame(ms);

    times.restart();
    for (const ms of [100, 20, 20]) times.frame(ms);

    expect(times.frames).toBe(2);
    expect(times.averageFps).toBeCloseTo(50);
    expect(times.longestMs).toBe(20);
  });

  it('has nothing to show before its first counted frame', () => {
    const times = new FrameTimes();
    times.restart();
    times.frame(16);

    expect(times.frames).toBe(0);
    expect(times.averageFps).toBeNull();
    expect(times.longestMs).toBeNull();
  });
});

describe('Frame times, slow and long frames', () => {
  it('counts frames over 20 ms and over 33 ms, and the 1% low', () => {
    const times = new FrameTimes();
    times.restart();
    times.frame(500); // the first carries the loading
    for (let k = 0; k < 99; k++) times.frame(10);
    times.frame(25);
    times.frame(40);

    expect(times.frames).toBe(101);
    expect(times.slowFrames).toBe(2);
    expect(times.longFrames).toBe(1);
    // 99% of 101 frames is 100: the 100th shortest frame is 25 ms.
    expect(times.onePercentLowFps).toBeCloseTo(40);
  });

  it('forgets slow frames on restart', () => {
    const times = new FrameTimes();
    times.restart();
    for (const ms of [16, 40, 40]) times.frame(ms);

    times.restart();
    for (const ms of [100, 16]) times.frame(ms);

    expect(times.slowFrames).toBe(0);
    expect(times.longFrames).toBe(0);
    expect(times.onePercentLowFps).toBeCloseTo(62.5);
  });
});

describe('Recent frames', () => {
  const frame = (ms: number, physicsMs = 0, renderMs = 0): FrameRecord => ({
    ms,
    physicsMs,
    steps: 1,
    drawMs: 0,
    renderMs,
  });

  it('keeps the last frames, oldest first', () => {
    const recent = new RecentFrames(3);
    for (const ms of [1, 2, 3, 4, 5]) recent.push(frame(ms));

    expect(recent.records.map((r) => r.ms)).toEqual([3, 4, 5]);
  });

  it('sums up the newest second of frames', () => {
    const recent = new RecentFrames(240);
    recent.push(frame(900, 50)); // older than the last second
    for (let k = 0; k < 49; k++) recent.push(frame(20, 1, 4));
    recent.push(frame(40, 3, 30));

    const summary = recent.summary()!;

    // The newest 40 ms frame and 48 of the 20 ms ones make up one second.
    expect(summary.frames).toBe(49);
    expect(summary.fps).toBeCloseTo(49);
    expect(summary.longestMs).toBe(40);
    expect(summary.physicsMs.max).toBe(3);
    expect(summary.physicsMs.mean).toBeCloseTo((48 + 3) / 49);
    expect(summary.renderMs.max).toBe(30);
  });

  it('counts the steps over the whole second, however few each frame takes', () => {
    const recent = new RecentFrames(240);
    // 144 fps with 60 Hz physics: most frames take no step.
    for (let k = 0; k < 144; k++) {
      const steps = Math.floor(((k + 1) * 60) / 144) - Math.floor((k * 60) / 144);
      recent.push({ ms: 1000 / 144, physicsMs: 1.2 * steps, steps, drawMs: 0, renderMs: 0 });
    }

    const summary = recent.summary()!;

    expect(summary.steps).toBe(60);
    expect(summary.msPerStep).toBeCloseTo(1.2);
  });

  it('has no time per step without a step', () => {
    const recent = new RecentFrames(10);
    recent.push({ ms: 16, physicsMs: 0, steps: 0, drawMs: 0, renderMs: 0 });

    expect(recent.summary()!.msPerStep).toBeNull();
  });

  it('has nothing to sum up before the first frame', () => {
    expect(new RecentFrames(10).summary()).toBeNull();
  });
});

describe('Frame recorder', () => {
  it('hands on each frame with its length once the next one starts', () => {
    const recorder = new FrameRecorder();
    recorder.begin(0, false);
    recorder.physics(2, 1);
    recorder.draw(1);
    recorder.render(5);
    recorder.begin(30, true);

    expect(recorder.recent.records).toEqual([
      { ms: 30, physicsMs: 2, steps: 1, drawMs: 1, renderMs: 5 },
    ]);
  });

  it('counts towards the time since the start only frames while the world runs', () => {
    const recorder = new FrameRecorder();
    recorder.sinceStart.restart();
    recorder.begin(0, true);
    recorder.begin(100, true); // ends the first frame after the restart: left out
    recorder.begin(20, false); // ends a running frame; a paused one starts
    recorder.begin(50, true); // ends the paused frame
    recorder.begin(10, true);

    expect(recorder.sinceStart.frames).toBe(2);
    expect(recorder.sinceStart.longestMs).toBe(20);
    expect(recorder.recent.records).toHaveLength(4);
  });
});
