import { COLOURS, type Colour } from '../materials/colour';
import { enemyName, isBoss } from '../materials/enemy-types';
import type { Arena } from '../sandbox/arena';
import type { StressTest } from '../stress-tests/stress-test';
import { hintLines } from './analysis';
import type { Campaign } from './campaign';
import { CardViewer } from './cards';
import type { DefenceReading } from './defence-loop';
import type { Allowed, Game } from './game';
import type { TankReadings } from './ink-tanks';
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

/**
 * What kind of play a Level is being played as: Free play, with the sandbox
 * tool on hand, a Campaign Level, or the Tutorial.
 */
export type Play = 'free-play' | 'campaign' | 'tutorial';

/** A choice the end of a Campaign Level, or of the Tutorial, offers. */
export type Choice =
  'next-level' | 'start-campaign' | 'retry-wave' | 'restart-level' | 'level-list' | 'title';

/**
 * What the end of a Campaign Level or the Tutorial offers. A Campaign Level
 * once cleared: Next Level (unless it was the last) and the Level list;
 * once lost, Retry Wave, Restart Level and the Level list. The Tutorial once
 * cleared: Start Campaign and the title screen; once lost, Retry Wave,
 * Restart Level and the title screen.
 */
export interface Offer {
  /** The choices, in the order they stand. */
  readonly choices: readonly Choice[];
  /** The Level clearing this one unlocked; null once lost, and after the last Level. */
  readonly next: { readonly name: string } | null;
}

/**
 * What a command did, for the scene to follow: a Level was loaded
 * (`started`), the world was taken back to the last start (`reset`), the
 * Level was left for the Level list (`left`) or for the title screen
 * (`title`), or it couldn't be done and nothing happened (`refused`).
 */
export type Acted = 'started' | 'reset' | 'left' | 'title' | 'refused';

/** What the scene shows of what is being played. */
export interface SessionReading {
  /** The Level's name, for F1's readings. */
  readonly name: string;
  /** The stress test's one-line status, if a stress test is being played. */
  readonly status: string | null;
  /** What kind of play it is: Free play's toolbar buttons show in Free play only. */
  readonly play: Play;
  /** Where in the Campaign, if a Campaign Level is being played; null otherwise. */
  readonly campaign: CampaignPlace | null;
  /** What the end of a Campaign Level or the Tutorial offers; null in Free play, and while it goes on. */
  readonly offer: Offer | null;
}

/** A boss in the Arena, as its bar at the top of the screen shows it. */
export interface BossReading {
  /** What it is called: the bar's label. */
  readonly name: string;
  /** HP left, never below 0. */
  readonly hp: number;
  /** HP when whole. */
  readonly fullHp: number;
}

/**
 * Everything the screen shows of the game in one frame, worked out once:
 * the HUD, the palette, the rewards screen and the boss bar draw from it,
 * and none of them holds the Game.
 */
export interface Frame {
  /** Where the Defence loop is. */
  readonly defence: DefenceReading;
  /** What is being played. */
  readonly session: SessionReading;
  /** Whether physics is running. */
  readonly running: boolean;
  /** What is on hand now: the tools, and what refuses building. */
  readonly allowed: Allowed;
  /** The Colours the Level has, in palette order: every Colour while Ink costs nothing. */
  readonly colours: readonly Colour[];
  /** Whether Strokes and Fills cost Ink. */
  readonly inkCosts: boolean;
  /** Each Ink Tank as the player reads it. */
  readonly tanks: TankReadings;
  /** Where the Enemies come in: the HUD counts them there. */
  readonly arena: Pick<Arena, 'spawn' | 'spawnSide' | 'width'>;
  /** The boss in the Arena, from when it is sent in until it dies or goes; null with none. */
  readonly boss: BossReading | null;
}

/**
 * What is being played, over the Game it is handed, from its start to its
 * end: the Level, for a stress test its `StressTest`, for a Campaign Level
 * which one, and its Cards. `play` loads a Level as Free play and remembers
 * it, `playCampaign` a Campaign Level, `playTutorial` the Tutorial, `clear`
 * loads it again (Clear), `retry` takes the world back to the last start
 * (R), and `advance` advances the Game and then the stress test, in that
 * order. Each says what it did, for the scene to follow. As a Campaign Level
 * is cleared, it tells the Campaign once, which unlocks the next. Once a
 * Campaign Level or the Tutorial is cleared or lost, its reading offers what
 * comes next, and `act` carries out a choice on offer. A Wave's Cards open
 * the first time its Intermission is reached since the Level started: R
 * does not open them again, Clear does; `showCards` (H) opens the
 * Tutorial's, all of them. It puts the sandbox tool (sending in Enemies)
 * away for a Campaign Level and the Tutorial and back for Free play; the
 * Eraser stays on hand. Until told otherwise, it plays the sandbox, as a new
 * Game is.
 */
export class Session {
  /** The Cards shown over the Arena: nothing is played or drawn behind them. */
  readonly cards = new CardViewer();
  private level: Level = SANDBOX_LEVEL;
  private test: StressTest | null = null;
  private kind: Play = 'free-play';
  /** The Campaign Level being played, from 0; null outside the Campaign. */
  private campaignIndex: number | null = null;
  /** Whether the Level was cleared as of the last advance, so the Campaign is told once. */
  private wasCleared = false;
  /** The Waves, from 0, whose Cards have opened since the Level started. */
  private readonly cardsShown = new Set<number>();

  constructor(
    private readonly game: Game,
    /** The Campaign whose Levels `playCampaign` plays; none by default. */
    readonly campaign: Campaign | null = null,
    /** The Level `playTutorial` plays, and whose Cards H shows; none by default. */
    readonly tutorial: Level | null = null,
  ) {}

