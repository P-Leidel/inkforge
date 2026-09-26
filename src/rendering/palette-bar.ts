import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { BakedDrawing, bakingGraphics } from './baked-textures';
import { drawInk } from './ink';
import { FONT_FAMILY, PALETTE } from './palette';

const LEFT = 60;
const TOP = 40;
const WIDTH = 84;
const HEIGHT = 72;
const GAP = 10;
/** Radius (px) of the Eraser's brush, shown on its swatch and at the pointer. */
export const ERASER_RADIUS = 12;

/** What the pointer does: draw and fill in a Colour, or erase. */
export type Tool = Colour | 'eraser';

/** The swatches in order: the five Colours, then the Eraser. */
const TOOLS: readonly Tool[] = [...COLOURS, 'eraser'];

/** A swatch's label: its key and its name. */
const label = (tool: Tool, k: number) => (tool === 'eraser' ? 'E eraser' : `${k + 1} ${tool}`);

/**
 * The palette: one swatch per Colour in the top-left corner, each showing a
 * dab of ink in its texture, its key (1–5) and its name, and one for the
 * Eraser (E), showing its brush. Clicking a swatch picks its tool; the
 * picked one is highlighted. The swatches are baked into a texture, again
 * only when the pick changes.
 */
export class PaletteBar {
  private readonly drawing: BakedDrawing;
  private shown: Tool | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    onPick: (tool: Tool) => void,
  ) {
    // With room for the highlight's border.
    this.drawing = new BakedDrawing(scene, {
      x: LEFT - 2,
      y: TOP - 2,
      width: TOOLS.length * (WIDTH + GAP) - GAP + 4,
      height: HEIGHT + 4,
    });
    this.drawing.image.setDepth(60);
    TOOLS.forEach((tool, k) => {
      const x = LEFT + k * (WIDTH + GAP);
      const cx = x + WIDTH / 2;
      scene.add
        .text(cx, TOP + HEIGHT - 6, label(tool, k), {
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
          if (pointer.leftButtonDown()) onPick(tool);
        });
    });
  }

  /** Highlights the picked tool. */
  show(picked: Tool): void {
    if (picked === this.shown) return;
    this.shown = picked;
    const g = bakingGraphics(this.scene);
    TOOLS.forEach((tool, k) => {
      const x = LEFT + k * (WIDTH + GAP);
      const selected = tool === picked;
      g.fillStyle(selected ? 0x3b4250 : 0x2c313b, 1);
      g.fillRoundedRect(x, TOP, WIDTH, HEIGHT, 8);
      if (selected) {
        g.lineStyle(3, PALETTE.selection, 1);
        g.strokeRoundedRect(x, TOP, WIDTH, HEIGHT, 8);
      }
      const cx = x + WIDTH / 2;
      if (tool === 'eraser') {
        drawBrush(g, { x: cx, y: TOP + 27 });
        return;
      }
      drawInk(
        g,
        tool,
        [
          { x: cx - 24, y: TOP + 32 },
          { x: cx - 8, y: TOP + 20 },
          { x: cx + 8, y: TOP + 34 },
          { x: cx + 24, y: TOP + 22 },
        ],
        false,
        LINE_THICKNESS,
      );
    });
    this.drawing.bake(g);
    g.destroy();
  }

  destroy(): void {
    this.drawing.destroy();
  }
}

/** The Eraser's brush: a ring the size of what it erases. */
export function drawBrush(g: Phaser.GameObjects.Graphics, centre: Vec2): void {
  g.fillStyle(PALETTE.eraser, 0.15);
  g.fillCircle(centre.x, centre.y, ERASER_RADIUS);
  g.lineStyle(2, PALETTE.eraser, 0.9);
  g.strokeCircle(centre.x, centre.y, ERASER_RADIUS);
}
