import Phaser from 'phaser';
import type { Vec2 } from '../geometry/vec2';
import { DebugOverlay } from '../rendering/debug-overlay';
import { flashRejection } from '../rendering/rejection-flash';
import { Hud } from '../rendering/hud';
import { StrokePreview } from '../rendering/stroke-preview';
import { Toolbar } from '../rendering/toolbar';
import { WorldRenderer } from '../rendering/world-renderer';
import { SandboxWorld } from '../sandbox/sandbox-world';
import { isClosingStroke } from '../stroke/close-detection';

/**
 * The sandbox scene: turns pointer and keyboard input into Sandbox world
 * commands and draws the world's state. Game logic lives in SandboxWorld.
 */
export class SandboxScene extends Phaser.Scene {
  private world!: SandboxWorld;
  private worldView!: WorldRenderer;
  private overlay!: DebugOverlay;
  private hud!: Hud;
  private preview!: StrokePreview;
  /** Pointer samples of the Stroke being drawn, or null. */
  private stroke: Vec2[] | null = null;
  /** Whether the Stroke being drawn would be refused as an overlapping Object. */
  private strokeRefused = false;
  /** Sample count the refusal was last checked at. */
  private checkedSamples = 0;

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
    new Toolbar(this).addButton('Clear', () => this.world.clear());

    this.bindKeys();
    this.bindPointer();
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard!;
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
    const outcome = this.world.submitStroke(stroke);
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
    this.worldView.draw();
    this.updateRefusal();
    this.preview.draw(this.stroke, this.strokeRefused);
    this.overlay.draw();
    this.hud.draw();
  }
}
