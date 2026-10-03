import type Phaser from 'phaser';
import type { DefenceReading, WaveSummary } from '../game/defence-loop';
import { inLineLength } from '../game/ink-table';
import type { Choice, SessionReading } from '../game/session';
import { COLOURS } from '../materials/colour';
import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-table';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';
import { textButton } from './text-button';

/** What the panel calls each Enemy type: one of it, and more. */
const ENEMY_NAMES: Readonly<Record<EnemyType, readonly [string, string]>> = {
  crawler: ['Crawler', 'Crawlers'],
  runner: ['Runner', 'Runners'],
  heavy: ['Heavy', 'Heavies'],
};

/** What the rewards screen reads of the Session: where in the Campaign, and what its end offers. */
export type SessionShown = Pick<SessionReading, 'campaign' | 'offer'>;

/** Free play: outside the Campaign, nothing offered. */
const FREE_PLAY: SessionShown = { campaign: null, offer: null };

/**
 * What the rewards screen says, line by line. In an Intermission: the
 * summary of the Wave that ended, if one has, then the Analysis, each Enemy
 * type the next Wave sends and how many, and in the Campaign a hint for each
 * Colour and Enemy type new in it. Once the Level is cleared, the last
 * Wave's summary, and in the Campaign the Level it unlocked, or that the
 * Campaign is cleared; in the Campaign, once it is lost, that it is. Null
 * while there is nothing to show: with Waves off, during a Wave, and once
 * lost outside the Campaign, where the HUD says what to do. A choice of
 * rewards would be listed below the summary.
 */
export function rewardsLines(
  reading: DefenceReading,
  { campaign, offer }: SessionShown = FREE_PLAY,
): string[] | null {
  const { phase, rewards, wave, waves } = reading;
  if (phase === 'lost' && campaign) {
    return [`WAVE ${wave} OF ${waves} LOST`, '', 'The Ink Core is destroyed'];
  }
  if (phase === 'intermission') {
    return [
      ...(rewards ? [...summaryLines(rewards.summary, waves), 'Tanks refilled', ''] : []),
      ...analysisLines(reading),
      ...(campaign?.hints ?? []),
      '',
      `Space: start Wave ${wave}`,
    ];
  }
  if (!rewards || phase !== 'cleared') return null;
  return [
    'LEVEL CLEARED',
    ...summaryLines(rewards.summary, waves).slice(1),
    '',
    !campaign
      ? 'Clear: play the Level again'
      : offer?.next
        ? `${offer.next.name} unlocked`
        : 'Campaign cleared',
  ];
}

/** A Wave's summary: its title, a blank line, its kills and Ink Core HP, and the Ink picked up. */
function summaryLines(summary: WaveSummary, waves: number): string[] {
  const ink = COLOURS.map((colour) => `${colour} ${Math.round(inLineLength(summary.ink[colour]))}`);
  return [
    `WAVE ${summary.wave} OF ${waves} SURVIVED`,
    '',
    `Kills ${summary.kills}    Ink Core HP ${Math.round(summary.coreHp)}`,
    `Ink picked up    ${ink.join('   ')}`,
  ];
}

/** The Analysis: which Wave comes next, and each Enemy type it sends with how many. */
function analysisLines({ wave, waves, next }: DefenceReading): string[] {
  const sent = ENEMY_TYPES.filter((type) => (next?.[type] ?? 0) > 0).map((type) => {
    const count = next![type];
    return `${count} ${ENEMY_NAMES[type][count === 1 ? 0 : 1]}`;
  });
  return [`Next: Wave ${wave} of ${waves}    ${sent.length > 0 ? sent.join('   ') : 'no Enemies'}`];
}

/** Each button's label, in the order they stand. */
const CHOICE_LABELS: Readonly<Record<Choice, string>> = {
  'next-level': 'Next Level',
  'retry-wave': 'Retry Wave (R)',
  'restart-level': 'Restart Level (Clear)',
  'level-list': 'Level list',
};

const BUTTON_GAP = 16;
/** Space below the text for a row of buttons. */
const BUTTON_ROW = 70;

/**
 * The rewards screen: a panel in the middle of the Arena during an
 * Intermission, with the summary of the Wave that ended and the Analysis of
 * the next, and in the Campaign, once the Level is cleared or lost, a
 * button for each choice the Session offers. Everything behind it stays as
 * the Wave left it. A button's click goes to `onChoice`, for the scene to
 * forward to the Session.
 */
export class RewardsScreen {
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;
  private readonly buttons: ReadonlyMap<Choice, Phaser.GameObjects.Text>;
  /** What it shows, so it is redrawn only on a change. */
  private shown: string | null = null;

  constructor(scene: Phaser.Scene, onChoice: (choice: Choice) => void) {
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
    this.buttons = new Map(
      (Object.keys(CHOICE_LABELS) as Choice[]).map((choice) => [
        choice,
        textButton(scene, 0, 0, CHOICE_LABELS[choice], () => onChoice(choice))
          .setDepth(62)
          .setVisible(false),
      ]),
    );
  }

  draw(reading: DefenceReading, session: SessionShown = FREE_PLAY): void {
    const lines = rewardsLines(reading, session);
    const choices = lines ? (session.offer?.choices ?? []) : [];
    const shown = lines ? `${lines.join('\n')}\n${choices.join(' ')}` : null;
    if (shown === this.shown) return;
    this.shown = shown;
    this.panel.setVisible(lines !== null);
    this.text.setVisible(lines !== null);
    for (const button of this.buttons.values()) button.setVisible(false);
    if (lines === null) return;
    this.text.setText(lines.join('\n'));
    this.layOut(choices);
  }

  /** Sizes the panel to the text, with a row of the buttons for `choices` beneath it if any. */
  private layOut(choices: readonly Choice[]): void {
    const { x, y } = this.panel;
    const row = choices.length > 0 ? BUTTON_ROW : 0;
    const height = Math.max(260, this.text.height + 80 + row);
    this.panel.setSize(Math.max(760, this.text.width + 80), height);
    this.text.setY(y - row / 2);
    const buttons = choices.map((choice) => this.buttons.get(choice)!);
    const total =
      buttons.reduce((sum, button) => sum + button.width, 0) + BUTTON_GAP * (buttons.length - 1);
    // A button is placed by its top-right corner.
    let left = x - total / 2;
    const top = y + height / 2 - row + 4;
    for (const button of buttons) {
      button.setPosition(left + button.width, top).setVisible(true);
      left += button.width + BUTTON_GAP;
    }
  }
}
