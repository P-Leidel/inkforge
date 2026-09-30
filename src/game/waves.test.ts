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
  it('starts with 6 Crawlers, 3 Runners and 2 Heavies, 2 s apart, and a 480 px Core Zone', () => {
    expect(DEFAULT_WAVE_TABLE).toEqual({
      counts: { crawler: 6, runner: 3, heavy: 2 },
      gap: 2,
      coreZone: 480,
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
  it('starts with Space in the Build Phase: the first Enemy comes at once', () => {
    const game = wavesGame();
    expect(game.defence.reading.phase).toBe('build');

    game.togglePause();
    game.step();

    expect(game.defence.reading.phase).toBe('wave');
    expect(game.isRunning).toBe(true);
    expect(game.world.enemies.map((enemy) => enemy.type)).toEqual(['crawler']);
    expect(game.defence.reading.toCome).toBe(10);
  });

  it('refuses undo, paused or running, and the Eraser still works', () => {
    const game = wavesGame({ crawler: 1 });
    // Ink is unlimited, so the Line drawn during the Wave needs no Wave Ink.
    game.inkCosts = false;
    drawLine(game, 400, 300, 200);
    game.togglePause();
    stepFor(game, 0.1);
    // Inside the Core Zone, the only place to draw during a Wave.
    drawLine(game, 560, 1650, 150);

    game.undo();
    game.togglePause();
    game.undo();
    expect(game.world.lines).toHaveLength(2);
    expect(game.history).toHaveLength(2);

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
    const box = game.submitStroke(dragBox(300, 300, 60, 60), 'grey');
    if (box.kind !== 'object') throw new Error('expected an Object');
    game.togglePause();

    expect(game.releaseAt({ x: 330, y: 330 })).toBe(true);
  });
});

describe('The end of a Wave', () => {
  it('comes when none is left to come and none is alive: back in the Build Phase', () => {
    const game = wavesGame({ runner: 2, gap: 1 });
    drawLine(game, 400, 300, 200);
    game.togglePause();

    const steps = stepFor(game, 60, () => game.defence.reading.phase === 'build');

    expect(steps).toBeLessThan(60 / STEP_SECONDS);
    expect(game.defence.reading.phase).toBe('build');
    expect(game.isRunning).toBe(false);
    expect(game.world.enemies).toEqual([]);
    expect(game.world.inkCore.hp).toBe(8);
    // Undo works again, and nothing is Frozen again.
    game.undo();
    expect(game.world.lines).toEqual([]);
  });

  it('leaves Released Objects as they are', () => {
    const game = wavesGame({ runner: 1 });
    // On a shelf, above the Runner's way to the Ink Core.
    drawLine(game, 500, 300, 200);
    const box = game.submitStroke(dragBox(370, 430, 60, 60), 'grey');
    if (box.kind !== 'object') throw new Error('expected an Object');
    game.togglePause();
    expect(game.releaseAt({ x: 400, y: 460 })).toBe(true);

    stepFor(game, 60, () => game.defence.reading.phase === 'build');

    expect(game.defence.reading.phase).toBe('build');
    expect(game.world.objects[0]!.frozen).toBe(false);
  });

  it('comes when the Ink Core is destroyed, with Enemies still to come', () => {
    const game = wavesGame({ runner: 4, gap: 0.5 });
    editEnemies(game.world.enemyTable, (table) => (table.types.runner.coreDamage = 5));
    game.togglePause();

    stepFor(game, 60, () => game.defence.reading.phase === 'build');

    expect(game.defence.reading.coreDestroyed).toBe(true);
    expect(game.defence.reading.phase).toBe('build');
    expect(game.defence.reading.toCome).toBe(0);
    expect(game.isRunning).toBe(false);
    // Space starts nothing until R.
    game.togglePause();
    expect(game.defence.reading.phase).toBe('build');
    expect(game.isRunning).toBe(false);
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
  it('returns to the Build Phase as it was when the Wave started', () => {
    const game = wavesGame({ crawler: 2, runner: 1, gap: 1 });
    drawLine(game, 400, 300, 200);
    const tanks = game.tanks;
    game.togglePause();
    stepFor(game, 3);
    game.spawn('heavy');

    game.reset();

    expect(game.defence.reading.phase).toBe('build');
    expect(game.isRunning).toBe(false);
    expect(game.world.enemies).toEqual([]);
    expect(game.world.inkCore.hp).toBe(10);
    expect(game.tanks).toEqual(tanks);
    expect(game.history).toHaveLength(1);
    game.togglePause();
    expect(game.defence.reading.toCome).toBe(3);
  });

  it('plays a retry out the same, whatever the frame times and pauses', () => {
    const game = wavesGame({ crawler: 2, runner: 2, heavy: 1, gap: 1.5 });
    drawLine(game, 860, 600, 300);
    drawLine(game, 760, 900, 40);

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
  it('leave the Game in the Build Phase, paused where the demo left it, and R goes back there', () => {
    const game = wavesGame();
    game.clear((world) => {
      world.submitStroke(dragBox(300, 300, 60, 60), 'grey');
      world.togglePause();
    });

    expect(game.defence.reading.phase).toBe('build');
    expect(game.isRunning).toBe(false);
    game.togglePause();
    stepFor(game, 1);
    game.reset();
    expect(game.defence.reading.phase).toBe('build');
    expect(game.world.objects).toHaveLength(1);
  });

  it('can bring a Wave of their own', () => {
    const game = wavesGame();
    const wave = { counts: { crawler: 0, runner: 0, heavy: 1 }, gap: 3, coreZone: 300 };
    game.clear(() => {}, wave);

    expect(game.defence.table).toEqual(wave);
    game.togglePause();
    game.step();
    expect(game.world.enemies.map((enemy) => enemy.type)).toEqual(['heavy']);
  });
});
