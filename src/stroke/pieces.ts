import type { Segment } from '../geometry/segment';
import { distance, lerp, type Vec2 } from '../geometry/vec2';

/** Points closer than this (px) are one point. */
const SAME_POINT = 1e-6;

/**
 * Splits a Line into Pieces. Each connected part of the Line (a Line cut by
 * Terrain has several) becomes equal Pieces, as close to `pieceLength` long
 * as its length allows; a part shorter than that is one Piece. Only then is
 * each Piece split into capsules of at most `maxSegmentLength`, so no capsule
 * straddles two Pieces. Without a Piece length each part is one Piece.
 */
export function splitIntoPieces(
  segments: readonly Segment[],
  pieceLength: number | undefined,
  maxSegmentLength: number,
): Segment[][] {
  return connectedRuns(segments)
    .flatMap((run) => cutEvenly(run, pieceLength))
    .map((piece) => capsules(piece, maxSegmentLength));
}

/** Joins segments into runs of connected points. */
function connectedRuns(segments: readonly Segment[]): Vec2[][] {
  const runs: Vec2[][] = [];
  for (const { a, b } of segments) {
    const run = runs.at(-1);
    if (run && distance(run.at(-1)!, a) < SAME_POINT) run.push(b);
    else runs.push([a, b]);
  }
  return runs;
}

/** Cuts a polyline into pieces of equal length along it. */
function cutEvenly(points: readonly Vec2[], pieceLength: number | undefined): Vec2[][] {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!);
  const count = pieceLength && pieceLength > 0 ? Math.max(1, Math.round(total / pieceLength)) : 1;

  const pieces: Vec2[][] = [];
  let current: Vec2[] = [points[0]!];
  const extend = (p: Vec2) => {
    if (distance(current.at(-1)!, p) >= SAME_POINT) current.push(p);
  };
  let k = 1;
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = distance(a, b);
    // Cut where the k-th Piece ends, if that is within this segment.
    while (k < count && (total * k) / count <= travelled + length) {
      const cut = lerp(a, b, length > 0 ? ((total * k) / count - travelled) / length : 0);
      extend(cut);
      if (current.length > 1) pieces.push(current);
      current = [cut];
      k++;
    }
    extend(b);
    travelled += length;
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

/** A polyline's segments, each split into equal parts no longer than `maxLength`. */
function capsules(points: readonly Vec2[], maxLength: number): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const parts = Math.max(1, Math.ceil(distance(a, b) / maxLength));
    for (let k = 0; k < parts; k++) {
      out.push({ a: lerp(a, b, k / parts), b: lerp(a, b, (k + 1) / parts) });
    }
  }
  return out;
}
