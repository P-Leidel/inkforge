import { describe, expect, it } from 'vitest';
import type { Segment } from '../geometry/segment';
import { layPatch } from './patches';

const lengthOf = ({ a, b }: Segment) => Math.hypot(b.x - a.x, b.y - a.y);

/** A 100 px square about the origin, as an Object's Outline. */
const SQUARE = [
  { x: -50, y: -50 },
  { x: 50, y: -50 },
  { x: 50, y: 50 },
  { x: -50, y: 50 },
];

describe('Laying a Patch', () => {
  it('lies along the edge nearest the Droplet, centred where it landed, on the surface', () => {
    const patch = layPatch({ kind: 'polygons', polygons: [SQUARE] }, { x: 10, y: -53 }, 20)!;

    expect(patch.a.y).toBeCloseTo(-50, 9);
    expect(patch.b.y).toBeCloseTo(-50, 9);
    expect(Math.min(patch.a.x, patch.b.x)).toBeCloseTo(0, 9);
    expect(Math.max(patch.a.x, patch.b.x)).toBeCloseTo(20, 9);
  });

  it('moves along to stay on its edge, and is clipped to an edge shorter than it', () => {
    const polygons = [SQUARE];
    const nearCorner = layPatch({ kind: 'polygons', polygons }, { x: 48, y: -53 }, 20)!;
    expect(Math.max(nearCorner.a.x, nearCorner.b.x)).toBeCloseTo(50, 9);
    expect(lengthOf(nearCorner)).toBeCloseTo(20, 9);

    const long = layPatch({ kind: 'polygons', polygons }, { x: 0, y: 53 }, 300)!;
    expect(lengthOf(long)).toBeCloseTo(100, 9);
    expect(long.a.y).toBeCloseTo(50, 9);
  });

  it('counts edges running the same way as one edge', () => {
    // The top edge of the square split in two at a point just off the line.
    const bent = [{ x: -50, y: -50 }, { x: 0, y: -50.5 }, ...SQUARE.slice(1)];
    const patch = layPatch({ kind: 'polygons', polygons: [bent] }, { x: -5, y: -55 }, 60)!;

    expect(lengthOf(patch)).toBeCloseTo(60, 6);
    expect(Math.abs(patch.a.y + 50.25)).toBeLessThan(1);
  });

  it('lies on the side of a Piece’s capsules facing the Droplet', () => {
    const segments = [
      { a: { x: 0, y: 100 }, b: { x: 30, y: 100 } },
      { a: { x: 30, y: 100 }, b: { x: 60, y: 100 } },
    ];
    const above = layPatch({ kind: 'capsules', segments, radius: 4 }, { x: 30, y: 90 }, 40)!;
    const below = layPatch({ kind: 'capsules', segments, radius: 4 }, { x: 30, y: 110 }, 40)!;

    expect(above.a.y).toBeCloseTo(96, 9);
    expect(below.a.y).toBeCloseTo(104, 9);
    expect(lengthOf(above)).toBeCloseTo(40, 9); // across the seam between the capsules
  });

  it('lies along the tangent of a circle, at most its radius long', () => {
    const patch = layPatch({ kind: 'circle', radius: 6 }, { x: 0, y: -9 }, 20)!;

    expect(patch.a.y).toBeCloseTo(-6, 9);
    expect(patch.b.y).toBeCloseTo(-6, 9);
    expect(lengthOf(patch)).toBeCloseTo(6, 9);
  });
});
