import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geometry/polygon';
import type { Colour } from './colour';
import { objectMass } from './mass';
import { DEFAULT_MATERIAL_TABLE as table } from './material-table';

const square = (side: number): Polygon => [
  { x: 0, y: 0 },
  { x: side, y: 0 },
  { x: side, y: side },
  { x: 0, y: side },
];

describe('Object mass', () => {
  it("weighs a hollow grey 60 px box what milestone 1's box weighed: 1.44", () => {
    // Milestone 1: 3600 px² at 1 kg/m², 50 px per metre.
    expect(objectMass(square(60), 'grey', null, table)).toBeCloseTo(1.44, 6);
  });

  it("adds the Fill's ink to the Outline's: a grey-filled 60 px box weighs 4.14", () => {
    // 240 px of 8 px Outline is 1920 px² of ink, the Fill 3600 px² more:
    // 5520 px² at 0.00075 per px².
    expect(objectMass(square(60), 'grey', 'grey', table)).toBeCloseTo(4.14, 6);
  });

  it('makes a hollow shell lighter the bigger it is, relative to its area', () => {
    const small = objectMass(square(30), 'grey', null, table) / 900;
    const big = objectMass(square(120), 'grey', null, table) / 14400;
    expect(big).toBeCloseTo(small / 4, 6);
  });

  it('weighs each Colour by its density: black three times grey, blue half', () => {
    const hollow = objectMass(square(60), 'grey', null, table);
    const fillOf = (colour: Colour) => objectMass(square(60), 'grey', colour, table) - hollow;

    expect(fillOf('black')).toBeCloseTo(3 * fillOf('grey'), 6);
    expect(fillOf('blue')).toBeCloseTo(0.5 * fillOf('grey'), 6);
    expect(objectMass(square(60), 'blue', null, table)).toBeCloseTo(0.5 * hollow, 6);
    expect(objectMass(square(60), 'black', null, table)).toBeCloseTo(3 * hollow, 6);
  });
});
