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
  next: { crawler: 4, runner: 2, heavy: 1 },
  ...over,
});

describe('The rewards screen', () => {
  it('sums up the Wave that ended in the Intermission after it, then the next Wave', () => {
    expect(rewardsLines(reading())).toEqual([
      'WAVE 1 OF 3 SURVIVED',
      '',
      'Kills 4    Ink Core HP 8',
      'Ink picked up    grey 120   blue 40   green 0   black 0   red 0',
      'Tanks refilled',
      '',
      'Next: Wave 2 of 3    4 Crawlers   2 Runners   1 Heavy',
      '',
      'Space: start Wave 2',
    ]);
  });

  it('shows the next Wave alone before the first, leaving out what it does not send', () => {
    const first = reading({ wave: 1, rewards: null, next: { crawler: 1, runner: 0, heavy: 3 } });

    expect(rewardsLines(first)).toEqual([
      'Next: Wave 1 of 3    1 Crawler   3 Heavies',
      '',
      'Space: start Wave 1',
    ]);
  });

  it('says a Wave that sends nothing sends no Enemies', () => {
    const empty = reading({ wave: 1, rewards: null, next: { crawler: 0, runner: 0, heavy: 0 } });

    expect(rewardsLines(empty)![0]).toBe('Next: Wave 1 of 3    no Enemies');
  });

  it('says the Level is cleared after the last Wave', () => {
    const lines = rewardsLines(
      reading({ phase: 'cleared', wave: 3, rewards: { summary: { ...summary, wave: 3 } } }),
    );

    expect(lines![0]).toBe('LEVEL CLEARED');
    expect(lines!.at(-1)).toBe('Clear: play the Level again');
  });

  it('shows nothing during a Wave or with Waves off', () => {
    expect(rewardsLines(reading({ phase: 'wave', next: null }))).toBeNull();
    expect(rewardsLines(reading({ phase: null, next: null }))).toBeNull();
  });

  it('shows nothing once lost outside the Campaign: the HUD says R or Clear', () => {
    expect(rewardsLines(reading({ phase: 'lost', coreDestroyed: true, next: null }))).toBeNull();
  });
});

describe('The rewards screen in the Campaign', () => {
  const second = { index: 1, levels: 3, hasNext: true, hints: [] };
  const last = { index: 2, levels: 3, hasNext: false, hints: [] };
  const cleared = reading({
    phase: 'cleared',
    wave: 3,
    rewards: { summary: { ...summary, wave: 3 } },
    next: null,
  });
  const lost = reading({ phase: 'lost', coreDestroyed: true, next: null });

  it('gives a line for each Colour and Enemy type new in the next Wave, below it', () => {
    const hinted = { ...second, hints: ['New: blue bounces', 'New: Heavies'] };

    expect(rewardsLines(reading({ wave: 1, rewards: null }), hinted)).toEqual([
      'Next: Wave 1 of 3    4 Crawlers   2 Runners   1 Heavy',
      'New: blue bounces',
      'New: Heavies',
      '',
      'Space: start Wave 1',
    ]);
    expect(rewardsLines(reading(), hinted)!.slice(-5)).toEqual([
      'Next: Wave 2 of 3    4 Crawlers   2 Runners   1 Heavy',
      'New: blue bounces',
      'New: Heavies',
      '',
      'Space: start Wave 2',
    ]);
  });

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
