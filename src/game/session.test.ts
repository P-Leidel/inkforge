import { describe, expect, it } from 'vitest';
import { THREE_WAVES_DEMO } from '../gallery/gallery';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { BOX_TOWER_LEVEL } from '../stress-tests/box-tower';
import type { StressTest } from '../stress-tests/stress-test';
import { dragAlong } from '../stroke/pointer-paths';
import type { Game } from './game';
import { SANDBOX_LEVEL, type Level } from './level';
import { Session } from './session';
import { games } from './test-support';

const createGame = games();

/** A Level that builds a grey Line, so a load can be seen. */
const LINE_LEVEL: Level = {
  name: 'One Line',
  build(world) {
    world.submitStroke(
      dragAlong([
        { x: 300, y: 500 },
        { x: 500, y: 500 },
      ]),
      'grey',
    );
  },
};

/** A stress test that notes the world's time at each update. */
class Recorder implements StressTest {
  readonly name = 'Recorder';
  readonly updates: number[] = [];

  constructor(private readonly game: Game) {}

  update(): void {
    this.updates.push(this.game.world.time);
  }

  status(): string {
    return `${this.updates.length} updates`;
  }
}

describe('A Session', () => {
  it('plays the sandbox until told otherwise', () => {
    const session = new Session(createGame(true));

    expect(session.playing).toBe(SANDBOX_LEVEL);
    expect(session.reading).toEqual({ name: 'Sandbox', status: null });
  });

  it('play loads a Level and remembers it', () => {
    const game = createGame(true);
    const session = new Session(game);

    session.play(LINE_LEVEL);

    expect(session.playing).toBe(LINE_LEVEL);
    expect(game.world.lines).toHaveLength(1);
    expect(session.reading).toEqual({ name: 'One Line', status: null });
  });

  it('clear loads the same Level again', () => {
    const game = createGame(true);
    const session = new Session(game);
    session.play(LINE_LEVEL);
    game.submitStroke(
      dragAlong([
        { x: 300, y: 300 },
        { x: 500, y: 300 },
      ]),
      'grey',
    );
    expect(game.world.lines).toHaveLength(2);

    session.clear();

    expect(session.playing).toBe(LINE_LEVEL);
    expect(game.world.lines).toHaveLength(1);
  });

  it('clear goes back to Wave 1', () => {
    const game = createGame(false);
    const session = new Session(game);
    session.play({
      waves: [
        { counts: { crawler: 0, runner: 0, heavy: 0 }, gap: 1 },
        { counts: { crawler: 1, runner: 0, heavy: 0 }, gap: 1 },
      ],
    });
    game.togglePause();
    game.step();
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });

    session.clear();

    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, rewards: null });
  });

  it('playing a Level with its own Waves turns them on', () => {
    const game = createGame(true);
    const session = new Session(game);

    session.play(THREE_WAVES_DEMO);

    expect(game.waves).toBe(true);
    expect(session.reading.name).toBe('Three Waves');
  });

  it("names a Level that doesn't name itself", () => {
    const session = new Session(createGame(true));

    session.play({});

    expect(session.reading.name).toBe('Level');
  });

  it("reads a stress-test Level's status", () => {
    const game = createGame(true);
    const session = new Session(game);

    session.play(BOX_TOWER_LEVEL);

    expect(session.stressTest).not.toBeNull();
    expect(session.reading.name).toBe('Box tower');
    expect(session.reading.status).toBe(session.stressTest!.status());
  });

  it("updates the stress test after each advance, as the world then is; another Level's has none", () => {
    const game = createGame(true);
    const session = new Session(game);
    let recorder: Recorder | null = null;
    session.play({
      name: 'Recorded',
      build(world) {
        world.togglePause();
        return (recorder = new Recorder(game));
      },
    });

    const steps = session.advance(3 * STEP_SECONDS);
    session.advance(STEP_SECONDS);

    expect(steps).toBe(3);
    expect(recorder!.updates).toHaveLength(2);
    expect(recorder!.updates[0]).toBeCloseTo(3 * STEP_SECONDS, 9);
    expect(recorder!.updates[1]).toBeCloseTo(4 * STEP_SECONDS, 9);
    expect(session.reading.status).toBe('2 updates');

    session.play(SANDBOX_LEVEL);
    expect(session.stressTest).toBeNull();
    session.advance(STEP_SECONDS);
    expect(recorder!.updates).toHaveLength(2);
  });

  it("clear starts a stress test's measurements over", () => {
    const game = createGame(true);
    const session = new Session(game);
    session.play(BOX_TOWER_LEVEL);
    const first = session.stressTest;

    session.clear();

    expect(session.stressTest).not.toBeNull();
    expect(session.stressTest).not.toBe(first);
  });
});
