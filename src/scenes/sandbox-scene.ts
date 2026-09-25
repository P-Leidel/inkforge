import Phaser from 'phaser';
import { DebugOverlay } from '../rendering/debug-overlay';
import { Hud } from '../rendering/hud';
import { WorldRenderer } from '../rendering/world-renderer';
import { SandboxWorld } from '../sandbox/sandbox-world';

/**
 * The sandbox scene: turns pointer and keyboard input into Sandbox world
 * commands and draws the world's state. Game logic lives in SandboxWorld.
 */
export class SandboxScene extends Phaser.Scene {
  private world!: SandboxWorld;
  private worldView!: WorldRenderer;
  private overlay!: DebugOverlay;
  private hud!: Hud;

  constructor() {
    super('sandbox');
  }

  create(): void {
    this.world = new SandboxWorld();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.world.dispose());

    this.worldView = new WorldRenderer(this, this.world);
    this.overlay = new DebugOverlay(this, this.world);
    this.hud = new Hud(this, this.world);

    const keyboard = this.input.keyboard!;
    keyboard
      .addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      .on('down', () => this.world.togglePause());
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1).on('down', () => this.overlay.toggle());
  }

  override update(_time: number, deltaMs: number): void {
    this.world.advance(deltaMs / 1000);
    this.worldView.draw();
    this.overlay.draw();
    this.hud.draw();
  }
}
