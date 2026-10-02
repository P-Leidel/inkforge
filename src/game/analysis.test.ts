import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../levels/campaign-levels';
import { hintLines, newcomers } from './analysis';
import type { Level } from './level';

const NO_TANKS = { grey: 0, blue: 0, green: 0, black: 0, red: 0 };

/** A Wave table that sends `crawler`, `runner` and `heavy` of each. */
const wave = (crawler: number, runner = 0, heavy = 0) => ({
  counts: { crawler, runner, heavy },
  gap: 1,
});

const LEVELS: readonly Level[] = [
  {
    tanks: { ...NO_TANKS, grey: 100 },
    waves: [wave(2), wave(0), wave(1, 1)],
    hints: { grey: 'New: grey', crawler: 'New: Crawlers', runner: 'New: Runners' },
  },
  {
    tanks: { ...NO_TANKS, grey: 100, blue: 50 },
    waves: [wave(1, 1), wave(1, 0, 0.5), wave(1, 0, 2)],
    hints: { blue: 'New: blue' },
  },
];

describe('What is new in a Wave of the Campaign', () => {
  it("is, in a Level's first Wave, the Colours it is the first to have and the Enemy types first sent", () => {
    expect(newcomers(LEVELS, 0, 0)).toEqual(['grey', 'crawler', 'belly']);
  });

  it('is an Enemy type in the first Wave that sends one, not before', () => {
    expect(newcomers(LEVELS, 0, 1)).toEqual([]);
    expect(newcomers(LEVELS, 0, 2)).toEqual(['runner']);
  });

  it('is new to the Campaign, not just to the Level', () => {
    expect(newcomers(LEVELS, 1, 0)).toEqual(['blue']);
  });

  it('brings Bellies with the first Enemy, and only once', () => {
    const levels: readonly Level[] = [
      { tanks: { ...NO_TANKS, grey: 100 }, waves: [wave(0), wave(0, 1)] },
      { tanks: { ...NO_TANKS, grey: 100 }, waves: [wave(1)] },
    ];
    expect(newcomers(levels, 0, 0)).toEqual(['grey']);
    expect(newcomers(levels, 0, 1)).toEqual(['runner', 'belly']);
    expect(newcomers(levels, 1, 0)).toEqual(['crawler']);
  });

  it('counts an Enemy type only once a whole one is sent', () => {
    expect(newcomers(LEVELS, 1, 1)).toEqual([]);
    expect(newcomers(LEVELS, 1, 2)).toEqual(['heavy']);
  });

  it("gives each its hint, the Level's own or failing that another Level's; none without one", () => {
    expect(hintLines(LEVELS, 0, 0)).toEqual(['New: grey', 'New: Crawlers']);
    expect(hintLines(LEVELS, 1, 0)).toEqual(['New: blue']);
    expect(hintLines(LEVELS, 1, 2)).toEqual([]);
  });
});

describe("The Campaign's Levels", () => {
  /** Every Wave of every Campaign Level, with what is new in it. */
  const appearances = CAMPAIGN_LEVELS.flatMap((level, l) =>
    level.waves!.map((_, w) => ({ l, w, newcomers: newcomers(CAMPAIGN_LEVELS, l, w) })),
  );

  it('bring each Colour and Enemy type in where planned', () => {
    expect(appearances.filter((wave) => wave.newcomers.length > 0)).toEqual([
      { l: 0, w: 0, newcomers: ['grey', 'black', 'crawler', 'belly'] },
      { l: 0, w: 1, newcomers: ['runner'] },
      { l: 1, w: 0, newcomers: ['blue', 'green'] },
      { l: 1, w: 2, newcomers: ['heavy'] },
      { l: 2, w: 0, newcomers: ['red'] },
    ]);
  });

  it('have a hint, in the Level that brings it, for every Colour and Enemy type, and no other', () => {
    CAMPAIGN_LEVELS.forEach((level, l) => {
      const brought = appearances.filter((wave) => wave.l === l).flatMap((wave) => wave.newcomers);
      expect(Object.keys(level.hints!).sort()).toEqual([...brought].sort());
    });
  });
});
