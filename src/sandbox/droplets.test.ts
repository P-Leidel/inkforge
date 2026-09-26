import { describe, expect, it } from 'vitest';
import { polygonArea, polygonContainsPoint, type Polygon } from '../geometry/polygon';
import { DEFAULT_MATERIAL_TABLE as table } from '../materials/material-table';
import { dropletCount, packSpill } from './droplets';
import { Random } from './random';

const box = (width: number, height = width): Polygon => [
  { x: -width / 2, y: -height / 2 },
  { x: width / 2, y: -height / 2 },
  { x: width / 2, y: height / 2 },
  { x: -width / 2, y: height / 2 },
];

describe('Spills', () => {
  it('have between 10 and 15 Droplets across seeds, every count in that range turning up', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 500; seed++) counts.add(dropletCount(table, new Random(seed)));

    expect([...counts].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('start every Droplet inside the Outline, and share a Patch length that grows with the Fill', () => {
    for (const outline of [box(60), box(100), box(200, 20)]) {
      const spill = packSpill(outline, table, new Random(7));

      expect(spill.centres.length).toBeGreaterThanOrEqual(10);
      expect(spill.centres.length).toBeLessThanOrEqual(15);
      for (const centre of spill.centres) expect(polygonContainsPoint(outline, centre)).toBe(true);
      expect(spill.length * spill.centres.length).toBeCloseTo(
        table.patchLengthPerArea * polygonArea(outline),
        9,
      );
    }
    const small = packSpill(box(60), table, new Random(7));
    const big = packSpill(box(100), table, new Random(7));
    expect(big.length).toBeGreaterThan(2 * small.length);
  });

  it('put Droplets on spots of their own where there is room, and share spots where there isn’t', () => {
    const roomy = packSpill(box(100), table, new Random(3)).centres;
    const keys = (centres: readonly { x: number; y: number }[]) =>
      new Set(centres.map(({ x, y }) => `${x} ${y}`));
    expect(keys(roomy).size).toBe(roomy.length);

    const tiny = packSpill(box(8), table, new Random(3)).centres;
    expect(tiny.length).toBeGreaterThanOrEqual(10);
    for (const centre of tiny) expect(polygonContainsPoint(box(8), centre)).toBe(true);
  });

  it('are the same from the same seed', () => {
    expect(packSpill(box(80), table, new Random(11))).toEqual(
      packSpill(box(80), table, new Random(11)),
    );
  });
});
