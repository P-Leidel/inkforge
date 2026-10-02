import { describe, expect, it } from 'vitest';
import { browserStore, type CampaignStore } from './campaign';
import { Tutorial, TUTORIAL_CARDS, TUTORIAL_KEY } from './tutorial';

/** A store in memory, starting with `record`. */
function memory(record: string | null = null): CampaignStore & { record: string | null } {
  return {
    record,
    read() {
      return this.record;
    },
    write(next) {
      this.record = next;
    },
  };
}

/** A store whose storage refuses everything, as in a private window. */
const refusing: CampaignStore = {
  read: () => null,
  write: () => {},
};

describe('The Tutorial', () => {
  it('has three cards: the goal, killing, and pebble vs stone with grey and black swatches', () => {
    expect(TUTORIAL_CARDS.map((card) => card.title)).toEqual([
      'Defend the Ink Core',
      'Crush them',
      'Pebble or stone?',
    ]);
    expect(TUTORIAL_CARDS[2]!.swatches.map((swatch) => swatch.colour)).toEqual(['grey', 'black']);
  });

  it('opens at card 1 the first time Campaign Level 1 starts', () => {
    const tutorial = new Tutorial(memory());

    expect(tutorial.offer(0)).toBe(true);
    expect(tutorial.shown).toMatchObject({ index: 0, count: 3 });
  });

  it('never opens by itself on a later Campaign Level or in Free play', () => {
    const tutorial = new Tutorial(memory());

    expect(tutorial.offer(1)).toBe(false);
    expect(tutorial.offer(2)).toBe(false);
    expect(tutorial.offer(null)).toBe(false);
    expect(tutorial.isOpen).toBe(false);
  });

  it('turns card by card and closes after the last, seen', () => {
    const store = memory();
    const tutorial = new Tutorial(store);
    tutorial.offer(0);

    tutorial.next();
    expect(tutorial.shown?.index).toBe(1);
    tutorial.next();
    expect(tutorial.shown?.index).toBe(2);
    tutorial.next();

    expect(tutorial.isOpen).toBe(false);
    expect(tutorial.seen).toBe(true);
    expect(store.record).not.toBeNull();
  });

  it('is seen once skipped, from any card', () => {
    const tutorial = new Tutorial(memory());
    tutorial.offer(0);
    tutorial.next();

    tutorial.skip();

    expect(tutorial.isOpen).toBe(false);
    expect(tutorial.seen).toBe(true);
  });

  it('does not open by itself again once seen, even on a new page load', () => {
    const store = memory();
    const first = new Tutorial(store);
    first.offer(0);
    first.skip();

    expect(first.offer(0)).toBe(false);
    expect(new Tutorial(store).offer(0)).toBe(false);
  });

  it('opens again at card 1 when asked, seen or not', () => {
    const tutorial = new Tutorial(memory());
    tutorial.offer(0);
    tutorial.next();
    tutorial.skip();

    tutorial.open();

    expect(tutorial.shown?.index).toBe(0);
  });

  it('is not seen when hidden, so it is offered again', () => {
    const tutorial = new Tutorial(memory());
    tutorial.offer(0);

    tutorial.hide();

    expect(tutorial.isOpen).toBe(false);
    expect(tutorial.offer(0)).toBe(true);
  });

  it('where storage refuses, shows once a page load', () => {
    const tutorial = new Tutorial(refusing);
    tutorial.offer(0);
    tutorial.skip();

    expect(tutorial.offer(0)).toBe(false);
    expect(new Tutorial(refusing).offer(0)).toBe(true);
  });

  it('keeps working when localStorage throws', () => {
    const global = globalThis as { localStorage?: unknown };
    const before = global.localStorage;
    const fail = () => {
      throw new Error('blocked');
    };
    global.localStorage = { getItem: fail, setItem: fail };
    try {
      const tutorial = new Tutorial(browserStore(TUTORIAL_KEY));

      expect(tutorial.offer(0)).toBe(true);
      tutorial.skip();
      expect(tutorial.isOpen).toBe(false);
      expect(new Tutorial(browserStore(TUTORIAL_KEY)).offer(0)).toBe(true);
    } finally {
      global.localStorage = before;
    }
  });

  it('keeps the seen state in localStorage under a versioned key', () => {
    const global = globalThis as { localStorage?: unknown };
    const before = global.localStorage;
    const items = new Map<string, string>();
    global.localStorage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    };
    try {
      const tutorial = new Tutorial(browserStore(TUTORIAL_KEY));
      tutorial.offer(0);
      tutorial.skip();

      expect(TUTORIAL_KEY).toBe('inkforge.tutorial.v1');
      expect(items.has(TUTORIAL_KEY)).toBe(true);
    } finally {
      global.localStorage = before;
    }
  });
});
