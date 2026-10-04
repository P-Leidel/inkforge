import type Phaser from 'phaser';
import { polygonBounds } from '../../geometry/polygon';
import { transformPoints, type Transform } from '../../geometry/transform';
import type { EnemyType } from '../../materials/enemy-types';
import type { EnemyView } from '../../sandbox/sandbox-world';
import { fillPolygon, strokePolygon } from '../draw';
import { INK_HUES } from '../ink';
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
/**
 * The Belly's window: its width and height as shares of the Enemy's, how far
 * below its centre it sits (a share of its height), and its rim, light
 * enough to show black on a dark Heavy.
 */
const BELLY_WIDTH = 0.56;
const BELLY_HEIGHT = 0.4;
const BELLY_DROP = 0.14;
const BELLY_RIM = 0xd9d6cc;
const BELLY_RIM_WIDTH = 1.5;

/** How an Enemy type looks: its body and edge colours, and how far (px per px up) it leans forward. */
interface Look {
  readonly body: number;
  readonly edge: number;
  readonly lean: number;
}

const LOOKS: Readonly<Record<EnemyType, Look>> = {
  crawler: { body: PALETTE.crawler, edge: PALETTE.crawlerEdge, lean: 0 },
  runner: { body: PALETTE.runner, edge: PALETTE.runnerEdge, lean: 0.25 },
  heavy: { body: PALETTE.heavy, edge: PALETTE.heavyEdge, lean: 0 },
};

/** The colours an Enemy's pop bursts in, by its type, taken in turn: its body, edge and eyes. */
export const POP_HUES: Readonly<Record<EnemyType, readonly number[]>> = {
  crawler: [PALETTE.crawler, PALETTE.crawler, PALETTE.crawlerEdge, PALETTE.enemyEye],
  runner: [PALETTE.runner, PALETTE.runner, PALETTE.runnerEdge, PALETTE.enemyEye],
  heavy: [PALETTE.heavy, PALETTE.heavy, PALETTE.heavyEdge, PALETTE.enemyEye],
};

/**
 * The Enemies, each as its body's outline, redrawn every frame, with a thin
 * HP bar above it once it is hurt. Placeholder art, with two eyes on the
 * side it walks toward, the Ink Core's, which is to the right: a Crawler is
 * a low grey-brown box, a Runner a narrow one leaning forward, a Heavy a
 * big dark one. Each shows its Belly, the ink it carries, as a window low
 * in its body, in that Colour's hue (a plain box, to keep each Enemy a few
 * drawing calls), so the player can see what
 * it will spill. The lean is only drawn: its body stays upright. Its pop is
 * Debris, which the renderer bursts.
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
      const { body: hue, edge, lean } = LOOKS[enemy.type];
      // Leaning forward: each point shifts ahead by how far it is above the underside.
      const leant = enemy.outline.map(({ x, y }) => ({ x: x + lean * (enemy.height / 2 - y), y }));
      const body = transformPoints(leant, transform);
      g.fillStyle(hue, 1);
      fillPolygon(g, body);
      const belly = bellyWindow(enemy.width, enemy.height);
      const bellyX = transform.x + belly.x + lean * (enemy.height / 2 - belly.y - belly.height / 2);
      const bellyY = transform.y + belly.y;
      g.fillStyle(INK_HUES[enemy.belly], 1);
      g.fillRect(bellyX, bellyY, belly.width, belly.height);
      g.lineStyle(BELLY_RIM_WIDTH, BELLY_RIM, 1);
      g.strokeRect(bellyX, bellyY, belly.width, belly.height);
      g.lineStyle(EDGE_WIDTH, edge, 1);
      strokePolygon(g, body);
      const front = transform.x + enemy.width / 2 - EYE_IN + lean * (enemy.height - EYE_DOWN);
      const top = transform.y - enemy.height / 2 + EYE_DOWN;
      g.fillStyle(PALETTE.enemyEye, 1);
      g.fillRect(front - EYE_SIZE, top, EYE_SIZE, EYE_SIZE);
      g.fillRect(front - 3 * EYE_SIZE, top, EYE_SIZE, EYE_SIZE);
      if (enemy.hp < enemy.fullHp) this.drawHpBar(g, enemy, transform);
    }
  }

  /**
   * A thin bar above the Enemy, as wide as its outline where it is drawn:
   * the share of its HP left.
   */
  private drawHpBar(g: Phaser.GameObjects.Graphics, enemy: EnemyView, at: Transform): void {
    const left = enemy.fullHp > 0 ? Math.min(1, Math.max(0, enemy.hp / enemy.fullHp)) : 0;
    const { minX, minY, maxX } = polygonBounds(transformPoints(enemy.outline, at));
    const width = maxX - minX;
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

/**
 * The window an Enemy `width` by `height` shows its Belly in, relative to
 * its centre: a box low in its body, clear of its eyes, by its top left
 * corner and its size.
 */
export function bellyWindow(
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const w = BELLY_WIDTH * width;
  const h = BELLY_HEIGHT * height;
  return { x: -w / 2, y: BELLY_DROP * height - h / 2, width: w, height: h };
}
