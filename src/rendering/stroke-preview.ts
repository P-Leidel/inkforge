import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { isClosingStroke } from '../stroke/close-detection';
import { CLOSE_RADIUS, LINE_THICKNESS } from '../stroke/stroke-rules';
import { drawInk } from './ink';
import { PALETTE } from './palette';
import { drawBrush } from './palette-bar';

/** Where the pointer's Colour dab sits, relative to the pointer. */
const POINTER_OFFSET = { x: 16, y: 16 };

/**
 * Draws the Stroke the player is drawing right now in the current Colour, and
 * the close marker at its start while releasing would close it into an
 * Object. A Stroke that would be refused is drawn flat red with a red marker.
 * Between Strokes, a dab of the current Colour follows the pointer.
 */
export class StrokePreview {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(10);
  }

  draw(
    points: readonly Vec2[] | null,
    colour: Colour,
    refused: boolean,
    pointer: Vec2 | null,
  ): void {
    const g = this.g;
    g.clear();
    if (!points || points.length === 0) {
      if (pointer) this.drawPointerDab(pointer, colour);
      return;
    }
    if (refused) {
      g.lineStyle(LINE_THICKNESS, PALETTE.rejected, 0.8);
      g.fillStyle(PALETTE.rejected, 0.8);
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        g.fillCircle(p.x, p.y, LINE_THICKNESS / 2);
        if (i > 0) g.lineBetween(points[i - 1]!.x, points[i - 1]!.y, p.x, p.y);
      }
    } else {
      drawInk(g, colour, points, false, LINE_THICKNESS, 0.8);
    }
    if (isClosingStroke(points)) {
      const start = points[0]!;
      const marker = refused ? PALETTE.rejected : PALETTE.closeMarker;
      g.lineStyle(3, marker, 1);
      g.strokeCircle(start.x, start.y, CLOSE_RADIUS);
      g.fillStyle(marker, 1);
      g.fillCircle(start.x, start.y, 5);
    }
  }

  /** With the Eraser picked: its brush at the pointer, in place of a dab. */
  drawBrush(pointer: Vec2 | null): void {
    this.g.clear();
    if (pointer) drawBrush(this.g, pointer);
  }

  private drawPointerDab(pointer: Vec2, colour: Colour): void {
    const x = pointer.x + POINTER_OFFSET.x;
    const y = pointer.y + POINTER_OFFSET.y;
    drawInk(
      this.g,
      colour,
      [
        { x: x - 7, y: y + 4 },
        { x, y },
        { x: x + 7, y: y - 4 },
      ],
      false,
      LINE_THICKNESS,
    );
  }
}
