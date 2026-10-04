import { describe, expect, it } from 'vitest';
import { createEnemyTable } from '../materials/enemy-table';
import { Numbers } from './numbers';
import { createMaterialTable } from '../materials/material-table';
import {
  rightingCap,
  rightingTorque,
  tippedAfter,
  TRY_SECONDS,
  UP_AGAIN,
  type Tipped,
} from './tipping';

const numbers = new Numbers(createMaterialTable(), createEnemyTable());
const { tipAngle, gettingUp } = numbers;
const degrees = (d: number) => (d * Math.PI) / 180;
const STEP = 1 / 60;

describe('Getting up', () => {
  it('starts with a tip angle of 40°, a delay of 4 s, and a first try that lifts its own weight', () => {
    expect(tipAngle).toBeCloseTo(degrees(40), 9);
    expect(gettingUp).toEqual({ delay: 4, torque: 1, growth: 0.5 });
  });

  it('caps each try at the first try’s torque, raised by half of it for each failed try', () => {
    expect([0, 1, 2, 3].map((tries) => rightingCap(gettingUp, tries))).toEqual([
      1, 1.5, 2.25, 3.375,
    ]);
  });

  it('turns it toward upright the short way round, either way, and upside down too', () => {
    const torque = (d: number) => rightingTorque(degrees(d), 0, 1, Infinity, STEP);

    expect(torque(90)).toBeLessThan(0);
    expect(torque(-90)).toBeGreaterThan(0);
    expect(torque(270)).toBeGreaterThan(0); // -90° the other way round
    expect(torque(179)).toBeLessThan(0);
    expect(torque(-179)).toBeGreaterThan(0);
  });

  it('never turns it harder than its cap', () => {
    expect(rightingTorque(degrees(90), 0, 1e9, 500, STEP)).toBe(-500);
    expect(rightingTorque(degrees(-90), 0, 1e9, 500, STEP)).toBe(500);
  });
});

describe('Tipped', () => {
  /** Steps a Tipped state `seconds` at `d` degrees. */
  const lie = (tipped: Tipped | null, d: number, seconds: number) => {
    for (let k = 0; k < Math.round(seconds / STEP); k++)
      tipped = tippedAfter(tipped, degrees(d), STEP, tipAngle, gettingUp);
    return tipped;
  };

  it('begins once it tilts past its tip angle, either way, and not before', () => {
    expect(tippedAfter(null, degrees(39), STEP, tipAngle, gettingUp)).toBeNull();
    expect(tippedAfter(null, degrees(-41), STEP, tipAngle, gettingUp)).toEqual({
      tries: 0,
      trying: false,
      elapsed: 0,
    });
  });

  it('lies through the delay, tries, and after a failed try lies again with one more try counted', () => {
    const tipped = lie(null, 90, gettingUp.delay - 0.1);
    expect(tipped).toMatchObject({ tries: 0, trying: false });
    expect(lie(tipped, 90, 0.2)).toMatchObject({ tries: 0, trying: true });
    expect(lie(tipped, 90, 0.2 + TRY_SECONDS)).toMatchObject({ tries: 1, trying: false });
  });

  it('ends once it tilts less than half its tip angle, and not before', () => {
    const tipped = lie(null, 90, 1);
    const half = UP_AGAIN * 40;
    expect(tippedAfter(tipped, degrees(half + 1), STEP, tipAngle, gettingUp)).not.toBeNull();
    expect(tippedAfter(tipped, degrees(half - 1), STEP, tipAngle, gettingUp)).toBeNull();
  });
});
