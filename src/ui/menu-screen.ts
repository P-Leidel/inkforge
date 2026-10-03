import type Phaser from 'phaser';
import type { Campaign } from '../game/campaign';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';
import { textButton } from './text-button';

/** One button of a menu screen. A locked one shows, muted, but takes no clicks. */
export interface ScreenItem {
  readonly label: string;
  readonly onPick: () => void;
  readonly locked?: boolean;
}

/** One entry of the Level list: a Campaign Level, and whether it can be opened. */
export interface LevelEntry {
  /** Which of the Campaign's Levels, from 0. */
  readonly index: number;
  readonly label: string;
  readonly locked: boolean;
}

/** The Level list: every Level of `campaign`, in order, the locked ones marked so. */
export function levelEntries(campaign: Campaign): LevelEntry[] {
  return campaign.levels.map((_level, index) => {
    const locked = !campaign.isUnlocked(index);
    const name = campaign.name(index);
    return { index, label: locked ? `${name}    locked` : name, locked };
  });
}

/** Above everything in the Arena and its UI, below F1's overlay. */
const DEPTH = 90;
const TITLE_TOP = 260;
const FIRST_TOP = 420;
const ROW = 76;
const BUTTON_WIDTH = 420;

/**
 * A screen over the whole Arena: a title and a column of text buttons, such
 * as the title screen and the Level list. While it is open it takes every
 * click, and the scene plays nothing behind it. Each `show` replaces what
 * it showed.
 */
export class MenuScreen {
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.backdrop = scene.add
      .rectangle(width / 2, height / 2, width, height, PALETTE.background, 1)
      .setDepth(DEPTH)
      // Takes the clicks beside its buttons, so nothing behind it is drawn on.
      .setInteractive();
    this.title = scene.add
      .text(width / 2, TITLE_TOP, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '64px',
        color: PALETTE.text,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1);
  }

  get isOpen(): boolean {
    return this.backdrop.visible;
  }

  /** Opens with `title` and a button for each of `items`, top to bottom. */
  show(title: string, items: readonly ScreenItem[]): void {
    for (const button of this.buttons) button.destroy();
    const centre = this.scene.scale.width / 2;
    this.buttons = items.map((item, k) => {
      const button = textButton(
        this.scene,
        centre + BUTTON_WIDTH / 2,
        FIRST_TOP + k * ROW,
        item.label,
        item.onPick,
      )
        .setFixedSize(BUTTON_WIDTH, 0)
        .setAlign('center')
        .setDepth(DEPTH + 1);
      if (item.locked) button.disableInteractive().setColor(PALETTE.textMuted).setAlpha(0.6);
      return button;
    });
    this.title.setText(title);
    this.setVisible(true);
  }

  hide(): void {
    for (const button of this.buttons) button.destroy();
    this.buttons = [];
    this.setVisible(false);
  }

  private setVisible(visible: boolean): void {
    this.backdrop.setVisible(visible);
    this.title.setVisible(visible);
  }
}
