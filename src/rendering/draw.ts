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

/** Outlines a capsule (for the debug overlay). */
export function strokeCapsule(g: Graphics, a: Vec2, b: Vec2, thickness: number): void {
  const r = thickness / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  const angle = Math.atan2(dy, dx);
  g.beginPath();
  g.arc(a.x, a.y, r, angle + Math.PI / 2, angle + (3 * Math.PI) / 2);
  g.lineTo(b.x - nx, b.y - ny);
  g.arc(b.x, b.y, r, angle - Math.PI / 2, angle + Math.PI / 2);
  g.lineTo(a.x + nx, a.y + ny);
  g.strokePath();
}
