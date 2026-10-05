import type { Colour } from '../materials/colour';

/** Why the Game refused a command: every command that can be stopped says one of these. */
export type Refusal =
  /** The Ink Core is destroyed: only R or Clear go on, Waves on or off. */
  | 'lost'
  /** With Waves on, it is not a Wave, or a rules switch bars it now (see `Rules`). */
  | 'not-now'
  /** During a Wave, a Stroke reaches inside an Enemy or within the small margin around it. */
  | 'near-enemy'
  /** A closing Stroke's Object would overlap the Terrain or an Object. */
  | 'overlaps'
  /** The Level doesn't have the Colour: its Tank maximum is 0, with Ink costs on. */
  | 'not-in-level'
  /** It costs more than its Colour's Tank holds. */
  | 'not-enough'
  /** The sandbox tool, sending in Enemies, is put away: the Campaign. */
  | 'not-on-hand';

/** What each Refusal says, and how it bears on what something costs. */
export interface RefusalEntry {
  /**
   * What a flash says, at the pointer. Only 'not-enough' names a Colour:
   * the refused Stroke's or Fill's.
   */
  readonly message: (colour?: Colour) => string;
  /**
   * Whether it holds whatever the Stroke costs, so the Stroke being drawn
   * shows red; only a price the Tank can't pay doesn't.
   */
  readonly whateverItCosts: boolean;
}

/** Every Refusal's message, and whether it holds whatever the Stroke costs. */
export const REFUSALS: Readonly<Record<Refusal, RefusalEntry>> = {
  lost: { message: () => 'Ink Core destroyed: R or Clear', whateverItCosts: true },
  'not-now': { message: () => 'Not now', whateverItCosts: true },
  'near-enemy': { message: () => 'Too close to an Enemy', whateverItCosts: true },
  overlaps: { message: () => 'Overlaps Terrain or an Object', whateverItCosts: true },
  'not-in-level': { message: () => 'Not in this Level', whateverItCosts: true },
  'not-enough': { message: (colour) => `Not enough ${colour ?? 'Ink'}`, whateverItCosts: false },
  'not-on-hand': { message: () => 'Not on hand', whateverItCosts: true },
};
