import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';
import type { Polygon } from '../geometry/polygon';
import { ARENA_HEIGHT, ARENA_WIDTH, type Arena } from '../sandbox/arena';

/*
 * Level 2: a valley between two ledges. The Spawn's lane runs in along the
 * left ledge, which ends in a cliff; Enemies drop to the valley floor and
 * walk up a slope to the right ledge, where the Ink Core stands. A bridge
 * from ledge to ledge keeps them out of the valley, blue in the valley
 * throws them back, and Heavies wear through what they cross.
 */

const WALL_WIDTH = 40;
/** How far the lane runs beyond the Spawn edge, out of view. */
const LANE_LENGTH = 240;
/** Both ledges' tops (px). */
const LEDGE_Y = 700;
/** The valley floor (px): a drop of 260 from the ledges, six Crawlers deep. */
const VALLEY_Y = 960;
/** Where the left ledge ends in a cliff, and the valley floor begins. */
const CLIFF_X = 560;
/** Where the valley floor meets the slope up to the right ledge. */
const SLOPE_LEFT = 1160;
/** Where the slope meets the right ledge. It rises 1 in 2, as the sandbox's does. */
const SLOPE_RIGHT = SLOPE_LEFT + 2 * (VALLEY_Y - LEDGE_Y);
const RIGHT_WALL = ARENA_WIDTH - WALL_WIDTH;
/** The Ink Core is a square block this wide (px). */
const CORE_SIZE = 96;

const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/** The valley: two ledges with a gap of 600 px between them, the right one reached by a slope. */
export const LEVEL_2_ARENA: Arena = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  terrain: [
    box(-LANE_LENGTH - WALL_WIDTH, 0, -LANE_LENGTH, ARENA_HEIGHT), // the lane's far wall
    box(RIGHT_WALL, 0, ARENA_WIDTH, ARENA_HEIGHT), // right wall
    box(-LANE_LENGTH - WALL_WIDTH, LEDGE_Y, CLIFF_X, ARENA_HEIGHT), // lane and left ledge
    box(CLIFF_X, VALLEY_Y, SLOPE_LEFT, ARENA_HEIGHT), // valley floor
    [
      // slope
      { x: SLOPE_LEFT, y: VALLEY_Y },
      { x: SLOPE_RIGHT, y: LEDGE_Y },
      { x: SLOPE_RIGHT, y: ARENA_HEIGHT },
      { x: SLOPE_LEFT, y: ARENA_HEIGHT },
    ],
    box(SLOPE_RIGHT, LEDGE_Y, RIGHT_WALL, ARENA_HEIGHT), // right ledge
  ],
  spawnSide: 'left',
  spawn: { x: -LANE_LENGTH, y: LEDGE_Y },
  core: {
    minX: RIGHT_WALL - CORE_SIZE,
    minY: LEDGE_Y - CORE_SIZE,
    maxX: RIGHT_WALL,
    maxY: LEDGE_Y,
  },
};

const { grey, blue, green, black } = DEFAULT_INK_TABLE.tanks;

/**
 * The Campaign's Level 2: blue and green join grey and black, and Heavies
 * join the Crawlers and Runners in the last two Waves. Starting values, to
 * tune.
 */
export const LEVEL_2: Level = {
  name: 'Level 2',
  arena: LEVEL_2_ARENA,
  // Today's maximums; no red until Level 3.
  tanks: { grey, blue, green, black, red: 0 },
  waves: [
    { counts: { crawler: 5, runner: 0, heavy: 0 }, gap: 2 },
    { counts: { crawler: 4, runner: 2, heavy: 0 }, gap: 1.5 },
    { counts: { crawler: 5, runner: 2, heavy: 1 }, gap: 1.5 },
    { counts: { crawler: 4, runner: 2, heavy: 2 }, gap: 1.5 },
  ],
  hints: {
    blue: 'New: blue bounces whatever hits it, harder the faster it comes',
    green: 'New: green is glue; whatever moves on it slows right down',
    heavy: 'New: Heavies never climb, but they wear through what they cross',
  },
};
