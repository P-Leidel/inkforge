import { describe, expect, it } from 'vitest';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import { SANDBOX_ARENA } from '../sandbox/arena';
import { Random } from '../sandbox/random';
import {
  isConvex,
  polygonArea,
  polygonBounds,
  polygonContainsPoint,
  type Polygon,
} from '../geometry/polygon';
import { dragAlong as drag, dragBox, dragCircle, dragPolygon } from './pointer-paths';
import { processStroke, type StrokeContext, type StrokeResult } from './stroke-pipeline';

const context: StrokeContext = { terrain: SANDBOX_ARENA.terrain, objects: [] };

function jitter(samples: readonly Vec2[], amplitude: number, seed = 7): Vec2[] {
  const random = new Random(seed);
  return samples.map((p) => ({
    x: p.x + random.range(-amplitude, amplitude),
    y: p.y + random.range(-amplitude, amplitude),
  }));
}

function lineSegments(result: StrokeResult): readonly Segment[] {
  if (result.kind !== 'line') throw new Error(`expected a Line, got ${result.kind}`);
  return result.segments;
}

function linePoints(result: StrokeResult): Vec2[] {
  return lineSegments(result).flatMap((s) => [s.a, s.b]);
}

describe('Stroke pipeline: Lines', () => {
  it('turns an open Stroke into a Line along the drawn path', () => {
    const result = processStroke(
      drag([
        { x: 200, y: 500 },
        { x: 600, y: 500 },
      ]),
      context,
    );

    const points = linePoints(result);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(200, 0);
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(600, 0);
    for (const p of points) expect(p.y).toBeCloseTo(500, 5);
  });

  it('smooths out hand jitter', () => {
    const shaky = jitter(
      drag([
        { x: 200, y: 500 },
        { x: 800, y: 500 },
      ]),
      3,
    );

    const segments = lineSegments(processStroke(shaky, context));

    // Compare how far the raw samples and the Line wander from the intended y = 500.
    const rms = (ys: number[]) => Math.sqrt(ys.reduce((s, y) => s + (y - 500) ** 2, 0) / ys.length);
    const alongLine = segments.flatMap((s) =>
      Array.from({ length: 10 }, (_, k) => s.a.y + ((s.b.y - s.a.y) * k) / 10),
    );
    expect(rms(alongLine)).toBeLessThan(rms(shaky.map((p) => p.y)) / 2);
  });

  it('flattens a spike thinner than the Line thickness', () => {
    const path = [
      { x: 200, y: 500 },
      { x: 400, y: 500 },
      { x: 402, y: 440 }, // 60 px tall spike, 4 px wide at its base
      { x: 404, y: 500 },
      { x: 600, y: 500 },
    ];

    const points = linePoints(processStroke(drag(path), context));

    const highest = Math.min(...points.map((p) => p.y));
    expect(highest).toBeGreaterThan(500 - 8);
  });

  it('keeps a loop that is wider than the Line thickness', () => {
    const loop: Vec2[] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = Math.PI / 2 + (i / 32) * 2 * Math.PI;
      loop.push({ x: 400 + 30 * Math.cos(angle), y: 470 + 30 * Math.sin(angle) });
    }
    const path = [{ x: 200, y: 500 }, ...loop, { x: 600, y: 500 }];

    const points = linePoints(processStroke(drag(path), context));

    const highest = Math.min(...points.map((p) => p.y));
    expect(highest).toBeLessThan(450);
  });

  it('drops a Stroke shorter than 16 px silently', () => {
    const result = processStroke(
      drag([
        { x: 300, y: 300 },
        { x: 312, y: 300 },
      ]),
      context,
    );
    expect(result.kind).toBe('dropped');
  });

  it('keeps a Stroke just over 16 px long', () => {
    const result = processStroke(
      drag([
        { x: 300, y: 300 },
        { x: 320, y: 300 },
      ]),
      context,
    );
    expect(result.kind).toBe('line');
  });

  it('drops a single click', () => {
    expect(processStroke([{ x: 300, y: 300 }], context).kind).toBe('dropped');
  });

  it('cuts a Line where it runs into the ground', () => {
    const result = processStroke(
      drag([
        { x: 500, y: 700 },
        { x: 500, y: 980 },
      ]),
      context,
    );

    const points = linePoints(result);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(880, 3);
  });

  it('cuts a Line into two where it passes through Terrain', () => {
    // Runs along y = 1000 through the pit: inside ground | air in the pit | inside ground.
    const result = processStroke(
      drag([
        { x: 800, y: 1000 },
        { x: 1200, y: 1000 },
      ]),
      context,
    );

    const points = linePoints(result);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(900, 3);
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(1100, 3);
  });

  it('cuts a Line where it enters a wall', () => {
    const result = processStroke(
      drag([
        { x: 10, y: 400 },
        { x: 300, y: 400 },
      ]),
      context,
    );

    const points = linePoints(result);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(40, 3);
  });

  it('drops a Line drawn entirely inside Terrain', () => {
    const result = processStroke(
      drag([
        { x: 300, y: 950 },
        { x: 600, y: 950 },
      ]),
      context,
    );
    expect(result.kind).toBe('dropped');
  });

  it('keeps a Line lying on the ground surface', () => {
    const result = processStroke(
      drag([
        { x: 300, y: 880 },
        { x: 600, y: 880 },
      ]),
      context,
    );
    expect(result.kind).toBe('line');
  });

  it('splits a Line into short segments', () => {
    const segments = lineSegments(
      processStroke(
        drag([
          { x: 200, y: 500 },
          { x: 800, y: 500 },
        ]),
        context,
      ),
    );

    for (const s of segments)
      expect(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).toBeLessThanOrEqual(32.001);
  });
});

