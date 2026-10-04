import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';
import type { Polygon } from '../geometry/polygon';
import { ARENA_HEIGHT, ARENA_WIDTH, type Arena } from '../sandbox/arena';

/*
 * Level 3's Arena, left to right: the lane in from the Spawn, a valley in
 * the middle, flat ground, a short ramp and the low plateau the Ink Core
 * stands on against the right wall. Above the valley hangs an overhang, a
 * slab held from the top of the screen by a pillar, to hang Objects from.
 *
 * The valley has a floor: it is no Pit. Its sides slope 1 in 2, as the
 * sandbox Arena's slope does, gentle enough for every Enemy type to walk
 * out of, Heavies included, which never climb a step.
 */

const WALL_WIDTH = 40;
/** How far the lane runs beyond the Spawn edge, out of view. */
const LANE_LENGTH = 240;
const RIGHT_WALL = ARENA_WIDTH - WALL_WIDTH;

/** The ground's height either side of the valley. */
export const LEVEL_3_GROUND_Y = 820;
/** Where the valley's sides start and end, and how deep its floor lies below the ground. */
export const LEVEL_3_VALLEY = { left: 600, right: 1240, depth: 100 } as const;
/** How wide each of the valley's sides is: they slope 1 in 2. */
const VALLEY_SIDE = LEVEL_3_VALLEY.depth * 2;
const VALLEY_FLOOR_Y = LEVEL_3_GROUND_Y + LEVEL_3_VALLEY.depth;

/** Where the ramp to the plateau starts, and how high the plateau stands above the ground. */
const RAMP_LEFT = 1520;
const PLATEAU_RISE = 60;
const PLATEAU_LEFT = RAMP_LEFT + PLATEAU_RISE * 2;
const PLATEAU_Y = LEVEL_3_GROUND_Y - PLATEAU_RISE;

/** The overhang's slab: above the valley, high enough to leave room to build under it. */
export const LEVEL_3_OVERHANG = { left: 560, right: 1280, top: 360, bottom: 400 } as const;
/** The pillar holding the overhang from the top of the screen. */
const PILLAR = { left: 880, right: 960 } as const;

/** The Ink Core is a square block this wide (px). */
const CORE_SIZE = 96;

const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/** A slope's polygon from (x1, y1) to (x2, y2), filled down to the bottom of the screen. */
const slope = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
  { x: x2, y: ARENA_HEIGHT },
  { x: x1, y: ARENA_HEIGHT },
];

const { left, right } = LEVEL_3_VALLEY;

const ARENA: Arena = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  terrain: [
    box(-LANE_LENGTH - WALL_WIDTH, 0, -LANE_LENGTH, ARENA_HEIGHT), // the lane's far wall
    box(RIGHT_WALL, 0, ARENA_WIDTH, ARENA_HEIGHT), // right wall
    box(-LANE_LENGTH - WALL_WIDTH, LEVEL_3_GROUND_Y, left, ARENA_HEIGHT), // lane and ground
    slope(left, LEVEL_3_GROUND_Y, left + VALLEY_SIDE, VALLEY_FLOOR_Y), // into the valley
    box(left + VALLEY_SIDE, VALLEY_FLOOR_Y, right - VALLEY_SIDE, ARENA_HEIGHT), // its floor
    slope(right - VALLEY_SIDE, VALLEY_FLOOR_Y, right, LEVEL_3_GROUND_Y), // out of it
    box(right, LEVEL_3_GROUND_Y, RAMP_LEFT, ARENA_HEIGHT), // ground
    slope(RAMP_LEFT, LEVEL_3_GROUND_Y, PLATEAU_LEFT, PLATEAU_Y), // ramp
    box(PLATEAU_LEFT, PLATEAU_Y, RIGHT_WALL, ARENA_HEIGHT), // plateau
    box(PILLAR.left, 0, PILLAR.right, LEVEL_3_OVERHANG.top), // the overhang's pillar
    box(
      LEVEL_3_OVERHANG.left,
      LEVEL_3_OVERHANG.top,
      LEVEL_3_OVERHANG.right,
      LEVEL_3_OVERHANG.bottom,
    ), // the overhang
  ],
  spawnSide: 'left',
  spawn: { x: -LANE_LENGTH, y: LEVEL_3_GROUND_Y },
  core: {
    minX: RIGHT_WALL - CORE_SIZE,
    minY: PLATEAU_Y - CORE_SIZE,
    maxX: RIGHT_WALL,
    maxY: PLATEAU_Y,
  },
};

/**
 * The Campaign's Level 3: every Colour, at today's Tank maximums, and five
 * Waves of 6, 8, 10, 10 and 12 Enemies, Crawlers, Runners and Heavies in
 * each. Nothing is built in advance.
 */
export const LEVEL_3: Level = {
  name: 'Level 3',
  arena: ARENA,
  tanks: DEFAULT_INK_TABLE.tanks,
  waves: [
    {
      sends: [
        { type: 'crawler', count: 3 },
        { type: 'runner', count: 2 },
        { type: 'heavy', count: 1 },
      ],
      gap: 2,
    },
    {
      sends: [
        { type: 'crawler', count: 4 },
        { type: 'runner', count: 2 },
        { type: 'heavy', count: 2 },
      ],
      gap: 1.75,
    },
    {
      sends: [
        { type: 'crawler', count: 5 },
        { type: 'runner', count: 3 },
        { type: 'heavy', count: 2 },
      ],
      gap: 1.5,
    },
    {
      sends: [
        { type: 'crawler', count: 4 },
        { type: 'runner', count: 3 },
        { type: 'heavy', count: 3 },
      ],
      gap: 1.5,
    },
    {
      sends: [
        { type: 'crawler', count: 5 },
        { type: 'runner', count: 4 },
        { type: 'heavy', count: 3 },
      ],
      gap: 1.25,
    },
  ],
  // Red is the one Colour new to the Campaign here, and no Enemy type is.
  hints: {
    red: 'New: red bursts when it breaks, blasting everything near it',
  },
};
