import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { createEnemyTable } from '../materials/enemy-table';
import { SANDBOX_ARENA } from '../sandbox/arena';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import { DEFAULT_RULES } from './defence-loop';
import type { Game } from './game';
import { inLineLength } from './ink-table';
import { SANDBOX_LEVEL } from './level';
import { games } from './test-support';

const createGame = games();

/** A Game with Waves on, whose Wave sends in one Crawler, then waits a long while. */
function wavesGame(inkCosts: boolean): Game {
  const game = createGame(inkCosts, { waves: true });
  game.defence.edit((table) => {
    table.counts = { crawler: 1, runner: 0, heavy: 0 };
    table.gap = 100;
  });
  return game;
}

/** A horizontal drag from `x` to `x + length` at `y`. */
const across = (x: number, y: number, length: number): Vec2[] =>
  dragAlong([
    { x, y },
    { x: x + length, y },
  ]);

/** The sandbox Arena's ground, where its Spawn stands. */
const GROUND = SANDBOX_ARENA.spawn.y;
/** A Crawler (40 px wide) standing on the ground at x = 800, sent in by hand. */
const CRAWLER = { x: 800, y: GROUND - 22 };
/** 20 px above that Crawler's head: closer than its width. */
const NEAR = across(760, GROUND - 62, 80);
/** High in the air, far from it. */
const FAR = across(600, 200, 200);

describe('With Waves on, in an Intermission (building between Waves, provisional)', () => {
  it('lets a Stroke and a Fill be made, with physics still paused', () => {
    const game = wavesGame(false);
    expect(game.defence.reading.phase).toBe('intermission');

    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    expect(game.submitStroke(dragBox(300, 300, 60, 60), 'grey').kind).toBe('object');
    expect(game.fillAt({ x: 330, y: 330 }, 'blue').kind).toBe('filled');
    expect(game.prospect(game.lookAtStroke(FAR)!, 'grey').refusal).toBeNull();
    expect(game.world.lines).toHaveLength(1);
    expect(game.world.isRunning).toBe(false);
    expect(game.defence.reading.phase).toBe('intermission');
  });

  it('lets undo and the Eraser work', () => {
    const game = wavesGame(false);
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    expect(game.submitStroke(across(600, 400, 200), 'grey').kind).toBe('line');

    game.undo();
    expect(game.world.lines).toHaveLength(1);
    game.eraseAlong(
      [
        { x: 590, y: 200 },
        { x: 810, y: 200 },
      ],
      12,
    );

    expect(game.world.lines).toEqual([]);
  });
});

describe('With Waves on and building between Waves off, in an Intermission', () => {
  it('bars every Stroke and Fill', () => {
    const game = createGame(false, {
      waves: true,
      rules: { ...DEFAULT_RULES, buildBetweenWaves: false },
    });
    game.waves = false;
    expect(game.submitStroke(dragBox(300, 300, 60, 60), 'grey').kind).toBe('object');
    game.waves = true;
    expect(game.defence.reading.phase).toBe('intermission');

    expect(game.submitStroke(FAR, 'grey')).toMatchObject({ kind: 'refused', reason: 'not-now' });
    expect(game.fillAt({ x: 330, y: 330 }, 'blue')).toMatchObject({
      kind: 'refused',
      reason: 'not-now',
    });
    expect(game.world.lines).toEqual([]);
  });
});

