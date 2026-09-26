import { describe, expect, it } from 'vitest';
import { FrameTimes } from './frame-times';

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
