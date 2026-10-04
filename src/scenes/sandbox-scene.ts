import Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { GALLERY } from '../gallery/gallery';
import { browserStore, Campaign } from '../game/campaign';
import { Game } from '../game/game';
import { SANDBOX_LEVEL, type Level } from '../game/level';
import { Session, type Acted } from '../game/session';
import { DrawingInput, type Flash } from '../input/drawing-input';
import { COLOURS } from '../materials/colour';
import { ENEMY_TYPES } from '../materials/enemy-types';
import { DebugOverlay } from '../debug/debug-overlay';
import { FrameRecorder } from '../debug/frame-times';
import { flashRejection } from '../rendering/rejection-flash';
import { Hud } from '../ui/hud';
import { RewardsScreen } from '../ui/rewards-screen';
import type { Menu } from '../ui/menu';
import { levelEntries, MenuScreen } from '../ui/menu-screen';
import { PaletteBar } from '../ui/palette-bar';
import { StrokePreview } from '../rendering/stroke-preview';
import { Toolbar } from '../ui/toolbar';
import { TuningPanel } from '../ui/tuning-panel';
import { CardScreen } from '../ui/card-screen';
import { WorldRenderer } from '../rendering/world-renderer';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { BALL_CANNON_LEVEL } from '../stress-tests/ball-cannon';
import { BOX_TOWER_LEVEL } from '../stress-tests/box-tower';
import { PEBBLES_LEVEL } from '../stress-tests/pebble-drop';
import { CAMPAIGN_LEVELS } from '../levels/campaign-levels';
import { TUTORIAL_LEVEL } from '../levels/tutorial';

/** Keys 1–5 pick the Colours in palette order. */
const COLOUR_KEYS = new Map(COLOURS.map((colour, k) => [String(k + 1), colour]));
/**
 * Shift+1, Shift+2, ... send in the Enemy types in order, by the key's place
 * on any layout: a sandbox tool, so only while the Game has it on hand.
 */
const ENEMY_KEYS = new Map(ENEMY_TYPES.map((type, k) => [`Digit${k + 1}`, type]));
/** The toolbar's Stress tests menu. */
const STRESS_TESTS = [PEBBLES_LEVEL, BOX_TOWER_LEVEL, BALL_CANNON_LEVEL];

