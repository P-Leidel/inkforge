import type { Level } from './level';

/**
 * Where the Campaign keeps its one record: `localStorage` in the browser
 * (`browserStore`), a fake in tests. `read` gives back what was last
 * written, or null if nothing was or it can't be read.
 */
export interface CampaignStore {
  read(): string | null;
  write(record: string): void;
}

/** The `localStorage` key of the Campaign's record. A new shape of record gets a new version. */
export const CAMPAIGN_KEY = 'inkforge.campaign.v1';

/**
 * The browser's store: `localStorage` under `CAMPAIGN_KEY`. Where storage is
 * missing or refuses (a private window, blocked site data), reading gives
 * null and writing does nothing, so the Campaign plays on unsaved.
 */
export function browserStore(key = CAMPAIGN_KEY): CampaignStore {
  return {
    read() {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(record) {
      try {
        globalThis.localStorage?.setItem(key, record);
      } catch {
        // Unsaved: the Campaign still has it until the page closes.
      }
    },
  };
}

/** The record, as it is written: how many Levels are unlocked, from the first. */
interface CampaignRecord {
  readonly unlocked: number;
}

/**
 * The Campaign (CONTEXT.md): its Levels in order, and which are unlocked.
 * Level 1 always is; each other once the one before is cleared. Clearing a
 * Level unlocks the next and saves it through its store, which holds only
 * that: a missing or unreadable record unlocks only Level 1. Levels are
 * counted from 0 here. It knows nothing of Phaser.
 */
export class Campaign {
  /** How many Levels are unlocked, from the first: at least 1. */
  private count: number;

  constructor(
    readonly levels: readonly Level[],
    private readonly store: CampaignStore,
  ) {
    if (levels.length === 0) throw new Error('a Campaign has at least one Level');
    this.count = unlockedIn(store.read(), levels.length);
  }

  /** How many Levels are unlocked, from the first. */
  get unlocked(): number {
    return this.count;
  }

  /** Whether the Level at `index` is unlocked, so it can be played. */
  isUnlocked(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.count;
  }

  /** The name of the Level at `index`: its own, or failing that "Level n", by its place. */
  name(index: number): string {
    return this.levels[index]?.name ?? `Level ${index + 1}`;
  }

  /** Whether a Level comes after the one at `index`. */
  hasNext(index: number): boolean {
    return index + 1 < this.levels.length;
  }

  /**
   * The Level at `index` was cleared: unlocks the next, if there is one, and
   * saves it. Clearing it again, or a Level before the last unlocked one,
   * changes nothing and saves nothing.
   */
  cleared(index: number): void {
    if (!this.isUnlocked(index)) return;
    const count = Math.min(this.levels.length, index + 2);
    if (count <= this.count) return;
    this.count = count;
    const record: CampaignRecord = { unlocked: count };
    this.store.write(JSON.stringify(record));
  }
}

/** How many of `levels` Levels `record` unlocks: 1 if it is missing or unreadable. */
function unlockedIn(record: string | null, levels: number): number {
  if (record === null) return 1;
  let parsed: unknown;
  try {
    parsed = JSON.parse(record);
  } catch {
    return 1;
  }
  const unlocked = (parsed as Partial<CampaignRecord> | null)?.unlocked;
  if (typeof unlocked !== 'number' || !Number.isInteger(unlocked) || unlocked < 1) return 1;
  return Math.min(levels, unlocked);
}
