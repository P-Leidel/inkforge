import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';

type Graphics = Phaser.GameObjects.Graphics;

function tracePath(g: Graphics, points: readonly Vec2[], closed: boolean): void {
  const first = points[0];
  if (!first) return;
  g.beginPath();
  g.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
  if (closed) g.closePath();
}

/** Fills a closed polygon with the current fill style. */
export function fillPolygon(g: Graphics, points: readonly Vec2[]): void {
  tracePath(g, points, true);
  g.fillPath();
}

/** Outlines a closed polygon with the current line style. */
export function strokePolygon(g: Graphics, points: readonly Vec2[]): void {
  tracePath(g, points, true);
  g.strokePath();
}

/** Draws an open polyline with the current line style. */
export function strokePolyline(g: Graphics, points: readonly Vec2[]): void {
  tracePath(g, points, false);
  g.strokePath();
}

/** Draws a filled capsule: a thick segment with round ends, exactly `thickness` wide. */
export function fillCapsule(g: Graphics, a: Vec2, b: Vec2, thickness: number, color: number): void {
  g.lineStyle(thickness, color, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(color, 1);
  g.fillCircle(a.x, a.y, thickness / 2);
  g.fillCircle(b.x, b.y, thickness / 2);
}

/** Outlines a circle as a polygon of `sides` (for the debug overlay): no arc to tessellate. */
export function strokeRing(g: Graphics, centre: Vec2, radius: number, sides: number): void {
  g.beginPath();
  for (let k = 0; k <= sides; k++) {
    const turn = (2 * Math.PI * k) / sides;
    const x = centre.x + radius * Math.cos(turn);
    const y = centre.y + radius * Math.sin(turn);
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.strokePath();
}