  /** The Level being played. */
  get playing(): Level {
    return this.level;
  }

  /** The stress test being played, or null. */
  get stressTest(): StressTest | null {
    return this.test;
  }

  /** Everything the screen shows of this frame, worked out once: read it after `advance`. */
  frame(): Frame {
    const game = this.game;
    return {
      defence: game.defence.reading,
      session: this.reading,
      running: game.isRunning,
      allowed: game.allowed,
      colours: COLOURS.filter((colour) => game.has(colour)),
      inkCosts: game.inkCosts,
      tanks: game.tanks,
      arena: game.world.arena,
      boss: this.boss,
    };
  }

  /** The oldest boss in the Arena, if there is one. */
  private get boss(): BossReading | null {
    const boss = this.game.world.enemies.find((enemy) => isBoss(enemy.type));
    return boss ? { name: enemyName(boss.type, 1), hp: boss.hp, fullHp: boss.fullHp } : null;
  }

  get reading(): SessionReading {
    return {
      name: this.level.name ?? 'Level',
      status: this.test?.status() ?? null,
      play: this.kind,
      campaign: this.place,
      offer: this.offer,
    };
  }

  /**
   * Loads `level` and remembers it, for Clear. It is not a Campaign Level,
   * even if the Campaign has it: Free play, with the sandbox tool on hand.
   */
  play(level: Level): Acted {
    return this.load(level, 'free-play');
  }

  /**
   * Loads the Campaign's Level at `index`, from 0, at its first Wave, if it
   * is unlocked. A locked one can't be played. The sandbox tool, sending in
   * Enemies, is put away.
   */
  playCampaign(index: number): Acted {
    const campaign = this.campaign;
    if (!campaign?.isUnlocked(index)) return 'refused';
    return this.load(campaign.levels[index]!, 'campaign', index);
  }

  /** Loads the Tutorial at its first Wave, the sandbox tool put away, if there is one. */
  playTutorial(): Acted {
    return this.tutorial ? this.load(this.tutorial, 'tutorial') : 'refused';
  }

  /**
   * Clear: loads the Level being played again, from Wave 1, as the same kind
   * of play. Its Cards open again.
   */
  clear(): Acted {
    this.test = this.game.load(this.level) ?? null;
    this.wasCleared = false;
    this.cardsShown.clear();
    this.cards.close();
    this.openCards();
    return 'started';
  }

  /** R: takes the world and the Tanks back to the last start, if there was one. */
  retry(): Acted {
    this.game.reset();
    return 'reset';
  }

  /**
   * H: opens the Tutorial's Cards, all of them, at the first, pausing a Wave
   * under way; it stays paused once they close. Does nothing while Cards are
   * open, or without a Tutorial.
   */
  showCards(): void {
    if (this.cards.isOpen || !this.tutorial?.cards) return;
    if (this.game.isRunning) this.game.togglePause();
    this.cards.show(this.tutorial.cards.flat());
  }

  /**
   * Carries out `choice`, if the end of the Campaign Level or the Tutorial
   * offers it: Next Level loads the Level after it at its first Wave, Start
   * Campaign the Campaign's first Level, Retry Wave is R, Restart Level is
   * Clear, and the Level list and the title screen leave the Level as it is.
   * A choice not on offer does nothing.
   */
  act(choice: Choice): Acted {
    if (!this.offer?.choices.includes(choice)) return 'refused';
    switch (choice) {
      case 'next-level':
        return this.playCampaign(this.campaignIndex! + 1);
      case 'start-campaign':
        return this.playCampaign(0);
      case 'retry-wave':
        return this.retry();
      case 'restart-level':
        return this.clear();
      case 'level-list':
        return 'left';
      case 'title':
        return 'title';
    }
  }

  /**
   * Advances the Game by real elapsed time, then updates the stress test, if
   * any, which reads the world as it now is, and tells the Campaign if its
   * Level is now cleared. Opens the next Wave's Cards once its Intermission
   * is reached. Returns the steps taken.
   */
  advance(seconds: number): number {
    const steps = this.game.advance(seconds);
    this.test?.update();
    const cleared = this.game.defence.reading.phase === 'cleared';
    if (cleared && !this.wasCleared && this.campaignIndex !== null) {
      this.campaign!.cleared(this.campaignIndex);
    }
    this.wasCleared = cleared;
    this.openCards();
    return steps;
  }

  private load(level: Level, kind: Play, campaignIndex: number | null = null): Acted {
    this.level = level;
    this.kind = kind;
    this.campaignIndex = campaignIndex;
    this.game.sandboxTools = kind === 'free-play';
    return this.clear();
  }

  /** In an Intermission, opens the next Wave's Cards, if it has any and they haven't opened yet. */
  private openCards(): void {
    const { phase, wave } = this.game.defence.reading;
    const index = wave - 1;
    if (phase !== 'intermission' || this.cardsShown.has(index)) return;
    const cards = this.level.cards?.[index];
    if (!cards) return;
    this.cardsShown.add(index);
    this.cards.show(cards);
  }

  private get place(): CampaignPlace | null {
    const index = this.campaignIndex;
    if (index === null || !this.campaign) return null;
    const { phase, wave } = this.game.defence.reading;
    return {
      index,
      levels: this.campaign.levels.length,
      hints:
        phase === 'intermission'
          ? hintLines(this.campaign.levels, index, wave - 1, this.game.defence.list)
          : [],
    };
  }

  private get offer(): Offer | null {
    if (this.kind === 'tutorial') {
      switch (this.game.defence.reading.phase) {
        case 'cleared':
          return { choices: ['start-campaign', 'title'], next: null };
        case 'lost':
          return { choices: ['retry-wave', 'restart-level', 'title'], next: null };
        case 'intermission':
        case 'wave':
        case null:
          return null;
      }
    }
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
