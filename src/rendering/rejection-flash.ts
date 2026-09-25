import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import type { RejectionReason } from '../stroke/stroke-pipeline';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { strokePolyline } from './draw';
import { FONT_FAMILY, PALETTE } from './palette';

/** What a flash says about a refused Stroke. */
export const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  'too-small': 'Too small',
  'self-crossing': 'Shape crosses itself',
  overlaps: 'Overlaps Terrain or an Object',
};

const FADE_MS = 900;

/**
 * Something refused (a Stroke, a Fill) flashes red along `path` and fades
 * out, with a short message at the pointer.
 */
export function flashRejection(
  scene: Phaser.Scene,
  path: readonly Vec2[],
  message: string,
  pointer: Vec2,
): void {
  const g = scene.add.graphics().setDepth(20);
  g.lineStyle(LINE_THICKNESS, PALETTE.rejected, 1);
  strokePolyline(g, path);
  const label = scene.add
    .text(pointer.x + 18, pointer.y - 18, message, {
      fontFamily: FONT_FAMILY,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ff7a7a',
      backgroundColor: '#1d2027cc',
      padding: { x: 8, y: 4 },
    })
    .setOrigin(0, 1)
    .setDepth(21);
  scene.tweens.add({
    targets: [g, label],
    alpha: 0,
    duration: FADE_MS,
    ease: 'Quad.easeIn',
    onComplete: () => {
      g.destroy();
      label.destroy();
    },
  });
}
