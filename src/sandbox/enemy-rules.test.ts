import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { isFloor, isPressed, STEEPEST_FLOOR } from './enemy-rules';

describe('Floor or not', () => {
  /** The normal of a surface `degrees` steep, pointing from it up towards what stands on it. */
  const up = (degrees: number, facing = 1): Vec2 => {
    const turn = (degrees * Math.PI) / 180;
    return { x: -facing * Math.sin(turn), y: -Math.cos(turn) };
  };

  it('stands on a surface no steeper than 45°, either way it slopes, and presses a steeper one', () => {
    expect(STEEPEST_FLOOR).toBeCloseTo(Math.PI / 4, 12);
    for (const facing of [1, -1]) {
      expect(isFloor(up(0, facing))).toBe(true);
      expect(isFloor(up(44, facing))).toBe(true);
      expect(isFloor(up(45, facing))).toBe(true);
      expect(isFloor(up(46, facing))).toBe(false);
      expect(isFloor(up(90, facing))).toBe(false);
    }
    expect(isFloor({ x: 0, y: 1 })).toBe(false); // a ceiling
  });

  it('presses a surface steeper than 45° in its way, and not a ceiling or one behind it', () => {
    for (const heading of [1, -1]) {
      expect(isPressed(up(46, heading), heading)).toBe(true);
      expect(isPressed(up(90, heading), heading)).toBe(true);
      expect(isPressed(up(134, heading), heading)).toBe(true); // an overhang in its way
      expect(isPressed(up(44, heading), heading)).toBe(false); // a floor
      expect(isPressed(up(90, -heading), heading)).toBe(false); // behind it
    }
    expect(isPressed({ x: 0, y: 1 }, 1)).toBe(false); // a ceiling
  });
});
