import type Phaser from 'phaser';
import { transformPoints } from '../../geometry/transform';
import type { EnemyView } from '../../sandbox/sandbox-world';
import { fillPolygon, strokePolygon } from '../draw';
import { PALETTE } from '../palette';
import { drawn, type DrawnKind } from './drawn-kind';

/** Enemies show over Lines and Objects, under Patches, which may lie on them. */
export const ENEMY_DEPTH = 2;
/** Width of an Enemy's outline. */
const EDGE_WIDTH = 2;
/** Size (px) of an eye, and how far in from its front and down from its top. */
const EYE_SIZE = 4;
const EYE_IN = 7;
const EYE_DOWN = 9;

/**
 * The Enemies, each as its body's outline, redrawn every frame. Placeholder
 * art: a Crawler is a low grey-brown box with two eyes on the side it walks
 * toward, the Ink Core's, which is to the right.
 */
export class EnemiesDrawing implements DrawnKind {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly views: () => readonly EnemyView[],
  ) {
    this.graphics = scene.add.graphics().setDepth(ENEMY_DEPTH);
  }

  /** Nothing to make or free: they are drawn afresh every frame. */
  follow(): void {}

  dropAll(): void {}

  draw(fraction: number): void {
    const g = this.graphics;
    g.clear();
    for (const enemy of this.views()) {
      const transform = drawn(enemy, fraction);
      const body = transformPoints(enemy.outline, transform);
      g.fillStyle(PALETTE.crawler, 1);
      fillPolygon(g, body);
      g.lineStyle(EDGE_WIDTH, PALETTE.crawlerEdge, 1);
      strokePolygon(g, body);
      const front = transform.x + enemy.width / 2 - EYE_IN;
      const top = transform.y - enemy.height / 2 + EYE_DOWN;
      g.fillStyle(PALETTE.enemyEye, 1);
      g.fillRect(front - EYE_SIZE, top, EYE_SIZE, EYE_SIZE);
      g.fillRect(front - 3 * EYE_SIZE, top, EYE_SIZE, EYE_SIZE);
    }
  }
}
