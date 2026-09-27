import Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { GALLERY, type Demo } from '../gallery/gallery';
import { Game } from '../game/game';
import { DrawingInput } from '../input/drawing-input';
import { COLOURS } from '../materials/colour';
import { DebugOverlay } from '../rendering/debug-overlay';
import { FrameRecorder } from '../rendering/frame-times';
import { flashRejection } from '../rendering/rejection-flash';
import { Hud } from '../rendering/hud';
import type { Menu } from '../rendering/menu';
import { PaletteBar } from '../rendering/palette-bar';
import { StrokePreview } from '../rendering/stroke-preview';
import { Toolbar } from '../rendering/toolbar';
import { TuningPanel } from '../rendering/tuning-panel';
import { WorldRenderer } from '../rendering/world-renderer';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { BallCannon } from '../stress-tests/ball-cannon';
import { BoxTower } from '../stress-tests/box-tower';
import { PebbleDrop } from '../stress-tests/pebble-drop';
import type { StressTest } from '../stress-tests/stress-test';

/** Keys 1–5 pick the Colours in palette order. */
const COLOUR_KEYS = new Map(COLOURS.map((colour, k) => [String(k + 1), colour]));

/**
 * The sandbox scene: forwards pointer and tool events to drawing input,
 * which turns them into commands to the Game, and draws the Sandbox world's
 * state, the Ink Tanks and what drawing input says to preview and flash. The
 * rules live in the Game and the Sandbox world below it.
 */
export class SandboxScene extends Phaser.Scene {
  /** The rules layer: Phaser's own `game` is the Phaser game. */
  private gameLayer!: Game;
  /** The Sandbox world below the Game: what is drawn, and what demos build on. */
  private world!: SandboxWorld;
  private drawing!: DrawingInput;
  private worldView!: WorldRenderer;
  private overlay!: DebugOverlay;
  private hud!: Hud;
  private preview!: StrokePreview;
  private palette!: PaletteBar;
  private tuning!: TuningPanel;
  private gallery!: Menu;
  private stressTest: StressTest | null = null;
  /** Every frame's timings, for the F1 stats. */
  private readonly frames = new FrameRecorder();

  constructor() {
    super('sandbox');
  }

  create(): void {
    // Ink is unlimited until Ink costs is turned on in F2.
    this.gameLayer = new Game({ inkCosts: false });
    this.world = this.gameLayer.world;
    this.drawing = new DrawingInput(this.gameLayer);
    this.tuning = new TuningPanel(this.world.materials, this.gameLayer);
    this.worldView = new WorldRenderer(this, this.world);
    this.preview = new StrokePreview(this);
    this.overlay = new DebugOverlay(this, this.gameLayer, this.frames, this.worldView);
    // Phaser renders after the scene's update: time it for the frame's record.
    let renderStart = 0;
    const beforeRender = () => (renderStart = performance.now());
    const afterRender = () => this.frames.render(performance.now() - renderStart);
    this.game.events.on(Phaser.Core.Events.PRE_RENDER, beforeRender);
    this.game.events.on(Phaser.Core.Events.POST_RENDER, afterRender);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.PRE_RENDER, beforeRender);
      this.game.events.off(Phaser.Core.Events.POST_RENDER, afterRender);
      this.overlay.destroy();
      this.worldView.destroy();
      this.palette.destroy();
      this.tuning.destroy();
      this.gameLayer.dispose();
    });
    this.hud = new Hud(this, this.world);
    this.palette = new PaletteBar(this, (tool) => this.drawing.pick(tool));
    const toolbar = new Toolbar(this);
    this.gallery = toolbar.addMenu(
      'Gallery',
      GALLERY.map((demo) => ({ label: demo.name, onPick: () => this.loadDemo(demo) })),
    );
    toolbar
      .addButton('Clear', () => this.startStressTest('Sandbox', null))
      .addButton('Pebbles', () => this.startStressTest('Pebbles', (world) => new PebbleDrop(world)))
      .addButton('Box tower', () =>
        this.startStressTest('Box tower', (world) => new BoxTower(world)),
      )
      .addButton('Ball cannon', () =>
        this.startStressTest('Ball cannon', (world) => new BallCannon(world)),
      );

    this.bindKeys();
    this.bindPointer();
  }

  /** Clears the Arena, fills the Tanks and starts a stress test on it (or none). */
  private startStressTest(
    name: string,
    create: ((world: SandboxWorld) => StressTest) | null,
  ): void {
    this.stressTest = null;
    this.gameLayer.clear(create ? (world) => (this.stressTest = create(world)) : undefined);
    this.overlay.setSceneName(name);
    this.frames.sinceStart.restart();
  }

  /** Clears the Arena, fills the Tanks and sets up a gallery demo on it. */
  private loadDemo(demo: Demo): void {
    this.stressTest = null;
    this.gameLayer.clear((world) => demo.build(world));
    this.overlay.setSceneName(demo.name);
    this.frames.sinceStart.restart();
  }

  /** Takes the world and the Tanks back to the last start; the replay is timed on its own. */
  private reset(): void {
    this.gameLayer.reset();
    this.frames.sinceStart.restart();
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard!;
    keyboard.on('keydown', (event: KeyboardEvent) => {
      const colour = COLOUR_KEYS.get(event.key);
      if (colour) this.drawing.pick(colour);
      else if (event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey) {
        this.drawing.pick('eraser');
      }
    });
    keyboard
      .addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      .on('down', () => this.gameLayer.togglePause());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1).on('down', () => this.overlay.cycle());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F2).on('down', () => this.tuning.toggle());
    keyboard
      .addKey(Phaser.Input.Keyboard.KeyCodes.F3)
      .on('down', () => void this.overlay.copyReadings());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R).on('down', () => this.reset());
    keyboard.on('keydown-Z', (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.drawing.undo();
    });
  }

  private bindPointer(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.drawing.leave());
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length > 0) return; // a toolbar button
        // A click beside the open gallery only closes it.
        if (this.gallery.isOpen) {
          this.gallery.close();
          return;
        }
        if (pointer.leftButtonDown()) this.drawing.press(at(pointer), 'left');
        else if (pointer.rightButtonDown()) this.drawing.press(at(pointer), 'right');
      },
    );
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) =>
      this.drawing.move(at(pointer)),
    );
    const release = () => {
      const flash = this.drawing.release();
      if (flash) flashRejection(this, flash.path, flash.message, flash.pointer);
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  }

  override update(_time: number, deltaMs: number): void {
    // Phaser smooths `deltaMs` over several frames, which would hide a long one.
    this.frames.begin(this.game.loop.rawDelta, this.world.isRunning);
    this.drawing.tick();
    const start = performance.now();
    const steps = this.gameLayer.advance(deltaMs / 1000);
    this.frames.physics(performance.now() - start, steps);
    this.stressTest?.update();
    const drawStart = performance.now();
    this.worldView.draw();
    const preview = this.drawing.preview();
    if (preview.kind === 'brush') this.preview.drawBrush(preview.pointer);
    else this.preview.draw(preview.samples, preview.colour, preview.refused, preview.pointer);
    this.palette.show(this.drawing.tool, this.gameLayer);
    this.overlay.draw();
    this.hud.draw(this.stressTest?.status());
    this.frames.draw(performance.now() - drawStart);
  }
}

/** Where the pointer is in the world. */
function at(pointer: Phaser.Input.Pointer): Vec2 {
  return { x: pointer.worldX, y: pointer.worldY };
}
