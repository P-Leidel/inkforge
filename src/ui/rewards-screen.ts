import type Phaser from 'phaser';
import type { DefenceReading } from '../game/defence-loop';
import { inLineLength } from '../game/ink-table';
import type { CampaignPlace } from '../game/session';
import { COLOURS } from '../materials/colour';
import { FONT_FAMILY, PALETTE } from '../rendering/palette';
import { textButton } from './text-button';

/**
 * What the rewards screen says, line by line: the summary of the Wave that
 * ended, in an Intermission after it or once the Level is cleared, and in
 * the Campaign (`campaign`, where in it), that the Level is lost. Null while
 * there is nothing to show: with Waves off, during a Wave, before the first
 * Wave, and once lost outside the Campaign, where the HUD says what to do.
 * A choice of rewards would be listed below the summary.
 */
export function rewardsLines(
  reading: DefenceReading,
  campaign: CampaignPlace | null = null,
): string[] | null {
  const { phase, rewards, wave, waves } = reading;
  if (phase === 'lost' && campaign) {
    return [`WAVE ${wave} OF ${waves} LOST`, '', 'The Ink Core is destroyed'];
  }
  if (!rewards || (phase !== 'intermission' && phase !== 'cleared')) return null;
  const { summary } = rewards;
  const ink = COLOURS.map((colour) => `${colour} ${Math.round(inLineLength(summary.ink[colour]))}`);
  return [
    phase === 'cleared' ? 'LEVEL CLEARED' : `WAVE ${summary.wave} OF ${waves} SURVIVED`,
    '',
    `Kills ${summary.kills}    Ink Core HP ${Math.round(summary.coreHp)}`,
    `Ink picked up    ${ink.join('   ')}`,
    '',
    phase === 'intermission'
      ? `Tanks refilled    Space: start Wave ${wave}`
      : !campaign
        ? 'Clear: play the Level again'
        : campaign.hasNext
          ? `Level ${campaign.index + 2} unlocked`
          : 'Campaign cleared',
  ];
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
 * Intermission, with the summary of the Wave that ended, and in the
 * Campaign, once the Level is cleared or lost, the buttons of what to do
 * next. Everything behind it stays as the Wave left it. A button's click
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
    this.panel.setSize(this.panel.width, height);
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
