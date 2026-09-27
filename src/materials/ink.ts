import { polygonArea, polygonPerimeter, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { distance, type Vec2 } from '../geometry/vec2';
import { closeRing, isClosingStroke } from '../stroke/close-detection';
import { LINE_THICKNESS } from '../stroke/stroke-rules';

/*
 * Ink, in px²: how much a Line, an Outline or a Fill is. A Line is its
 * length × the thickness it was drawn with, an Outline its perimeter × the
 * Line thickness, and a Fill its Object's area. Every amount is of one
 * Colour, which the caller holds alongside it. Mass, Blasts, Spills and
 * Rubble read their amounts from here, and so do the commands that report
 * what they spent, and the estimate of a Stroke while it is drawn.
 */

/** The Ink of a Line, or of any part of one: its length × `thickness`. */
export function lineInk(segments: readonly Segment[], thickness: number): number {
  let length = 0;
  for (const { a, b } of segments) length += distance(a, b);
  return length * thickness;
}

/** The Ink of an Object's Outline: its perimeter × the Line thickness. */
export function outlineInk(outline: Polygon): number {
  return polygonPerimeter(outline) * LINE_THICKNESS;
}

/** The Ink of an Object's Fill: the area inside its Outline. */
export function fillInk(outline: Polygon): number {
  return polygonArea(outline);
}

/** A Stroke's raw pointer samples, measured as drawn, without the Stroke pipeline. */
export interface SamplesInk {
  /** Whether they close into an Object. */
  readonly closes: boolean;
  /** Their Ink: a closing Stroke's Outline's, anything else's as a Line along them. */
  readonly ink: number;
  /** The part of `ink` lying on a Line already standing; none for an Object's Outline. */
  readonly onLines: number;
}

/**
 * Measures a Stroke's raw pointer samples as drawn, to estimate what it
 * costs while it is drawn: a closing Stroke as its ring's Outline, anything
 * else as a Line along the samples in the Line thickness, of which the parts
 * `lyingOnLines` finds lie on another Line.
 */
export function samplesInk(
  samples: readonly Vec2[],
  lyingOnLines: (path: readonly Segment[]) => readonly Segment[],
): SamplesInk {
  if (isClosingStroke(samples)) {
    return { closes: true, ink: outlineInk(closeRing(samples)), onLines: 0 };
  }
  const path = samples.slice(1).map((b, k) => ({ a: samples[k]!, b }));
  return {
    closes: false,
    ink: lineInk(path, LINE_THICKNESS),
    onLines: lineInk(lyingOnLines(path), LINE_THICKNESS),
  };
}
