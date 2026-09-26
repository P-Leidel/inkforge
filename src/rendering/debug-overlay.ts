import Phaser from 'phaser';
import { transformPoints } from '../geometry/transform';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { bandPolygon } from '../geometry/separation';
import { strokePolygon, strokeRing } from './draw';
import type { FrameRecorder } from './frame-times';
import { PALETTE } from './palette';
import { readingLines, type Readings } from './readings';
import { StatsPanel } from './stats-panel';

/** F1 cycles through these. */
const LEVELS = ['off', 'stats', 'debug'] as const;
type Level = (typeof LEVELS)[number];

/** The stats panel is refreshed this often, ms. */
const REFRESH_MS = 250;
/** Where the stats panel's top-left corner sits, in game px: under the palette. */
const PANEL_AT = { x: 60, y: 180 };

/** The durability labels' bitmap font, built once per game. */
const LABEL_FONT = 'debug-labels';
const LABEL_CHARS = ' 0123456789×/';
const LABEL_CELL = { width: 9, height: 18 };

/** Sides of the polygons Rubble colliders and Blast rings are drawn as. */
const RUBBLE_SIDES = 12;
const BLAST_SIDES = 48;
/** Dots along a Blast's reach, and their size, px. */
const REACH_DOTS = 48;
const REACH_DOT = 3;

/**
 * The F1 overlay, in two levels. **Stats**: a plain HTML panel with the
 * frame rate, the longest frames, where each frame's time goes, bodies by
 * kind and the render load, refreshed four times a second; it costs the
 * WebGL renderer nothing, so it can stay on while measuring. **Debug** adds
 * collider outlines, each Piece's and Object's durability and Blast rings
 * with their full reach; Rubble never breaks, so it gets no label. The
 * labels share one bitmap font texture. F3 copies the readings.
 */
