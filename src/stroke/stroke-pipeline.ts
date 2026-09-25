import { cutPolylineOutside } from '../geometry/clip';
import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { distance, lerp, pathLength, type Vec2 } from '../geometry/vec2';
import { resample } from './sampling';
import { flattenSpikesOpen, simplifyCapped } from './simplification';
import { smooth } from './smoothing';
import {
  LINE_THICKNESS,
  MAX_LINE_SEGMENT_LENGTH,
  MAX_STROKE_POINTS,
  MIN_LINE_LENGTH,
  PRESMOOTHING_SIGMA,
  SAMPLE_SPACING,
  SIMPLIFY_TOLERANCE,
  SMOOTHING_SIGMA,
} from './stroke-rules';

/** A read-only view of what already exists in the Arena. */
export interface StrokeContext {
  readonly terrain: readonly Polygon[];
  /** Existing Objects, each as its convex pieces in world coordinates. */
  readonly objects: readonly (readonly Polygon[])[];
  /** Thickness of a Line; defaults to LINE_THICKNESS. */
  readonly lineThickness?: number;
}

export type RejectionReason = 'too-small' | 'self-crossing' | 'overlaps';

/** What a Stroke becomes: exactly one of a Line, an Object, a rejection, or nothing. */
export type StrokeResult =
  | {
      readonly kind: 'line';
      /** Capsule centre lines, after cutting at Terrain. */
      readonly segments: readonly Segment[];
      readonly thickness: number;
    }
  | {
      readonly kind: 'object';
      /** The simplified outline in world coordinates. */
      readonly outline: Polygon;
      /** Convex pieces that together cover the outline. */
      readonly pieces: readonly Polygon[];
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
  return processOpenStroke(samples, context);
}

function processOpenStroke(samples: readonly Vec2[], context: StrokeContext): StrokeResult {
  const thickness = context.lineThickness ?? LINE_THICKNESS;
  const even = resample(samples, SAMPLE_SPACING);
  // Spikes are cut before the main smoothing, which would smear them into their
  // base; a light pass first keeps per-sample jitter from looking like spikes.
  const presmoothed = smooth(even, SAMPLE_SPACING, PRESMOOTHING_SIGMA, false);
  const flattened = resample(flattenSpikesOpen(presmoothed, thickness), SAMPLE_SPACING);
  const smoothed = smooth(flattened, SAMPLE_SPACING, SMOOTHING_SIGMA, false);
  const simplified = simplifyCapped(smoothed, SIMPLIFY_TOLERANCE, MAX_STROKE_POINTS, false);
  const cut = cutPolylineOutside(simplified, context.terrain);
  const total = cut.reduce((sum, s) => sum + distance(s.a, s.b), 0);
  if (total < MIN_LINE_LENGTH) return { kind: 'dropped' };
  return { kind: 'line', segments: splitSegments(cut, MAX_LINE_SEGMENT_LENGTH), thickness };
}

/** Splits segments so none is longer than `maxLength`. */
function splitSegments(segments: readonly Segment[], maxLength: number): Segment[] {
  const out: Segment[] = [];
  for (const { a, b } of segments) {
    const pieces = Math.max(1, Math.ceil(distance(a, b) / maxLength));
    for (let k = 0; k < pieces; k++) {
      out.push({ a: lerp(a, b, k / pieces), b: lerp(a, b, (k + 1) / pieces) });
    }
  }
  return out;
}
