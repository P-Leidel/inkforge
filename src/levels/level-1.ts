import type { Polygon } from '../geometry/polygon';
import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';
import { ARENA_HEIGHT, ARENA_WIDTH, type Arena } from '../sandbox/arena';

/*
 * Level 1: grey and black against Crawlers, then Runners. Flat ground from
 * the Spawn, room for walls and for dropping things, then two terraces up to
 * the Ink Core. Every rise is a ramp of 1 in 2, as the sandbox slope, so
 * nothing in the Terrain traps an Enemy against it.
 */

const GROUND_Y = 880;
const WALL_WIDTH = 40;
/** How far the lane runs beyond the Spawn edge, out of view. */
const LANE_LENGTH = 240;
const RIGHT_WALL = ARENA_WIDTH - WALL_WIDTH;
/** How high each terrace stands above the one before (px); its ramp is twice as long. */
const RISE = 100;
/** Where the flat ground ends and the first ramp starts. */
const RAMP_1 = 900;
const TERRACE_1 = RAMP_1 + 2 * RISE;
const TERRACE_1_Y = GROUND_Y - RISE;
const RAMP_2 = 1380;
const TERRACE_2 = RAMP_2 + 2 * RISE;
const TERRACE_2_Y = TERRACE_1_Y - RISE;
/** The Ink Core is a square block this wide (px). */
const CORE_SIZE = 96;

const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/** A ramp rising from (`x1`, `y1`) to (`x2`, `y2`), solid down to the bottom of the screen. */
const ramp = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
  { x: x2, y: ARENA_HEIGHT },
  { x: x1, y: ARENA_HEIGHT },
];

const ARENA: Arena = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  terrain: [
    box(-LANE_LENGTH - WALL_WIDTH, 0, -LANE_LENGTH, ARENA_HEIGHT), // the lane's far wall
    box(RIGHT_WALL, 0, ARENA_WIDTH, ARENA_HEIGHT), // right wall
    box(-LANE_LENGTH - WALL_WIDTH, GROUND_Y, RAMP_1, ARENA_HEIGHT), // ground and lane
    ramp(RAMP_1, GROUND_Y, TERRACE_1, TERRACE_1_Y),
    box(TERRACE_1, TERRACE_1_Y, RAMP_2, ARENA_HEIGHT), // first terrace
    ramp(RAMP_2, TERRACE_1_Y, TERRACE_2, TERRACE_2_Y),
    box(TERRACE_2, TERRACE_2_Y, RIGHT_WALL, ARENA_HEIGHT), // second terrace
  ],
  spawnSide: 'left',
  spawn: { x: -LANE_LENGTH, y: GROUND_Y },
  core: {
    minX: RIGHT_WALL - CORE_SIZE,
    minY: TERRACE_2_Y - CORE_SIZE,
    maxX: RIGHT_WALL,
    maxY: TERRACE_2_Y,
  },
};

const { grey, black } = DEFAULT_INK_TABLE.tanks;

/** The Campaign's Level 1. Its Waves are starting values, to tune with F2. */
export const LEVEL_1: Level = {
  name: 'Level 1',
  arena: ARENA,
  tanks: { grey, blue: 0, green: 0, black, red: 0 },
  waves: [
    { counts: { crawler: 4, runner: 0, heavy: 0 }, gap: 2.5 },
    { counts: { crawler: 4, runner: 2, heavy: 0 }, gap: 2 },
    { counts: { crawler: 3, runner: 3, heavy: 0 }, gap: 1.5 },
  ],
  hints: {
    grey: 'New: grey is cheap. Draw walls and ramps, or drop rocks of it',
    black: 'New: black makes the strongest wall, but there is little of it',
    crawler: 'New: Crawlers walk slowly and climb over each other',
    runner: 'New: Runners are fast and hop over slower Enemies',
  },
};
