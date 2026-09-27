import type Phaser from 'phaser';
import type { InkCoreView } from '../../sandbox/sandbox-world';
import { PALETTE } from '../palette';
import type { DrawnKind } from './drawn-kind';
import { ENEMY_DEPTH } from './enemies-drawing';

/** How far (px) each layer of the Ink Core's glow reaches past it, and how strong it is. */
const GLOW = [
  { reach: 14, alpha: 0.08 },
  { reach: 7, alpha: 0.16 },
] as const;
/** Width of the Ink Core's bright edge. */
const EDGE_WIDTH = 3;
/** The HP bar: its height, how far (px) above the Ink Core it floats, and its border. */
const BAR_HEIGHT = 8;
const BAR_GAP = 12;
const BAR_BORDER = 2;
/** Below this share of its HP left, the bar shows red. */
const LOW_HP = 0.3;

/**
 * The Ink Core: a glowing block with its HP bar above it, redrawn every
 * frame. Placeholder art.
 */
export class InkCoreDrawing implements DrawnKind {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly view: () => InkCoreView,
  ) {
    this.graphics = scene.add.graphics().setDepth(ENEMY_DEPTH);
  }

  /** Nothing to make or free: it is drawn afresh every frame. */
  follow(): void {}

  dropAll(): void {}

  draw(): void {
    const g = this.graphics;
    g.clear();
    const { hp, fullHp, bounds } = this.view();
    const { minX, minY, maxX, maxY } = bounds;
    const width = maxX - minX;
    for (const { reach, alpha } of GLOW) {
      g.fillStyle(PALETTE.coreGlow, alpha);
      g.fillRect(minX - reach, minY - reach, width + 2 * reach, maxY - minY + 2 * reach);
    }
    g.fillStyle(PALETTE.core, 1);
    g.fillRect(minX, minY, width, maxY - minY);
    g.lineStyle(EDGE_WIDTH, PALETTE.coreEdge, 1);
    g.strokeRect(minX, minY, width, maxY - minY);

    const left = fullHp > 0 ? Math.min(1, Math.max(0, hp / fullHp)) : 0;
    const top = minY - BAR_GAP - BAR_HEIGHT;
    g.fillStyle(PALETTE.hpEmpty, 1);
    g.fillRect(
      minX - BAR_BORDER,
      top - BAR_BORDER,
      width + 2 * BAR_BORDER,
      BAR_HEIGHT + 2 * BAR_BORDER,
    );
    g.fillStyle(left < LOW_HP ? PALETTE.hpLow : PALETTE.hpFull, 1);
    g.fillRect(minX, top, width * left, BAR_HEIGHT);
  }
}
