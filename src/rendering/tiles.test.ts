import { describe, expect, it } from 'vitest';
import { rectAround, segmentMeetsRect, tilesAlong } from './tiles';

describe('Tiles', () => {
  it('puts a whole-px rectangle around points and what reaches out from them', () => {
    expect(
      rectAround(
        [
          { x: 10.5, y: 20 },
          { x: 30, y: 25.2 },
        ],
        4,
      ),
    ).toEqual({ x: 6, y: 16, width: 28, height: 14 });
  });

  it('tells whether a segment lies in a rectangle, crosses it or misses it', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(segmentMeetsRect({ x: 2, y: 2 }, { x: 3, y: 3 }, rect)).toBe(true);
    expect(segmentMeetsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, rect)).toBe(true);
    expect(segmentMeetsRect({ x: -5, y: 8 }, { x: 8, y: -5 }, rect)).toBe(true);
    expect(segmentMeetsRect({ x: -5, y: 3 }, { x: 3, y: -5 }, rect)).toBe(false);
  });

  it('covers a short Line with one tile', () => {
    const tiles = tilesAlong([{ a: { x: 100, y: 100 }, b: { x: 200, y: 110 } }], 5, 256);
    expect(tiles).toEqual([{ x: 95, y: 95, width: 110, height: 20 }]);
  });

  it('covers a long Line with tiles that meet edge to edge', () => {
    const tiles = tilesAlong([{ a: { x: 0, y: 100 }, b: { x: 600, y: 100 } }], 10, 256);
    expect(tiles).toEqual([
      { x: -10, y: 90, width: 256, height: 20 },
      { x: 246, y: 90, width: 256, height: 20 },
      { x: 502, y: 90, width: 108, height: 20 },
    ]);
  });

  it('leaves out the tiles a diagonal Line does not reach', () => {
    const tiles = tilesAlong([{ a: { x: 0, y: 0 }, b: { x: 1000, y: 1000 } }], 10, 256);
    // Of the 4 × 4 grid: the 4 it runs through, and the 6 it passes within reach of at a corner.
    expect(tiles).toHaveLength(10);
    for (let k = 0; k < 4; k++) {
      expect(tiles).toContainEqual(expect.objectContaining({ x: -10 + 256 * k, y: -10 + 256 * k }));
    }
  });

  it('has no tiles for no segments', () => {
    expect(tilesAlong([], 10, 256)).toEqual([]);
  });
});