describe('The rules switches, turned off (provisional, F2)', () => {
  it("are on by default, the Defence loop's own, and kept by loading a Level", () => {
    const game = wavesGame(false);
    expect(game.rules).toEqual(DEFAULT_RULES);
    expect(game.rules).toBe(game.defence.rules);

    game.rules.undoDuringWave = false;
    game.load(SANDBOX_LEVEL);
    expect(game.rules.undoDuringWave).toBe(false);
  });

  it('Undo during a Wave off: undo takes nothing back in a Wave, running or paused, and refunds nothing', () => {
    const game = wavesGame(true);
    game.rules.undoDuringWave = false;
    game.togglePause();
    expect(game.defence.reading.phase).toBe('wave');
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    const left = game.tanks.grey.spendable;

    for (const running of [true, false]) {
      expect(game.isRunning).toBe(running);
      expect(game.undo()).toEqual({ kind: 'refused', reason: 'not-now' });
      expect(game.world.lines).toHaveLength(1);
      expect(game.tanks.grey.spendable).toBe(left);
      if (running) game.togglePause();
    }

    game.rules.undoDuringWave = true;
    expect(game.undo()).toMatchObject({ kind: 'undone', action: { kind: 'stroke' } });
    expect(game.world.lines).toEqual([]);
    expect(game.tanks.grey.spendable).toBeGreaterThan(left);
  });

  it('Undo during a Wave off leaves undo in an Intermission alone', () => {
    const game = wavesGame(false);
    game.rules.undoDuringWave = false;
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');

    game.undo();

    expect(game.world.lines).toEqual([]);
  });

  it('Build while paused off: nothing is drawn, filled or undone in a paused Wave; running, it is', () => {
    const game = wavesGame(false);
    game.rules.buildWhilePaused = false;
    expect(game.submitStroke(dragBox(300, 300, 60, 60), 'grey').kind).toBe('object');
    game.togglePause();
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    game.togglePause();
    expect(game.isRunning).toBe(false);
    expect(game.defence.reading.phase).toBe('wave');

    expect(game.submitStroke(across(300, 500, 100), 'grey')).toMatchObject({
      kind: 'refused',
      reason: 'not-now',
    });
    expect(game.prospect(game.lookAtStroke(FAR)!, 'grey').refusal).toBe('not-now');
    expect(game.fillAt({ x: 330, y: 330 }, 'blue')).toMatchObject({
      kind: 'refused',
      reason: 'not-now',
    });
    game.undo();
    expect(game.world.lines).toHaveLength(1);

    game.togglePause();
    expect(game.fillAt({ x: 330, y: 330 }, 'blue').kind).toBe('filled');
  });

  it('Build between Waves off leaves a paused Wave alone', () => {
    const game = wavesGame(false);
    game.rules.buildBetweenWaves = false;
    game.togglePause();
    game.togglePause();
    expect(game.defence.reading.phase).toBe('wave');

    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
  });
});

describe('The sandbox tools: the Eraser and sending in Enemies', () => {
  const brush = [
    { x: 590, y: 200 },
    { x: 810, y: 200 },
  ];

  it('are on hand by default: the Eraser erases, or misses, and Enemies are sent in', () => {
    const game = createGame(true);
    expect(game.sandboxTools).toBe(true);
    expect(game.allowed).toMatchObject({ eraser: true, spawning: true });

    expect(game.eraseAlong(brush, 12)).toEqual({ kind: 'missed' });
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    expect(game.eraseAlong(brush, 12)).toEqual({ kind: 'erased' });
    expect(game.world.lines).toEqual([]);
    expect(game.spawn('crawler')).toEqual({ kind: 'spawned' });
    expect(game.world.enemyCount).toBe(1);
  });

  it('put away, are refused, Waves on or off, and nothing is erased, refunded or sent in; on hand again, they work', () => {
    const game = createGame(true);
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    const left = game.tanks.grey.spendable;

    game.sandboxTools = false;
    expect(game.allowed).toMatchObject({ eraser: false, spawning: false });
    for (const waves of [false, true]) {
      game.waves = waves;
      expect(game.eraseAlong(brush, 12)).toEqual({ kind: 'refused', reason: 'not-on-hand' });
      expect(game.spawn('crawler')).toEqual({ kind: 'refused', reason: 'not-on-hand' });
    }
    expect(game.world.lines).toHaveLength(1);
    expect(game.world.enemyCount).toBe(0);
    expect(game.tanks.grey.spendable).toBe(left);

    game.sandboxTools = true;
    expect(game.eraseAlong(brush, 12)).toEqual({ kind: 'erased' });
    expect(game.world.lines).toEqual([]);
  });
});

