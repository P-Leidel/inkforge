import type Phaser from 'phaser';
import { FONT_FAMILY, PALETTE } from './palette';

const MARGIN = 60;
const GAP = 14;

/** A row of text buttons along the top-right corner, laid out from the right. */
export class Toolbar {
  private right: number;

  /** `top`: y of the row's top edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly top = MARGIN,
  ) {
    this.right = scene.scale.width - MARGIN;
  }

  addButton(label: string, onClick: () => void): this {
    const button = this.scene.add
      .text(this.right, this.top, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: PALETTE.text,
        backgroundColor: '#2c313b',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(1, 0)
      .setDepth(60)
      .setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setBackgroundColor('#3b4250'));
    button.on('pointerout', () => button.setBackgroundColor('#2c313b'));
    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) onClick();
    });
    this.right -= button.width + GAP;
    return this;
  }

  /** A caption left of the buttons added so far. */
  addLabel(text: string): this {
    const label = this.scene.add
      .text(this.right, this.top + 10, text, {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: PALETTE.textMuted,
      })
      .setOrigin(1, 0)
      .setDepth(60);
    this.right -= label.width + GAP;
    return this;
  }
}
