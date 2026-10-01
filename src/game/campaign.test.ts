import { describe, expect, it } from 'vitest';
import { Campaign, CAMPAIGN_KEY, browserStore, type CampaignStore } from './campaign';
import type { Level } from './level';

/** A store in memory, which counts what is written to it. */
class FakeStore implements CampaignStore {
  writes = 0;

  constructor(public record: string | null = null) {}

  read(): string | null {
    return this.record;
  }

  write(record: string): void {
    this.record = record;
    this.writes++;
  }
}

const LEVELS: readonly Level[] = [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }];

/** Which of the Campaign's Levels are unlocked, in order. */
const unlocked = (campaign: Campaign) => LEVELS.map((_, index) => campaign.isUnlocked(index));

describe('A Campaign', () => {
  it('unlocks only Level 1 with nothing saved', () => {
    const campaign = new Campaign(LEVELS, new FakeStore());

    expect(unlocked(campaign)).toEqual([true, false, false]);
    expect(campaign.unlocked).toBe(1);
  });

  it('unlocks the next Level when one is cleared, and saves it', () => {
    const store = new FakeStore();
    const campaign = new Campaign(LEVELS, store);

    campaign.cleared(0);

    expect(unlocked(campaign)).toEqual([true, true, false]);
    expect(store.writes).toBe(1);
    expect(unlocked(new Campaign(LEVELS, store))).toEqual([true, true, false]);
  });

  it('has nothing to unlock after the last Level', () => {
    const store = new FakeStore();
    const campaign = new Campaign(LEVELS, store);
    campaign.cleared(0);
    campaign.cleared(1);
    expect(store.writes).toBe(2);

    campaign.cleared(2);

    expect(unlocked(campaign)).toEqual([true, true, true]);
    expect(campaign.hasNext(1)).toBe(true);
    expect(campaign.hasNext(2)).toBe(false);
    expect(store.writes).toBe(2);
  });

  it('saves nothing when a Level is cleared again, or an earlier one', () => {
    const store = new FakeStore();
    const campaign = new Campaign(LEVELS, store);
    campaign.cleared(0);
    campaign.cleared(1);

    campaign.cleared(1);
    campaign.cleared(0);

    expect(store.writes).toBe(2);
    expect(campaign.unlocked).toBe(3);
  });

  it("can't clear a locked Level", () => {
    const store = new FakeStore();
    const campaign = new Campaign(LEVELS, store);

    campaign.cleared(1);
    campaign.cleared(-1);
    campaign.cleared(0.5);

    expect(unlocked(campaign)).toEqual([true, false, false]);
    expect(store.writes).toBe(0);
  });

  it('reads what an earlier Campaign saved', () => {
    expect(unlocked(new Campaign(LEVELS, new FakeStore('{"unlocked":3}')))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it.each([
    ['not JSON', '{unlocked'],
    ['null', 'null'],
    ['a number', '2'],
    ['no count', '{}'],
    ['a count of 0', '{"unlocked":0}'],
    ['a fraction', '{"unlocked":1.5}'],
    ['a string', '{"unlocked":"2"}'],
  ])('unlocks only Level 1 from an unreadable record: %s', (_, record) => {
    expect(unlocked(new Campaign(LEVELS, new FakeStore(record)))).toEqual([true, false, false]);
  });

  it('unlocks no more Levels than it has', () => {
    expect(new Campaign(LEVELS, new FakeStore('{"unlocked":9}')).unlocked).toBe(3);
  });
});

describe("The browser's store", () => {
  it('keeps the record in localStorage under a versioned key', () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
    const global = globalThis as { localStorage?: unknown };
    const before = global.localStorage;
    global.localStorage = storage;
    try {
      new Campaign(LEVELS, browserStore()).cleared(0);

      expect(CAMPAIGN_KEY).toMatch(/v\d+$/);
      expect(items.get(CAMPAIGN_KEY)).toBe('{"unlocked":2}');
      expect(new Campaign(LEVELS, browserStore()).unlocked).toBe(2);
    } finally {
      global.localStorage = before;
    }
  });

  it('plays on unsaved where storage is missing or refuses', () => {
    const global = globalThis as { localStorage?: unknown };
    const before = global.localStorage;
    global.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    try {
      const campaign = new Campaign(LEVELS, browserStore());
      campaign.cleared(0);
      expect(campaign.unlocked).toBe(2);
      global.localStorage = undefined;
      expect(new Campaign(LEVELS, browserStore()).unlocked).toBe(1);
    } finally {
      global.localStorage = before;
    }
  });
});
