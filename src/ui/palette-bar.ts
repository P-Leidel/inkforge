import type Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import type { CostEstimate } from '../game/game';
import type { Frame } from '../game/session';
import { ERASER_RADIUS, type Tool } from '../input/drawing-input';
import { COLOURS, type Colour } from '../materials/colour';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { BakedDrawing, bakingGraphics } from '../rendering/baked-textures';
import { drawInk, INK_HUES } from '../rendering/ink';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';

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

/** The left edge of the swatch in `slot`, from 0 at the left. */
const slotX = (slot: number) => LEFT + slot * (WIDTH + GAP);

/** What the gauges read: each Colour's Tank, whether Ink costs anything, and the Level's Colours. */
export type Tanks = Pick<Frame, 'inkCosts' | 'tanks' | 'colours'>;

/** What the palette reads of the frame: the Tanks, and what is on hand (`allowed`). */
export type PaletteFrame = Tanks & Pick<Frame, 'allowed'>;

/** What one gauge draws. */
export interface GaugeView {
  /** How full it is, 0–1, to the nearest half pixel. */
  readonly filled: number;
  /** The pending cost, greyed out at the top of `filled`, to the nearest half pixel. */
  readonly pending: number;
  /** Whether the pending cost is more than can be spent, so all that can is red. */
  readonly over: boolean;
  /** The whole units that can be spent, under it; ∞ while Ink costs nothing. */
  readonly amount: string;
  /**
   * Whether the Level has this Colour: with Ink costs on, a Tank maximum of
   * 0 means it doesn't, and its swatch and gauge are hidden. With Ink costs
   * off, every Colour is on hand.
   */
  readonly inLevel: boolean;
}

/**
 * What each Colour's gauge draws, in palette order: its Tank's reading
 * rounded to what the gauge can show, and `cost` on its own Colour's gauge, clamped to what can be spent. The
 * gauges are baked again only when this changes.
 */
export function gaugeViews(tanks: Tanks, cost: CostEstimate | null): GaugeView[] {
  const halfPixels = (ink: number, maximum: number) =>
    maximum > 0 ? Math.round((ink / maximum) * WIDTH * 2) / (WIDTH * 2) : 0;
  const readings = tanks.tanks;
  return COLOURS.map((colour) => {
    const { spendable, maximum, units } = readings[colour];
    const inLevel = tanks.colours.includes(colour);
    if (!inLevel) return { filled: 0, pending: 0, over: false, amount: '', inLevel };
    if (!tanks.inkCosts) return { filled: 1, pending: 0, over: false, amount: '∞', inLevel };
    const filled = halfPixels(spendable, maximum);
    const priced = cost?.colour === colour ? cost : null;
    const pending = priced ? Math.min(filled, halfPixels(priced.price, maximum)) : 0;
    const over = priced?.over ?? false;
    return { filled, pending, over, amount: String(units), inLevel };
  });
}

