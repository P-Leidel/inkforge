import { describe, expect, it } from 'vitest';
import { GALLERY, THREE_WAVES_DEMO } from '../gallery/gallery';
import { CAMPAIGN_LEVELS } from '../levels/campaign-levels';
import { COLOURS } from '../materials/colour';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { editEnemies } from '../materials/enemy-table';
import { BALL_CANNON_LEVEL } from '../stress-tests/ball-cannon';
import { BOX_TOWER_LEVEL } from '../stress-tests/box-tower';
import { PEBBLES_LEVEL } from '../stress-tests/pebble-drop';
import type { StressTest } from '../stress-tests/stress-test';
import { dragAlong } from '../stroke/pointer-paths';
import { Campaign, type CampaignStore } from './campaign';
import type { Game } from './game';
import { SANDBOX_LEVEL, type Level } from './level';
import { Session } from './session';
import { fromLineLength } from './ink-table';
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
    expect(session.reading).toEqual({ name: 'Sandbox', status: null, campaign: null });
  });

  it('play loads a Level and remembers it', () => {
    const game = createGame(true);
    const session = new Session(game);

    session.play(LINE_LEVEL);

    expect(session.playing).toBe(LINE_LEVEL);
    expect(game.world.lines).toHaveLength(1);
    expect(session.reading).toEqual({ name: 'One Line', status: null, campaign: null });
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

/** A store in memory. */
class FakeStore implements CampaignStore {
  record: string | null = null;

  read(): string | null {
    return this.record;
  }

  write(record: string): void {
    this.record = record;
  }
}

/** A Wave that sends in nothing, so it ends on its first step. */
const EMPTY_WAVE = { counts: { crawler: 0, runner: 0, heavy: 0 }, gap: 1 };

/** Three Campaign Levels of two empty Waves each, the second building a Line. */
const LEVELS: readonly Level[] = [
  { name: 'First', waves: [EMPTY_WAVE, EMPTY_WAVE] },
  { ...LINE_LEVEL, name: 'Second', waves: [EMPTY_WAVE, EMPTY_WAVE] },
  { name: 'Third', waves: [EMPTY_WAVE, EMPTY_WAVE] },
];

describe('A Session in the Campaign', () => {
  /** A Session over a new Game, Ink costs on, with a Campaign of `LEVELS` over `store`. */
  function campaignSession(store: CampaignStore = new FakeStore()) {
    const game = createGame(true);
    const campaign = new Campaign(LEVELS, store);
    return { game, campaign, session: new Session(game, campaign) };
  }

  /** Starts the Wave the Session's Game is in the Intermission of, and plays it out. */
  function playWave(game: Game, session: Session): void {
    expect(game.defence.reading.phase).toBe('intermission');
    game.togglePause();
    for (let k = 0; k < 600 && game.defence.reading.phase === 'wave'; k++) {
      session.advance(STEP_SECONDS);
    }
    expect(game.defence.reading.phase).not.toBe('wave');
  }

  it('plays a Campaign Level at its first Wave, and says where it is', () => {
    const { game, session } = campaignSession();

    expect(session.playCampaign(0)).toBe(true);

    expect(session.playing).toBe(LEVELS[0]);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, waves: 2 });
    expect(session.reading).toEqual({
      name: 'First',
      status: null,
      campaign: { index: 0, levels: 3, hasNext: true, hints: [] },
    });
  });

  it('gives the hints of what is new in the next Wave in its Intermission, and none during a Wave', () => {
    const game = createGame(true);
    const levels: readonly Level[] = [
      {
        name: 'Hinted',
        waves: [EMPTY_WAVE, { counts: { crawler: 1, runner: 0, heavy: 0 }, gap: 1 }],
        hints: { crawler: 'New: Crawlers' },
      },
    ];
    const session = new Session(game, new Campaign(levels, new FakeStore()));
    session.playCampaign(0);
    expect(session.reading.campaign?.hints).toEqual([]);

    playWave(game, session);

    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
    expect(session.reading.campaign?.hints).toEqual(['New: Crawlers']);
    game.togglePause();
    expect(session.reading.campaign?.hints).toEqual([]);
  });

  it("can't play a locked Level", () => {
    const { session } = campaignSession();

    expect(session.playCampaign(1)).toBe(false);

    expect(session.playing).toBe(SANDBOX_LEVEL);
    expect(session.reading.campaign).toBeNull();
  });

  it('clearing the last Wave unlocks the next Level and saves it; Next Level loads it at its first Wave', () => {
    const store = new FakeStore();
    const { game, campaign, session } = campaignSession(store);
    session.playCampaign(0);

    playWave(game, session);
    expect(campaign.isUnlocked(1)).toBe(false);
    playWave(game, session);

    expect(game.defence.reading.phase).toBe('cleared');
    expect(campaign.isUnlocked(1)).toBe(true);
    expect(new Campaign(LEVELS, store).isUnlocked(1)).toBe(true);

    expect(session.playNext()).toBe(true);

    expect(session.playing).toBe(LEVELS[1]);
    expect(game.world.lines).toHaveLength(1);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, rewards: null });
    expect(session.reading.campaign).toEqual({ index: 1, levels: 3, hasNext: true, hints: [] });
  });

  it('Next Level does nothing until the Level is cleared, nor outside the Campaign', () => {
    const { session } = campaignSession();
    session.playCampaign(0);

    expect(session.playNext()).toBe(false);
    expect(session.playing).toBe(LEVELS[0]);

    session.play(LINE_LEVEL);
    expect(session.reading.campaign).toBeNull();
    expect(session.playNext()).toBe(false);
  });

  it('after the last Level, nothing comes next', () => {
    const store = new FakeStore();
    store.record = '{"unlocked":3}';
    const { game, session } = campaignSession(store);
    session.playCampaign(2);
    expect(session.reading.campaign!.hasNext).toBe(false);

    playWave(game, session);
    playWave(game, session);

    expect(game.defence.reading.phase).toBe('cleared');
    expect(session.playNext()).toBe(false);
    expect(session.playing).toBe(LEVELS[2]);
  });

  describe('a lost Level', () => {
    /** The first Campaign Level, but with a Runner that destroys the Ink Core in its second Wave. */
    function lostSession() {
      const store = new FakeStore();
      const deadly: Level = {
        name: 'Deadly',
        waves: [EMPTY_WAVE, { counts: { crawler: 0, runner: 1, heavy: 0 }, gap: 1 }],
      };
      const game = createGame(true);
      editEnemies(game.world.enemyTable, (table) => (table.types.runner.coreDamage = 1000));
      const campaign = new Campaign([deadly, ...LEVELS.slice(1)], store);
      const session = new Session(game, campaign);
      session.playCampaign(0);
      playWave(game, session);
      game.togglePause();
      for (let k = 0; k < 6000 && game.defence.reading.phase === 'wave'; k++) {
        session.advance(STEP_SECONDS);
      }
      expect(game.defence.reading.phase).toBe('lost');
      return { game, campaign, session, store };
    }

    it('leaves the Campaign as it was', () => {
      const { campaign, session, store } = lostSession();

      expect(campaign.unlocked).toBe(1);
      expect(store.record).toBeNull();
      expect(session.playNext()).toBe(false);
    });

    it("Retry Wave goes back to R's checkpoint: the Intermission before the lost Wave", () => {
      const { game, session } = lostSession();

      game.reset();

      expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
      expect(session.reading.campaign!.index).toBe(0);
    });

    it('Restart Level loads the Level again from Wave 1', () => {
      const { game, session } = lostSession();

      session.clear();

      expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, rewards: null });
      expect(game.world.inkCore.hp).toBeGreaterThan(0);
      expect(session.reading.campaign!.index).toBe(0);
    });
  });
  describe('the Eraser and the sandbox tool, sending in Enemies', () => {
    const brush = [
      { x: 290, y: 500 },
      { x: 510, y: 500 },
    ];

    it('put sending in Enemies away in a Campaign Level, after Next Level and Restart Level too, and leave the Eraser on hand', () => {
      const { game, session } = campaignSession();
      session.playCampaign(0);
      playWave(game, session);
      playWave(game, session);
      expect(session.playNext()).toBe(true);
      expect(game.world.lines).toHaveLength(1);

      for (const again of [false, true]) {
        if (again) session.clear();
        expect(game.allowed).toMatchObject({ eraser: true, spawning: false });
        expect(game.spawn('crawler')).toEqual({ kind: 'refused', reason: 'not-on-hand' });
        expect(game.world.lines).toHaveLength(1);
        expect(game.eraseAlong(brush, 12)).toEqual({ kind: 'erased' });
        expect(game.world.lines).toEqual([]);
      }
    });

    it('are on hand again in Free play: the Sandbox and the Gallery', () => {
      const { game, session } = campaignSession();
      session.playCampaign(0);

      for (const level of [LINE_LEVEL, THREE_WAVES_DEMO]) {
        session.play(level);
        expect(game.allowed).toMatchObject({ eraser: true, spawning: true });
      }
      session.play(LINE_LEVEL);
      expect(game.eraseAlong(brush, 12)).toEqual({ kind: 'erased' });
      expect(game.world.lines).toEqual([]);
      expect(game.spawn('crawler')).toEqual({ kind: 'spawned' });
    });
  });
});

