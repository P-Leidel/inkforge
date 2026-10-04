import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { DEFAULT_ENEMY_TABLE, editEnemies } from '../materials/enemy-table';
import type { EnemyType } from '../materials/enemy-types';
import { SANDBOX_ARENA } from './arena';
import { frontWear, pushBehind } from './push';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, piecesOf, runFor, sandboxWorlds } from './test-support';

describe('The Push: chains', () => {
  /** Who presses into whom, as a list of `pusher > pressed` pairs. */
  const chains = (pairs: string[]) => (walker: string) =>
    pairs.flatMap((pair) => {
      const [pusher, pressed] = pair.split('>');
      return pressed === walker ? [pusher!] : [];
    });
  const all = () => true;

  it('follows a line of Enemies back from the front, each pressing into the next', () => {
    expect(pushBehind('a', chains(['b>a', 'c>b', 'd>c']), all)).toEqual(['b', 'c', 'd']);
  });

  it('counts an Enemy once, however many chains reach it', () => {
    // d presses into both b and c, which both press into a.
    const pushers = pushBehind('a', chains(['b>a', 'c>a', 'd>b', 'd>c']), all);
    expect(pushers.sort()).toEqual(['b', 'c', 'd']);
  });

  it('follows every branch, and never counts the front, even pressed back into', () => {
    const pushers = pushBehind('a', chains(['b>a', 'c>b', 'd>b', 'e>d', 'a>e']), all);
    expect(pushers.sort()).toEqual(['b', 'c', 'd', 'e']);
  });

  it('stops at a gap: an Enemy pressing into none of the chain is no part of it', () => {
    // c stands behind b with a gap between them; d presses into c.
    expect(pushBehind('a', chains(['b>a', 'd>c']), all)).toEqual(['b']);
  });

  it('skips one that pushes nothing (a Tipped Siege Walker), and what presses only into it', () => {
    const tipped = (walker: string) => walker !== 'w';
    // w lies Tipped behind b; c presses into w alone, d into both w and b.
    const pushers = pushBehind('a', chains(['b>a', 'w>b', 'c>w', 'd>w', 'd>b']), tipped);
    expect(pushers.sort()).toEqual(['b', 'd']);
  });

  it('is empty with no one behind', () => {
    expect(pushBehind('a', chains([]), all)).toEqual([]);
  });
});

describe('The Push: wear at the front', () => {
  it('is pressing × (1 + stackWear × Stack + Σ push)', () => {
    expect(frontWear(300, 0.5, 0, [])).toBe(300);
    expect(frontWear(300, 0.5, 2, [])).toBe(600);
    expect(frontWear(300, 0.5, 0, [0.2, 0.2])).toBeCloseTo(420, 9);
    expect(frontWear(300, 0.5, 1, [4, 0.6])).toBeCloseTo(300 * (1 + 0.5 + 4.6), 9);
  });

  it('has four Crawlers behind a Siege Walker roughly double its wear', () => {
    const { crawler, siegeWalker } = DEFAULT_ENEMY_TABLE.types;
    const pushed = frontWear(siegeWalker.pressing, 0.5, 0, Array(4).fill(crawler.push));
    const ratio = pushed / siegeWalker.pressing;
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.2);
  });

  it('starts every type’s push as the spec does', () => {
    const push = (type: EnemyType) => DEFAULT_ENEMY_TABLE.types[type].push;
    expect([push('crawler'), push('runner'), push('heavy'), push('siegeWalker')]).toEqual([
      0.2, 0.1, 0.6, 4,
    ]);
  });
});

describe('The Push in the Sandbox world', () => {
  const createWorld = sandboxWorlds();
  const GROUND_Y = SANDBOX_ARENA.spawn.y;
  const WALL_X = 600;

  /** Where an Enemy of `type` stands on the ground with its front at `front`. */
  const standing = (type: EnemyType, front: number): Vec2 => {
    const { width, height } = DEFAULT_ENEMY_TABLE.types[type];
    return { x: front - width / 2, y: GROUND_Y - height / 2 - 0.5 };
  };

  /**
   * A black wall at x 600 and Enemies of `types`, front first, lined up
   * behind it; Crawlers climb nothing, so they stay in a row. Returns the
   * durability per second the wall's bottom Piece, which only the front
   * Enemy touches, loses once they press it.
   */
  function wearOf(types: EnemyType[]): number {
    const world = createWorld();
    editEnemies(world.enemyTable, (table) => {
      table.types.crawler.climb = 0;
      table.floorWear = 0;
    });
    const wall = drawLine(
      world,
      [
        { x: WALL_X, y: GROUND_Y - 4 },
        { x: WALL_X, y: GROUND_Y - 250 },
      ],
      'black',
    );
    let front = WALL_X - 10;
    for (const type of types) {
      world.spawn(type, standing(type, front));
      front -= DEFAULT_ENEMY_TABLE.types[type].width + 2;
    }
    const bottom = (world: SandboxWorld) =>
      piecesOf(world.lines.find(({ id }) => id === wall)!)[0]!.durability;
    runFor(world, 1.5);
    const before = bottom(world);
    runFor(world, 1);
    return before - bottom(world);
  }

  it('has three Crawlers in a row at a black wall wear it faster than one, by their push', () => {
    const { crawler } = DEFAULT_ENEMY_TABLE.types;
    const one = wearOf(['crawler']);
    const three = wearOf(['crawler', 'crawler', 'crawler']);

    expect(one).toBeCloseTo(crawler.pressing, -1);
    expect(three).toBeCloseTo(crawler.pressing * (1 + 2 * crawler.push), -1);
  });

  it('has a Siege Walker behind a Crawler make it wear the wall much faster', () => {
    const { crawler, siegeWalker } = DEFAULT_ENEMY_TABLE.types;
    const one = wearOf(['crawler']);
    const pushed = wearOf(['crawler', 'siegeWalker']);

    expect(pushed).toBeGreaterThan(4 * one);
    expect(pushed).toBeCloseTo(crawler.pressing * (1 + siegeWalker.push), -1);
  });
});
