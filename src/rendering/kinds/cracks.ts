/** Wear at which each of the three crack stages shows. */
export const CRACK_STAGES = [0.25, 0.5, 0.75];
export const CRACK_WIDTH = 2;

/** How many crack stages a Piece's or an Object's wear shows: 0 to 3. */
export function crackStage(wear: number): number {
  return CRACK_STAGES.filter((stage) => wear >= stage).length;
}
