import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { PALETTE } from './palette';

/** How far a Frozen thing's pin reaches from where it is stuck, px. */
export const PIN_REACH = 10;

/**
 * The Frozen look: a push pin stuck in at `at`, in neutral white so it reads
 * on every Colour. A Frozen Object has it at its centroid, a Frozen Line
 * halfway along it.
 */
export function drawPin(g: Phaser.GameObjects.Graphics, { x, y }: Vec2): void {
  g.lineStyle(3, PALETTE.frozenPinEdge, 1);
  g.lineBetween(x, y, x + 8, y + 8);
  g.fillStyle(PALETTE.frozenPin, 1);
  g.fillCircle(x, y, 7);
  g.lineStyle(2, PALETTE.frozenPinEdge, 1);
  g.strokeCircle(x, y, 7);
}
