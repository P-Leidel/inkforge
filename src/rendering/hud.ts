import type Phaser from 'phaser';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { FONT_FAMILY, PALETTE } from './palette';

const HELP_TEXT = 'Drag: draw    Space: run / pause    Ctrl+Z: undo    F1: debug overlay';

/** Pause / running indicator and control hints. */
export class Hud {
  private readonly status: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    this.status = scene.add
      .text(scene.scale.width / 2, 40, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '32px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
    scene.add
      .text(scene.scale.width / 2, 86, HELP_TEXT, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: PALETTE.textMuted,
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
  }

  draw(): void {
    const running = this.world.isRunning;
    this.status.setText(running ? '▶ RUNNING' : '❚❚ PAUSED');
    this.status.setColor(running ? PALETTE.running : PALETTE.paused);
  }
}
