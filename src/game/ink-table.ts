import type { Colour } from '../materials/colour';
import { LINE_THICKNESS } from '../stroke/stroke-rules';

/*
 * The Ink table: what Strokes and Fills cost, and how much each Ink Tank
 * holds. Pure data, owned by the Game, next to but apart from the material
 * table. The player reads Ink as Line length: px² ÷ the Line thickness, so a
 * 400 px Line is 400.
 */

export interface InkTable {
  /** What a unit of a Line or an Outline costs. */
  linePrice: number;
  /** What a unit of a Fill costs. */
  fillPrice: number;
  /** Each Colour's Tank maximum, in Line length. */
  tanks: Record<Colour, number>;
}

/** The Ink table, read only: the Game's is edited through `Game.editInk`. */
export type ReadonlyInkTable = { readonly [K in keyof InkTable]: Readonly<InkTable[K]> };

/**
 * The starting values. The F2 tuning panel's "Copy as JSON" gives a table in
 * this shape under `ink`, to paste over it.
 */
export const DEFAULT_INK_TABLE: ReadonlyInkTable = {
  linePrice: 1,
  fillPrice: 0.25,
  tanks: {
    grey: 4000,
    blue: 3000,
    green: 3000,
    black: 1500,
    red: 1000,
  },
};

/** A fresh, editable copy of the default Ink table. */
export function createInkTable(): InkTable {
  return structuredClone(DEFAULT_INK_TABLE) as InkTable;
}

/** Ink (px²) as the player reads it: in Line length. */
export function inLineLength(ink: number): number {
  return ink / LINE_THICKNESS;
}

/** An amount in Line length, as Ink (px²). */
export function fromLineLength(length: number): number {
  return length * LINE_THICKNESS;
}
