import Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { GALLERY, type Demo } from '../gallery/gallery';
import { COLOURS, type Colour } from '../materials/colour';
import { DebugOverlay } from '../rendering/debug-overlay';
import { flashRejection } from '../rendering/rejection-flash';
import { Hud } from '../rendering/hud';
import { PaletteBar } from '../rendering/palette-bar';
import { StrokePreview } from '../rendering/stroke-preview';
import { Toolbar } from '../rendering/toolbar';
import { WorldRenderer } from '../rendering/world-renderer';
import { SandboxWorld } from '../sandbox/sandbox-world';
import { BallCannon } from '../stress-tests/ball-cannon';
import { BoxTower } from '../stress-tests/box-tower';
import { PebbleDrop } from '../stress-tests/pebble-drop';
import type { StressTest } from '../stress-tests/stress-test';
import { isClosingStroke } from '../stroke/close-detection';

/** Top edge of the gallery's row of buttons, under the stress-test row. */
const GALLERY_ROW_TOP = 118;

/** Keys 1–5 pick the Colours in palette order. */
const COLOUR_KEYS = new Map(COLOURS.map((colour, k) => [String(k + 1), colour]));

/**
 * The sandbox scene: turns pointer and keyboard input into Sandbox world
 * commands and draws the world's state. Game logic lives in SandboxWorld.
 * The scene remembers the picked Colour and hands it to every command.
 */
export class SandboxScene extends Phaser.Scene {
  private world!: SandboxWorld;
  private worldView!: WorldRenderer;
  private overlay!: DebugOverlay;
  private hud!: Hud;
  private preview!: StrokePreview;
  private palette!: PaletteBar;
  /** The Colour new Strokes are drawn in. */
  private colour: Colour = 'grey';
  /** Whether the pointer is over the game canvas. */
  private pointerInside = false;
  /** Pointer samples of the Stroke being drawn, or null. */
  private stroke: Vec2[] | null = null;
  /** Whether the Stroke being drawn would be refused as an overlapping Object. */
  private strokeRefused = false;
  /** Sample count the refusal was last checked at. */
  private checkedSamples = 0;
  private stressTest: StressTest | null = null;

  constructor() {
    super('sandbox');
  }

  create(): void {
    this.world = new SandboxWorld();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.world.dispose());

    this.worldView = new WorldRenderer(this, this.world);
    this.preview = new StrokePreview(this);
    this.overlay = new DebugOverlay(this, this.world);
    this.hud = new Hud(this, this.world);
    this.palette = new PaletteBar(this, (colour) => (this.colour = colour));
    new Toolbar(this)
      .addButton('Clear', () => this.startStressTest(null))
      .addButton('Pebbles', () => this.startStressTest((world) => new PebbleDrop(world)))
      .addButton('Box tower', () => this.startStressTest((world) => new BoxTower(world)))
      .addButton('Ball cannon', () => this.startStressTest((world) => new BallCannon(world)));
    const gallery = new Toolbar(this, GALLERY_ROW_TOP);
    for (const demo of [...GALLERY].reverse()) {
      gallery.addButton(demo.name, () => this.loadDemo(demo));
    }
    gallery.addLabel('Gallery');

    this.bindKeys();
    this.bindPointer();
  }

  /** Clears the Arena and starts a stress test on it (or none). */
  private startStressTest(create: ((world: SandboxWorld) => StressTest) | null): void {
    this.world.clear();
    this.stressTest = create ? create(this.world) : null;
  }

  /** Clears the Arena and sets up a gallery demo on it. */
  private loadDemo(demo: Demo): void {
    this.world.clear();
    this.stressTest = null;
    demo.build(this.world);
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard!;
    keyboard.on('keydown', (event: KeyboardEvent) => {
      const colour = COLOUR_KEYS.get(event.key);
      if (colour) this.colour = colour;
    });
    keyboard
      .addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      .on('down', () => this.world.togglePause());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1).on('down', () => this.overlay.toggle());
    keyboard.on('keydown-Z', (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.world.undo();
    });
  }

  private bindPointer(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.GAME_OVER, () => (this.pointerInside = true));
    this.input.on(Phaser.Input.Events.GAME_OUT, () => (this.pointerInside = false));
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length > 0) return; // a toolbar button
        const point = { x: pointer.worldX, y: pointer.worldY };
        if (pointer.leftButtonDown()) this.stroke = [point];
        else if (pointer.rightButtonDown()) this.world.releaseAt(point);
      },
    );
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.pointerInside = true;
      this.stroke?.push({ x: pointer.worldX, y: pointer.worldY });
    });
    const finish = () => this.finishStroke();
    this.input.on(Phaser.Input.Events.POINTER_UP, finish);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, finish);
  }

  private finishStroke(): void {
    const stroke = this.stroke;
    if (!stroke) return;
    this.stroke = null;
    const outcome = this.world.submitStroke(stroke, this.colour);
    if (outcome.kind === 'rejected') {
      flashRejection(this, outcome.path, outcome.reason, stroke[stroke.length - 1]!);
    }
  }

  /** Re-checks, at most once per frame, whether the Stroke being drawn would be refused. */
  private updateRefusal(): void {
    const stroke = this.stroke;
    if (!stroke || !isClosingStroke(stroke)) {
      this.strokeRefused = false;
      this.checkedSamples = 0;
      return;
    }
    if (stroke.length === this.checkedSamples) return;
    this.checkedSamples = stroke.length;
    const preview = this.world.previewStroke(stroke);
    this.strokeRefused = preview.kind === 'rejected' && preview.reason === 'overlaps';
  }

  override update(_time: number, deltaMs: number): void {
    this.world.advance(deltaMs / 1000);
    this.stressTest?.update();
    this.worldView.draw();
    this.updateRefusal();
    const pointer = this.input.activePointer;
    this.preview.draw(
      this.stroke,
      this.colour,
      this.strokeRefused,
      this.pointerInside ? { x: pointer.worldX, y: pointer.worldY } : null,
    );
    this.palette.show(this.colour);
    this.overlay.draw();
    this.hud.draw(this.stressTest?.status());
  }
}
