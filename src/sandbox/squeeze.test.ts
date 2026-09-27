import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { dragBox } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

/** A Line along y from x0 to x1. */
const across = (y: number, x0 = 250, x1 = 550): Vec2[] => [
  { x: x0, y },
  { x: x1, y },
];

/** Where each Object is, rounded to 1e-6 px and 1e-6 rad. */
const places = (world: SandboxWorld, ids: readonly number[]) =>
  ids.map((id) => {
    const { x, y, angle } = objectById(world, id).transform;
    return `${id}: ${x.toFixed(6)} ${y.toFixed(6)} ${angle.toFixed(6)}`;
  });

/** Starts physics and steps a quarter of a second: long enough for each slide to end. */
const squeezed = (world: SandboxWorld, ids: readonly number[]) => {
  runFor(world, 0.25);
  return places(world, ids);
};

// The Squeeze decides where an Object ends up, which replays depend on: these
// pin its outcomes against the Terrain, other Objects and other Lines.
describe('Squeeze: where a squeezed Object ends up', () => {
  it('goes the long way round when the Terrain is in the short way', () => {
    const world = createWorld();
    // 5 px above the ground: down, the shorter way off the Line, would sink it.
    const box = drawObject(world, dragBox(370, 815, 60, 60));
    drawLine(world, across(820));

    expect(squeezed(world, [box])).toMatchInlineSnapshot(`
      [
        "1: 400.000863 785.399133 0.000000",
      ]
    `);
  });

  it('goes the other way when another Object is in the shorter way', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(370, 400, 60, 60));
    const below = drawObject(world, dragBox(350, 465, 100, 40));
    drawLine(world, across(410));

    expect(squeezed(world, [box, below])).toMatchInlineSnapshot(`
      [
        "1: 400.000863 375.572744 0.000000",
        "2: 400.000863 485.000493 0.000000",
      ]
    `);
  });

  it('goes the other way when another Line is in the shorter way', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(370, 400, 60, 60));
    drawLine(world, across(470, 300, 500));
    drawLine(world, across(410));

    expect(squeezed(world, [box])).toMatchInlineSnapshot(`
      [
        "1: 400.000863 375.572744 0.000000",
      ]
    `);
  });

  it('squeezes each Object a Line crosses, with the others in the way', () => {
    const world = createWorld();
    const left = drawObject(world, dragBox(300, 400, 60, 60));
    const middle = drawObject(world, dragBox(362, 380, 60, 60));
    const right = drawObject(world, dragBox(424, 420, 60, 60));
    drawLine(world, across(430));

    expect(squeezed(world, [left, middle, right])).toMatchInlineSnapshot(`
      [
        "1: 330.000863 469.811663 0.000000",
        "2: 391.998344 396.041139 0.000003",
        "3: 454.000863 481.790829 0.000000",
      ]
    `);
  });

  it('squeezes an Object a Line is drawn across while running', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(370, 400, 60, 60));
    const beside = drawObject(world, dragBox(435, 360, 60, 60));
    runFor(world, 0.1);
    drawLine(world, across(445));

    expect(squeezed(world, [box, beside])).toMatchInlineSnapshot(`
      [
        "1: 399.999975 411.040945 -0.000030",
        "2: 465.000863 390.001233 0.000000",
      ]
    `);
  });
});
