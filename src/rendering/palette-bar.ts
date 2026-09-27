import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import type { Game } from '../game/game';
import { inLineLength } from '../game/ink-table';
import { ERASER_RADIUS, type Tool } from '../input/drawing-input';
import { COLOURS } from '../materials/colour';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { BakedDrawing, bakingGraphics } from './baked-textures';
import { drawInk, INK_HUES } from './ink';
import { FONT_FAMILY, PALETTE } from './palette';

const LEFT = 60;
const TOP = 40;
const WIDTH = 84;
const HEIGHT = 72;
const GAP = 10;
/** Each Colour's gauge: a bar under its swatch, with the Ink left under it. */
const GAUGE_TOP = TOP + HEIGHT + 6;
const GAUGE_HEIGHT = 8;
/** The swatches in order: the five Colours, then the Eraser. */
const TOOLS: readonly Tool[] = [...COLOURS, 'eraser'];

/** A swatch's label: its key and its name. */
const label = (tool: Tool, k: number) => (tool === 'eraser' ? 'E eraser' : `${k + 1} ${tool}`);

/** What the gauges read: each Colour's Tank, and whether Ink costs anything. */
export type Tanks = Pick<Game, 'inkCosts' | 'tank' | 'maximum'>;

/**
 * The palette: one swatch per Colour in the top-left corner, each showing a
 * dab of ink in its texture, its key (1–5) and its name, and one for the
 * Eraser (E), showing its brush. Clicking a swatch picks its tool; the
 * picked one is highlighted. Under each Colour's swatch, a gauge shows its
 * Ink Tank, and the Ink left in Line length; ∞ while Ink costs nothing. The
 * swatches and the gauges are baked into textures, again only when the pick
 * or a gauge changes.
 */
export class PaletteBar {
  private readonly drawing: BakedDrawing;
  private readonly gauges: BakedDrawing;
  /** The Ink left, under each gauge. */
  private readonly amounts: Phaser.GameObjects.Text[];
  private shown: Tool | null = null;
  /** What the gauges show, so they are baked again only when that changes. */
  private shownGauges = '';

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
    this.gauges = new BakedDrawing(scene, {
      x: LEFT,
      y: GAUGE_TOP,
      width: COLOURS.length * (WIDTH + GAP) - GAP,
      height: GAUGE_HEIGHT,
    });
    this.gauges.image.setDepth(60);
    this.amounts = COLOURS.map((_, k) =>
      scene.add
        .text(LEFT + k * (WIDTH + GAP) + WIDTH / 2, GAUGE_TOP + GAUGE_HEIGHT + 2, '', {
          fontFamily: FONT_FAMILY,
          fontSize: '15px',
          color: PALETTE.text,
        })
        .setOrigin(0.5, 0)
        .setDepth(61),
    );
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

  /** Highlights the picked tool, and shows each Colour's Tank. */
  show(picked: Tool, tanks: Tanks): void {
    this.showSwatches(picked);
    this.showGauges(tanks);
  }

  private showSwatches(picked: Tool): void {
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

  /** Each gauge filled as its Tank is, to the nearest half pixel, and the whole units left. */
  private showGauges(tanks: Tanks): void {
    const gauges = COLOURS.map((colour) => {
      if (!tanks.inkCosts) return { filled: 1, amount: '∞' };
      const left = tanks.tank(colour);
      const maximum = tanks.maximum(colour);
      const filled = maximum > 0 ? Math.round((left / maximum) * WIDTH * 2) / (WIDTH * 2) : 0;
      return { filled, amount: String(Math.floor(inLineLength(left) + 1e-6)) };
    });
    const key = gauges.map(({ filled, amount }) => `${filled}:${amount}`).join(' ');
    if (key === this.shownGauges) return;
    this.shownGauges = key;
    const g = bakingGraphics(this.scene);
    gauges.forEach(({ filled, amount }, k) => {
      const x = LEFT + k * (WIDTH + GAP);
      g.fillStyle(0x2c313b, 1);
      g.fillRoundedRect(x, GAUGE_TOP, WIDTH, GAUGE_HEIGHT, 3);
      if (filled > 0) {
        g.fillStyle(INK_HUES[COLOURS[k]!], 1);
        g.fillRoundedRect(x, GAUGE_TOP, Math.max(WIDTH * filled, 2), GAUGE_HEIGHT, 3);
      }
      g.lineStyle(1, 0x4f5666, 1);
      g.strokeRoundedRect(x, GAUGE_TOP, WIDTH, GAUGE_HEIGHT, 3);
      // Text re-renders its texture on every change: touch it only on one.
      const text = this.amounts[k]!;
      if (text.text !== amount) text.setText(amount);
    });
    this.gauges.bake(g);
    g.destroy();
  }

  destroy(): void {
    this.drawing.destroy();
    this.gauges.destroy();
    for (const text of this.amounts) text.destroy();
  }
}

/** The Eraser's brush: a ring the size of what it erases. */
export function drawBrush(g: Phaser.GameObjects.Graphics, centre: Vec2): void {
  g.fillStyle(PALETTE.eraser, 0.15);
  g.fillCircle(centre.x, centre.y, ERASER_RADIUS);
  g.lineStyle(2, PALETTE.eraser, 0.9);
  g.strokeCircle(centre.x, centre.y, ERASER_RADIUS);
}
