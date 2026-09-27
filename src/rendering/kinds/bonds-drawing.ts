import type Phaser from 'phaser';
import { carry } from '../../geometry/transform';
import type { BondView } from '../../sandbox/sandbox-world';
import { INK_HUES } from '../ink';
import { PALETTE } from '../palette';
import { drawn, type DrawnKind } from './drawn-kind';

/** Bond blobs show over the Objects they hold. */
const BOND_DEPTH = 4;
/** Radius of the blob of glue drawn where a bond holds. */
const BOND_RADIUS = 5;

/**
 * The bonds: a blob of green glue where each stuck Object is held, so it's
 * clear why it hangs, drawn where the Object is drawn, every frame.
 */
export class BondsDrawing implements DrawnKind {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly views: () => readonly BondView[],
  ) {
    this.graphics = scene.add.graphics().setDepth(BOND_DEPTH);
  }

  /** Nothing to make or free: they are drawn afresh every frame. */
  follow(): void {}

  dropAll(): void {}

  draw(fraction: number): void {
    const g = this.graphics;
    g.clear();
    for (const bond of this.views()) {
      const point = carry(
        bond.point,
        bond.objectPoses.transform,
        drawn(bond.objectPoses, fraction),
      );
      g.fillStyle(INK_HUES.green, 1);
      g.fillCircle(point.x, point.y, BOND_RADIUS);
      g.lineStyle(2, PALETTE.crack, 0.8);
      g.strokeCircle(point.x, point.y, BOND_RADIUS);
    }
  }
}