/**
 * A Game with Ink costs on whose Ink Core has 1 HP: a Line and a box are
 * drawn first, then physics starts (a Wave, with Waves on) and a Crawler
 * on the plateau walks into the Ink Core.
 */
function lostGame(waves: boolean): Game {
  const enemies = createEnemyTable();
  enemies.coreHp = 1;
  const game = createGame(true, { waves, worldOptions: { seed: 1, enemies } });
  game.waves = false;
  expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
  expect(game.submitStroke(dragBox(300, 300, 60, 60), 'grey').kind).toBe('object');
  game.waves = waves;
  game.togglePause();
  const { minX, maxY } = game.world.arena.core;
  game.world.spawn('crawler', { x: minX - 60, y: maxY - 20 });
  for (let k = 0; k < 600 && game.isRunning; k++) game.step();
  expect(game.defence.reading.coreDestroyed).toBe(true);
  return game;
}

describe('What the player may do (allowed)', () => {
  const none = { draw: null, fill: null, erase: null, undo: null };
  const all = (bar: string) => ({ draw: bar, fill: bar, erase: bar, undo: bar });

  it('with Waves off: anything', () => {
    const game = createGame(false);
    expect(game.allowed).toEqual({ eraser: true, spawning: true, ...none });
  });

  it('with Waves on and the rules on: anything, in an Intermission and during a Wave, paused or running', () => {
    const game = wavesGame(false);
    expect(game.allowed).toMatchObject(none);
    game.togglePause();
    expect(game.defence.reading.phase).toBe('wave');
    expect(game.allowed).toMatchObject(none);
    game.togglePause();
    expect(game.allowed).toMatchObject(none);
  });

  it('as each rules switch says, and agrees with what the commands do', () => {
    const game = wavesGame(false);
    game.rules.buildBetweenWaves = false;
    expect(game.allowed).toMatchObject(all('not-now'));
    expect(game.undo()).toEqual({ kind: 'refused', reason: 'not-now' });
    game.rules.buildBetweenWaves = true;

    game.togglePause();
    game.rules.undoDuringWave = false;
    expect(game.allowed).toMatchObject({ ...none, undo: 'not-now' });
    game.rules.undoDuringWave = true;

    game.rules.buildWhilePaused = false;
    expect(game.allowed).toMatchObject(none); // running
    game.togglePause();
    expect(game.allowed).toMatchObject(all('not-now'));
    expect(game.eraseAlong(FAR, 12)).toEqual({ kind: 'refused', reason: 'not-now' });
  });

  it('nothing once the Ink Core is destroyed, though the sandbox tools stay on hand', () => {
    const game = lostGame(true);

    expect(game.allowed).toEqual({ eraser: true, spawning: true, ...all('lost') });
  });

  it('undo with nothing to take back says so', () => {
    const game = createGame(false);
    expect(game.undo()).toEqual({ kind: 'nothing' });
  });
});

