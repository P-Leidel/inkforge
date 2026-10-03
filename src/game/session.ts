import type { StressTest } from '../stress-tests/stress-test';
import { hintLines } from './analysis';
import type { Campaign } from './campaign';
import type { Game } from './game';
import { SANDBOX_LEVEL, type Level } from './level';

/** Which Campaign Level is being played, and what comes after it. */
export interface CampaignPlace {
  /** Which of the Campaign's Levels, from 0. */
  readonly index: number;
  /** How many Levels the Campaign has. */
  readonly levels: number;
  /**
   * In an Intermission, the hint for each Colour and Enemy type new to the
   * Campaign in the next Wave, one line each; none outside an Intermission.
   */
  readonly hints: readonly string[];
}

/** A choice the end of a Campaign Level offers. */
export type Choice = 'next-level' | 'retry-wave' | 'restart-level' | 'level-list';

/**
 * What the end of a Campaign Level offers: once it is cleared, Next Level
 * (unless it was the last) and the Level list; once it is lost, Retry Wave,
 * Restart Level and the Level list.
 */
export interface Offer {
  /** The choices, in the order they stand. */
  readonly choices: readonly Choice[];
  /** The Level clearing this one unlocked; null once lost, and after the last Level. */
  readonly next: { readonly name: string } | null;
}

/**
 * What a choice, or R, did, for the scene to follow: a Level was loaded
 * (`started`), the world was taken back to the last start (`reset`), the
 * Level was left for the Level list (`left`), or the choice wasn't on
 * offer and nothing happened (`refused`).
 */
export type Acted = 'started' | 'reset' | 'left' | 'refused';

/** What the scene shows of what is being played. */
export interface SessionReading {
  /** The Level's name, for F1's readings. */
  readonly name: string;
  /** The stress test's one-line status, if a stress test is being played. */
  readonly status: string | null;
  /** Where in the Campaign, if a Campaign Level is being played; null otherwise. */
  readonly campaign: CampaignPlace | null;
  /** What the end of a Campaign Level offers; null outside the Campaign, and while it goes on. */
  readonly offer: Offer | null;
}

/**
 * What is being played, over the Game it is handed: the Level, for a stress
 * test its `StressTest`, and for a Campaign Level, which one. `play` loads a
 * Level and remembers it, `playCampaign` a Campaign Level, `clear` loads it
 * again (Clear), `retry` takes the world back to the last start (R), and
 * `advance` advances the Game and then the stress test, in that order. As a
 * Campaign Level is cleared, it tells the Campaign once, which unlocks the
 * next. Once a Campaign Level is cleared or lost, its reading offers what
 * comes next, and `act` carries out a choice on offer. It puts the sandbox
 * tool (sending in Enemies) away for a Campaign Level and back for Free
 * play; the Eraser stays on hand. Until told otherwise, it plays the
 * sandbox, as a new Game is.
 */
export class Session {
  private level: Level = SANDBOX_LEVEL;
  private test: StressTest | null = null;
  /** The Campaign Level being played, from 0; null outside the Campaign. */
  private campaignIndex: number | null = null;
  /** Whether the Level was cleared as of the last advance, so the Campaign is told once. */
  private wasCleared = false;

  constructor(
    private readonly game: Game,
    /** The Campaign whose Levels `playCampaign` plays; none by default. */
    readonly campaign: Campaign | null = null,
  ) {}

  /** The Level being played. */
  get playing(): Level {
    return this.level;
  }

  /** The stress test being played, or null. */
  get stressTest(): StressTest | null {
    return this.test;
  }

  get reading(): SessionReading {
    return {
      name: this.level.name ?? 'Level',
      status: this.test?.status() ?? null,
      campaign: this.place,
      offer: this.offer,
    };
  }

  /**
   * Loads `level` and remembers it, for Clear. It is not a Campaign Level,
   * even if the Campaign has it: Free play, with the sandbox tool on hand.
   */
  play(level: Level): void {
    this.campaignIndex = null;
    this.game.sandboxTools = true;
    this.load(level);
  }

  /**
   * Loads the Campaign's Level at `index`, from 0, at its first Wave, if it
   * is unlocked; returns whether it did. A locked one can't be played. The
   * sandbox tool, sending in Enemies, is put away.
   */
  playCampaign(index: number): boolean {
    const campaign = this.campaign;
    if (!campaign?.isUnlocked(index)) return false;
    this.campaignIndex = index;
    this.game.sandboxTools = false;
    this.load(campaign.levels[index]!);
    return true;
  }

  /** Clear: loads the Level being played again, from Wave 1. A Campaign Level stays one. */
  clear(): void {
    this.test = this.game.load(this.level) ?? null;
    this.wasCleared = false;
  }

  /** R: takes the world and the Tanks back to the last start, if there was one. */
  retry(): Acted {
    this.game.reset();
    return 'reset';
  }

  /**
   * Carries out `choice`, if the end of the Campaign Level offers it: Next
   * Level loads the Level after it at its first Wave, Retry Wave is R,
   * Restart Level is Clear, and the Level list leaves the Level as it is.
   * A choice not on offer does nothing.
   */
  act(choice: Choice): Acted {
    if (!this.offer?.choices.includes(choice)) return 'refused';
    switch (choice) {
      case 'next-level':
        return this.playCampaign(this.campaignIndex! + 1) ? 'started' : 'refused';
      case 'retry-wave':
        return this.retry();
      case 'restart-level':
        this.clear();
        return 'started';
      case 'level-list':
        return 'left';
    }
  }

  /**
   * Advances the Game by real elapsed time, then updates the stress test, if
   * any, which reads the world as it now is, and tells the Campaign if its
   * Level is now cleared. Returns the steps taken.
   */
  advance(seconds: number): number {
    const steps = this.game.advance(seconds);
    this.test?.update();
    const cleared = this.game.defence.reading.phase === 'cleared';
    if (cleared && !this.wasCleared && this.campaignIndex !== null) {
      this.campaign!.cleared(this.campaignIndex);
    }
    this.wasCleared = cleared;
    return steps;
  }

  private load(level: Level): void {
    this.level = level;
    this.clear();
  }

  private get place(): CampaignPlace | null {
    const index = this.campaignIndex;
    if (index === null || !this.campaign) return null;
    const { phase, wave } = this.game.defence.reading;
    return {
      index,
      levels: this.campaign.levels.length,
      hints: phase === 'intermission' ? hintLines(this.campaign.levels, index, wave - 1) : [],
    };
  }

  private get offer(): Offer | null {
    const index = this.campaignIndex;
    const campaign = this.campaign;
    if (index === null || !campaign) return null;
    switch (this.game.defence.reading.phase) {
      case 'cleared':
        return campaign.hasNext(index)
          ? { choices: ['next-level', 'level-list'], next: { name: campaign.name(index + 1) } }
          : { choices: ['level-list'], next: null };
      case 'lost':
        return { choices: ['retry-wave', 'restart-level', 'level-list'], next: null };
      case 'intermission':
      case 'wave':
      case null:
        return null;
    }
  }
}
