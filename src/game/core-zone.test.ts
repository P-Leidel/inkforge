import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { editEnemies } from '../materials/enemy-table';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import type { Game } from './game';
import { games } from './test-support';

const createGame = games();

/** A Game with Waves on, whose Wave sends in one Crawler, then waits a long while. */
function wavesGame(inkCosts: boolean): Game {
  const game = createGame(inkCosts, { waves: true });
  game.editWave((table) => {
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

/**
 * In the sandbox Arena, the Ink Core's centre is at (1832, 662), and the
 * Core Zone reaches 240 px from it: these lie in the air, one wholly
 * inside it, the other reaching out of it to the left.
 */
const INSIDE = across(1650, 560, 40);
const REACHING_OUT = across(1500, 560, 200);
/** A 40 px box wholly inside the Core Zone, and one wholly outside it. */
const BOX_INSIDE = dragBox(1650, 540, 40, 40);
const BOX_OUTSIDE = dragBox(1000, 400, 40, 40);

/** Sends an Enemy in below the screen, where it dies, and steps until its Drop is let out. */
function pitKill(game: Game): void {
  const before = game.world.enemyCount;
  game.world.spawn('crawler', { x: 800, y: game.world.arena.height + 200 });
  for (let steps = 0; steps < Math.round(0.5 / STEP_SECONDS); steps++) {
    game.step();
    if (game.world.enemyCount === before) break;
  }
}

describe('The Core Zone', () => {
  it('is a circle centred on the Ink Core, as wide as the enemy table says', () => {
    const game = createGame(false);
    expect(game.coreZone).toEqual({ centre: { x: 1832, y: 662 }, radius: 240 });

    editEnemies(game.world.enemyTable, (table) => (table.coreZone = 100));

    expect(game.coreZone.radius).toBe(50);
  });

  describe('during a Wave, with Ink costs off', () => {
    it('draws a Stroke wholly inside it, and refuses whole one reaching outside', () => {
      const game = wavesGame(false);
      game.togglePause();
      expect(game.phase).toBe('wave');

      expect(game.submitStroke(INSIDE, 'grey').kind).toBe('line');
      const outside = game.submitStroke(REACHING_OUT, 'grey');

      expect(outside.kind).toBe('outside');
      expect(outside.kind === 'outside' && outside.path.length).toBeGreaterThan(1);
      expect(game.world.lines).toHaveLength(1);
      expect(game.history).toHaveLength(1);
    });

    it('refuses a closing Stroke outside it, and makes one inside it', () => {
      const game = wavesGame(false);
      game.togglePause();

      expect(game.submitStroke(BOX_OUTSIDE, 'grey').kind).toBe('outside');
      expect(game.submitStroke(BOX_INSIDE, 'grey').kind).toBe('object');
      expect(game.world.objects).toHaveLength(1);
    });

    it('holds while the Wave is paused', () => {
      const game = wavesGame(false);
      game.togglePause();
      game.togglePause();
      expect(game.isRunning).toBe(false);
      expect(game.phase).toBe('wave');

      expect(game.submitStroke(REACHING_OUT, 'grey').kind).toBe('outside');
    });

    it('refuses a Fill click outside it, and fills an Object clicked inside it', () => {
      const game = wavesGame(false);
      expect(game.submitStroke(BOX_OUTSIDE, 'grey').kind).toBe('object');
      expect(game.submitStroke(BOX_INSIDE, 'grey').kind).toBe('object');
      const [outsideBox, insideBox] = game.world.objects.map((object) => object.id);
      game.togglePause();

      const refused = game.fillAt({ x: 1020, y: 420 }, 'blue');
      expect(refused).toMatchObject({ kind: 'outside', id: outsideBox });
      expect(refused.kind === 'outside' && refused.outline.length).toBeGreaterThan(2);
      expect(game.fillAt({ x: 1670, y: 560 }, 'blue')).toMatchObject({
        kind: 'filled',
        id: insideBox,
      });
      expect(game.world.objects.map((object) => object.fill)).toEqual([null, 'blue']);
    });

    it('lets a click outside it over nothing miss, as ever', () => {
      const game = wavesGame(false);
      game.togglePause();

      expect(game.fillAt({ x: 600, y: 300 }, 'blue').kind).toBe('missed');
    });
  });

  describe('during a Wave, with Ink costs on', () => {
    it('draws a Stroke inside it with Wave Ink, and refuses one reaching outside for the Zone', () => {
      const game = wavesGame(true);
      // Room in the grey Tank for a Drop.
      expect(game.submitStroke(across(600, 200, 400), 'grey').kind).toBe('line');
      game.togglePause();
      pitKill(game);
      expect(game.tanks.grey.spendable).toBeGreaterThan(0);

      expect(game.submitStroke(REACHING_OUT, 'grey').kind).toBe('outside');
      expect(game.submitStroke(INSIDE, 'grey').kind).toBe('line');
    });

    it('says "outside" before "not enough"', () => {
      const game = wavesGame(true);
      game.togglePause();
      expect(game.tanks.grey.spendable).toBe(0);

      expect(game.submitStroke(REACHING_OUT, 'grey').kind).toBe('outside');
      expect(game.submitStroke(INSIDE, 'grey').kind).toBe('refused');
    });
  });

  describe('its prospect', () => {
    it('is refused as outside during a Wave, and not in the Build Phase', () => {
      const game = wavesGame(false);
      const look = game.lookAtStroke(REACHING_OUT)!;
      expect(game.prospect(look, 'grey').refusal).toBeNull();

      game.togglePause();

      expect(game.prospect(look, 'grey').refusal).toBe('outside');
      expect(game.prospect(game.lookAtStroke(INSIDE)!, 'grey').refusal).toBeNull();
    });

    it('refuses a Fill under a pointer outside it during a Wave', () => {
      const game = wavesGame(false);
      game.submitStroke(BOX_OUTSIDE, 'grey');
      game.togglePause();

      expect(game.prospect(game.lookAtFill({ x: 1020, y: 420 })!, 'grey').refusal).toBe('outside');
    });
  });

  it('leaves drawing unrestricted in the Build Phase', () => {
    const game = wavesGame(false);
    expect(game.phase).toBe('build');

    expect(game.submitStroke(REACHING_OUT, 'grey').kind).toBe('line');
    expect(game.submitStroke(BOX_OUTSIDE, 'grey').kind).toBe('object');
    expect(game.fillAt({ x: 1020, y: 420 }, 'blue').kind).toBe('filled');
  });

  it('leaves drawing unrestricted with Waves off, running or not', () => {
    const game = createGame(false);
    game.togglePause();
    expect(game.isRunning).toBe(true);

    expect(game.submitStroke(across(1500, 300, 200), 'grey').kind).toBe('line');
    expect(game.submitStroke(dragBox(1000, 200, 40, 40), 'grey').kind).toBe('object');
  });

  it('holds no more once the Wave ends', () => {
    const game = wavesGame(false);
    game.togglePause();
    game.waves = false;

    expect(game.submitStroke(REACHING_OUT, 'grey').kind).toBe('line');
  });
});
