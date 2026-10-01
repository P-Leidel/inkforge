import type Phaser from 'phaser';
import type { DefenceReading } from '../game/defence-loop';
import { inLineLength } from '../game/ink-table';
import { COLOURS } from '../materials/colour';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';

/**
 * What the rewards screen says, line by line: the summary of the Wave that
 * ended, in an Intermission after it or once the Level is cleared. Null
 * while there is nothing to show: with Waves off, during a Wave, and before
 * the first Wave. A choice of rewards would be listed below the summary.
 */
export function rewardsLines(reading: DefenceReading): string[] | null {
  const { phase, rewards, wave, waves } = reading;
  if (!rewards || (phase !== 'intermission' && phase !== 'cleared')) return null;
  const { summary } = rewards;
  const ink = COLOURS.map((colour) => `${colour} ${Math.round(inLineLength(summary.ink[colour]))}`);
  return [
    phase === 'cleared' ? 'LEVEL CLEARED' : `WAVE ${summary.wave} OF ${waves} SURVIVED`,
    '',
    `Kills ${summary.kills}    Ink Core HP ${Math.round(summary.coreHp)}`,
    `Ink picked up    ${ink.join('   ')}`,
    '',
    phase === 'cleared'
      ? 'Clear: play the Level again'
      : `Tanks refilled    Space: start Wave ${wave}`,
  ];
}

/**
 * The rewards screen: a panel in the middle of the Arena during an
 * Intermission, with the summary of the Wave that ended. Everything behind
 * it stays as the Wave left it.
 */
export class RewardsScreen {
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;
  /** What it shows, so the text is redrawn only on a change. */
  private shown: string | null = null;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.panel = scene.add
      .rectangle(width / 2, height / 2, 760, 260, 0x16171b, 0.85)
      .setStrokeStyle(2, 0x4f5666)
      .setDepth(60)
      .setVisible(false);
    this.text = scene.add
      .text(width / 2, height / 2, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        color: PALETTE.text,
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setDepth(61)
      .setVisible(false);
  }

  draw(reading: DefenceReading): void {
    const lines = rewardsLines(reading);
    const shown = lines?.join('\n') ?? null;
    if (shown === this.shown) return;
    this.shown = shown;
    this.panel.setVisible(shown !== null);
    this.text.setVisible(shown !== null);
    if (shown !== null) this.text.setText(shown);
  }
}
