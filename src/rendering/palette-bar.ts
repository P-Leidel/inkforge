import type Phaser from 'phaser';
import { COLOURS, type Colour } from '../materials/colour';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { drawInk } from './ink';
import { FONT_FAMILY, PALETTE } from './palette';

const LEFT = 60;
const TOP = 40;
const WIDTH = 84;
const HEIGHT = 72;
const GAP = 10;

/**
 * The palette: one swatch per Colour in the top-left corner, each showing a
 * dab of ink in its texture, its key (1–5) and its name. Clicking a swatch
 * picks its Colour; the picked one is highlighted.
 */
export class PaletteBar {
  private readonly frames: Phaser.GameObjects.Graphics;
  private shown: Colour | null = null;

  constructor(scene: Phaser.Scene, onPick: (colour: Colour) => void) {
    this.frames = scene.add.graphics().setDepth(60);
    const swatches = scene.add.graphics().setDepth(61);
    COLOURS.forEach((colour, k) => {
      const x = LEFT + k * (WIDTH + GAP);
      const cx = x + WIDTH / 2;
      drawInk(
        swatches,
        colour,
        [
          { x: cx - 24, y: TOP + 32 },
          { x: cx - 8, y: TOP + 20 },
          { x: cx + 8, y: TOP + 34 },
          { x: cx + 24, y: TOP + 22 },
        ],
        false,
        LINE_THICKNESS,
      );
      scene.add
        .text(cx, TOP + HEIGHT - 6, `${k + 1} ${colour}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
          color: PALETTE.text,
        })
        .setOrigin(0.5, 1)
        .setDepth(61);
      scene.add
        .zone(x, TOP, WIDTH, HEIGHT)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (pointer.leftButtonDown()) onPick(colour);
        });
    });
  }

  /** Highlights the picked Colour. */
  show(picked: Colour): void {
    if (picked === this.shown) return;
    this.shown = picked;
    const g = this.frames;
    g.clear();
    COLOURS.forEach((colour, k) => {
      const x = LEFT + k * (WIDTH + GAP);
      const selected = colour === picked;
      g.fillStyle(selected ? 0x3b4250 : 0x2c313b, 1);
      g.fillRoundedRect(x, TOP, WIDTH, HEIGHT, 8);
      if (selected) {
        g.lineStyle(3, PALETTE.selection, 1);
        g.strokeRoundedRect(x, TOP, WIDTH, HEIGHT, 8);
      }
    });
  }
}
