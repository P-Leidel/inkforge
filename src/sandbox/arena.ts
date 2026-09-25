import type { Polygon } from '../geometry/polygon';

/** Logical Arena size in pixels. The canvas is scaled to fit the window. */
export const ARENA_WIDTH = 1920;
export const ARENA_HEIGHT = 1080;

/** One fixed, non-scrolling screen with its Terrain. */
export interface Arena {
  readonly width: number;
  readonly height: number;
  /** Terrain as convex polygons in Arena pixels. */
  readonly terrain: readonly Polygon[];
}

const GROUND_Y = 880;
const WALL_WIDTH = 40;
const PIT_LEFT = 900;
const PIT_RIGHT = 1100;
const PIT_FLOOR_Y = 1040;
const SLOPE_LEFT = 1400;
const SLOPE_TOP_Y = 640;

const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/**
 * The milestone 1 sandbox Arena: flat ground, a wall at each side, a pit in
 * the middle and a slope rising to the right wall.
 */
export const SANDBOX_ARENA: Arena = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  terrain: [
    box(0, 0, WALL_WIDTH, ARENA_HEIGHT), // left wall
    box(ARENA_WIDTH - WALL_WIDTH, 0, ARENA_WIDTH, ARENA_HEIGHT), // right wall
    box(WALL_WIDTH, GROUND_Y, PIT_LEFT, ARENA_HEIGHT), // ground left of the pit
    box(PIT_LEFT, PIT_FLOOR_Y, PIT_RIGHT, ARENA_HEIGHT), // pit floor
    box(PIT_RIGHT, GROUND_Y, SLOPE_LEFT, ARENA_HEIGHT), // ground right of the pit
    [
      // slope
      { x: SLOPE_LEFT, y: GROUND_Y },
      { x: ARENA_WIDTH - WALL_WIDTH, y: SLOPE_TOP_Y },
      { x: ARENA_WIDTH - WALL_WIDTH, y: ARENA_HEIGHT },
      { x: SLOPE_LEFT, y: ARENA_HEIGHT },
    ],
  ],
};
