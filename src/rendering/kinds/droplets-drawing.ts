import type Phaser from 'phaser';
import type { DropletView } from '../../sandbox/sandbox-world';
import { INK_HUES } from '../ink';
import { drawn, type DrawnKind } from './drawn-kind';
import { PATCH_DEPTH } from './patches-drawing';

/**
 * The Droplets in flight, each a small disc in its Colour with a glint,
 * redrawn every frame over the Patches.
 */
export class DropletsDrawing implements DrawnKind {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly views: () => readonly DropletView[],
  ) {
    this.graphics = scene.add.graphics().setDepth(PATCH_DEPTH);
  }

  /** Nothing to make or free: they are drawn afresh every frame. */
  follow(): void {}

  dropAll(): void {}

  draw(fraction: number): void {
    const g = this.graphics;
    g.clear();
    for (const droplet of this.views()) {
      const { colour, radius } = droplet;
      const transform = drawn(droplet, fraction);
      g.fillStyle(INK_HUES[colour], 1);
      g.fillCircle(transform.x, transform.y, radius);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(transform.x - radius * 0.35, transform.y - radius * 0.35, radius * 0.35);
    }
  }
}
