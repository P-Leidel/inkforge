import { describe, expect, it } from 'vitest';
import { createEnemyTable, editEnemies } from '../materials/enemy-table';
import { STEP_SECONDS, type SandboxWorld } from '../sandbox/sandbox-world';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import type { Game } from './game';
import { games } from './test-support';
import { arrivals, DEFAULT_WAVE_TABLE, type ReadonlyWaveTable } from './wave-table';

/** A Game over a new Sandbox world, Ink costs on. */
const createGame = games();

/** A Game with Waves on, and `wave` as its Wave's list, if given. */
function wavesGame(wave?: Partial<ReadonlyWaveTable['counts']> & { gap?: number }): Game {
  const game = createGame(true, { waves: true });
  if (wave) {
    game.defence.edit((table) => {
      const { gap, ...counts } = wave;
      table.counts = { crawler: 0, runner: 0, heavy: 0, ...counts };
      if (gap !== undefined) table.gap = gap;
    });
  }
  return game;
}

/** Steps a running Game up to `seconds`, or until `until` holds. Returns the steps taken. */
function stepFor(game: Game, seconds: number, until: () => boolean = () => false): number {
  let steps = 0;
  for (; steps < Math.round(seconds / STEP_SECONDS) && !until(); steps++) game.step();
  return steps;
}

/** A horizontal grey Line that must be made. */
function drawLine(game: Game, y: number, x: number, length: number): void {
  const outcome = game.submitStroke(
    dragAlong([
      { x, y },
      { x: x + length, y },
    ]),
    'grey',
  );
  if (outcome.kind !== 'line') throw new Error(`expected a Line, got ${outcome.kind}`);
}

/** Where every Enemy is and its HP, rounded, for comparing two runs. */
function positions(world: SandboxWorld) {
  return world.enemies.map(({ type, transform, hp }) => ({
    type,
    x: Math.round(transform.x),
    y: Math.round(transform.y),
    hp: Math.round(hp),
  }));
}

describe('The Wave table', () => {
  it('starts with 6 Crawlers, 3 Runners and 2 Heavies, 2 s apart', () => {
    expect(DEFAULT_WAVE_TABLE).toEqual({
      counts: { crawler: 6, runner: 3, heavy: 2 },
      gap: 2,
    });
  });

  it('sends in Crawlers, then Runners, then Heavies, counts taken whole', () => {
    expect(arrivals({ counts: { heavy: 1, runner: 2.7, crawler: 1 } })).toEqual([
      'crawler',
      'runner',
      'runner',
      'heavy',
    ]);
    expect(arrivals({ counts: { crawler: -2, runner: 0, heavy: 0 } })).toEqual([]);
  });
});

describe('The Waves switch', () => {
  it('is off by default: Space runs and pauses physics as in milestone 3', () => {
    const game = createGame(true);
    expect(game.defence.waves).toBe(false);
    expect(game.defence.reading.phase).toBeNull();

    game.togglePause();
    stepFor(game, 1);

    expect(game.isRunning).toBe(true);
    expect(game.world.enemies).toEqual([]);
    expect(game.defence.reading.toCome).toBe(0);
  });
});

describe('A Wave', () => {
  it('starts with Space in an Intermission: the first Enemy comes at once', () => {
    const game = wavesGame();
    expect(game.defence.reading.phase).toBe('intermission');

    game.togglePause();
    game.step();

    expect(game.defence.reading.phase).toBe('wave');
    expect(game.isRunning).toBe(true);
    expect(game.world.enemies.map((enemy) => enemy.type)).toEqual(['crawler']);
    expect(game.defence.reading.toCome).toBe(10);
  });

  it('lets the Eraser work, paused or running', () => {
    const game = wavesGame({ crawler: 1 });
    game.togglePause();
    stepFor(game, 0.1);
    drawLine(game, 400, 300, 200);
    drawLine(game, 560, 1650, 150);
    game.togglePause();

    game.eraseAlong(
      [
        { x: 1640, y: 560 },
        { x: 1810, y: 560 },
      ],
      10,
    );
    expect(game.world.lines).toHaveLength(1);
  });

  it('lets a Frozen Object be Released anywhere', () => {
    const game = wavesGame({ crawler: 1 });
    game.togglePause();
    const box = game.submitStroke(dragBox(300, 300, 60, 60), 'grey');
    if (box.kind !== 'object') throw new Error('expected an Object');

    expect(game.releaseAt({ x: 330, y: 330 })).toBe(true);
  });
});

/** Whether the Wave under way is over, or was lost. */
const over = (game: Game) => game.defence.reading.phase !== 'wave' || !game.isRunning;

