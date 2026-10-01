import Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { GALLERY } from '../gallery/gallery';
import { Game } from '../game/game';
import { SANDBOX_LEVEL, type Level } from '../game/level';
import { Session } from '../game/session';
import { DrawingInput } from '../input/drawing-input';
import { COLOURS } from '../materials/colour';
import { ENEMY_TYPES } from '../materials/enemy-table';
import { DebugOverlay } from '../debug/debug-overlay';
import { FrameRecorder } from '../debug/frame-times';
import { flashRejection } from '../rendering/rejection-flash';
import { Hud } from '../ui/hud';
import { RewardsScreen } from '../ui/rewards-screen';
import type { Menu } from '../ui/menu';
import { gaugeCentre, PaletteBar } from '../ui/palette-bar';
import { StrokePreview } from '../rendering/stroke-preview';
import { Toolbar } from '../ui/toolbar';
import { TuningPanel } from '../ui/tuning-panel';
import { WorldRenderer } from '../rendering/world-renderer';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { BALL_CANNON_LEVEL } from '../stress-tests/ball-cannon';
import { BOX_TOWER_LEVEL } from '../stress-tests/box-tower';
import { PEBBLES_LEVEL } from '../stress-tests/pebble-drop';

/** Keys 1–5 pick the Colours in palette order. */
const COLOUR_KEYS = new Map(COLOURS.map((colour, k) => [String(k + 1), colour]));
/** Shift+1, Shift+2, ... send in the Enemy types in order, by the key's place on any layout. */
const ENEMY_KEYS = new Map(ENEMY_TYPES.map((type, k) => [`Digit${k + 1}`, type]));
/** The toolbar's Levels, after Clear: the sandbox and the stress tests. */
const TOOLBAR_LEVELS = [SANDBOX_LEVEL, PEBBLES_LEVEL, BOX_TOWER_LEVEL, BALL_CANNON_LEVEL];

/**
 * The sandbox scene: forwards pointer and tool events to drawing input,
 * which turns them into commands to the Game, and draws the Sandbox world's
 * state, the Ink Tanks and what drawing input says to preview and flash. The
 * rules live in the Game and the Sandbox world below it; what is being
 * played, in the Session over the Game.
 */
export class SandboxScene extends Phaser.Scene {
  /** The rules layer: Phaser's own `game` is the Phaser game. */
  private gameLayer!: Game;
  /** What is being played: the toolbar, the Gallery and the frame go through it. */
  private session!: Session;
  /** The Sandbox world below the Game: what is drawn, and what demos build on. */
  private world!: SandboxWorld;
  private drawing!: DrawingInput;
  private worldView!: WorldRenderer;
  private rewards!: RewardsScreen;
  private overlay!: DebugOverlay;
  private hud!: Hud;
  private preview!: StrokePreview;
  private palette!: PaletteBar;
  private tuning!: TuningPanel;
  private gallery!: Menu;
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
    this.tuning = new TuningPanel(this.world.materials, this.world.enemyTable, this.gameLayer);
    this.worldView = new WorldRenderer(this, this.world, gaugeCentre);
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
    this.session = new Session(this.gameLayer);
    this.hud = new Hud(this, this.gameLayer);
    this.rewards = new RewardsScreen(this);
    this.palette = new PaletteBar(this, (tool) => this.drawing.pick(tool));
    const toolbar = new Toolbar(this);
    this.gallery = toolbar.addMenu(
      'Gallery',
      GALLERY.map((demo) => ({ label: demo.name, onPick: () => this.play(demo) })),
    );
    toolbar.addButton('Clear', () => this.clear());
    for (const level of TOOLBAR_LEVELS) toolbar.addButton(level.name, () => this.play(level));

    this.bindKeys();
    this.bindPointer();
  }

  /**
   * Loads `level`: clears the Arena, fills the Tanks and sets it up, with
   * its own Arena, Waves and Tanks if it has them. Clear does it again.
   */
  private play(level: Level): void {
    this.session.play(level);
    this.started();
  }

  /** Clear: loads the Level being played again, from Wave 1. */
  private clear(): void {
    this.session.clear();
    this.started();
  }

  /** A Level was loaded: names it for F1, and times it from now. */
  private started(): void {
    this.overlay.setSceneName(this.session.reading.name);
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
      const enemy = event.shiftKey ? ENEMY_KEYS.get(event.code) : undefined;
      if (enemy) {
        this.gameLayer.spawn(enemy);
        return;
      }
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
    // A stress test's update is timed with physics: a few microseconds.
    const steps = this.session.advance(deltaMs / 1000);
    this.frames.physics(performance.now() - start, steps);
    const drawStart = performance.now();
    this.tuning.draw();
    this.rewards.draw(this.gameLayer.defence.reading);
    this.worldView.draw(deltaMs / 1000);
    const preview = this.drawing.preview();
    if (preview.kind === 'brush') this.preview.drawBrush(preview.pointer);
    else {
      const { samples, colour, closes, refused, pointer } = preview;
      this.preview.draw(samples, colour, closes, refused, pointer);
    }
    const cost = preview.kind === 'stroke' ? preview.cost : null;
    this.palette.show(this.drawing.tool, this.gameLayer, cost);
    this.overlay.draw();
    this.hud.draw(this.session.reading.status ?? undefined);
    this.frames.draw(performance.now() - drawStart);
  }
}

/** Where the pointer is in the world. */
function at(pointer: Phaser.Input.Pointer): Vec2 {
  return { x: pointer.worldX, y: pointer.worldY };
}
