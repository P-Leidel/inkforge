import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import { Random } from '../sandbox/random';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { DropBursts } from './drop-burst';

/** Each Colour's gauge along the top, 100 px apart. */
const gaugeAt = (colour: Colour): Vec2 => ({ x: 100 * COLOURS.indexOf(colour), y: 0 });
/** A Drop of these amounts, in Line length. */
const drop = (lengths: Partial<Record<Colour, number>>) =>
  Object.fromEntries(COLOURS.map((c) => [c, (lengths[c] ?? 0) * LINE_THICKNESS])) as Record<
    Colour,
    number
  >;

describe('The Drop burst', () => {
  it('lets out dots of each Colour the Drop holds, more for more Ink, none for none', () => {
    const bursts = new DropBursts(new Random(1), gaugeAt);
    bursts.burst({ x: 500, y: 800 }, drop({ grey: 90, red: 5 }));
    bursts.advance(0.25); // every dot has set off

    const colours = bursts.views.map((dot) => dot.colour);
    expect(new Set(colours)).toEqual(new Set(['grey', 'red']));
    expect(colours.filter((c) => c === 'grey').length).toBeGreaterThan(
      colours.filter((c) => c === 'red').length,
    );
  });

  it('flies from the body to its own gauge, and is gone once there', () => {
    const bursts = new DropBursts(new Random(1), gaugeAt);
    const at = { x: 500, y: 800 };
    bursts.burst(at, drop({ blue: 30 }));

    bursts.advance(0.21);
    const early = bursts.views;
    for (const { position } of early)
      expect(Math.hypot(position.x - 500, position.y - 800)).toBeLessThan(100);
    bursts.advance(0.5);
    for (const { position } of bursts.views) {
      expect(Math.hypot(position.x - gaugeAt('blue').x, position.y)).toBeLessThan(
        Math.hypot(at.x - gaugeAt('blue').x, at.y),
      );
    }
    bursts.advance(1);
    expect(bursts.count).toBe(0);
  });
});
