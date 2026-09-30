import type Phaser from 'phaser';
import type { Game } from '../game/game';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';

const HELP_TEXT =
  '1–5: Colour    E: eraser    Drag: draw    Click: fill    Right-click: release    Space: run / pause    R: reset    Ctrl+Z: undo    F1: stats / debug    F2: tuning';

/** What the status line says. */
const STATUS = {
  running: { text: '▶ RUNNING', color: PALETTE.running },
  paused: { text: '❚❚ PAUSED', color: PALETTE.paused },
  destroyed: { text: 'Ink Core destroyed    R: start over', color: PALETTE.destroyed },
} as const;

/** What the phase label says, with Waves on. */
const PHASE = {
  build: { text: 'BUILD PHASE    Space: start the Wave', color: PALETTE.buildPhase },
  wave: { text: 'WAVE', color: PALETTE.wave },
} as const;

/** How far above the ground the Spawn arrow is (see the World renderer), and right of the edge. */
const SPAWN_COUNT_RISE = 60;
const SPAWN_COUNT_X = 32;

/**
 * Pause / running indicator, "Ink Core destroyed" once its HP runs out,
 * the phase with Waves on, how many of the Wave's Enemies are still to
 * come beside the Spawn arrow, control hints and the stress-test readout.
 */
export class Hud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly phase: Phaser.GameObjects.Text;
  private readonly toCome: Phaser.GameObjects.Text;
  private readonly readout: Phaser.GameObjects.Text;
  /** What the status, the phase label and the count show, so each is redrawn only on a change. */
  private shown: keyof typeof STATUS | null = null;
  private shownPhase: keyof typeof PHASE | null | undefined = undefined;
  private shownToCome: number | null | undefined = undefined;

  constructor(
    scene: Phaser.Scene,
    private readonly game: Pick<Game, 'world' | 'defence'>,
  ) {
    this.status = scene.add
      .text(scene.scale.width / 2, 40, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '32px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
    this.phase = scene.add
      .text(scene.scale.width / 2, 84, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
    this.toCome = scene.add
      .text(SPAWN_COUNT_X, game.world.arena.spawn.y - SPAWN_COUNT_RISE, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: PALETTE.spawnCount,
      })
      .setOrigin(0, 0.5)
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
    this.drawStatus();
    this.drawPhase();
  }

  private drawStatus(): void {
    const { world, defence } = this.game;
    const destroyed = defence.reading.coreDestroyed;
    const shown = destroyed ? 'destroyed' : world.isRunning ? 'running' : 'paused';
    if (shown === this.shown) return;
    this.shown = shown;
    this.status.setText(STATUS[shown].text);
    this.status.setColor(STATUS[shown].color);
  }

  /** The phase label, and the count beside the Spawn arrow during a Wave. */
  private drawPhase(): void {
    const { phase, toCome: left } = this.game.defence.reading;
    if (phase !== this.shownPhase) {
      this.shownPhase = phase;
      this.phase.setText(phase ? PHASE[phase].text : '');
      if (phase) this.phase.setColor(PHASE[phase].color);
    }
    const toCome = phase === 'wave' ? left : null;
    if (toCome === this.shownToCome) return;
    this.shownToCome = toCome;
    this.toCome.setText(toCome === null ? '' : String(toCome));
  }
}