export class DebugOverlay {
  private readonly colliders: Phaser.GameObjects.Graphics;
  /** Durability labels, reused from frame to frame. */
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private readonly panel: StatsPanel;
  private level: Level = 'off';
  private lastRefresh = -Infinity;
  private sceneName = 'Sandbox';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: SandboxWorld,
    private readonly frames: FrameRecorder,
  ) {
    this.colliders = scene.add.graphics().setDepth(100);
    this.panel = new StatsPanel(() => void this.copyReadings());
    addLabelFont(scene);
    this.setLevel('off');
  }

  /** Off → stats → debug → off. */
  cycle(): void {
    this.setLevel(LEVELS[(LEVELS.indexOf(this.level) + 1) % LEVELS.length]!);
  }

  /** Names what is loaded (a demo or a stress test), for the copied readings. */
  setSceneName(name: string): void {
    this.sceneName = name;
  }

  destroy(): void {
    this.panel.destroy();
  }

  private setLevel(level: Level): void {
    this.level = level;
    this.panel.shown = level !== 'off';
    this.lastRefresh = -Infinity;
    const debug = level === 'debug';
    this.colliders.setVisible(debug);
    if (!debug) {
      this.colliders.clear();
      for (const label of this.labels) label.setVisible(false);
    }
  }

  private label(k: number): Phaser.GameObjects.BitmapText {
    let label = this.labels[k];
    if (!label) {
      label = this.scene.add.bitmapText(0, 0, LABEL_FONT, '').setOrigin(0.5).setDepth(101);
      this.labels[k] = label;
    }
    return label;
  }

  /** Draws the overlay for this frame. */
  draw(): void {
    if (this.level === 'off') return;
    if (this.level === 'debug') this.drawDebug();
    const now = performance.now();
    if (now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const canvas = this.scene.game.canvas.getBoundingClientRect();
    this.panel.show(readingLines(this.readings()), this.frames.recent.records, {
      x: canvas.left + (PANEL_AT.x * canvas.width) / this.scene.scale.width,
      y: canvas.top + (PANEL_AT.y * canvas.height) / this.scene.scale.height,
    });
  }

  private drawDebug(): void {
    const g = this.colliders;
    g.clear();
    g.lineStyle(2, PALETTE.debug, 1);
    for (const polygon of this.world.arena.terrain) strokePolygon(g, polygon);
    const lines = this.world.lines;
    // Each Piece's capsules as one outline (their union, with flat ends), not a path per capsule.
    for (const line of lines) {
      for (const { segments } of line.pieces) {
        strokePolygon(g, bandPolygon(segments, line.thickness / 2));
      }
    }
    for (const { transform: t, radius } of this.world.rubble) {
      strokeRing(g, t, radius, RUBBLE_SIDES);
      // A spoke, to show it rolling.
      g.lineBetween(t.x, t.y, t.x + radius * Math.cos(t.angle), t.y + radius * Math.sin(t.angle));
    }
    g.fillStyle(PALETTE.debug, 1);
    for (const { centre, radius, reach } of this.world.blasts) {
      strokeRing(g, centre, radius, BLAST_SIDES);
      // Its reach, dotted.
      for (let k = 0; k < REACH_DOTS; k++) {
        const turn = (2 * Math.PI * k) / REACH_DOTS;
        g.fillRect(
          centre.x + reach * Math.cos(turn) - REACH_DOT / 2,
          centre.y + reach * Math.sin(turn) - REACH_DOT / 2,
          REACH_DOT,
          REACH_DOT,
        );
      }
    }
    let k = 0;
    for (const line of lines) {
      for (const piece of line.pieces) {
        // At the middle of the Piece's middle capsule.
        const { a, b } = piece.segments[Math.floor(piece.segments.length / 2)]!;
        const middle =
          piece.segments.length % 2 === 0 ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.label(k++)
          .setText(` ${Math.ceil(piece.durability)} `)
          .setPosition(middle.x, middle.y)
          .setVisible(true);
      }
    }
    for (const object of this.world.objects) {
      for (const part of object.parts) strokePolygon(g, transformPoints(part, object.transform));
      // The impact count, for Colours that break on a number of impacts (blue).
      const limit = this.world.materials.colours[object.colour].outline.impactLimit;
      const impacts = limit > 0 ? ` ×${object.impacts}/${limit}` : '';
      this.label(k++)
        .setText(` ${Math.ceil(object.durability)}${impacts} `)
        .setPosition(object.transform.x, object.transform.y)
        .setVisible(true);
    }
    for (; k < this.labels.length; k++) this.labels[k]!.setVisible(false);
  }

  private readings(): Readings {
    const world = this.world;
    let pieces = 0;
    for (const line of world.lines) pieces += line.pieces.length;
    let graphics = 0;
    let commands = 0;
    let texts = 0;
    const list = this.scene.children.list;
    for (const child of list) {
      if (child instanceof Phaser.GameObjects.Graphics && child.visible) {
        graphics++;
        commands += child.commandBuffer.length;
      } else if (child instanceof Phaser.GameObjects.Text && child.visible) {
        texts++;
      }
    }
    return {
      recent: this.frames.recent.summary(),
      sinceStart: this.frames.sinceStart,
      bodies: {
        total: world.bodyCount,
        pieces,
        objects: world.objects.length,
        rubble: world.rubble.length,
        droplets: world.droplets.length,
        patches: world.patches.length,
        blasts: world.blasts.length,
        debris: world.debrisParticles.length,
      },
      render: { graphics, commands, texts, objects: list.length },
    };
  }

  /** Copies the readings, with the browser, GPU and screen, ready to paste into an issue. */
  async copyReadings(): Promise<void> {
    const game = this.scene.game;
    const canvas = game.canvas.getBoundingClientRect();
    const text = [
      `Inkforge readings, ${new Date().toISOString()}`,
      `scene        ${this.sceneName}, ${this.world.isRunning ? 'running' : 'paused'}`,
      `browser      ${navigator.userAgent}`,
      `GPU          ${gpuName(game.renderer)}`,
      `screen       ${this.scene.scale.width}×${this.scene.scale.height} shown at ` +
        `${Math.round(canvas.width)}×${Math.round(canvas.height)} css px, ` +
        `devicePixelRatio ${window.devicePixelRatio}`,
      ...readingLines(this.readings()),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.panel.say('Copied');
    } catch {
      // No clipboard access: show the readings to copy by hand.
      window.prompt('Copy the readings:', text);
    }
  }
}

/** The GPU's name as the browser reports it, where it does. */
function gpuName(
  renderer: Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer | null,
): string {
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return 'none (Canvas renderer)';
  const gl = renderer.gl;
  // Firefox reports the unmasked name through RENDERER and deprecates the extension.
  const info = navigator.userAgent.includes('Firefox')
    ? null
    : gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}

/**
 * Builds the durability labels' bitmap font once: a monospace glyph per cell
 * on the labels' dark backing, so a row of glyphs reads as one label.
 */
function addLabelFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(LABEL_FONT)) return;
  const { width, height } = LABEL_CELL;
  const texture = scene.textures.createCanvas(LABEL_FONT, width * LABEL_CHARS.length, height)!;
  const g = texture.getContext();
  g.font = '14px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...LABEL_CHARS].forEach((char, k) => {
    g.fillStyle = 'rgba(0, 0, 0, 0.67)';
    g.fillRect(k * width, 0, width, height);
    g.fillStyle = '#39ff88';
    g.fillText(char, k * width + width / 2, height / 2 + 1);
  });
  texture.refresh();
  scene.cache.bitmapFont.add(
    LABEL_FONT,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: LABEL_FONT,
      width,
      height,
      chars: LABEL_CHARS,
      charsPerRow: LABEL_CHARS.length,
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 0,
    }),
  );
}
