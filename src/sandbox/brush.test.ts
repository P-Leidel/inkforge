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

describe('Eraser brush, at its edges', () => {
  /** An Outline that isn't convex: a U, open at the top. */
  const cup = [
    { x: 100, y: 100 },
    { x: 120, y: 100 },
    { x: 120, y: 180 },
    { x: 180, y: 180 },
    { x: 180, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ];

  it('touches a polygon only closer than its radius, not at it', () => {
    expect(brushTouchesPolygon(click(212, 150), square)).toBe(false);
    expect(brushTouchesPolygon(click(211.99, 150), square)).toBe(true);
  });

  it('follows an Outline that isn’t convex: the inside of a cup is not the cup', () => {
    expect(brushTouchesPolygon(click(150, 130), cup)).toBe(false);
    expect(brushTouchesPolygon(click(150, 170), cup)).toBe(true);
    expect(brushTouchesPolygon(click(131, 130), cup)).toBe(true);
  });

  it('touches a circle or a capsule only closer than both radii', () => {
    expect(brushTouchesCircle(click(100, 0), { x: 122, y: 0 }, 10)).toBe(false);
    expect(brushTouchesCircle(click(100, 0), { x: 121.99, y: 0 }, 10)).toBe(true);
    const patch = [{ a: { x: 0, y: 0 }, b: { x: 30, y: 0 } }];
    expect(brushTouchesCapsules(click(15, 15), patch, 3)).toBe(false);
    expect(brushTouchesCapsules(click(15, 14.99), patch, 3)).toBe(true);
  });

  it('touches what a drag of several segments passes over', () => {
    const drag: Brush = {
      path: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
      ],
      radius: 5,
    };
    expect(brushTouchesCircle(drag, { x: 310, y: 150 }, 6)).toBe(true);
    expect(brushTouchesCircle(drag, { x: 150, y: 150 }, 6)).toBe(false);
    expect(brushTouchesPolygon(drag, square)).toBe(false);
  });
});
