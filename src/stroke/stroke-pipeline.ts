import { cutPolylineOutside } from '../geometry/clip';
import { decomposeConvex } from '../geometry/convex-decomposition';
import { circleOverlapsPolygon, convexPolygonsOverlap, type Circle } from '../geometry/overlap';
import {
  isSelfIntersecting,
  polygonArea,
  polygonCentroid,
  type Polygon,
} from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { distance, pathLength, type Vec2 } from '../geometry/vec2';
import { closeRing, isClosingStroke } from './close-detection';
import { splitIntoPieces } from './pieces';
import { resample, resampleClosed } from './sampling';
import { flattenSpikesClosed, flattenSpikesOpen, simplifyCapped } from './simplification';
import { findCorners, sharpenCorners } from './corners';
import { smooth, smoothBetweenCorners } from './smoothing';
import {
  LINE_THICKNESS,
  MAX_LINE_SEGMENT_LENGTH,
  MAX_PART_VERTICES,
  MAX_STROKE_POINTS,
  MIN_LINE_LENGTH,
  MIN_OBJECT_AREA,
  PRESMOOTHING_SIGMA,
  SAMPLE_SPACING,
  SIMPLIFY_TOLERANCE,
  SMOOTHING_SIGMA,
} from './stroke-rules';

/** A read-only view of what already exists in the Arena. */
export interface StrokeContext {
  readonly terrain: readonly Polygon[];
  /** Existing Objects, each as its convex parts in world coordinates. */
  readonly objects: readonly (readonly Polygon[])[];
  /** Existing Rubble, as circles in world coordinates. */
  readonly rubble?: readonly Circle[];
  /** Thickness of a Line; defaults to LINE_THICKNESS. */
  readonly lineThickness?: number;
  /**
   * The length (px) Lines are split into Pieces of, from the material table.
   * Without it each part of a Line is one Piece.
   */
  readonly pieceLength?: number;
}

export type RejectionReason = 'too-small' | 'self-crossing' | 'overlaps';

/** What a Stroke becomes: exactly one of a Line, an Object, a rejection, or nothing. */
export type StrokeResult =
  | {
      readonly kind: 'line';
      /** Capsule centre lines, after cutting at Terrain: every Piece's, in order. */
      readonly segments: readonly Segment[];
      /** The Line's Pieces in order along it, each as its capsule centre lines. */
      readonly pieces: readonly (readonly Segment[])[];
      readonly thickness: number;
    }
  | {
      readonly kind: 'object';
      /** The simplified outline in world coordinates. */
      readonly outline: Polygon;
      /** Convex parts that together cover the outline. */
      readonly parts: readonly Polygon[];
    }
  | {
      readonly kind: 'rejected';
      readonly reason: RejectionReason;
      /** The Stroke as drawn, for the rejection flash. */
      readonly path: readonly Vec2[];
    }
  | { readonly kind: 'dropped' };

/**
 * The Stroke pipeline: raw pointer samples of one Stroke in, a Line, an
 * Object, a rejection or nothing out. Pure: no engine or Phaser dependency.
 */
export function processStroke(samples: readonly Vec2[], context: StrokeContext): StrokeResult {
  if (samples.length < 2 || pathLength(samples) < MIN_LINE_LENGTH) return { kind: 'dropped' };
  return isClosingStroke(samples)
    ? processClosedStroke(samples, context)
    : processOpenStroke(samples, context);
}

function processClosedStroke(samples: readonly Vec2[], context: StrokeContext): StrokeResult {
  const even = resampleClosed(closeRing(samples), SAMPLE_SPACING);
  const presmoothed = smooth(even, SAMPLE_SPACING, PRESMOOTHING_SIGMA, true);
  const flattened = resampleClosed(
    flattenSpikesClosed(presmoothed, LINE_THICKNESS),
    SAMPLE_SPACING,
  );
  const corners = findCorners(flattened, true);
  const sharpened = sharpenCorners(flattened, corners, true);
  const smoothed = smoothBetweenCorners(sharpened, corners, SAMPLE_SPACING, SMOOTHING_SIGMA, true);
  const simplified = simplifyCapped(smoothed, SIMPLIFY_TOLERANCE, MAX_STROKE_POINTS, true);
  // Smoothing and simplifying shrink a ring, most of all a small round one;
  // scale it back so the Object keeps the area (and so the mass) that was drawn.
  const drawnArea = polygonArea(flattened);
  const outline = scaleToArea(simplified, drawnArea);

  if (outline.length < 3 || isSelfIntersecting(outline)) {
    return { kind: 'rejected', reason: 'self-crossing', path: samples };
  }
  if (drawnArea < MIN_OBJECT_AREA) {
    return { kind: 'rejected', reason: 'too-small', path: samples };
  }
  const parts = decomposeConvex(outline, MAX_PART_VERTICES);
  if (overlapsSolid(parts, context)) return { kind: 'rejected', reason: 'overlaps', path: samples };
  return { kind: 'object', outline, parts };
}

/** The ring scaled about its centroid to the given area. */
function scaleToArea(ring: readonly Vec2[], area: number): Vec2[] {
  const current = polygonArea(ring);
  if (current === 0) return [...ring];
  const c = polygonCentroid(ring);
  const k = Math.sqrt(area / current);
  return ring.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

/**
 * Whether an Object would overlap Terrain, another Object or Rubble.
 * Touching is fine; overlapping Lines is allowed (physics squeezes the
 * Object out).
 */
function overlapsSolid(parts: readonly Polygon[], context: StrokeContext): boolean {
  const solids = [...context.terrain, ...context.objects.flat()];
  const rubble = context.rubble ?? [];
  return parts.some(
    (part) =>
      solids.some((solid) => convexPolygonsOverlap(part, solid)) ||
      rubble.some((circle) => circleOverlapsPolygon(circle, part)),
  );
}

function processOpenStroke(samples: readonly Vec2[], context: StrokeContext): StrokeResult {
  const thickness = context.lineThickness ?? LINE_THICKNESS;
  const even = resample(samples, SAMPLE_SPACING);
  // Spikes are cut before the main smoothing, which would smear them into their
  // base; a light pass first keeps per-sample jitter from looking like spikes.
  const presmoothed = smooth(even, SAMPLE_SPACING, PRESMOOTHING_SIGMA, false);
  const flattened = resample(flattenSpikesOpen(presmoothed, thickness), SAMPLE_SPACING);
  const corners = findCorners(flattened, false);
  const sharpened = sharpenCorners(flattened, corners, false);
  const smoothed = smoothBetweenCorners(sharpened, corners, SAMPLE_SPACING, SMOOTHING_SIGMA, false);
  const simplified = simplifyCapped(smoothed, SIMPLIFY_TOLERANCE, MAX_STROKE_POINTS, false);
  const cut = cutPolylineOutside(simplified, context.terrain);
  const total = cut.reduce((sum, s) => sum + distance(s.a, s.b), 0);
  if (total < MIN_LINE_LENGTH) return { kind: 'dropped' };
  const pieces = splitIntoPieces(cut, context.pieceLength, MAX_LINE_SEGMENT_LENGTH);
  return { kind: 'line', segments: pieces.flat(), pieces, thickness };
}
