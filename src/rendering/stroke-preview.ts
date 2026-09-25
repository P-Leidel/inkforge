import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { PALETTE } from './palette';

/** Draws the Stroke the player is drawing right now. */
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
  }
}
