import { describe, expect, it } from 'vitest';
import { polygonContainsPoint, type Polygon } from '../geometry/polygon';
import { distancePointToSegment } from '../geometry/segment';
import { length, sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { fillMass } from '../materials/mass';
import { DEFAULT_MATERIAL_TABLE as table } from '../materials/material-table';
import { Random } from './random';
import { launchRubble, packRubble, type PackedRubble } from './rubble';

const box = (width: number, height = width): Polygon => [
  { x: -width / 2, y: -height / 2 },
  { x: width / 2, y: -height / 2 },
  { x: width / 2, y: height / 2 },
  { x: -width / 2, y: height / 2 },
];

const circle = (radius: number, sides = 48): Polygon =>
  Array.from({ length: sides }, (_, k) => ({
    x: radius * Math.cos((2 * Math.PI * k) / sides),
    y: radius * Math.sin((2 * Math.PI * k) / sides),
  }));

/** An L of two 60 px arms, 30 px thick: concave. */
const L_SHAPE: Polygon = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 30 },
  { x: 60, y: 30 },
  { x: 60, y: 60 },
  { x: 0, y: 60 },
];

function pack(outline: Polygon, fill: Colour, seed = 1): PackedRubble[] {
  return packRubble(outline, fill, fillMass(outline, fill, table), table, new Random(seed));
}

/** How far a point is from the nearest edge of the polygon. */
function depth(outline: Polygon, p: Vec2): number {
  let nearest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    nearest = Math.min(nearest, distancePointToSegment(p, a, b));
  }
  return nearest;
}

function expectPackedInside(outline: Polygon, rubble: readonly PackedRubble[]): void {
  for (const piece of rubble) {
    expect(piece.radius).toBeGreaterThan(0);
    expect(polygonContainsPoint(outline, piece.centre)).toBe(true);
    expect(depth(outline, piece.centre)).toBeGreaterThanOrEqual(piece.radius);
  }
  for (let i = 0; i < rubble.length; i++) {
    for (let j = i + 1; j < rubble.length; j++) {
      const a = rubble[i]!;
      const b = rubble[j]!;
      expect(length(sub(a.centre, b.centre))).toBeGreaterThanOrEqual(a.radius + b.radius);
    }
  }
}

const totalMass = (rubble: readonly PackedRubble[]) =>
  rubble.reduce((sum, piece) => sum + piece.mass, 0);

const OUTLINES: Record<string, Polygon> = {
  'a 60 px box': box(60),
  'a 150 px box': box(150),
  'a 40 px ball': circle(40),
  'an L': L_SHAPE,
  'a thin bar': box(200, 10),
  'a tiny box': box(21),
};