describe('The end of a Wave', () => {
  it('comes when none is left to come and none is alive; after the only Wave, the Level is cleared', () => {
    const game = wavesGame({ runner: 2, gap: 1 });
    game.togglePause();
    drawLine(game, 400, 300, 200);

    const steps = stepFor(game, 60, () => over(game));

    expect(steps).toBeLessThan(60 / STEP_SECONDS);
    expect(game.defence.reading.phase).toBe('cleared');
    expect(game.isRunning).toBe(false);
    expect(game.world.enemies).toEqual([]);
    expect(game.world.inkCore.hp).toBe(8);
    expect(game.world.lines).toHaveLength(1);
  });

  it('freezes again the Objects at rest, Released ones included, where they are', () => {
    const game = wavesGame({ runner: 1 });
    game.togglePause();
    // On a shelf, above the Runner's way to the Ink Core.
    drawLine(game, 500, 300, 200);
    const box = game.submitStroke(dragBox(370, 430, 60, 60), 'grey');
    if (box.kind !== 'object') throw new Error('expected an Object');
    expect(game.releaseAt({ x: 400, y: 460 })).toBe(true);
    stepFor(game, 3);
    expect(game.world.objects[0]!.frozen).toBe(false);
    const resting = game.world.objects[0]!.transform;

    stepFor(game, 60, () => over(game));

    expect(game.defence.reading.phase).toBe('cleared');
    const [object] = game.world.objects;
    expect(object!.frozen).toBe(true);
    expect(object!.transform.x).toBeCloseTo(resting.x, 0);
    expect(object!.transform.y).toBeCloseTo(resting.y, 0);
  });

  it('never comes when the Ink Core is destroyed: physics stops where the Wave was lost', () => {
    const game = wavesGame({ runner: 4, gap: 0.5 });
    editEnemies(game.world.enemyTable, (table) => (table.types.runner.coreDamage = 5));
    game.togglePause();
    const tanks = game.tanks;

    stepFor(game, 60, () => over(game));

    expect(game.defence.reading.coreDestroyed).toBe(true);
    expect(game.defence.reading.phase).toBe('wave');
    expect(game.isRunning).toBe(false);
    expect(game.tanks).toEqual(tanks);
    // Space starts nothing until R.
    game.togglePause();
    expect(game.isRunning).toBe(false);
  });
});

/** Steps a running Game until its Wave is over, and checks that it ended. */
function playWave(game: Game): void {
  stepFor(game, 60, () => over(game));
  expect(game.defence.reading.phase).not.toBe('wave');
}

describe('A Level of three Waves', () => {
  const LEVEL = {
    waves: [
      { counts: { crawler: 0, runner: 1, heavy: 0 }, gap: 1 },
      { counts: { crawler: 0, runner: 1, heavy: 0 }, gap: 1 },
      { counts: { crawler: 0, runner: 2, heavy: 0 }, gap: 1 },
    ],
  };

  /** Sends an Enemy in below the screen, where it dies, and steps until it has. */
  function pitKill(game: Game): void {
    const before = game.world.enemyCount;
    game.world.spawn('crawler', { x: 800, y: game.world.arena.height + 200 });
    stepFor(game, 0.5, () => game.world.enemyCount === before);
  }

  it('plays through: each Intermission sums up the Wave, refills and keeps the Arena; then it is cleared', () => {
    const game = createGame(true, { waves: true });
    game.load(LEVEL);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, waves: 3 });

    game.togglePause();
    drawLine(game, 400, 300, 200);
    pitKill(game);
    playWave(game);

    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
    const first = game.defence.reading.rewards!.summary;
    expect(first).toMatchObject({ wave: 1, kills: 1, coreHp: 9 });
    expect(first.ink.grey).toBeGreaterThan(0);
    for (const colour of Object.keys(game.tanks) as (keyof typeof game.tanks)[]) {
      expect(game.tanks[colour].spendable).toBe(game.tanks[colour].maximum);
    }
    expect(game.world.lines).toHaveLength(1);
    expect(game.world.inkCore.hp).toBe(9);

    game.togglePause();
    playWave(game);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 3 });
    expect(game.defence.reading.rewards!.summary).toMatchObject({ wave: 2, kills: 0, coreHp: 8 });

    game.togglePause();
    playWave(game);
    expect(game.defence.reading).toMatchObject({ phase: 'cleared', wave: 3 });
    expect(game.defence.reading.rewards!.summary).toMatchObject({ wave: 3, coreHp: 6 });
    expect(game.world.inkCore.hp).toBe(6);
    expect(game.world.lines).toHaveLength(1);
    game.togglePause();
    expect(game.isRunning).toBe(false);
  });

  it('R mid-Wave goes back to the Arena right after the refill; Clear goes back to Wave 1', () => {
    const game = createGame(true, { waves: true });
    game.load(LEVEL);
    game.togglePause();
    drawLine(game, 400, 300, 200);
    playWave(game);
    const tanks = game.tanks;

    game.togglePause();
    drawLine(game, 300, 600, 300);
    stepFor(game, 2);
    game.reset();

    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
    expect(game.defence.reading.rewards!.summary.wave).toBe(1);
    expect(game.tanks).toEqual(tanks);
    expect(game.world.lines).toHaveLength(1);
    expect(game.world.inkCore.hp).toBe(9);
    expect(game.world.enemies).toEqual([]);

    game.load(LEVEL);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, rewards: null });
    expect(game.world.lines).toEqual([]);
    expect(game.world.inkCore.hp).toBe(10);
  });
});