function objectOf(result: StrokeResult) {
  if (result.kind !== 'object') throw new Error(`expected an Object, got ${result.kind}`);
  return result;
}

/** The pieces are convex, within Box2D's vertex limit, and cover the outline exactly. */
function expectPiecesCoverOutline(outline: Polygon, pieces: readonly Polygon[]) {
  for (const piece of pieces) {
    expect(isConvex(piece)).toBe(true);
    expect(piece.length).toBeLessThanOrEqual(8);
  }
  const pieceArea = pieces.reduce((sum, piece) => sum + polygonArea(piece), 0);
  expect(pieceArea).toBeCloseTo(polygonArea(outline), 3);

  const bounds = polygonBounds(outline);
  for (let x = bounds.minX + 0.5; x < bounds.maxX; x += 3) {
    for (let y = bounds.minY + 0.5; y < bounds.maxY; y += 3) {
      const p = { x, y };
      const inPieces = pieces.some((piece) => polygonContainsPoint(piece, p));
      expect(inPieces, `(${x}, ${y})`).toBe(polygonContainsPoint(outline, p));
    }
  }
}

describe('Stroke pipeline: closing a Stroke', () => {
  it('closes a Stroke whose end returns to its start into an Object', () => {
    expect(processStroke(dragCircle({ x: 400, y: 400 }, 50), context).kind).toBe('object');
  });

  it('closes a Stroke that stops up to 24 px short of its start', () => {
    const path = [
      { x: 300, y: 300 },
      { x: 400, y: 300 },
      { x: 400, y: 400 },
      { x: 300, y: 400 },
      { x: 300, y: 322 }, // 22 px short of the start
    ];
    expect(processStroke(drag(path), context).kind).toBe('object');
  });

  it('stays a Line when the end is more than 24 px from the start', () => {
    const path = [
      { x: 300, y: 300 },
      { x: 400, y: 300 },
      { x: 400, y: 400 },
      { x: 300, y: 400 },
      { x: 300, y: 330 }, // 30 px short of the start
    ];
    expect(processStroke(drag(path), context).kind).toBe('line');
  });

  it('stays a Line when a Stroke back to its start is shorter than 72 px', () => {
    // A small triangle, 60 px round.
    const path = [
      { x: 300, y: 300 },
      { x: 320, y: 300 },
      { x: 310, y: 317.3 },
      { x: 300, y: 300 },
    ];
    expect(processStroke(drag(path), context).kind).toBe('line');
  });

  it('closes a Stroke that overshoots past its start', () => {
    const circle = dragCircle({ x: 400, y: 400 }, 50);
    // Carry on 15 px past the start, over the beginning of the Stroke.
    const overshoot = circle.slice(1, 9);

    const clean = objectOf(processStroke(circle, context));
    const overshot = objectOf(processStroke([...circle, ...overshoot], context));

    expect(polygonArea(overshot.outline) / polygonArea(clean.outline)).toBeCloseTo(1, 2);
  });
});

describe('Stroke pipeline: Objects', () => {
  it('keeps the drawn shape of a box', () => {
    const result = objectOf(processStroke(dragBox(300, 300, 120, 80), context));

    const bounds = polygonBounds(result.outline);
    expect(bounds.minX).toBeCloseTo(300, 0);
    expect(bounds.maxX).toBeCloseTo(420, 0);
    expect(bounds.minY).toBeCloseTo(300, 0);
    expect(bounds.maxY).toBeCloseTo(380, 0);
    // Smoothing rounds the corners only slightly.
    expect(polygonArea(result.outline) / (120 * 80)).toBeGreaterThan(0.97);
  });

  it('keeps a drawn circle round', () => {
    const result = objectOf(processStroke(dragCircle({ x: 400, y: 400 }, 40), context));

    for (const p of result.outline) {
      expect(Math.hypot(p.x - 400, p.y - 400)).toBeGreaterThan(38);
      expect(Math.hypot(p.x - 400, p.y - 400)).toBeLessThan(41);
    }
  });

  it('keeps a triangle a triangle', () => {
    const triangle = [
      { x: 300, y: 400 },
      { x: 400, y: 400 },
      { x: 350, y: 313 },
    ];
    const result = objectOf(processStroke(dragPolygon(triangle), context));

    expect(polygonArea(result.outline) / polygonArea(triangle)).toBeGreaterThan(0.93);
    expect(result.pieces).toHaveLength(1);
  });

  it('splits a concave L into convex pieces that cover it', () => {
    const l = [
      { x: 300, y: 300 },
      { x: 340, y: 300 },
      { x: 340, y: 420 },
      { x: 420, y: 420 },
      { x: 420, y: 460 },
      { x: 300, y: 460 },
    ];
    const result = objectOf(processStroke(dragPolygon(l), context));

    expect(result.pieces.length).toBeGreaterThan(1);
    expectPiecesCoverOutline(result.outline, result.pieces);
  });

  it('splits a star into convex pieces that cover it', () => {
    const star: Vec2[] = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 100 : 45;
      const angle = -Math.PI / 2 + (k * Math.PI) / 5;
      star.push({ x: 500 + r * Math.cos(angle), y: 400 + r * Math.sin(angle) });
    }
    const result = objectOf(processStroke(dragPolygon(star), context));

    expectPiecesCoverOutline(result.outline, result.pieces);
  });

  it('keeps every piece of a large, detailed shape within 8 vertices', () => {
    const result = objectOf(processStroke(dragCircle({ x: 600, y: 400 }, 200), context));

    expectPiecesCoverOutline(result.outline, result.pieces);
  });
});
