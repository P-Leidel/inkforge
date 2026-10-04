import type Phaser from 'phaser';
import type { Bounds } from '../geometry/polygon';
import { PALETTE } from './palette';

/**
 * An HP bar's size: its height, how far (px) above what it belongs to it
 * floats, and its border. `small` over an Enemy, `large` over the Ink Core.
 */
const SIZES = {
  small: { height: 4, gap: 6, border: 1 },
  large: { height: 8, gap: 12, border: 2 },
} as const;

export type HpBarSize = keyof typeof SIZES;

/** Below this share of its HP left, a bar shows red. */
const LOW_HP = 0.3;

/** The share of `fullHp` that `hp` is, from 0 to 1; 0 if there is no full HP. */
export function hpShare(hp: number, fullHp: number): number {
  return fullHp > 0 ? Math.min(1, Math.max(0, hp / fullHp)) : 0;
}

/**
 * Draws an HP bar above `over`, as wide as it: the share of `hp` left of
 * `fullHp`, green, or red once low, on a dark border. Every HP bar is drawn
 * here: an Enemy's, the Ink Core's, and the boss's.
 */
export function drawHpBar(
  g: Pick<Phaser.GameObjects.Graphics, 'fillStyle' | 'fillRect'>,
  over: Pick<Bounds, 'minX' | 'minY' | 'maxX'>,
  hp: number,
  fullHp: number,
  size: HpBarSize,
): void {
  const { height, gap, border } = SIZES[size];
  const left = hpShare(hp, fullHp);
  const width = over.maxX - over.minX;
  const top = over.minY - gap - height;
  g.fillStyle(PALETTE.hpEmpty, 1);
  g.fillRect(over.minX - border, top - border, width + 2 * border, height + 2 * border);
  g.fillStyle(left < LOW_HP ? PALETTE.hpLow : PALETTE.hpFull, 1);
  g.fillRect(over.minX, top, width * left, height);
}
