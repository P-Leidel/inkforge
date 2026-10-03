import { describe, expect, it } from 'vitest';
import { boxOutline, boxShape } from './enemy-shape';

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
