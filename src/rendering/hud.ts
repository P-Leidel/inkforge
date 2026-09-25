import type Phaser from 'phaser';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { FONT_FAMILY, PALETTE } from './palette';

const HELP_TEXT =
  'Drag: draw    Right-click: release    Space: run / pause    Ctrl+Z: undo    F1: debug overlay';

/** Pause / running indicator, control hints and the stress-test readout. */
export class Hud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly readout: Phaser.GameObjects.Text;

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
    this.readout = scene.add
      .text(scene.scale.width / 2, 124, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: PALETTE.text,
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
  }

  /** `readout`: the running stress test's measurements, if any. */
  draw(readout = ''): void {
    this.readout.setText(readout);
    const running = this.world.isRunning;
    this.status.setText(running ? '▶ RUNNING' : '❚❚ PAUSED');
    this.status.setColor(running ? PALETTE.running : PALETTE.paused);
  }
}
