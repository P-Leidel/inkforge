import type Phaser from 'phaser';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';

const HELP_TEXT =
  '1–5: Colour    E: eraser    Drag: draw    Click: fill    Right-click: release    Space: run / pause    R: reset    Ctrl+Z: undo    F1: stats / debug    F2: tuning';

/** What the status line says. */
const STATUS = {
  running: { text: '▶ RUNNING', color: PALETTE.running },
  paused: { text: '❚❚ PAUSED', color: PALETTE.paused },
  destroyed: { text: 'Ink Core destroyed    R: start over', color: PALETTE.destroyed },
} as const;

/**
 * Pause / running indicator, "Ink Core destroyed" once its HP runs out,
 * control hints and the stress-test readout.
 */
export class Hud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly readout: Phaser.GameObjects.Text;
  /** What the status shows, so it is redrawn only when that changes. */
  private shown: keyof typeof STATUS | null = null;

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
    // Control hints along the top edge, above the palette, status and toolbar.
    scene.add
      .text(scene.scale.width / 2, 8, HELP_TEXT, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: PALETTE.textMuted,
      })
      .setOrigin(0.5, 0)
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
    const shown = this.world.coreDestroyed
      ? 'destroyed'
      : this.world.isRunning
        ? 'running'
        : 'paused';
    if (shown === this.shown) return;
    this.shown = shown;
    this.status.setText(STATUS[shown].text);
    this.status.setColor(STATUS[shown].color);
  }
}
