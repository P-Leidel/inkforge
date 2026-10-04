import type { Card } from '../game/cards';
import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';
import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import { ARENA_HEIGHT, ARENA_WIDTH, type Arena } from '../sandbox/arena';

/*
 * Level 4, the boss Level: its Arena, left to right, is a long lane in from
 * the Spawn, a long flat approach to build on, a crest with a short, steep
 * down-slope behind it, low ground, and a gentle ramp up to the low plateau
 * the Ink Core stands on against the right wall. Above the middle of the
 * approach hangs an overhang, a slab held from the top of the screen by a
 * pillar, to hang Frozen black Objects from.
 *
 * The Siege Walker never climbs and Terrain never breaks, so a step on its
 * path would stall it for good: the ground is one unbroken run of slopes,
 * none steeper than 30°. No Pit either: one wide enough for the Siege
 * Walker would swallow every Enemy that reached it.
 */

const WALL_WIDTH = 40;
/** How far the lane runs beyond the Spawn edge, out of view: a Siege Walker sent in stands wholly in it. */
export const LEVEL_4_LANE_LENGTH = 320;
const RIGHT_WALL = ARENA_WIDTH - WALL_WIDTH;

/** The approach's height, and the plateau's. */
const GROUND_Y = 820;
/**
 * The crest: how high it rises above the approach, up a slope of 1 in 4,
 * and where its top starts and ends. Its top is wide enough for the Siege
 * Walker to come level on before it goes over: one too short pitches it
 * over backwards on its own.
 */
const CREST = { rise: 60, left: 1180, right: 1300 } as const;
/** The low ground behind the crest, below the approach. */
const LOW_Y = 860;
/** The crest's down-slope: 30°, as steep as the Siege Walker can walk. */
const DOWN_RUN = Math.ceil((LOW_Y - (GROUND_Y - CREST.rise)) * Math.sqrt(3));
/**
 * Where the ramp to the plateau starts; it rises 1 in 3. The low ground
 * before it is wide enough that the Siege Walker comes off the down-slope
 * level before it starts up: one too short pitches it over onto its nose.
 */
const RAMP_LEFT = CREST.right + DOWN_RUN + 160;

/**
 * The ground's top, left to right, from the lane's far wall to the right
 * wall: each pair of points one slope or flat, so it has no step.
 */
export const LEVEL_4_GROUND: readonly Vec2[] = [
  { x: -LEVEL_4_LANE_LENGTH, y: GROUND_Y },
  { x: CREST.left - CREST.rise * 4, y: GROUND_Y }, // the approach
  { x: CREST.left, y: GROUND_Y - CREST.rise }, // up the crest
  { x: CREST.right, y: GROUND_Y - CREST.rise }, // its top
  { x: CREST.right + DOWN_RUN, y: LOW_Y }, // its down-slope
  { x: RAMP_LEFT, y: LOW_Y }, // the low ground
  { x: RAMP_LEFT + (LOW_Y - GROUND_Y) * 3, y: GROUND_Y }, // the ramp
  { x: RIGHT_WALL, y: GROUND_Y }, // the plateau
];

/** The overhang's slab: above the middle of the approach, high enough to drop things from. */
export const LEVEL_4_OVERHANG = { left: 420, right: 980, top: 360, bottom: 400 } as const;
/** The pillar holding the overhang from the top of the screen. */
const PILLAR = { left: 660, right: 740 } as const;

/** The Ink Core is a square block this wide (px). */
const CORE_SIZE = 96;

const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/** A slope's polygon from `a` to `b`, filled down to the bottom of the screen. */
const slope = (a: Vec2, b: Vec2): Polygon => [
  { x: a.x, y: a.y },
  { x: b.x, y: b.y },
  { x: b.x, y: ARENA_HEIGHT },
  { x: a.x, y: ARENA_HEIGHT },
];

const ARENA: Arena = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  terrain: [
    box(-LEVEL_4_LANE_LENGTH - WALL_WIDTH, 0, -LEVEL_4_LANE_LENGTH, ARENA_HEIGHT), // the lane's far wall
    box(RIGHT_WALL, 0, ARENA_WIDTH, ARENA_HEIGHT), // right wall
    ...LEVEL_4_GROUND.slice(1).map((point, i) => slope(LEVEL_4_GROUND[i]!, point)), // the ground
    box(PILLAR.left, 0, PILLAR.right, LEVEL_4_OVERHANG.top), // the overhang's pillar
    box(
      LEVEL_4_OVERHANG.left,
      LEVEL_4_OVERHANG.top,
      LEVEL_4_OVERHANG.right,
      LEVEL_4_OVERHANG.bottom,
    ), // the overhang
  ],
  spawnSide: 'left',
  spawn: { x: -LEVEL_4_LANE_LENGTH, y: GROUND_Y },
  core: {
    minX: RIGHT_WALL - CORE_SIZE,
    minY: GROUND_Y - CORE_SIZE,
    maxX: RIGHT_WALL,
    maxY: GROUND_Y,
  },
};

/** Before Wave 3: the boss. */
const SIEGE_WALKER_CARD: Card = {
  title: 'The Siege Walker',
  body:
    'Too heavy to wall off, too tough to wear down. ' +
    "It's top-heavy: trip it, drop things on it, blow it up. " +
    "Once it's down, it's helpless for a while.",
  swatches: [],
};

/**
 * The Campaign's Level 4, the boss Level: every Colour, at today's Tank
 * maximums, and three Waves, the Siege Walker in the last with Crawlers
 * close behind it to push it on and Heavies after to shove it or finish
 * the Ink Core. Nothing is built in advance. Starting values, to tune by
 * playing it.
 */
export const LEVEL_4: Level = {
  name: 'Level 4 · Siege Walker',
  arena: ARENA,
  tanks: DEFAULT_INK_TABLE.tanks,
  waves: [
    {
      sends: [
        { type: 'crawler', count: 2 },
        { type: 'runner', count: 1 },
        { type: 'crawler', count: 1 },
        { type: 'runner', count: 1 },
        { type: 'crawler', count: 1 },
      ],
      gap: 2.5,
    },
    {
      sends: [
        { type: 'crawler', count: 2 },
        { type: 'runner', count: 1 },
        { type: 'heavy', count: 1 },
        { type: 'crawler', count: 1 },
        { type: 'runner', count: 1 },
        { type: 'crawler', count: 1 },
        { type: 'heavy', count: 1 },
      ],
      gap: 2.5,
    },
    {
      sends: [
        { type: 'crawler', count: 3, gap: 2 },
        { type: 'siegeWalker', count: 1, gap: 3 },
        { type: 'crawler', count: 3, gap: 1.5 },
        { type: 'heavy', count: 2, gap: 3 },
      ],
      gap: 2,
    },
  ],
  cards: [[], [], [SIEGE_WALKER_CARD]],
  // The Siege Walker is the one thing new to the Campaign here.
  hints: {
    siegeWalker: 'New: the Siege Walker. Knock it over.',
  },
};
