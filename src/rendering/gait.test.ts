import { describe, expect, it } from 'vitest';
import { gaitAfter, legAngles, STALL_SPEED, STANDING, STRIDE, swungLeg, type Gait } from './gait';

/** The gait after `seconds` going as `going`, a frame at a time. */
function goFor(gait: Gait, going: { speed: number; tipped: boolean }, seconds: number): Gait {
  for (let t = 0; t < seconds; t += 1 / 60) gait = gaitAfter(gait, going, 1 / 60);
  return gait;
}

/** The widest any leg is swung, through a stride or so. */
function widest(gait: Gait, going: { speed: number; tipped: boolean }): number {
  let most = 0;
  for (let k = 0; k < 120; k++) {
    gait = gaitAfter(gait, going, 1 / 60);
    most = Math.max(most, ...legAngles(gait, going.tipped, 4).map(Math.abs));
  }
  return most;
}

describe("The Siege Walker's gait", () => {
  it('swings its legs in pairs, each pair against the other, while it walks', () => {
    const gait = goFor(STANDING, { speed: 30, tipped: false }, 1.2);
    const [a, b, c, d] = legAngles(gait, false, 4);

    expect(widest(gait, { speed: 30, tipped: false })).toBeGreaterThan(0.2);
    expect(c).toBeCloseTo(a!);
    expect(d).toBeCloseTo(b!);
    expect(b).toBeCloseTo(-a!);
  });

  it('strides once each stride length it goes over the ground, faster the faster it goes', () => {
    const slow = gaitAfter({ phase: 0, swing: 1 }, { speed: 30, tipped: false }, 0.5);
    const fast = gaitAfter({ phase: 0, swing: 1 }, { speed: 60, tipped: false }, 0.5);

    expect(slow.phase).toBeCloseTo((2 * Math.PI * 15) / STRIDE);
    expect(fast.phase).toBeCloseTo(2 * slow.phase);
    // Backing off works the same.
    expect(gaitAfter({ phase: 0, swing: 1 }, { speed: -30, tipped: false }, 0.5).phase).toBeCloseTo(
      slow.phase,
    );
  });

  it('stands its legs still when it stalls', () => {
    const walking = goFor(STANDING, { speed: 30, tipped: false }, 2);
    const stalled = goFor(walking, { speed: STALL_SPEED / 2, tipped: false }, 2);

    expect(widest(stalled, { speed: 0, tipped: false })).toBeLessThan(0.01);
    expect(stalled.phase).toBeCloseTo(goFor(stalled, { speed: 0, tipped: false }, 1).phase);
  });

  it('flails its legs out of step while it is Tipped, even lying still', () => {
    const tipped = goFor(STANDING, { speed: 0, tipped: true }, 1);
    const angles = legAngles(tipped, true, 4);

    expect(widest(tipped, { speed: 0, tipped: true })).toBeGreaterThan(
      widest(goFor(STANDING, { speed: 30, tipped: false }, 1), { speed: 30, tipped: false }),
    );
    expect(new Set(angles.map((angle) => angle.toFixed(3))).size).toBe(4);
  });

  it('holds still while no time passes: paused, the legs keep their pose', () => {
    const gait = goFor(STANDING, { speed: 30, tipped: false }, 1);

    expect(gaitAfter(gait, { speed: 30, tipped: false }, 0)).toEqual(gait);
  });

  it('swings a leg about the middle of its top', () => {
    const leg = [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 90 },
      { x: -10, y: 90 },
    ];

    const swung = swungLeg(leg, Math.PI / 2);

    expect(swung[0]!.x).toBeCloseTo(0);
    expect(swung[0]!.y).toBeCloseTo(-10);
    expect(swung[2]!.x).toBeCloseTo(-90);
    expect(swung[2]!.y).toBeCloseTo(10);
    expect(swungLeg(leg, 0)).toEqual(leg);
  });
});
