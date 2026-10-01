import { describe, expect, it } from 'vitest';
import type { DefenceReading } from '../game/defence-loop';
import { fromLineLength } from '../game/ink-table';
import { panelActions, rewardsLines } from './rewards-screen';

const summary = {
  wave: 1,
  kills: 4,
  coreHp: 8,
  ink: { grey: fromLineLength(120), blue: fromLineLength(40.4), green: 0, black: 0, red: 0 },
};

/** A reading of a Level of three Waves, after the first ended. */
const reading = (over: Partial<DefenceReading> = {}): DefenceReading => ({
  phase: 'intermission',
  wave: 2,
  waves: 3,
  toCome: 0,
  coreDestroyed: false,
  rewards: { summary },
  ...over,
});

describe('The rewards screen', () => {
  it("sums up the Wave that ended in the Intermission after it, and says what's next", () => {
    expect(rewardsLines(reading())).toEqual([
      'WAVE 1 OF 3 SURVIVED',
      '',
      'Kills 4    Ink Core HP 8',
      'Ink picked up    grey 120   blue 40   green 0   black 0   red 0',
      '',
      'Tanks refilled    Space: start Wave 2',
    ]);
  });

  it('says the Level is cleared after the last Wave', () => {
    const lines = rewardsLines(
      reading({ phase: 'cleared', wave: 3, rewards: { summary: { ...summary, wave: 3 } } }),
    );

    expect(lines![0]).toBe('LEVEL CLEARED');
    expect(lines!.at(-1)).toBe('Clear: play the Level again');
  });

  it('shows nothing before the first Wave, during a Wave or with Waves off', () => {
    expect(rewardsLines(reading({ wave: 1, rewards: null }))).toBeNull();
    expect(rewardsLines(reading({ phase: 'wave' }))).toBeNull();
    expect(rewardsLines(reading({ phase: null }))).toBeNull();
  });

  it('shows nothing once lost outside the Campaign: the HUD says R or Clear', () => {
    expect(rewardsLines(reading({ phase: 'lost', coreDestroyed: true }))).toBeNull();
  });
});

describe('The rewards screen in the Campaign', () => {
  const second = { index: 1, levels: 3, hasNext: true };
  const last = { index: 2, levels: 3, hasNext: false };
  const cleared = reading({
    phase: 'cleared',
    wave: 3,
    rewards: { summary: { ...summary, wave: 3 } },
  });
  const lost = reading({ phase: 'lost', coreDestroyed: true });

  it('offers Next Level and the Level list once a Level is cleared', () => {
    expect(rewardsLines(cleared, second)!.at(-1)).toBe('Level 3 unlocked');
    expect(panelActions(cleared, second)).toEqual(['next-level', 'level-list']);
  });

  it('says the Campaign is cleared after the last Level, and offers the Level list', () => {
    expect(rewardsLines(cleared, last)!.at(-1)).toBe('Campaign cleared');
    expect(panelActions(cleared, last)).toEqual(['level-list']);
  });

  it('offers Retry Wave, Restart Level and the Level list once a Level is lost', () => {
    expect(rewardsLines(lost, second)![0]).toBe('WAVE 2 OF 3 LOST');
    expect(panelActions(lost, second)).toEqual(['retry-wave', 'restart-level', 'level-list']);
  });

  it('offers nothing while the Level goes on, nor outside the Campaign', () => {
    expect(panelActions(reading(), second)).toEqual([]);
    expect(panelActions(reading({ phase: 'wave' }), second)).toEqual([]);
    expect(panelActions(cleared, null)).toEqual([]);
    expect(panelActions(lost, null)).toEqual([]);
  });
});
