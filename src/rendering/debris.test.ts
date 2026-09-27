import { describe, expect, it } from 'vitest';
import { Random } from '../sandbox/random';
import { DEBRIS_LIFETIME, Debris } from './debris';

const STEP = 1 / 60;
const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

describe('Debris', () => {
  it('falls, collides with nothing and fades out over its life', () => {
    const debris = new Debris(new Random(1), 1000, STEP);
    debris.burst(square, { x: 0, y: 0 }, ['red']);
    const burst = debris.views.map((p) => p.position.y);

    debris.advance(30);
    expect(Math.max(...debris.views.map((p) => p.position.y))).toBeGreaterThan(
      Math.max(...burst) + 50,
    );
    expect(debris.views.every((p) => p.opacity < 1)).toBe(true);

    debris.advance(Math.round(DEBRIS_LIFETIME / STEP) - 30 + 1);
    expect(debris.count).toBe(0);
  });

  it('moves a burst from steps ago on that far, and nothing else', () => {
    const now = new Debris(new Random(1), 1000, STEP);
    const late = new Debris(new Random(1), 1000, STEP);
    now.burst(square, { x: 0, y: 0 }, ['grey']);
    now.advance(5);
    late.burst(square, { x: 0, y: 0 }, ['grey'], 5);
    expect(late.views).toEqual(now.views);

    late.burst(square, { x: 0, y: 0 }, ['blue'], 0);
    expect(late.views.slice(0, now.count)).toEqual(now.views);
  });
});
