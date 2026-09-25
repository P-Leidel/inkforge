/** The five ink materials, in palette order (keys 1–5). */
export const COLOURS = ['grey', 'blue', 'green', 'black', 'red'] as const;

export type Colour = (typeof COLOURS)[number];
