import { describe, expect, it } from 'vitest';
import { brushTouchesCapsules, brushTouchesCircle, brushTouchesPolygon, type Brush } from './brush';

const square = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 200 },
  { x: 100, y: 200 },
];

/** A click: a path of one point. */
const click = (x: number, y: number, radius = 12): Brush => ({ path: [{ x, y }], radius });

describe('Eraser brush', () => {
  it('touches a polygon it is inside, or reaches the edge of', () => {
    expect(brushTouchesPolygon(click(150, 150), square)).toBe(true);
    expect(brushTouchesPolygon(click(211, 150), square)).toBe(true);
    expect(brushTouchesPolygon(click(213, 150), square)).toBe(false);
  });

  it('touches what its drag passes over, not only where it starts and ends', () => {
    const drag: Brush = {
      path: [
        { x: 50, y: 150 },
        { x: 250, y: 150 },
      ],
      radius: 12,
    };
    expect(brushTouchesPolygon(drag, square)).toBe(true);
    expect(brushTouchesCircle(drag, { x: 150, y: 170 }, 10)).toBe(true);
    expect(brushTouchesCircle(drag, { x: 150, y: 175 }, 10)).toBe(false);
  });

  it('touches a capsule within its radius and the brush radius of the centre line', () => {
    const line = [{ a: { x: 0, y: 300 }, b: { x: 400, y: 300 } }];
    expect(brushTouchesCapsules(click(200, 317), line, 6)).toBe(true);
    expect(brushTouchesCapsules(click(200, 319), line, 6)).toBe(false);
    expect(brushTouchesCapsules(click(415, 300), line, 6)).toBe(true);
  });
});