/**
 * The sandbox scene: forwards pointer and tool events to drawing input,
 * which turns them into commands to the Game, and draws the Sandbox world's
 * state, the Ink Tanks and what drawing input says to preview and flash. The
 * rules live in the Game and the Sandbox world below it; what is being
 * played, in the Session over the Game, and which Levels are unlocked, in
 * the Campaign. It opens on the title screen (Tutorial, Campaign, Sandbox,
 * Gallery); while that or the Level list is open, nothing is played behind
 * it. The Session opens a Level's Cards before the Waves they teach, and
 * the Tutorial's on H; while they are open, nothing is played or drawn, and
 * Space, a click and Esc only turn or close them.
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
  /** The toolbar's menus, Gallery and Stress tests: a click beside an open one closes it. */
  private menus!: Menu[];
  /** The toolbar's Gallery, Sandbox and Stress tests: shown in Free play only. */
  private freePlayControls!: { setVisible(visible: boolean): unknown }[];
  /** The title screen, the Level list and the Gallery's list, over everything. */
  private screen!: MenuScreen;
  private campaign!: Campaign;
  private cardScreen!: CardScreen;
  /** Every frame's timings, for the F1 stats. */
  private readonly frames = new FrameRecorder();

  constructor() {
    super('sandbox');
  }

  create(): void {
    // Strokes cost Ink until F2 turns Ink costs off: then every Colour is on hand, unlimited.
    this.gameLayer = new Game({ inkCosts: true });
    this.world = this.gameLayer.world;
    this.drawing = new DrawingInput(this.gameLayer);
    this.tuning = new TuningPanel(this.world.materials, this.world.enemyTable, this.gameLayer);
    // The palette lays out only the Colours the Level has: ask it where each gauge is now.
    this.worldView = new WorldRenderer(this, this.world, (colour) =>
      this.palette.gaugeCentre(colour),
    );
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
    this.campaign = new Campaign(CAMPAIGN_LEVELS, browserStore());
    this.session = new Session(this.gameLayer, this.campaign, TUTORIAL_LEVEL);
    this.hud = new Hud(this);
    this.rewards = new RewardsScreen(this, (choice) => this.follow(this.session.act(choice)));
    this.palette = new PaletteBar(this, (tool) => this.drawing.pick(tool));
    // Clear and Title at the right end, on hand everywhere; Free play's own
    // buttons beside them, hidden in the Campaign.
    const toolbar = new Toolbar(this);
    toolbar.addButton('Clear', () => this.clear());
    toolbar.addButton('Title', () => this.showTitle());
    const gallery = toolbar.addMenu(
      'Gallery',
      GALLERY.map((demo) => ({ label: demo.name, onPick: () => this.play(demo) })),
    );
    const sandbox = toolbar.addButton(SANDBOX_LEVEL.name, () => this.play(SANDBOX_LEVEL));
    const stressTests = toolbar.addMenu(
      'Stress tests',
      STRESS_TESTS.map((level) => ({ label: level.name, onPick: () => this.play(level) })),
    );
    this.menus = [gallery, stressTests];
    this.freePlayControls = [gallery, sandbox, stressTests];
    this.cardScreen = new CardScreen(this);
    this.screen = new MenuScreen(this);

    this.bindKeys();
    this.bindPointer();
    this.showTitle();
  }

  /** The title screen: Tutorial, Campaign, Sandbox and Gallery. */
  private showTitle(): void {
    this.open('INKFORGE', [
      { label: 'Tutorial', onPick: () => this.follow(this.session.playTutorial()) },
      { label: 'Campaign', onPick: () => this.showLevelList() },
      { label: 'Sandbox', onPick: () => this.play(SANDBOX_LEVEL) },
      { label: 'Gallery', onPick: () => this.showGallery() },
    ]);
  }

  /** The Level list: the Campaign's Levels, the locked ones shown but shut. */
  private showLevelList(): void {
    this.open('CAMPAIGN', [
      ...levelEntries(this.campaign).map(({ index, label, locked }) => ({
        label,
        locked,
        onPick: () => this.playCampaign(index),
      })),
      { label: 'Back', onPick: () => this.showTitle() },
    ]);
  }

  /** The Gallery's demos, as the toolbar's Gallery menu lists them. */
  private showGallery(): void {
    this.open('GALLERY', [
      ...GALLERY.map((demo) => ({ label: demo.name, onPick: () => this.play(demo) })),
      { label: 'Back', onPick: () => this.showTitle() },
    ]);
  }

  /** Opens a menu screen; a Stroke being drawn is dropped. */
  private open(title: string, items: Parameters<MenuScreen['show']>[1]): void {
    this.drawing.leave();
    this.session.cards.close();
    for (const menu of this.menus) menu.close();
    this.screen.show(title, items);
  }

  /**
   * Follows what the Session did: a Level loaded, the world taken back to
   * the last start, or the Level left for the Level list or the title screen.
   */
  private follow(acted: Acted): void {
    switch (acted) {
      case 'started':
        return this.started();
      case 'reset':
        // The replay is timed on its own.
        return this.frames.sinceStart.restart();
      case 'left':
        return this.showLevelList();
      case 'title':
        return this.showTitle();
      case 'refused':
        return;
    }
  }

  /** Loads the Campaign's Level at `index`, if it is unlocked. */
  private playCampaign(index: number): void {
    this.follow(this.session.playCampaign(index));
  }

  /**
   * Loads `level`: clears the Arena, fills the Tanks and sets it up, with
   * its own Arena, Waves and Tanks if it has them. Clear does it again.
   */
  private play(level: Level): void {
    this.follow(this.session.play(level));
  }

  /** Clear: loads the Level being played again, from Wave 1. */
  private clear(): void {
    this.follow(this.session.clear());
  }

  /**
   * A Level was loaded: closes any menu screen, shows Free play's toolbar
   * buttons in Free play only, drops a Stroke being drawn if Cards opened,
   * names it for F1, and times it from now.
   */
  private started(): void {
    this.screen.hide();
    const { play, name } = this.session.reading;
    for (const control of this.freePlayControls) control.setVisible(play === 'free-play');
    if (this.session.cards.isOpen) this.drawing.leave();
    this.overlay.setSceneName(name);
    this.frames.sinceStart.restart();
  }

  /** Whether a menu screen or Cards are open: nothing is played or drawn behind either. */
  private get blocked(): boolean {
    return this.screen.isOpen || this.session.cards.isOpen;
  }

  /** H: opens the Tutorial's Cards, pausing a Wave under way; it stays paused once they close. */
  private showTutorial(): void {
    if (this.blocked) return;
    this.drawing.leave();
    for (const menu of this.menus) menu.close();
    this.session.showCards();
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard!;
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (this.blocked) return;
      const enemy = event.shiftKey ? ENEMY_KEYS.get(event.code) : undefined;
      if (enemy) {
        if (this.gameLayer.allowed.spawning) this.gameLayer.spawn(enemy);
        return;
      }
      const colour = COLOUR_KEYS.get(event.key);
      if (colour) this.drawing.pick(colour);
      else if (event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey) {
        if (this.gameLayer.allowed.eraser) this.drawing.pick('eraser');
      }
    });
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => {
      if (this.screen.isOpen) return;
      // The Space that closes the Cards does not also start the Wave.
      if (this.session.cards.isOpen) this.session.cards.next();
      else this.gameLayer.togglePause();
    });
    keyboard
      .addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      .on('down', () => this.session.cards.close());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H).on('down', () => this.showTutorial());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1).on('down', () => this.overlay.cycle());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F2).on('down', () => this.tuning.toggle());
    keyboard
      .addKey(Phaser.Input.Keyboard.KeyCodes.F3)
      .on('down', () => void this.overlay.copyReadings());
    keyboard
      .addKey(Phaser.Input.Keyboard.KeyCodes.R)
      .on('down', () => !this.blocked && this.follow(this.session.retry()));
    // Ctrl (Cmd on a Mac) held draws straight; pressed or let go with the
    // pointer still, the preview follows at once.
    const straighten = (event: KeyboardEvent) => this.drawing.straighten(straightKey(event));
    keyboard.on('keydown', straighten);
    keyboard.on('keyup', straighten);
    keyboard.on('keydown-Z', (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (this.blocked) return;
      event.preventDefault();
      this.flash(this.drawing.undo());
    });
  }

  private bindPointer(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.drawing.leave());
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length > 0) return; // a toolbar button
        if (this.session.cards.isOpen) {
          if (pointer.leftButtonDown()) this.session.cards.next();
          return;
        }
        // A click beside an open menu only closes it.
        const open = this.menus.filter((menu) => menu.isOpen);
        if (open.length > 0) {
          for (const menu of open) menu.close();
          return;
        }
        this.drawing.straighten(straightKey(pointer.event));
        if (pointer.leftButtonDown()) this.flash(this.drawing.press(at(pointer), 'left'));
        else if (pointer.rightButtonDown()) this.drawing.press(at(pointer), 'right');
      },
    );
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.drawing.straighten(straightKey(pointer.event));
      this.drawing.move(at(pointer));
    });
    const release = (pointer: Phaser.Input.Pointer) => {
      this.drawing.straighten(straightKey(pointer.event));
      this.flash(this.drawing.release());
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  }

  /** Flashes what drawing input says was refused, if anything. */
  private flash(flash: Flash | null): void {
    if (flash) flashRejection(this, flash.path, flash.message, flash.pointer);
  }

  override update(_time: number, deltaMs: number): void {
    // Phaser smooths `deltaMs` over several frames, which would hide a long one.
    this.frames.begin(this.game.loop.rawDelta, this.world.isRunning);
    this.flash(this.drawing.tick());
    const start = performance.now();
    // A stress test's update is timed with physics: a few microseconds. Behind
    // a menu screen or Cards, nothing is played.
    const steps = this.blocked ? 0 : this.session.advance(deltaMs / 1000);
    this.frames.physics(performance.now() - start, steps);
    const drawStart = performance.now();
    const frame = this.session.frame();
    this.tuning.draw();
    this.rewards.draw(frame.defence, frame.session);
    this.cardScreen.draw(this.session.cards);
    this.worldView.draw(deltaMs / 1000);
    const preview = this.drawing.preview();
    if (preview.kind === 'brush') this.preview.drawBrush(preview.pointer);
    else {
      const { samples, colour, closes, refused, pointer, pinned } = preview;
      this.preview.draw(samples, colour, closes, refused, pointer, pinned);
    }
    const cost = preview.kind === 'stroke' ? preview.cost : null;
    this.palette.show(this.drawing.tool, frame, cost);
    this.overlay.draw();
    this.hud.draw(frame);
    this.frames.draw(performance.now() - drawStart);
  }
}

/** Whether the straight-line key is held: Ctrl, or Cmd on a Mac. */
function straightKey(event: { readonly ctrlKey: boolean; readonly metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey;
}

/** Where the pointer is in the world. */
function at(pointer: Phaser.Input.Pointer): Vec2 {
  return { x: pointer.worldX, y: pointer.worldY };
}
