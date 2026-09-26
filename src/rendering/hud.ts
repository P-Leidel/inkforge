import type Phaser from 'phaser';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { FONT_FAMILY, PALETTE } from './palette';

const HELP_TEXT =
  '1–5: Colour    Drag: draw    Click: fill    Right-click: release    Space: run / pause    R: reset    Ctrl+Z: undo    F1: stats / debug    F2: tuning';

/** Pause / running indicator, control hints and the stress-test readout. */
export class Hud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly readout: Phaser.GameObjects.Text;
  /** What the status shows, so it is redrawn only when that changes. */
  private shownRunning: boolean | null = null;

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
    // Control hints along the bottom edge, clear of the toolbar.
    scene.add
      .text(scene.scale.width / 2, scene.scale.height - 24, HELP_TEXT, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: PALETTE.textMuted,
      })
      .setOrigin(0.5, 1)
      .setDepth(50);
    this.readout = scene.add
      .text(scene.scale.width / 2, 130, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: PALETTE.text,
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
  }

  /** `readout`: the running stress test's measurements, if any. */
  draw(readout = ''): void {
    // Text re-renders its canvas and re-uploads the texture on every change
    // (setColor even when the colour is the same), so touch it only on a change.
    this.readout.setText(readout);
    const running = this.world.isRunning;
    if (running === this.shownRunning) return;
    this.shownRunning = running;
    this.status.setText(running ? '▶ RUNNING' : '❚❚ PAUSED');
    this.status.setColor(running ? PALETTE.running : PALETTE.paused);
  }
}
