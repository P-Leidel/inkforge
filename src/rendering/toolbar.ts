import type Phaser from 'phaser';
import { FONT_FAMILY, PALETTE } from './palette';

const MARGIN = 60;
const GAP = 14;

/** A row of text buttons in the top-right corner. */
export class Toolbar {
  private right: number;

  constructor(private readonly scene: Phaser.Scene) {
    this.right = scene.scale.width - MARGIN;
  }

  addButton(label: string, onClick: () => void): this {
    const button = this.scene.add
      .text(this.right, MARGIN, label, {
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
}
