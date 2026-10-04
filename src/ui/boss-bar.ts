import type Phaser from 'phaser';
import type { Frame } from '../game/session';
import { drawHpBar, hpBarRise } from '../rendering/hp-bar';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';

/** How wide (px) the boss bar is, and where its label's top is: under the HUD's phase label. */
const BAR_WIDTH = 520;
const LABEL_TOP = 114;
/** Where (px) the bar's top is, under its label. */
const BAR_TOP = 142;

/** What the boss bar reads of the frame. */
export type BossFrame = Pick<Frame, 'boss'>;

/**
 * Where the boss bar stands, as the bounds `drawHpBar` floats a bar above:
 * top-centre on a screen `screenWidth` wide.
 */
export function bossBarOver(screenWidth: number): { minX: number; minY: number; maxX: number } {
  const minX = (screenWidth - BAR_WIDTH) / 2;
  return { minX, minY: BAR_TOP + hpBarRise('large'), maxX: minX + BAR_WIDTH };
}

/**
 * The boss's HP bar: a `large` bar top-centre, labelled with its name, while
 * a boss is in the Arena, from when it is sent in until it dies or goes.
 * Drawn from the frame alone.
 */
export class BossBar {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  /** What the label shows, so it is redrawn only on a change. */
  private shownName: string | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(50);
    this.label = scene.add
      .text(scene.scale.width / 2, LABEL_TOP, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: PALETTE.text,
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
  }

  draw({ boss }: BossFrame): void {
    const g = this.graphics;
    g.clear();
    const name = boss?.name ?? null;
    // Text re-renders its canvas on every change, so touch it only on a change.
    if (name !== this.shownName) {
      this.shownName = name;
      this.label.setText(name ?? '');
    }
    if (boss) drawHpBar(g, bossBarOver(this.scene.scale.width), boss.hp, boss.fullHp, 'large');
  }
}