describe('During a Wave', () => {
  it('lets a Stroke be drawn anywhere away from the Enemies, paused or running', () => {
    const game = wavesGame(false);
    game.togglePause();
    game.world.spawn('crawler', CRAWLER);

    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    expect(game.submitStroke(dragBox(1500, 300, 60, 60), 'grey').kind).toBe('object');
    game.togglePause();
    expect(game.defence.reading.phase).toBe('wave');
    expect(game.submitStroke(across(300, 300, 100), 'grey').kind).toBe('line');
  });

  it('bars a Stroke closer to an Enemy than its width, with its path to flash', () => {
    const game = wavesGame(false);
    game.togglePause();
    game.world.spawn('crawler', CRAWLER);

    const near = game.submitStroke(NEAR, 'grey');

    expect(near).toMatchObject({ kind: 'refused', reason: 'near-enemy' });
    expect(near.kind === 'refused' && near.path.length).toBeGreaterThan(1);
    expect(game.world.lines).toEqual([]);
    expect(game.prospect(game.lookAtStroke(NEAR)!, 'grey').refusal).toBe('near-enemy');
    expect(game.prospect(game.lookAtStroke(FAR)!, 'grey').refusal).toBeNull();
  });

  it('bars a closing Stroke just above an Enemy too', () => {
    const game = wavesGame(false);
    game.togglePause();
    game.world.spawn('crawler', CRAWLER);

    expect(game.submitStroke(dragBox(760, GROUND - 130, 80, 80), 'grey')).toMatchObject({
      kind: 'refused',
      reason: 'near-enemy',
    });
  });

  it('says "near an Enemy" before "not enough"', () => {
    const game = wavesGame(true);
    game.editInk((table) => (table.tanks.grey = 0));
    game.togglePause();
    game.world.spawn('crawler', CRAWLER);

    expect(game.submitStroke(NEAR, 'grey').kind).toBe('refused');
    expect(game.submitStroke(FAR, 'grey').kind).toBe('refused');
  });

  it('lets a Fill be made near an Enemy', () => {
    const game = wavesGame(false);
    game.togglePause();
    expect(game.submitStroke(dragBox(860, GROUND - 160, 60, 60), 'grey').kind).toBe('object');
    game.world.spawn('crawler', CRAWLER);

    expect(game.fillAt({ x: 890, y: GROUND - 130 }, 'blue').kind).toBe('filled');
  });

  it('lets undo take back anything, with a full refund (provisional)', () => {
    const game = wavesGame(true);
    game.waves = false;
    expect(game.submitStroke(across(600, 100, 400), 'grey').kind).toBe('line');
    game.waves = true;
    game.togglePause();
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');

    game.undo();
    game.togglePause();
    game.undo();

    expect(game.world.lines).toEqual([]);
    expect(inLineLength(game.tanks.grey.spendable)).toBeCloseTo(4000, 6);
  });
});

describe('With Waves off', () => {
  it('lets a Stroke be drawn next to an Enemy, running or not', () => {
    const game = createGame(false);
    game.world.spawn('crawler', CRAWLER);
    expect(game.submitStroke(NEAR, 'grey').kind).toBe('line');
    game.togglePause();
    expect(game.submitStroke(across(760, GROUND - 160, 80), 'grey').kind).toBe('line');
  });
});

describe('Once the Ink Core is destroyed', () => {
  for (const waves of [true, false]) {
    describe(waves ? 'with Waves on' : 'with Waves off', () => {
      it('bars every Stroke and Fill, and charges nothing', () => {
        const game = lostGame(waves);
        const tanks = game.tanks;
        const stroke = across(300, 150, 100);

        expect(game.submitStroke(stroke, 'grey')).toMatchObject({
          kind: 'refused',
          reason: 'lost',
        });
        expect(game.fillAt({ x: 330, y: 330 }, 'blue')).toMatchObject({
          kind: 'refused',
          reason: 'lost',
        });
        expect(game.prospect(game.lookAtStroke(stroke)!, 'grey').refusal).toBe('lost');
        expect(game.world.lines).toHaveLength(1);
        expect(game.tanks).toEqual(tanks);
      });

      it('leaves undo and the Eraser doing nothing, until R', () => {
        const game = lostGame(waves);

        expect(game.undo()).toEqual({ kind: 'refused', reason: 'lost' });
        expect(
          game.eraseAlong(
            [
              { x: 590, y: 200 },
              { x: 810, y: 200 },
            ],
            12,
          ),
        ).toEqual({ kind: 'refused', reason: 'lost' });
        expect(game.world.lines).toHaveLength(1);
        expect(game.world.objects).toHaveLength(1);

        game.reset();
        if (waves) game.togglePause();
        game.undo();
        expect(game.world.objects).toHaveLength(0);
      });
    });
  }
});
