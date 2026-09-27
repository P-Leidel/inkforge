import type Phaser from 'phaser';
import type { BlastView } from '../../sandbox/sandbox-world';
import { INK_HUES } from '../ink';
import type { DrawnKind } from './drawn-kind';

/** Blast rings show over everything else in the Arena. */
const BLAST_DEPTH = 6;
/** Width of a Blast's ring at full strength, and as it dies out. */
const BLAST_RING_WIDTH = 10;
const BLAST_RING_MIN_WIDTH = 2;
/** The hot flash inside a fresh Blast ring. */
const BLAST_FLASH = 0xffc15a;

/**
 * The Blasts, each as its ring spreading out, fading and thinning as it
 * weakens the way its strength does, (1 − d/R)², around a hot flash that
 * fades faster. Redrawn every frame; they keep to the steps.
 */
export class BlastsDrawing implements DrawnKind {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly views: () => readonly BlastView[],
  ) {
    this.graphics = scene.add.graphics().setDepth(BLAST_DEPTH);
  }

  /** Nothing to make or free: they are drawn afresh every frame. */
  follow(): void {}

  dropAll(): void {}

  draw(): void {
    const g = this.graphics;
    g.clear();
    for (const { centre, radius, reach } of this.views()) {
      const left = 1 - radius / reach;
      const strength = left * left;
      g.fillStyle(BLAST_FLASH, 0.35 * strength * strength);
      g.fillCircle(centre.x, centre.y, radius);
      const width = BLAST_RING_MIN_WIDTH + (BLAST_RING_WIDTH - BLAST_RING_MIN_WIDTH) * strength;
      g.lineStyle(width, INK_HUES.red, 0.2 + 0.8 * strength);
      g.strokeCircle(centre.x, centre.y, radius);
    }
  }
}
