import { describe, expect, it } from 'vitest';
import { isConvex, isSelfIntersecting, polygonBounds } from '../geometry/polygon';
import { DEFAULT_ENEMY_TABLE } from '../materials/enemy-table';
import { enemyMass } from '../materials/mass';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { boxOutline, boxShape, siegeWalkerShape, TIP_ANGLE } from './enemy-shape';

describe('A box shape', () => {
  const at = { x: 100, y: 200, angle: 0 };

  it('is one convex part, its outline, and stays upright', () => {
    const shape = boxShape(40, 60);

    expect(shape.parts).toEqual([boxOutline(40, 60)]);
    expect(shape.outline).toEqual(boxOutline(40, 60));
    expect(shape.staysUpright).toBe(true);
    expect(shape.upright(at)).toBe(true);
  });

  it('is the same shape for the same size', () => {
    expect(boxShape(40, 60)).toBe(boxShape(40, 60));
    expect(boxShape(40, 60)).not.toBe(boxShape(60, 40));
  });

  it('has its feet at its bottom and its top at its top, and covers its box', () => {
    const shape = boxShape(40, 60);

    expect(shape.feet(at)).toBe(230);
    expect(shape.climb!.top(at)).toBe(170);
    expect(shape.climb!.height).toBe(60);
    expect(shape.bounds(at)).toEqual({ minX: 80, minY: 170, maxX: 120, maxY: 230 });
  });

  it('needs room as big as itself just ahead to climb, either way it walks', () => {
    const { climb } = boxShape(40, 60);

    expect(climb!.roomAhead(at, 1, 150)).toEqual([
      { x: 120, y: 90 },
      { x: 160, y: 90 },
      { x: 160, y: 150 },
      { x: 120, y: 150 },
    ]);
    expect(climb!.roomAhead(at, -1, 150)).toEqual([
      { x: 40, y: 90 },
      { x: 80, y: 90 },
      { x: 80, y: 150 },
      { x: 40, y: 150 },
    ]);
  });
});

describe("The Siege Walker's shape", () => {
  const shape = siegeWalkerShape(220, 200);
  const at = { x: 100, y: 200, angle: 0 };
  const degrees = (d: number) => (d * Math.PI) / 180;

  it('is a hull on four legs, each a convex part, and turns', () => {
    expect(shape.parts).toHaveLength(5);
    for (const part of shape.parts) expect(isConvex(part)).toBe(true);
    expect(shape.staysUpright).toBe(false);
    const [hull, ...legs] = shape.parts.map(polygonBounds);
    expect(hull).toMatchObject({ minX: -110, maxX: 110, minY: -100, maxY: 10 });
    for (const leg of legs) {
      expect(leg.maxX - leg.minX).toBeCloseTo(20, 9);
      expect(leg.maxY - leg.minY).toBeCloseTo(90, 9);
    }
    // Outer foot to outer foot.
    expect(legs[0]!.minX).toBeCloseTo(-90, 9);
    expect(legs[3]!.maxX).toBeCloseTo(90, 9);
  });

  it('is outlined round its hull and legs, and covers its whole box upright', () => {
    expect(isSelfIntersecting(shape.outline)).toBe(false);
    expect(polygonBounds(shape.outline)).toEqual(polygonBounds(shape.parts.flat()));
    expect(shape.bounds(at)).toEqual({ minX: -10, minY: 100, maxX: 210, maxY: 300 });
  });

  it('weighs about twenty Crawlers at its density', () => {
    const crawler = DEFAULT_ENEMY_TABLE.types.crawler;
    const walker = enemyMass(
      DEFAULT_ENEMY_TABLE.types.siegeWalker,
      shape.area,
      DEFAULT_MATERIAL_TABLE,
    );
    const crawlers = walker / enemyMass(crawler, 40 * 40, DEFAULT_MATERIAL_TABLE);
    expect(crawlers).toBeGreaterThan(18);
    expect(crawlers).toBeLessThan(22);
  });

  it('has its feet at the lowest point of its legs, however it is turned', () => {
    expect(shape.feet(at)).toBe(300);
    const turned = { ...at, angle: degrees(30) };
    expect(shape.feet(turned)).toBeCloseTo(shape.bounds(turned).maxY, 9);
  });

  it('is upright while it is tilted less than its tip angle, 40°, either way', () => {
    expect(TIP_ANGLE).toBeCloseTo(degrees(40), 9);
    for (const angle of [0, 39, -39, 360, -360 + 30])
      expect(shape.upright({ ...at, angle: degrees(angle) }), `${angle}°`).toBe(true);
    for (const angle of [41, -41, 90, 180, -170, 360 + 45])
      expect(shape.upright({ ...at, angle: degrees(angle) }), `${angle}°`).toBe(false);
  });

  it('never climbs and is never a step', () => {
    expect(shape.climb).toBeUndefined();
  });

  it('is the same shape for the same size', () => {
    expect(siegeWalkerShape(220, 200)).toBe(shape);
  });
});
