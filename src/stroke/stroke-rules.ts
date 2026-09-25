/** The geometry rules of the milestone 1 spec, in Arena pixels. */

/** Line thickness, on screen and in collision. */
export const LINE_THICKNESS = 8;
/** A Stroke closes when its end is within this distance of its start… */
export const CLOSE_RADIUS = 24;
/** …and it is at least this long, so short scribbles don't snap shut. */
export const MIN_CLOSING_LENGTH = 3 * CLOSE_RADIUS;
/** Objects with less area (px²) are rejected as too small. */
export const MIN_OBJECT_AREA = 20 * 20;
/** Lines shorter than this are dropped silently. */
export const MIN_LINE_LENGTH = 16;
/** Longest capsule segment of a Line. */
export const MAX_LINE_SEGMENT_LENGTH = 32;

/** Spacing of the evenly resampled Stroke before smoothing. */
export const SAMPLE_SPACING = 2;
/** Light smoothing (σ, px along the Stroke) before spikes are looked for. */
export const PRESMOOTHING_SIGMA = 2;
/** Width (standard deviation, px along the Stroke) of the smoothing that removes hand jitter. */
export const SMOOTHING_SIGMA = 5;
/** Simplification keeps points that deviate more than this from a straight run. */
export const SIMPLIFY_TOLERANCE = 1.5;
/** Most points a simplified Stroke may keep. */
export const MAX_STROKE_POINTS = 64;
/** Box2D polygons are convex with at most this many vertices. */
export const MAX_PIECE_VERTICES = 8;