describe('Rubble generation', () => {
  for (const [name, outline] of Object.entries(OUTLINES)) {
    for (const fill of ['grey', 'black'] as const) {
      it(`packs ${fill} Rubble into ${name}: inside, not overlapping, weighing the Fill`, () => {
        const rubble = pack(outline, fill);

        const max = table.colours[fill].fill.rubbleMax;
        expect(rubble.length).toBeGreaterThanOrEqual(1);
        expect(rubble.length).toBeLessThanOrEqual(max);
        expectPackedInside(outline, rubble);
        expect(totalMass(rubble)).toBeCloseTo(fillMass(outline, fill, table), 9);
      });
    }
  }

  it('releases more for a bigger Fill, up to 18 pebbles and 8 stones', () => {
    const sides = [25, 35, 45, 60, 80, 120, 200];
    for (const [fill, max] of [
      ['grey', 18],
      ['black', 8],
    ] as const) {
      const counts = sides.map((side) => pack(box(side), fill).length);
      for (let k = 1; k < counts.length; k++) {
        expect(counts[k], `${fill} ${sides[k]} px`).toBeGreaterThanOrEqual(counts[k - 1]!);
      }
      expect(counts[0]).toBeLessThan(counts[counts.length - 1]!);
      expect(counts[counts.length - 1]).toBe(max);
    }
  });

  it('gives a 60 px box the full 8 stones, each heavier than its pebbles', () => {
    const pebbles = pack(box(60), 'grey');
    const stones = pack(box(60), 'black');

    expect(stones).toHaveLength(8);
    expect(pebbles.length).toBeGreaterThan(stones.length);
    expect(stones[0]!.mass).toBeGreaterThan(pebbles[0]!.mass);
    expect(stones[0]!.radius).toBeGreaterThan(pebbles[0]!.radius);
  });

  it('shrinks a piece that fits nowhere to the deepest point of a thin Outline', () => {
    const [stone, ...more] = pack(box(200, 10), 'black');

    expect(more).toHaveLength(0);
    expect(stone!.radius).toBeLessThan(table.colours.black.fill.rubbleRadius);
    expect(Math.abs(stone!.centre.y)).toBeLessThan(1);
  });

  it('releases nothing from a hollow Object or a Fill that makes no Rubble', () => {
    expect(packRubble(box(60), null, 0, table, new Random(1))).toEqual([]);
    for (const fill of ['blue', 'green', 'red'] as const) expect(pack(box(60), fill)).toEqual([]);
  });

  it('places Rubble by the seed: the same seed, the same pieces', () => {
    const outline = box(80);
    expect(pack(outline, 'grey', 7)).toEqual(pack(outline, 'grey', 7));
    expect(pack(outline, 'grey', 7)).not.toEqual(pack(outline, 'grey', 8));
  });
});

describe('The Fill kick', () => {
  const still = { transform: { x: 100, y: 200, angle: 0 }, velocity: { x: 0, y: 0 } };
  const piece = (centre: Vec2): PackedRubble => ({ centre, radius: 5, mass: 1 });

  it('flings each piece outward from the centre at the kick speed, within the spread', () => {
    const spread = table.kickSpread;
    const pieces = [piece({ x: 20, y: 0 }), piece({ x: 0, y: -20 }), piece({ x: -10, y: 10 })];

    const launched = launchRubble(
      pieces,
      { ...still, angularVelocity: 0 },
      300,
      spread,
      new Random(3),
    );

    launched.forEach(({ position, velocity }, k) => {
      const offset = pieces[k]!.centre;
      expect(position).toEqual({ x: 100 + offset.x, y: 200 + offset.y });
      expect(length(velocity)).toBeCloseTo(300, 9);
      const turn = Math.atan2(
        offset.x * velocity.y - offset.y * velocity.x,
        offset.x * velocity.x + offset.y * velocity.y,
      );
      expect(Math.abs(turn)).toBeLessThanOrEqual(spread + 1e-9);
    });
  });

  it("adds the Object's velocity at each piece, spin included, and places pieces with its pose", () => {
    const moving = {
      transform: { x: 100, y: 200, angle: Math.PI / 2 },
      velocity: { x: 50, y: -20 },
      angularVelocity: 2,
    };

    const [launched] = launchRubble([piece({ x: 10, y: 0 })], moving, 0, 0, new Random(3));

    // Turned a quarter: the piece is 10 px below the centre.
    expect(launched!.position.x).toBeCloseTo(100, 9);
    expect(launched!.position.y).toBeCloseTo(210, 9);
    // v + ω × r: 2 rad/s about a point 10 px away adds 20 px/s across.
    expect(launched!.velocity.x).toBeCloseTo(50 - 2 * 10, 9);
    expect(launched!.velocity.y).toBeCloseTo(-20, 9);
    expect(launched!.angularVelocity).toBe(2);
  });

  it('kicks a piece at the very centre in a seeded direction', () => {
    const at = (seed: number) =>
      launchRubble(
        [piece({ x: 0, y: 0 })],
        { ...still, angularVelocity: 0 },
        300,
        0.3,
        new Random(seed),
      )[0]!.velocity;

    expect(length(at(1))).toBeCloseTo(300, 9);
    expect(at(1)).toEqual(at(1));
    expect(at(1)).not.toEqual(at(2));
  });
});
