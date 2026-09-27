import { describe, expect, it } from 'vitest';
import { capsuleOverlapsPolygon, circleOverlapsPolygon, convexPolygonsOverlap } from './overlap';
import type { Polygon } from './polygon';

const box = (x: number, y: number, width: number, height: number): Polygon => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

/** A 60 px box resting on the ground (y = 880), as the gallery draws it. */
const onGround = box(470, 820, 60, 60);

/** The ground left of the pit. */
const ground = box(40, 880, 860, 200);

describe('convexPolygonsOverlap', () => {
  it('lets polygons touch, or overlap by up to 1 px', () => {
    expect(convexPolygonsOverlap(onGround, ground)).toBe(false);
    expect(convexPolygonsOverlap(box(470, 821, 60, 60), ground)).toBe(false);
    expect(convexPolygonsOverlap(box(470, 821.5, 60, 60), ground)).toBe(true);
  });

  it('takes the tolerance', () => {
    expect(convexPolygonsOverlap(box(470, 820.5, 60, 60), ground, 0)).toBe(true);
    expect(convexPolygonsOverlap(box(470, 825, 60, 60), ground, 10)).toBe(false);
  });

  it('finds a separating axis on either polygon, not only on the bounds', () => {
    const slope = [
      { x: 1400, y: 880 },
      { x: 1880, y: 640 },
      { x: 1880, y: 1080 },
      { x: 1400, y: 1080 },
    ];
    // Its bounding box dips into the slope's, but it stays above the slope.
    expect(convexPolygonsOverlap(box(1500, 760, 40, 40), slope)).toBe(false);
    expect(convexPolygonsOverlap(box(1500, 800, 40, 40), slope)).toBe(true);
  });

  it('never overlaps a polygon whose bounds it misses', () => {
    expect(convexPolygonsOverlap(onGround, box(600, 820, 60, 60))).toBe(false);
  });
});

describe('capsuleOverlapsPolygon', () => {
  it('overlaps when an end lies inside the polygon', () => {
    expect(capsuleOverlapsPolygon({ x: 500, y: 850 }, { x: 700, y: 850 }, 4, onGround)).toBe(true);
  });

  it('overlaps when its centre line crosses an edge, however thin it is', () => {
    expect(capsuleOverlapsPolygon({ x: 400, y: 850 }, { x: 600, y: 850 }, 0, onGround)).toBe(true);
  });

  it('overlaps when its centre line comes closer to an edge than its radius less 1 px', () => {
    const above = (y: number) => capsuleOverlapsPolygon({ x: 400, y }, { x: 600, y }, 4, onGround);
    expect(above(817.5)).toBe(true);
    expect(above(817)).toBe(false);
    expect(above(810)).toBe(false);
  });

  it('takes the tolerance', () => {
    expect(capsuleOverlapsPolygon({ x: 400, y: 817 }, { x: 600, y: 817 }, 4, onGround, 0)).toBe(
      true,
    );
    expect(capsuleOverlapsPolygon({ x: 400, y: 816 }, { x: 600, y: 816 }, 4, onGround, 0)).toBe(
      false,
    );
  });
});

describe('circleOverlapsPolygon', () => {
  it('lets Rubble rest on the ground, and overlaps when it sinks in more than 1 px', () => {
    const pebble = (y: number) => ({ centre: { x: 300, y }, radius: 6 });
    expect(circleOverlapsPolygon(pebble(874), ground)).toBe(false);
    expect(circleOverlapsPolygon(pebble(875), ground)).toBe(false);
    expect(circleOverlapsPolygon(pebble(875.5), ground)).toBe(true);
  });

  it('overlaps when its centre is inside, and takes the tolerance', () => {
    expect(circleOverlapsPolygon({ centre: { x: 500, y: 850 }, radius: 1 }, onGround)).toBe(true);
    expect(circleOverlapsPolygon({ centre: { x: 300, y: 874.5 }, radius: 6 }, ground, 0)).toBe(
      true,
    );
  });
});
