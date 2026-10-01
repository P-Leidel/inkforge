import type { StressTest } from '../stress-tests/stress-test';
import type { Game } from './game';
import { SANDBOX_LEVEL, type Level } from './level';

/** What the scene shows of what is being played. */
export interface SessionReading {
  /** The Level's name, for F1's readings. */
  readonly name: string;
  /** The stress test's one-line status, if a stress test is being played. */
  readonly status: string | null;
}

/**
 * What is being played, over the Game it is handed: the Level, and for a
 * stress test, its `StressTest`. `play` loads a Level and remembers it,
 * `clear` loads it again (Clear), and `advance` advances the Game and then
 * the stress test, in that order. Until `play`, it plays the sandbox, as a
 * new Game is. R stays a Game command.
 */
export class Session {
  private level: Level = SANDBOX_LEVEL;
  private test: StressTest | null = null;

  constructor(private readonly game: Game) {}

  /** The Level being played. */
  get playing(): Level {
    return this.level;
  }

  /** The stress test being played, or null. */
  get stressTest(): StressTest | null {
    return this.test;
  }

  get reading(): SessionReading {
    return { name: this.level.name ?? 'Level', status: this.test?.status() ?? null };
  }

  /** Loads `level` and remembers it, for Clear. */
  play(level: Level): void {
    this.level = level;
    this.clear();
  }

  /** Clear: loads the Level being played again, from Wave 1. */
  clear(): void {
    this.test = this.game.load(this.level) ?? null;
  }

  /**
   * Advances the Game by real elapsed time, then updates the stress test, if
   * any, which reads the world as it now is. Returns the steps taken.
   */
  advance(seconds: number): number {
    const steps = this.game.advance(seconds);
    this.test?.update();
    return steps;
  }
}
