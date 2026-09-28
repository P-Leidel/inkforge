import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { fillInk, lineInk, outlineInk, samplesInk } from './ink';
import { fillMass, outlineMass } from './mass';
import { DEFAULT_MATERIAL_TABLE as table } from './material-table';

const square = (side: number): Polygon => [
  { x: 0, y: 0 },
  { x: side, y: 0 },
  { x: side, y: side },
  { x: 0, y: side },
];

describe('Ink', () => {
  it("makes a straight Line's Ink its length × the Line thickness", () => {
    const line = [{ a: { x: 0, y: 0 }, b: { x: 300, y: 400 } }];

    expect(lineInk(line, LINE_THICKNESS)).toBe(500 * 8);
  });

  it('adds up the Line across its segments, in whatever Pieces they come', () => {
    const bent = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100, y: 0 }, b: { x: 100, y: 50 } },
    ];

    expect(lineInk(bent, LINE_THICKNESS)).toBe(150 * 8);
    expect(lineInk(bent.slice(1), LINE_THICKNESS)).toBe(50 * 8);
    expect(lineInk([], LINE_THICKNESS)).toBe(0);
  });

  it('measures a Line by the thickness it was drawn with', () => {
    const line = [{ a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }];

    expect(lineInk(line, 4)).toBe(800);
    expect(lineInk(line, 4)).toBe(lineInk(line, LINE_THICKNESS) / 2);
  });

  it("makes a square Outline's Ink its perimeter × the Line thickness, and its Fill's its area", () => {
    expect(outlineInk(square(60))).toBe(240 * 8);
    expect(fillInk(square(60))).toBe(3600);
  });

  it('weighs an Object by its Ink: Ink × ink mass × density', () => {
    const { grey } = table.colours;

    expect(outlineMass(square(60), 'grey', table)).toBe(
      table.inkMass * outlineInk(square(60)) * grey.outline.density,
    );
    expect(fillMass(square(60), 'grey', table)).toBe(
      table.inkMass * fillInk(square(60)) * grey.fill.density,
    );
  });

  describe("a Stroke's raw samples", () => {
    const nothingOnLines = () => [];

    it('measure an open path as a Line along them, with the part lying on Lines', () => {
      const samples = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ];
      const firstLeg = (path: readonly Segment[]) => path.slice(0, 1);

      expect(samplesInk(samples, nothingOnLines)).toEqual({
        closes: false,
        ink: 150 * 8,
        onLines: 0,
      });
      expect(samplesInk(samples, firstLeg)).toMatchObject({ ink: 150 * 8, onLines: 100 * 8 });
    });

    it('measure an open path only where it is left after the cut', () => {
      const samples = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ];
      const firstLegOnly = (points: readonly { x: number; y: number }[]): Segment[] => [
        { a: points[0]!, b: points[1]! },
      ];
      const everything = (path: readonly Segment[]) => path;

      expect(samplesInk(samples, everything, firstLegOnly)).toEqual({
        closes: false,
        ink: 100 * 8,
        onLines: 100 * 8,
      });
    });

    it("measure a closing path as its ring's Outline, none of it on Lines", () => {
      // Round a 60 px square, ending 2 px short of the start.
      const samples = [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 60 },
        { x: 0, y: 60 },
        { x: 0, y: 2 },
      ];
      const everything = (path: readonly Segment[]) => path;

      expect(samplesInk(samples, everything)).toEqual({
        closes: true,
        ink: outlineInk(square(60)),
        onLines: 0,
      });
    });
  });
});
