import type Phaser from 'phaser';
import { transformPoints } from '../../geometry/transform';
import type { Vec2 } from '../../geometry/vec2';
import type { EnemyType } from '../../materials/enemy-table';
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
/** The HP bar: its height, how far (px) above the Enemy it floats, and its border. */
const BAR_HEIGHT = 4;
const BAR_GAP = 6;
const BAR_BORDER = 1;
/** Below this share of its HP left, the bar shows red. */
const LOW_HP = 0.3;

/** The colours an Enemy's pop bursts in, by its type, taken in turn: its body, edge and eyes. */
export const POP_HUES: Readonly<Record<EnemyType, readonly number[]>> = {
  crawler: [PALETTE.crawler, PALETTE.crawler, PALETTE.crawlerEdge, PALETTE.enemyEye],
};

/**
 * The Enemies, each as its body's outline, redrawn every frame, with a thin
 * HP bar above it once it is hurt. Placeholder art: a Crawler is a low
 * grey-brown box with two eyes on the side it walks toward, the Ink Core's,
 * which is to the right. Its pop is Debris, which the renderer bursts.
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
      if (enemy.hp < enemy.fullHp) this.drawHpBar(g, enemy, transform);
    }
  }

  /** A thin bar above the Enemy, as wide as it is: the share of its HP left. */
  private drawHpBar(g: Phaser.GameObjects.Graphics, enemy: EnemyView, { x, y }: Vec2): void {
    const left = enemy.fullHp > 0 ? Math.min(1, Math.max(0, enemy.hp / enemy.fullHp)) : 0;
    const minX = x - enemy.width / 2;
    const top = y - enemy.height / 2 - BAR_GAP - BAR_HEIGHT;
    g.fillStyle(PALETTE.hpEmpty, 1);
    g.fillRect(
      minX - BAR_BORDER,
      top - BAR_BORDER,
      enemy.width + 2 * BAR_BORDER,
      BAR_HEIGHT + 2 * BAR_BORDER,
    );
    g.fillStyle(left < LOW_HP ? PALETTE.hpLow : PALETTE.hpFull, 1);
    g.fillRect(minX, top, enemy.width * left, BAR_HEIGHT);
  }
}
