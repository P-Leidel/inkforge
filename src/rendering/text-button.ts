import type Phaser from 'phaser';
import { FONT_FAMILY, PALETTE } from './palette';

const BUTTON_COLOUR = '#2c313b';
const HOVER_COLOUR = '#3b4250';

/** A text button with its top-right corner at (`right`, `top`). */
export function textButton(
  scene: Phaser.Scene,
  right: number,
  top: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Text {
  const button = scene.add
    .text(right, top, label, {
      fontFamily: FONT_FAMILY,
      fontSize: '22px',
      color: PALETTE.text,
      backgroundColor: BUTTON_COLOUR,
      padding: { x: 12, y: 10 },
    })
    .setOrigin(1, 0)
    .setDepth(60)
    .setInteractive({ useHandCursor: true });
  button.on('pointerover', () => button.setBackgroundColor(HOVER_COLOUR));
  button.on('pointerout', () => button.setBackgroundColor(BUTTON_COLOUR));
  button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pointer.leftButtonDown()) onClick();
  });
  return button;
}