describe('Free play after a Campaign Level', () => {
  /** A Session over a new Game, Ink costs on, with the real Campaign, every Level unlocked. */
  function freePlaySession(options: { waves?: boolean } = {}) {
    const game = createGame(true, options);
    const store = new FakeStore();
    store.write(JSON.stringify({ unlocked: CAMPAIGN_LEVELS.length }));
    return { game, session: new Session(game, new Campaign(CAMPAIGN_LEVELS, store)) };
  }

  /** Every Tank's maximum, px². */
  const maximums = (game: Game) => COLOURS.map((colour) => game.tanks[colour].maximum);
  /** Free play's maximums, from F2's Ink table, px². */
  const freePlayMaximums = (game: Game) =>
    COLOURS.map((colour) => fromLineLength(game.ink.tanks[colour]));

  const FREE_PLAY: readonly Level[] = [
    SANDBOX_LEVEL,
    ...GALLERY,
    PEBBLES_LEVEL,
    BOX_TOWER_LEVEL,
    BALL_CANNON_LEVEL,
  ];

  it('has every Colour, at Free play maximums, in the Sandbox, every Gallery demo and every stress test', () => {
    const { game, session } = freePlaySession();

    for (const level of FREE_PLAY) {
      session.playCampaign(0);
      expect(COLOURS.filter((colour) => game.has(colour))).not.toEqual(COLOURS);

      session.play(level);

      expect(
        COLOURS.filter((colour) => game.has(colour)),
        level.name,
      ).toEqual(COLOURS);
      expect(maximums(game), level.name).toEqual(freePlayMaximums(game));
    }
  });

  it('leaves the Waves switch as Free play had it; a Level with its own Waves still plays with them', () => {
    for (const before of [false, true]) {
      const { game, session } = freePlaySession({ waves: before });

      session.playCampaign(0);
      expect(game.waves).toBe(true);
      session.play(SANDBOX_LEVEL);
      expect(game.waves).toBe(before);

      session.play(THREE_WAVES_DEMO);
      expect(game.waves).toBe(true);
      session.play(GALLERY[0]!);
      expect(game.waves).toBe(before);
    }
  });

  it('keeps Free play edits to the Tanks and the Waves switch across Clear, other Levels and a Campaign Level', () => {
    const { game, session } = freePlaySession();
    session.play(SANDBOX_LEVEL);
    game.editInk((ink) => (ink.tanks.blue = 1234)); // as the F2 tuning panel does
    game.waves = true;

    session.clear();
    session.play(GALLERY[0]!);
    session.playCampaign(1);
    session.play(SANDBOX_LEVEL);

    expect(game.ink.tanks.blue).toBe(1234);
    expect(game.tanks.blue.maximum).toBe(fromLineLength(1234));
    expect(game.waves).toBe(true);
  });

  it("edits a Campaign Level's own Tanks for this play only: they survive R, and are gone after Clear", () => {
    const { game, session } = freePlaySession();
    const freePlay = structuredClone(game.ink);
    session.playCampaign(0);
    const own = CAMPAIGN_LEVELS[0]!.tanks!;

    game.editInk((ink) => (ink.tanks.grey = 77));
    expect(game.inkInForce.tanks.grey).toBe(77);
    expect(game.tanks.grey.maximum).toBe(fromLineLength(77));
    game.togglePause(); // a Wave starts: R's checkpoint
    game.reset();
    expect(game.tanks.grey.maximum).toBe(fromLineLength(77));

    session.clear();

    expect(game.inkInForce.tanks).toEqual(own);
    expect(game.ink).toEqual(freePlay);
  });

  it("unticking Waves in a Level with its own Waves lasts until Clear, and leaves Free play's switch", () => {
    const { game, session } = freePlaySession({ waves: true });
    session.playCampaign(0);

    game.waves = false;
    session.clear();
    expect(game.waves).toBe(true);

    game.waves = false;
    session.play(SANDBOX_LEVEL);
    expect(game.waves).toBe(true);
  });
});
