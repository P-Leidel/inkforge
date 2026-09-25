import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { isClosingStroke } from '../stroke/close-detection';
import { CLOSE_RADIUS, LINE_THICKNESS } from '../stroke/stroke-rules';
import { PALETTE } from './palette';

/**
 * Draws the Stroke the player is drawing right now, and the close marker at
 * its start while releasing would close it into an Object.
 */
export class StrokePreview {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(10);
  }

  draw(points: readonly Vec2[] | null): void {
    const g = this.g;
    g.clear();
    if (!points || points.length === 0) return;
    const color = PALETTE.ink;
    const r = LINE_THICKNESS / 2;
    g.fillStyle(color, 0.7);
    g.lineStyle(LINE_THICKNESS, color, 0.7);
    // Round joints: a dot at every sample, joined by thick segments.
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      g.fillCircle(p.x, p.y, r);
      if (i > 0) g.lineBetween(points[i - 1]!.x, points[i - 1]!.y, p.x, p.y);
    }
    if (isClosingStroke(points)) {
      const start = points[0]!;
      g.lineStyle(3, PALETTE.closeMarker, 1);
      g.strokeCircle(start.x, start.y, CLOSE_RADIUS);
      g.fillStyle(PALETTE.closeMarker, 1);
      g.fillCircle(start.x, start.y, 5);
    }
  }
}
