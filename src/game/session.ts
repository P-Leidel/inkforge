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
  /** Whether a Level comes after it: after the last, the Campaign is cleared. */
  readonly hasNext: boolean;
  /**
   * In an Intermission, the hint for each Colour and Enemy type new to the
   * Campaign in the next Wave, one line each; none outside an Intermission.
   */
  readonly hints: readonly string[];
}

/** What the scene shows of what is being played. */
export interface SessionReading {
  /** The Level's name, for F1's readings. */
  readonly name: string;
  /** The stress test's one-line status, if a stress test is being played. */
  readonly status: string | null;
  /** Where in the Campaign, if a Campaign Level is being played; null otherwise. */
  readonly campaign: CampaignPlace | null;
}

/**
 * What is being played, over the Game it is handed: the Level, for a stress
 * test its `StressTest`, and for a Campaign Level, which one. `play` loads a
 * Level and remembers it, `playCampaign` and `playNext` a Campaign Level,
 * `clear` loads it again (Clear), and `advance` advances the Game and then
 * the stress test, in that order. Once a Campaign Level is cleared, it tells
 * the Campaign, which unlocks the next. Until told otherwise, it plays the
 * sandbox, as a new Game is. R stays a Game command.
 */
export class Session {
  private level: Level = SANDBOX_LEVEL;
  private test: StressTest | null = null;
  /** The Campaign Level being played, from 0; null outside the Campaign. */
  private campaignIndex: number | null = null;

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
    };
  }

  /** Loads `level` and remembers it, for Clear. It is not a Campaign Level, even if the Campaign has it. */
  play(level: Level): void {
    this.campaignIndex = null;
    this.load(level);
  }

  /**
   * Loads the Campaign's Level at `index`, from 0, at its first Wave, if it
   * is unlocked; returns whether it did. A locked one can't be played.
   */
  playCampaign(index: number): boolean {
    const campaign = this.campaign;
    if (!campaign?.isUnlocked(index)) return false;
    this.campaignIndex = index;
    this.load(campaign.levels[index]!);
    return true;
  }

  /**
   * Next Level: loads the Campaign Level after the one being played, at its
   * first Wave, once clearing it has unlocked it; returns whether it did.
   */
  playNext(): boolean {
    if (this.campaignIndex === null) return false;
    return this.playCampaign(this.campaignIndex + 1);
  }

  /** Clear: loads the Level being played again, from Wave 1. A Campaign Level stays one. */
  clear(): void {
    this.test = this.game.load(this.level) ?? null;
  }

  /**
   * Advances the Game by real elapsed time, then updates the stress test, if
   * any, which reads the world as it now is, and tells the Campaign if its
   * Level is now cleared. Returns the steps taken.
   */
  advance(seconds: number): number {
    const steps = this.game.advance(seconds);
    this.test?.update();
    if (this.campaignIndex !== null && this.game.defence.reading.phase === 'cleared') {
      this.campaign!.cleared(this.campaignIndex);
    }
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
      hasNext: this.campaign.hasNext(index),
      hints: phase === 'intermission' ? hintLines(this.campaign.levels, index, wave - 1) : [],
    };
  }
}
