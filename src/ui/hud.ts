import type Phaser from 'phaser';
import type { DefenceReading } from '../game/defence-loop';
import type { Allowed, Game } from '../game/game';
import { ENEMY_TYPES } from '../materials/enemy-table';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';
import { inward, spawnEdgeX } from '../sandbox/arena';

/**
 * The control hints: the Eraser (E) and sending in Enemies (Shift+1–3)
 * only while they are on hand.
 */
export function helpText({ eraser, spawning }: Pick<Allowed, 'eraser' | 'spawning'>): string {
  return [
    '1–5: Colour',
    eraser && 'E: eraser',
    'Drag: draw',
    'Click: fill',
    'Right-click: release',
    'Space: run / pause',
    'R: reset',
    'Ctrl+Z: undo',
    spawning && `Shift+1–${ENEMY_TYPES.length}: Enemy`,
    'F1: stats / debug',
    'F2: tuning',
  ]
    .filter(Boolean)
    .join('    ');
}

/** What the status line says. */
const STATUS = {
  running: { text: '▶ RUNNING', color: PALETTE.running },
  paused: { text: '❚❚ PAUSED', color: PALETTE.paused },
  destroyed: { text: 'Ink Core destroyed    R or Clear', color: PALETTE.destroyed },
} as const;

/** What the phase label says, with Waves on; nothing with Waves off. */
export function phaseLabel({ phase, wave, waves }: DefenceReading): string {
  switch (phase) {
    case null:
      return '';
    // Short: the toolbar is close beside it. The rewards screen says the rest.
    case 'intermission':
      return `Space: WAVE ${wave} of ${waves}`;
    case 'wave':
      return `WAVE ${wave} of ${waves}`;
    case 'cleared':
      return 'LEVEL CLEARED';
    case 'lost':
      return `WAVE ${wave} of ${waves} LOST`;
  }
}

/** How far above the ground the Spawn arrow is (see the World renderer), and in from the Spawn edge. */
const SPAWN_COUNT_RISE = 60;
const SPAWN_COUNT_X = 32;

/**
 * Pause / running indicator, "Ink Core destroyed" once its HP runs out,
 * the phase with Waves on, how many of the Wave's Enemies are still to
 * come beside the Spawn arrow, control hints (the sandbox tools' only
 * while the Game's `allowed` has them on hand) and the stress-test readout.
 */
export class Hud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly help: Phaser.GameObjects.Text;
  private readonly phase: Phaser.GameObjects.Text;
  private readonly toCome: Phaser.GameObjects.Text;
  private readonly readout: Phaser.GameObjects.Text;
  /** What the status, the phase label and the count show, so each is redrawn only on a change. */
  private shown: keyof typeof STATUS | null = null;
  private shownPhase: string | undefined = undefined;
  private shownToCome: number | null | undefined = undefined;

  constructor(
    scene: Phaser.Scene,
    private readonly game: Pick<Game, 'world' | 'defence' | 'allowed'>,
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
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        fontStyle: 'bold',
        color: PALETTE.spawnCount,
      })
      .setDepth(50);
    this.placeToCome();
    // Control hints along the top edge, above the palette, status and toolbar.
    this.help = scene.add
      .text(scene.scale.width / 2, 8, helpText(game.allowed), {
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
    this.help.setText(helpText(this.game.allowed));
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

  /** Puts the count to come beside the Spawn arrow, on the Arena's side of it. */
  private placeToCome(): void {
    const arena = this.game.world.arena;
    const left = arena.spawnSide === 'left';
    this.toCome
      .setPosition(
        spawnEdgeX(arena) + inward(arena) * SPAWN_COUNT_X,
        arena.spawn.y - SPAWN_COUNT_RISE,
      )
      .setOrigin(left ? 0 : 1, 0.5);
  }

  /** The phase label, and the count beside the Spawn arrow during a Wave. */
  private drawPhase(): void {
    const reading = this.game.defence.reading;
    const { phase, toCome: left } = reading;
    const label = phaseLabel(reading);
    if (label !== this.shownPhase) {
      this.shownPhase = label;
      this.phase.setText(label);
      if (phase) this.phase.setColor(PALETTE[phase]);
    }
    // A Level may have brought its own Spawn.
    this.placeToCome();
    const toCome = phase === 'wave' ? left : null;
    if (toCome === this.shownToCome) return;
    this.shownToCome = toCome;
    this.toCome.setText(toCome === null ? '' : String(toCome));
  }
}
