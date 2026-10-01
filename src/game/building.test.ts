import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { createEnemyTable } from '../materials/enemy-table';
import { SANDBOX_ARENA } from '../sandbox/arena';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import type { Game } from './game';
import { inLineLength } from './ink-table';
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

describe('With Waves on, in an Intermission', () => {
  it('bars every Stroke and Fill, and Space starts the Wave', () => {
    const game = wavesGame(false);
    game.defence.waves = false;
    expect(game.submitStroke(dragBox(300, 300, 60, 60), 'grey').kind).toBe('object');
    game.defence.waves = true;
    expect(game.defence.reading.phase).toBe('intermission');

    const stroke = game.submitStroke(FAR, 'grey');
    expect(stroke).toMatchObject({ kind: 'barred', reason: 'not-now' });
    expect(stroke.kind === 'barred' && stroke.path.length).toBeGreaterThan(1);
    expect(game.fillAt({ x: 330, y: 330 }, 'blue')).toMatchObject({
      kind: 'barred',
      reason: 'not-now',
    });
    expect(game.prospect(game.lookAtStroke(FAR)!, 'grey').refusal).toBe('not-now');
    expect(game.world.lines).toEqual([]);
  });

  it('leaves undo and the Eraser doing nothing', () => {
    const game = wavesGame(false);
    game.defence.waves = false;
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    game.defence.waves = true;

    game.undo();
    game.eraseAlong(
      [
        { x: 590, y: 200 },
        { x: 810, y: 200 },
      ],
      12,
    );

    expect(game.world.lines).toHaveLength(1);
    expect(game.history).toHaveLength(1);
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

    expect(near).toMatchObject({ kind: 'barred', reason: 'near-enemy' });
    expect(near.kind === 'barred' && near.path.length).toBeGreaterThan(1);
    expect(game.world.lines).toEqual([]);
    expect(game.prospect(game.lookAtStroke(NEAR)!, 'grey').refusal).toBe('near-enemy');
    expect(game.prospect(game.lookAtStroke(FAR)!, 'grey').refusal).toBeNull();
  });

  it('bars a closing Stroke just above an Enemy too', () => {
    const game = wavesGame(false);
    game.togglePause();
    game.world.spawn('crawler', CRAWLER);

    expect(game.submitStroke(dragBox(760, GROUND - 130, 80, 80), 'grey')).toMatchObject({
      kind: 'barred',
      reason: 'near-enemy',
    });
  });

  it('says "near an Enemy" before "not enough"', () => {
    const game = wavesGame(true);
    game.editInk((table) => (table.tanks.grey = 0));
    game.togglePause();
    game.world.spawn('crawler', CRAWLER);

    expect(game.submitStroke(NEAR, 'grey').kind).toBe('barred');
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
    game.defence.waves = false;
    expect(game.submitStroke(across(600, 100, 400), 'grey').kind).toBe('line');
    game.defence.waves = true;
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
  /**
   * A Game with Ink costs on whose Ink Core has 1 HP: a Line and a box are
   * drawn first, then physics starts (a Wave, with Waves on) and a Crawler
   * on the plateau walks into the Ink Core.
   */
  function lostGame(waves: boolean): Game {
    const enemies = createEnemyTable();
    enemies.coreHp = 1;
    const game = createGame(true, { waves, worldOptions: { seed: 1, enemies } });
    game.defence.waves = false;
    expect(game.submitStroke(FAR, 'grey').kind).toBe('line');
    expect(game.submitStroke(dragBox(300, 300, 60, 60), 'grey').kind).toBe('object');
    game.defence.waves = waves;
    game.togglePause();
    const { minX, maxY } = game.world.arena.core;
    game.world.spawn('crawler', { x: minX - 60, y: maxY - 20 });
    for (let k = 0; k < 600 && game.isRunning; k++) game.step();
    expect(game.defence.reading.coreDestroyed).toBe(true);
    return game;
  }

  for (const waves of [true, false]) {
    describe(waves ? 'with Waves on' : 'with Waves off', () => {
      it('bars every Stroke and Fill, and charges nothing', () => {
        const game = lostGame(waves);
        const tanks = game.tanks;
        const stroke = across(300, 150, 100);

        expect(game.submitStroke(stroke, 'grey')).toMatchObject({ kind: 'barred', reason: 'lost' });
        expect(game.fillAt({ x: 330, y: 330 }, 'blue')).toMatchObject({
          kind: 'barred',
          reason: 'lost',
        });
        expect(game.prospect(game.lookAtStroke(stroke)!, 'grey').refusal).toBe('lost');
        expect(game.world.lines).toHaveLength(1);
        expect(game.tanks).toEqual(tanks);
      });

      it('leaves undo and the Eraser doing nothing, until R', () => {
        const game = lostGame(waves);

        game.undo();
        game.eraseAlong(
          [
            { x: 590, y: 200 },
            { x: 810, y: 200 },
          ],
          12,
        );
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
