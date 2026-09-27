import { polygonArea, polygonPerimeter, type Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { distance } from '../geometry/vec2';
import { LINE_THICKNESS } from '../stroke/stroke-rules';

/*
 * Ink, in px²: how much a Line, an Outline or a Fill is. A Line is its
 * length × the thickness it was drawn with, an Outline its perimeter × the
 * Line thickness, and a Fill its Object's area. Every amount is of one
 * Colour, which the caller holds alongside it. Mass, Blasts, Spills and
 * Rubble read their amounts from here, and so do the commands that report
 * what they spent.
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
