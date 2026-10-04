import { describe, expect, it } from 'vitest';
import { dragBox } from '../stroke/pointer-paths';
import { contentCounts } from './content-counts';
import { drawLine, drawObject, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

describe('Content counts', () => {
  it('counts every list of the world’s contents, in kind order', () => {
    const world = createWorld();
    drawObject(world, dragBox(900, 200, 60, 60));
    drawObject(world, dragBox(1100, 200, 60, 60));
    drawLine(world, [
      { x: 300, y: 400 },
      { x: 600, y: 400 },
    ]);

    expect(contentCounts(world.contents)).toEqual([
      { name: 'objects', count: 2 },
      { name: 'lines', count: 1 },
      { name: 'rubble', count: 0 },
      { name: 'enemies', count: 0 },
      { name: 'bonds', count: 0 },
      { name: 'droplets', count: 0 },
      { name: 'patches', count: 0 },
      { name: 'blasts', count: 0 },
    ]);
  });
});
