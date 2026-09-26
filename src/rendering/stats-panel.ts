import type Phaser from 'phaser';
import { LONG_FRAME_MS, type FrameRecord } from './frame-times';
import { addMonoFont } from './mono-font';

/** Where things go on the panel, in game px from its top-left corner. */
const WIDTH = 700;
const PADDING = 12;
const FONT_SIZE = 16;
const LINE_HEIGHT = 20;
/** Room for this many lines of readings. */
const MAX_LINES = 8;
const GRAPH_HEIGHT = 90;
/** The graph's height covers frames up to this long; longer ones get a red cap. */
const GRAPH_MAX_MS = 50;
const FOOTER_HEIGHT = 28;
const TEXT_TOP = PADDING;
const GRAPH_TOP = TEXT_TOP + MAX_LINES * LINE_HEIGHT + 8;
const LEGEND_TOP = GRAPH_TOP + GRAPH_HEIGHT + 6;
const FOOTER_TOP = LEGEND_TOP + LINE_HEIGHT + 6;
const HEIGHT = FOOTER_TOP + FOOTER_HEIGHT + PADDING;
/** The Copy readings button. */
const BUTTON = { x: PADDING, y: FOOTER_TOP, width: 210, height: FOOTER_HEIGHT };
const DEPTH = 102;

/** Where each frame's time went, bottom to top. */
const PHASES = [
  { name: 'physics', color: 0x62d98b },
  { name: 'draw', color: 0x5aa9ff },
  { name: 'render', color: 0xffc15a },
  { name: 'other', color: 0x6f7684 },
] as const;
const TEXT_COLOR = 0x39ff88;
const MUTED_COLOR = 0x9aa0ad;
const OVER_COLOR = 0xff5a5a;
const GUIDE_COLOR = 0xe8e2d0;

/**
 * The F1 stats panel: the readings as text and the recent frames as a graph
 * of stacked bars (physics, draw, render and the rest), with guides at 60 fps
 * and at 33 ms, and a Copy readings button.
 *
 * Built so that showing it costs next to nothing: its text is BitmapText in
 * one font texture uploaded once, and its graph is plain rectangles, redrawn
 * only when the readings refresh. A Text or a canvas texture would be
 * re-uploaded on each refresh, and an HTML element over the game's canvas
 * makes the browser composite the canvas again every frame.
 */
export class StatsPanel {
  private readonly parts: Phaser.GameObjects.GameObject[] = [];
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly graph: Phaser.GameObjects.Graphics;
  private readonly status: Phaser.GameObjects.BitmapText;
  private statusUntil = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly at: { x: number; y: number },
    onCopy: () => void,
  ) {
    const font = addMonoFont(scene, 'mono-16', FONT_SIZE);
    const { x, y } = at;
    const text = (dx: number, dy: number, value: string, tint: number) =>
      this.add(scene.add.bitmapText(x + dx, y + dy, font, value).setTint(tint));

    // Backing, legend and button: drawn once.
    const frame = this.add(scene.add.graphics());
    frame.fillStyle(0x000000, 0.72).fillRect(x, y, WIDTH, HEIGHT);
    frame
      .fillStyle(0xffffff, 0.04)
      .fillRect(x + PADDING, y + GRAPH_TOP, WIDTH - 2 * PADDING, GRAPH_HEIGHT);
    let legendX = PADDING;
    for (const { name, color } of PHASES) {
      frame.fillStyle(color, 1).fillRect(x + legendX, y + LEGEND_TOP + 5, 10, 10);
      legendX += 14 + text(legendX + 14, LEGEND_TOP, name, MUTED_COLOR).width + 16;
    }
    text(legendX + 8, LEGEND_TOP, `guides: 60 fps, ${LONG_FRAME_MS} ms`, MUTED_COLOR);
    frame
      .fillStyle(0x2c313b, 1)
      .fillRect(x + BUTTON.x, y + BUTTON.y, BUTTON.width, BUTTON.height)
      .lineStyle(1, 0x4f5666, 1)
      .strokeRect(x + BUTTON.x, y + BUTTON.y, BUTTON.width, BUTTON.height);
    text(BUTTON.x + 10, BUTTON.y + 4, 'Copy readings (F3)', 0xe8e2d0);
    text(WIDTH - PADDING, BUTTON.y + 4, 'F1: stats → debug → off', MUTED_COLOR).setOrigin(1, 0);

    this.text = text(PADDING, TEXT_TOP, '', TEXT_COLOR);
    this.status = text(BUTTON.x + BUTTON.width + 12, BUTTON.y + 4, '', TEXT_COLOR);
    this.graph = this.add(scene.add.graphics());

    // Clicks on the panel don't reach the Arena (the scene skips interactive objects).
    const zone = (dx: number, dy: number, width: number, height: number) => {
      const z = this.add(scene.add.zone(x + dx, y + dy, width, height).setOrigin(0));
      z.setInteractive();
      this.zones.push(z);
      return z;
    };
    zone(0, 0, WIDTH, HEIGHT);
    zone(BUTTON.x, BUTTON.y, BUTTON.width, BUTTON.height).on('pointerdown', onCopy);
    this.shown = false;
  }

  set shown(shown: boolean) {
    for (const part of this.parts)
      (part as unknown as Phaser.GameObjects.Components.Visible).setVisible(shown);
    for (const zone of this.zones) zone.input!.enabled = shown;
  }

  /** Shows `lines` and the graph of `frames` (oldest first), of at most `capacity` frames. */
  show(lines: readonly string[], frames: readonly FrameRecord[], capacity: number): void {
    this.text.setText(lines.slice(0, MAX_LINES).join('\n'));
    this.status.setVisible(this.text.visible && performance.now() < this.statusUntil);
    this.drawGraph(frames, capacity);
  }

  /** Shows a short message by the copy button for a moment, from the next refresh. */
  say(message: string): void {
    this.status.setText(message);
    this.statusUntil = performance.now() + 1500;
  }

  destroy(): void {
    for (const part of this.parts) part.destroy();
  }

  private add<T extends Phaser.GameObjects.GameObject & { setDepth(depth: number): T }>(
    part: T,
  ): T {
    this.parts.push(part.setDepth(DEPTH));
    return part;
  }

  private drawGraph(frames: readonly FrameRecord[], capacity: number): void {
    const g = this.graph.clear();
    const left = this.at.x + PADDING;
    const top = this.at.y + GRAPH_TOP;
    const width = WIDTH - 2 * PADDING;
    const bar = width / capacity;
    const y = (ms: number) =>
      top + GRAPH_HEIGHT - (Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS) * GRAPH_HEIGHT;
    // Newest on the right.
    frames.forEach((frame, k) => {
      const x = left + width - (frames.length - k) * bar;
      const other = Math.max(0, frame.ms - frame.physicsMs - frame.drawMs - frame.renderMs);
      let below = 0;
      [frame.physicsMs, frame.drawMs, frame.renderMs, other].forEach((ms, phase) => {
        const height = y(below) - y(below + ms);
        if (height >= 0.5)
          g.fillStyle(PHASES[phase]!.color, 1).fillRect(x, y(below + ms), bar - 0.5, height);
        below += ms;
      });
      if (frame.ms > GRAPH_MAX_MS) g.fillStyle(OVER_COLOR, 1).fillRect(x, top, bar - 0.5, 3);
    });
    g.fillStyle(GUIDE_COLOR, 0.45);
    for (const ms of [1000 / 60, LONG_FRAME_MS]) g.fillRect(left, Math.round(y(ms)), width, 1);
  }
}