describe('The Ink Core destroyed, with Waves off', () => {
  it('stops physics, and Space starts nothing until R, which starts over', () => {
    const enemies = createEnemyTable();
    enemies.coreHp = 2;
    const game = createGame(true, { worldOptions: { seed: 1, enemies } });
    const { minX, maxY } = game.world.arena.core;
    // Two Crawlers on the plateau, walking into the Ink Core.
    game.world.spawn('crawler', { x: minX - 150, y: maxY - 20 });
    game.world.spawn('crawler', { x: minX - 60, y: maxY - 20 });
    game.togglePause();

    stepFor(game, 10, () => !game.isRunning);

    expect(game.world.inkCore.hp).toBe(0);
    expect(game.defence.reading.coreDestroyed).toBe(true);
    game.togglePause();
    expect(game.isRunning).toBe(false);
    expect(game.advance(1)).toBe(0);

    game.reset();
    expect(game.world.inkCore.hp).toBe(2);
    game.togglePause();
    expect(game.isRunning).toBe(true);
  });
});

describe('R, with Waves on', () => {
  it('returns to the Intermission as it was when the Wave started', () => {
    const game = wavesGame({ crawler: 2, runner: 1, gap: 1 });
    const tanks = game.tanks;
    game.togglePause();
    drawLine(game, 400, 300, 200);
    stepFor(game, 3);
    game.spawn('heavy');

    game.reset();

    expect(game.defence.reading.phase).toBe('intermission');
    expect(game.isRunning).toBe(false);
    expect(game.world.enemies).toEqual([]);
    expect(game.world.lines).toEqual([]);
    expect(game.world.inkCore.hp).toBe(10);
    expect(game.tanks).toEqual(tanks);
    expect(game.history).toEqual([]);
    game.togglePause();
    expect(game.defence.reading.toCome).toBe(3);
  });

  it('plays a retry out the same, whatever the frame times and pauses', () => {
    const game = wavesGame({ crawler: 2, runner: 2, heavy: 1, gap: 1.5 });
    game.defence.waves = false;
    drawLine(game, 860, 600, 300);
    drawLine(game, 760, 900, 40);
    game.defence.waves = true;

    game.togglePause();
    // Uneven frames, and a pause in the middle.
    for (let frame = 0; frame < 200; frame++) game.advance(frame % 3 === 0 ? 0.05 : 0.01);
    game.togglePause();
    game.togglePause();
    while (game.world.time < 12 - 1e-6) game.advance(Math.min(0.033, 12 - game.world.time));
    const first = {
      at: positions(game.world),
      toCome: game.defence.reading.toCome,
      time: game.world.time,
    };
    expect(first.at.length).toBeGreaterThan(1);

    game.reset();
    game.togglePause();
    while (game.world.time < first.time - 1e-6) game.step();

    expect(game.world.time).toBeCloseTo(first.time, 6);
    expect(positions(game.world)).toEqual(first.at);
    expect(game.defence.reading.toCome).toBe(first.toCome);
  });

  it('starts the retry with the Wave table as it is now', () => {
    const game = wavesGame({ crawler: 2 });
    game.togglePause();
    stepFor(game, 1);
    game.defence.edit((table) => (table.counts.runner = 1));

    expect(game.defence.reading.toCome).toBe(1);
    game.reset();
    game.togglePause();
    expect(game.defence.reading.toCome).toBe(3);
  });
});

describe('Demos, with Waves on', () => {
  it('leave the Game in the first Intermission, paused where the demo left it, and R goes back there', () => {
    const game = wavesGame();
    game.load({
      build(world) {
        world.submitStroke(dragBox(300, 300, 60, 60), 'grey');
        world.togglePause();
      },
    });

    expect(game.defence.reading.phase).toBe('intermission');
    expect(game.isRunning).toBe(false);
    game.togglePause();
    stepFor(game, 1);
    game.reset();
    expect(game.defence.reading.phase).toBe('intermission');
    expect(game.world.objects).toHaveLength(1);
  });

  it('can bring Waves of their own', () => {
    const game = wavesGame();
    const wave = { counts: { crawler: 0, runner: 0, heavy: 1 }, gap: 3 };
    game.load({ waves: [wave] });

    expect(game.defence.table).toEqual(wave);
    game.togglePause();
    game.step();
    expect(game.world.enemies.map((enemy) => enemy.type)).toEqual(['heavy']);
  });
});