/**
 * The palette: one swatch per Colour the Level has in the top-left corner,
 * side by side in palette order, each showing a dab of ink in its texture,
 * its key (1–5) and its name, and one for the Eraser (E), showing its
 * brush, unless the Eraser is put away. Clicking a swatch picks its tool; the
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
  /** What the swatches show, so they are baked again only when that changes. */
  private shown = '';
  /** What the gauges show, so they are baked again only when that changes. */
  private shownGauges = '';
  /** Each tool's label and the zone that picks it, in TOOLS order, moved to its slot or shut while it is hidden. */
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  /** Each Colour's slot, from 0 at the left, in palette order; null while it is hidden. */
  private slots: (number | null)[] = COLOURS.map((_, k) => k);

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
      const x = slotX(k);
      const cx = x + WIDTH / 2;
      const text = scene.add
        .text(cx, TOP + HEIGHT - 6, label(tool, k), {
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
          color: PALETTE.text,
        })
        .setOrigin(0.5, 1)
        .setDepth(61);
      const zone = scene.add
        .zone(x, TOP, WIDTH, HEIGHT)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (pointer.leftButtonDown()) onPick(tool);
        });
      this.labels.push(text);
      this.zones.push(zone);
    });
  }

  /**
   * The middle of `colour`'s gauge, on screen: where a Drop's dots of it fly
   * to. A hidden Colour's is where it would be with every Colour shown.
   */
  gaugeCentre(colour: Colour): Vec2 {
    const k = COLOURS.indexOf(colour);
    return { x: slotX(this.slots[k] ?? k) + WIDTH / 2, y: GAUGE_TOP + GAUGE_HEIGHT / 2 };
  }

  /**
   * Highlights the picked tool, and shows each Colour's Tank, with `cost`
   * greyed out at the top of its Colour's gauge, red if it is more than is
   * left. Only the Colours the Level has are shown, and the Eraser's swatch
   * only while the Game's `allowed` has it on hand.
   */
  show(picked: Tool, frame: PaletteFrame, cost: CostEstimate | null = null): void {
    const gauges = gaugeViews(frame, cost);
    this.showSwatches(
      picked,
      gauges.map((gauge) => gauge.inLevel),
      frame.allowed.eraser,
    );
    this.showGauges(gauges);
  }

  /**
   * The swatches of the Colours the Level has, side by side, then the
   * Eraser's, only if `eraser`; each label and zone moved to its slot, and
   * a hidden tool's shut.
   */
  private showSwatches(picked: Tool, inLevel: readonly boolean[], eraser: boolean): void {
    const key = `${picked} ${inLevel.join()} ${eraser}`;
    if (key === this.shown) return;
    this.shown = key;
    let next = 0;
    this.slots = inLevel.map((has) => (has ? next++ : null));
    const toolSlots = [...this.slots, eraser ? next : null];
    const g = bakingGraphics(this.scene);
    TOOLS.forEach((tool, k) => {
      const slot = toolSlots[k] ?? null;
      const label = this.labels[k]!;
      const zone = this.zones[k]!;
      label.setVisible(slot !== null);
      if (zone.input) zone.input.enabled = slot !== null;
      if (slot === null) return;
      const x = slotX(slot);
      label.setX(x + WIDTH / 2);
      zone.setX(x);
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

  /**
   * Each shown Colour's gauge, under its swatch, filled as its Tank is, to
   * the nearest half pixel, and the whole units left.
   */
  private showGauges(gauges: readonly GaugeView[]): void {
    const key = gauges
      .map(({ filled, pending, over, amount }, k) => {
        return `${this.slots[k]}:${filled}:${pending}:${over}:${amount}`;
      })
      .join(' ');
    if (key === this.shownGauges) return;
    this.shownGauges = key;
    const g = bakingGraphics(this.scene);
    gauges.forEach(({ filled, pending, over, amount }, k) => {
      const slot = this.slots[k];
      const text = this.amounts[k]!;
      text.setVisible(slot !== null);
      if (slot === null || slot === undefined) return;
      const x = slotX(slot);
      g.fillStyle(0x2c313b, 1);
      g.fillRoundedRect(x, GAUGE_TOP, WIDTH, GAUGE_HEIGHT, 3);
      if (filled > 0) {
        g.fillStyle(INK_HUES[COLOURS[k]!], 1);
        g.fillRoundedRect(x, GAUGE_TOP, Math.max(WIDTH * filled, 2), GAUGE_HEIGHT, 3);
      }
      // The pending cost, greyed out at the top of what is left; all that can be spent red when over.
      if (over) {
        g.fillStyle(PALETTE.rejected, 1);
        g.fillRect(x, GAUGE_TOP, Math.max(WIDTH * filled, 2), GAUGE_HEIGHT);
      } else if (pending > 0) {
        g.fillStyle(0x8a8f99, 0.85);
        g.fillRect(x + WIDTH * (filled - pending), GAUGE_TOP, WIDTH * pending, GAUGE_HEIGHT);
      }
      g.lineStyle(1, 0x4f5666, 1);
      g.strokeRoundedRect(x, GAUGE_TOP, WIDTH, GAUGE_HEIGHT, 3);
      // Text re-renders its texture on every change: touch it only on one.
      if (text.x !== x + WIDTH / 2) text.setX(x + WIDTH / 2);
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
