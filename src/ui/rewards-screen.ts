import type Phaser from 'phaser';
import type { DefenceReading, WaveSummary } from '../game/defence-loop';
import { inLineLength } from '../game/ink-table';
import type { CampaignPlace } from '../game/session';
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

/**
 * What the rewards screen says, line by line. In an Intermission: the
 * summary of the Wave that ended, if one has, then the Analysis, each Enemy
 * type the next Wave sends and how many, and in the Campaign (`campaign`,
 * where in it) a hint for each Colour and Enemy type new in it. Once the
 * Level is cleared, the last Wave's summary; in the Campaign, once it is
 * lost, that it is. Null while there is nothing to show: with Waves off,
 * during a Wave, and once lost outside the Campaign, where the HUD says what
 * to do. A choice of rewards would be listed below the summary.
 */
export function rewardsLines(
  reading: DefenceReading,
  campaign: CampaignPlace | null = null,
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
      : campaign.hasNext
        ? `Level ${campaign.index + 2} unlocked`
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

/** What a button on the rewards screen does, once a Campaign Level is cleared or lost. */
export type PanelAction = 'next-level' | 'retry-wave' | 'restart-level' | 'level-list';

/** Each button's label, in the order they stand. */
const PANEL_LABELS: Readonly<Record<PanelAction, string>> = {
  'next-level': 'Next Level',
  'retry-wave': 'Retry Wave (R)',
  'restart-level': 'Restart Level (Clear)',
  'level-list': 'Level list',
};

/**
 * The buttons the rewards screen offers, in order: in the Campaign, once
 * the Level is cleared, Next Level (unless it was the last) and the Level
 * list; once it is lost, Retry Wave, Restart Level and the Level list.
 * None outside the Campaign, nor while the Level goes on.
 */
export function panelActions(
  { phase }: DefenceReading,
  campaign: CampaignPlace | null,
): PanelAction[] {
  if (!campaign) return [];
  switch (phase) {
    case 'cleared':
      return campaign.hasNext ? ['next-level', 'level-list'] : ['level-list'];
    case 'lost':
      return ['retry-wave', 'restart-level', 'level-list'];
    case 'intermission':
    case 'wave':
    case null:
      return [];
  }
}

const BUTTON_GAP = 16;
/** Space below the text for a row of buttons. */
const BUTTON_ROW = 70;

/**
 * The rewards screen: a panel in the middle of the Arena during an
 * Intermission, with the summary of the Wave that ended and the Analysis of
 * the next, and in the Campaign, once the Level is cleared or lost, the
 * buttons of what to do next. Everything behind it stays as the Wave left it. A button's click
 * goes to `onAction`; what it does is the scene's to forward.
 */
export class RewardsScreen {
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;
  private readonly buttons: ReadonlyMap<PanelAction, Phaser.GameObjects.Text>;
  /** What it shows, so it is redrawn only on a change. */
  private shown: string | null = null;

  constructor(scene: Phaser.Scene, onAction: (action: PanelAction) => void) {
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
      (Object.keys(PANEL_LABELS) as PanelAction[]).map((action) => [
        action,
        textButton(scene, 0, 0, PANEL_LABELS[action], () => onAction(action))
          .setDepth(62)
          .setVisible(false),
      ]),
    );
  }

  draw(reading: DefenceReading, campaign: CampaignPlace | null = null): void {
    const lines = rewardsLines(reading, campaign);
    const actions = lines ? panelActions(reading, campaign) : [];
    const shown = lines ? `${lines.join('\n')}\n${actions.join(' ')}` : null;
    if (shown === this.shown) return;
    this.shown = shown;
    this.panel.setVisible(lines !== null);
    this.text.setVisible(lines !== null);
    for (const button of this.buttons.values()) button.setVisible(false);
    if (lines === null) return;
    this.text.setText(lines.join('\n'));
    this.layOut(actions);
  }

  /** Sizes the panel to the text, with a row of the buttons for `actions` beneath it if any. */
  private layOut(actions: readonly PanelAction[]): void {
    const { x, y } = this.panel;
    const row = actions.length > 0 ? BUTTON_ROW : 0;
    const height = Math.max(260, this.text.height + 80 + row);
    this.panel.setSize(Math.max(760, this.text.width + 80), height);
    this.text.setY(y - row / 2);
    const buttons = actions.map((action) => this.buttons.get(action)!);
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
