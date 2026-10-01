import { describe, expect, it } from 'vitest';
import { Campaign, type CampaignStore } from '../game/campaign';
import { levelEntries } from './menu-screen';

/** A store holding `record`, which forgets what is written. */
const store = (record: string | null): CampaignStore => ({ read: () => record, write: () => {} });

const LEVELS = [{ name: 'Level 1' }, { name: 'Level 2' }, {}];

describe('The Level list', () => {
  it('shows every Level, the locked ones marked and shut', () => {
    expect(levelEntries(new Campaign(LEVELS, store(null)))).toEqual([
      { index: 0, label: 'Level 1', locked: false },
      { index: 1, label: 'Level 2    locked', locked: true },
      { index: 2, label: 'Level 3    locked', locked: true },
    ]);
  });

  it('opens what clearing has unlocked', () => {
    const entries = levelEntries(new Campaign(LEVELS, store('{"unlocked":2}')));

    expect(entries.map((entry) => entry.locked)).toEqual([false, false, true]);
  });
});
