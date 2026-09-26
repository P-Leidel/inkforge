import { describe, expect, it } from 'vitest';
import type { Segment } from '../geometry/segment';
import { distance, type Vec2 } from '../geometry/vec2';
import { SANDBOX_ARENA } from '../sandbox/arena';
import { pieceCentre, splitIntoPieces } from './pieces';
import { dragAlong } from './pointer-paths';
import { processStroke } from './stroke-pipeline';

const lengthOf = (segments: readonly Segment[]) =>
  segments.reduce((sum, s) => sum + distance(s.a, s.b), 0);

const segmentsOf = (points: readonly Vec2[]): Segment[] =>
  points.slice(1).map((b, k) => ({ a: points[k]!, b }));

describe('Piece splitting', () => {
  it('splits a Line into equal Pieces as close to the Piece length as the length allows', () => {
    // 200 px: four Pieces of 50 px are closer to 48 than five of 40.
    const pieces = splitIntoPieces(
      segmentsOf([
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ]),
      48,
      32,
    );

    expect(pieces).toHaveLength(4);
    for (const piece of pieces) expect(lengthOf(piece)).toBeCloseTo(50, 6);
  });

  it('measures Pieces along a bent Line, cutting inside its segments', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 70, y: 0 },
      { x: 70, y: 50 },
      { x: 10, y: 50 },
    ];
    // 180 px in all: four Pieces of 45 px.
    const pieces = splitIntoPieces(segmentsOf(points), 48, 32);

    expect(pieces).toHaveLength(4);
    for (const piece of pieces) expect(lengthOf(piece)).toBeCloseTo(45, 6);
  });

  it('covers the Line: each Piece starts where the one before ends, from end to end', () => {
    const points = [
      { x: 10, y: 20 },
      { x: 130, y: 80 },
      { x: 300, y: 60 },
    ];
    const pieces = splitIntoPieces(segmentsOf(points), 48, 32);

    expect(pieces[0]![0]!.a).toEqual(points[0]);
    expect(pieces.at(-1)!.at(-1)!.b).toEqual(points[2]);
    for (let k = 1; k < pieces.length; k++) {
      expect(distance(pieces[k - 1]!.at(-1)!.b, pieces[k]![0]!.a)).toBeLessThan(1e-9);
    }
    const total = pieces.reduce((sum, piece) => sum + lengthOf(piece), 0);
    expect(total).toBeCloseTo(lengthOf(segmentsOf(points)), 6);
  });

  it('makes a Line shorter than one Piece a single Piece', () => {
    const pieces = splitIntoPieces(
      segmentsOf([
        { x: 0, y: 0 },
        { x: 30, y: 0 },
      ]),
      48,
      32,
    );

    expect(pieces).toHaveLength(1);
    expect(lengthOf(pieces[0]!)).toBeCloseTo(30, 6);
  });

  it('splits each Piece into capsules no longer than the longest capsule', () => {
    const pieces = splitIntoPieces(
      segmentsOf([
        { x: 0, y: 0 },
        { x: 500, y: 0 },
      ]),
      80,
      32,
    );

    for (const piece of pieces) {
      expect(piece.length).toBeGreaterThan(1);
      for (const s of piece) expect(distance(s.a, s.b)).toBeLessThanOrEqual(32 + 1e-9);
    }
  });

  it('splits each part of a Line cut by Terrain on its own', () => {
    const parts = [
      ...segmentsOf([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      ...segmentsOf([
        { x: 150, y: 0 },
        { x: 170, y: 0 },
      ]),
    ];
    const pieces = splitIntoPieces(parts, 48, 32);

    expect(pieces.map((piece) => Math.round(lengthOf(piece)))).toEqual([50, 50, 20]);
  });

  it('keeps the whole part one Piece without a Piece length', () => {
    const pieces = splitIntoPieces(
      segmentsOf([
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ]),
      undefined,
      32,
    );

    expect(pieces).toHaveLength(1);
  });
});

describe('Stroke pipeline: Pieces', () => {
  it('gives a Line as Pieces of about the given length, and their capsules as its segments', () => {
    const result = processStroke(
      dragAlong([
        { x: 200, y: 600 },
        { x: 700, y: 600 },
      ]),
      { terrain: SANDBOX_ARENA.terrain, objects: [], pieceLength: 48 },
    );
    if (result.kind !== 'line') throw new Error(`expected a Line, got ${result.kind}`);

    expect(result.pieces.length).toBe(Math.round(500 / 48));
    for (const piece of result.pieces) expect(lengthOf(piece)).toBeCloseTo(500 / 10, 0);
    expect(result.pieces.flat()).toEqual(result.segments);
  });
});

describe('A Piece’s centre', () => {
  it('is halfway along its capsules, round a bend', () => {
    const bent = segmentsOf([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
    ]);

    expect(pieceCentre(bent)).toEqual({ x: 20, y: 0 });
    expect(
      pieceCentre(
        segmentsOf([
          { x: 5, y: 5 },
          { x: 5, y: 45 },
        ]),
      ),
    ).toEqual({ x: 5, y: 25 });
  });
});
