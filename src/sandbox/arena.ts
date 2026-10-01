import type { Bounds, Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';

/** Logical Arena size in pixels. The canvas is scaled to fit the window. */
export const ARENA_WIDTH = 1920;
export const ARENA_HEIGHT = 1080;

/** Which edge of the screen an Arena's Spawn is beyond. */
export type SpawnSide = 'left' | 'right';

/**
 * One fixed, non-scrolling screen with its Terrain, the Spawn and the Ink
 * Core. The screen's edge on the Spawn's side is the Spawn edge: beyond it,
 * out of view, Terrain carries on as the lane Enemies walk in along.
 */
export interface Arena {
  readonly width: number;
  readonly height: number;
  /** Terrain as convex polygons in Arena pixels, the lane beyond the Spawn edge included. */
  readonly terrain: readonly Polygon[];
  /** Which edge the Spawn is beyond: the Spawn edge. */
  readonly spawnSide: SpawnSide;
  /**
   * The Spawn: where the lane's floor meets the Terrain wall at its far end,
   * out of view. A new Enemy stands there, its back to the wall.
   */
  readonly spawn: Vec2;
  /** Where the Ink Core stands: a block of the Arena, px. */
  readonly core: Bounds;
}

const GROUND_Y = 880;
const WALL_WIDTH = 40;
/** How far the lane runs beyond the Spawn edge, out of view. */
const LANE_LENGTH = 240;
const SLOPE_LEFT = 1400;
/** Where the slope meets the plateau. The slope rises 1 in 2, as in milestone 1. */
const PLATEAU_LEFT = 1740;
const PLATEAU_Y = GROUND_Y - (PLATEAU_LEFT - SLOPE_LEFT) / 2;
const RIGHT_WALL = ARENA_WIDTH - WALL_WIDTH;
/** The Ink Core is a square block this wide (px). */
const CORE_SIZE = 96;

const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/** The ground, from the lane's far wall to where the slope starts. */
const GROUND = box(-LANE_LENGTH - WALL_WIDTH, GROUND_Y, SLOPE_LEFT, ARENA_HEIGHT);

/** The sandbox Arena's Terrain, with its ground as given. */
const sandboxTerrain = (ground: readonly Polygon[]): Polygon[] => [
  box(-LANE_LENGTH - WALL_WIDTH, 0, -LANE_LENGTH, ARENA_HEIGHT), // the lane's far wall
  box(RIGHT_WALL, 0, ARENA_WIDTH, ARENA_HEIGHT), // right wall
  ...ground, // ground and lane
  [
    // slope
    { x: SLOPE_LEFT, y: GROUND_Y },
    { x: PLATEAU_LEFT, y: PLATEAU_Y },
    { x: PLATEAU_LEFT, y: ARENA_HEIGHT },
    { x: SLOPE_LEFT, y: ARENA_HEIGHT },
  ],
  box(PLATEAU_LEFT, PLATEAU_Y, RIGHT_WALL, ARENA_HEIGHT), // plateau
];

/**
 * The sandbox Arena's Terrain with a Pit in its ground from `left` to
 * `right` (px): a gap open to the bottom of the screen.
 */
export function sandboxTerrainWithPit(left: number, right: number): Polygon[] {
  if (!(0 < left && left < right && right < SLOPE_LEFT))
    throw new Error(`a Pit from ${left} to ${right} is not in the flat ground`);
  return sandboxTerrain([
    box(-LANE_LENGTH - WALL_WIDTH, GROUND_Y, left, ARENA_HEIGHT),
    box(right, GROUND_Y, SLOPE_LEFT, ARENA_HEIGHT),
  ]);
}

/**
 * The sandbox Arena: flat ground from the Spawn, beyond the left edge, to a
 * slope rising to a plateau, where the Ink Core stands against the right
 * wall. The ground carries on out of view as the lane, closed at its far end
 * by a wall.
 */
export const SANDBOX_ARENA: Arena = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  terrain: sandboxTerrain([GROUND]),
  spawnSide: 'left',
  spawn: { x: -LANE_LENGTH, y: GROUND_Y },
  core: {
    minX: RIGHT_WALL - CORE_SIZE,
    minY: PLATEAU_Y - CORE_SIZE,
    maxX: RIGHT_WALL,
    maxY: PLATEAU_Y,
  },
};

/** Where on the x axis an Arena's Spawn edge is: 0 or its width. */
export const spawnEdgeX = ({ spawnSide, width }: Pick<Arena, 'spawnSide' | 'width'>): number =>
  spawnSide === 'left' ? 0 : width;

/** Which way along x is in from the Spawn edge: +1 from the left, -1 from the right. */
export const inward = ({ spawnSide }: Pick<Arena, 'spawnSide'>): number =>
  spawnSide === 'left' ? 1 : -1;
