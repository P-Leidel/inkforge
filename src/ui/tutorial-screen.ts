import type Phaser from 'phaser';
import type { Tutorial, TutorialCard } from '../game/tutorial';
import { INK_HUES } from '../rendering/ink';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';

/** The line at the foot of card `index` (from 0) of `count`: where it stands and the keys. */
export function tutorialFooter(index: number, count: number): string {
  const last = index + 1 === count;
  return `${index + 1} / ${count}    Space or click: ${last ? 'close' : 'next'}    Esc: skip    H: show again`;
}

/** Above the rewards screen, below a menu screen. */
const DEPTH = 80;
const WIDTH = 900;
const PADDING = 48;
/** Space between the title, the text, the swatches and the footer, top to bottom. */
const GAP = 28;
const SWATCH = 36;
const SWATCH_GAP = 40;

/**
 * The Tutorial's card: a panel in the middle of the Arena, over the
 * rewards screen, with the card's title, its text, its swatches and a
 * footer. It shows whatever the Tutorial shows; it takes no clicks itself,
 * the scene turns the cards.
 */
export class TutorialScreen {
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly footer: Phaser.GameObjects.Text;
  private readonly swatches: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  /** What it shows, so it is redrawn only on a change: the card's index, or -1 while closed. */
  private shown = -1;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.panel = scene.add
      .rectangle(width / 2, height / 2, WIDTH, 0, 0x16171b, 1)
      .setStrokeStyle(2, 0x4f5666)
      .setDepth(DEPTH);
    this.title = scene.add
      .text(width / 2, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        color: PALETTE.text,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH + 1);
    this.body = scene.add
      .text(width / 2, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        color: PALETTE.text,
        align: 'center',
        lineSpacing: 8,
        wordWrap: { width: WIDTH - 2 * PADDING },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH + 1);
    this.footer = scene.add
      .text(width / 2, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: PALETTE.textMuted,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH + 1);
    this.swatches = scene.add.graphics().setDepth(DEPTH + 1);
    this.setVisible(false);
  }

  draw(tutorial: Tutorial): void {
    const shown = tutorial.shown;
    const key = shown?.index ?? -1;
    if (key === this.shown) return;
    this.shown = key;
    this.setVisible(shown !== null);
    if (!shown) return;
    const { card, index, count } = shown;
    this.title.setText(card.title);
    this.body.setText(card.body);
    this.footer.setText(tutorialFooter(index, count));
    this.layOut(card.swatches);
  }

  /** Stacks the title, the text, the swatches if any and the footer, and sizes the panel to them. */
  private layOut(swatches: TutorialCard['swatches']): void {
    const row = swatches.length > 0 ? SWATCH + GAP : 0;
    const height =
      2 * PADDING + this.title.height + this.body.height + this.footer.height + 2 * GAP + row;
    this.panel.setSize(WIDTH, height);
    let y = this.panel.y - height / 2 + PADDING;
    this.title.setY(y);
    y += this.title.height + GAP;
    this.body.setY(y);
    y += this.body.height + GAP;
    this.drawSwatches(swatches, y);
    this.footer.setY(y + row);
  }

  /** A chip of each swatch's Colour with its label, in a row centred at `y` from the top. */
  private drawSwatches(swatches: TutorialCard['swatches'], y: number): void {
    this.swatches.clear();
    for (const label of this.labels) label.destroy();
    this.labels.length = 0;
    if (swatches.length === 0) return;
    const items = swatches.map(({ colour, label }) => {
      const text = this.scene.add
        .text(0, y + SWATCH / 2, label, {
          fontFamily: FONT_FAMILY,
          fontSize: '22px',
          color: PALETTE.text,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH + 1);
      this.labels.push(text);
      return { colour, text, width: SWATCH + 12 + text.width };
    });
    const total =
      items.reduce((sum, item) => sum + item.width, 0) + SWATCH_GAP * (items.length - 1);
    let left = this.panel.x - total / 2;
    for (const { colour, text, width } of items) {
      this.swatches.fillStyle(INK_HUES[colour], 1).fillRect(left, y, SWATCH, SWATCH);
      this.swatches.lineStyle(2, 0x8a909e, 1).strokeRect(left, y, SWATCH, SWATCH);
      text.setX(left + SWATCH + 12);
      left += width + SWATCH_GAP;
    }
  }

  private setVisible(visible: boolean): void {
    this.panel.setVisible(visible);
    this.title.setVisible(visible);
    this.body.setVisible(visible);
    this.footer.setVisible(visible);
    this.swatches.setVisible(visible);
    for (const label of this.labels) label.setVisible(visible);
  }
}
