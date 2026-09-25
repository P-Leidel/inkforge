import { distance, type Vec2 } from '../geometry/vec2';

/** Samples each side of a point that the corner test looks across. */
const WINDOW = 5;
/** A corner's straw is at most this fraction of the median straw. */
const STRAW_RATIO = 0.9;
/** …and the Stroke turns by at least this much there (radians). */
const MIN_TURN = (35 * Math.PI) / 180;
/** Sharpening moves a corner at most this far (px); more means the sides aren't straight. */
const MAX_SHARPEN_SHIFT = 5;

/**
 * Indices of the corners of an evenly spaced Stroke, after ShortStraw
 * (Wolin et al., 2008): the "straw" of a point is the distance between the
 * points WINDOW samples before and after it. Along a straight run or a round
 * curve the straws are all alike; at a corner they dip. A corner is a local
 * minimum of the straw, well below the median, where the Stroke turns
 * sharply. An open Stroke's end points are not corners.
 */
export function findCorners(points: readonly Vec2[], closed: boolean): number[] {
  const n = points.length;
  if (n < 2 * WINDOW + 1) return [];
  const at = (i: number) => points[closed ? (i + n) % n : i]!;
  const first = closed ? 0 : WINDOW;
  const last = closed ? n - 1 : n - 1 - WINDOW;

  const straws = new Map<number, number>();
  for (let i = first; i <= last; i++) straws.set(i, distance(at(i - WINDOW), at(i + WINDOW)));
  const sorted = [...straws.values()].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  const corners: number[] = [];
  for (let i = first; i <= last; i++) {
    const straw = straws.get(i)!;
    if (straw >= STRAW_RATIO * median) continue;
    // A local minimum within the window (ties go to the first).
    let isMinimum = true;
    for (let k = -WINDOW; k <= WINDOW && isMinimum; k++) {
      if (k === 0) continue;
      const j = closed ? (i + k + n) % n : i + k;
      const other = straws.get(j);
      if (other === undefined) continue;
      if (other < straw || (other === straw && k < 0)) isMinimum = false;
    }
    if (isMinimum && turnAt(at(i - WINDOW), at(i), at(i + WINDOW)) >= MIN_TURN) corners.push(i);
  }
  return corners;
}

function turnAt(before: Vec2, point: Vec2, after: Vec2): number {
  const a = Math.atan2(point.y - before.y, point.x - before.x);
  const b = Math.atan2(after.y - point.y, after.x - point.x);
  let turn = Math.abs(b - a);
  if (turn > Math.PI) turn = 2 * Math.PI - turn;
  return turn;
}

/** A line through `points`, fitted by least squares, as a point and a unit direction. */
function fitLine(points: readonly Vec2[]): { origin: Vec2; direction: Vec2 } {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p.x, 0) / n;
  const cy = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - cx) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
    syy += (p.y - cy) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { origin: { x: cx, y: cy }, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
}

/**
 * Moves each corner to where the Stroke's two sides next to it meet, so a
 * corner rounded off by earlier smoothing is sharp again. The sides are
 * fitted just beyond the rounded tip, which also averages out hand jitter.
 */
export function sharpenCorners(
  points: readonly Vec2[],
  corners: readonly number[],
  closed: boolean,
): Vec2[] {
  const n = points.length;
  const out = [...points];
  const valid = (i: number) => closed || (i >= 0 && i < n);
  const at = (i: number) => points[(i + n) % n]!;
  for (const c of corners) {
    const before: Vec2[] = [];
    const after: Vec2[] = [];
    for (let k = 2; k <= 2 * WINDOW; k++) {
      if (valid(c - k)) before.push(at(c - k));
      if (valid(c + k)) after.push(at(c + k));
    }
    if (before.length < 3 || after.length < 3) continue;
    const a = fitLine(before);
    const b = fitLine(after);
    const denominator = a.direction.x * b.direction.y - a.direction.y * b.direction.x;
    if (Math.abs(denominator) < Math.sin(MIN_TURN / 2)) continue; // nearly parallel sides
    const dx = b.origin.x - a.origin.x;
    const dy = b.origin.y - a.origin.y;
    const t = (dx * b.direction.y - dy * b.direction.x) / denominator;
    const meet = { x: a.origin.x + a.direction.x * t, y: a.origin.y + a.direction.y * t };
    if (distance(meet, at(c)) <= MAX_SHARPEN_SHIFT) out[c] = meet;
  }
  return out;
}
