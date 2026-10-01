import { describe, expect, it } from 'vitest';
import { rubbleAlpha } from './rubble-drawing';

describe('rubbleAlpha', () => {
  it('is opaque until the last 0.5 s of a lifetime, then fades out evenly to nothing', () => {
    expect(rubbleAlpha(5)).toBe(1);
    expect(rubbleAlpha(0.5)).toBe(1);
    expect(rubbleAlpha(0.375)).toBeCloseTo(0.75, 9);
    expect(rubbleAlpha(0.25)).toBeCloseTo(0.5, 9);
    expect(rubbleAlpha(0)).toBe(0);
  });
});
