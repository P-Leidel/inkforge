import type { Card } from '../game/cards';
import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';
import type { Polygon } from '../geometry/polygon';
import { ARENA_HEIGHT, ARENA_WIDTH, type Arena } from '../sandbox/arena';

/*
 * The Tutorial (ADR 0022): a Level that teaches the game, its Cards shown
 * before each Wave. One flat field from the Spawn to the Ink Core, with room
 * to wall the path and to hang Objects over it, and nothing else in the way.
 */

const GROUND_Y = 880;
const WALL_WIDTH = 40;
/** How far the lane runs beyond the Spawn edge, out of view. */
const LANE_LENGTH = 240;
const RIGHT_WALL = ARENA_WIDTH - WALL_WIDTH;
/** The Ink Core is a square block this wide (px). */
const CORE_SIZE = 96;

const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

const ARENA: Arena = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  terrain: [
    box(-LANE_LENGTH - WALL_WIDTH, 0, -LANE_LENGTH, ARENA_HEIGHT), // the lane's far wall
    box(RIGHT_WALL, 0, ARENA_WIDTH, ARENA_HEIGHT), // right wall
    box(-LANE_LENGTH - WALL_WIDTH, GROUND_Y, RIGHT_WALL, ARENA_HEIGHT), // ground and lane
  ],
  spawnSide: 'left',
  spawn: { x: -LANE_LENGTH, y: GROUND_Y },
  core: {
    minX: RIGHT_WALL - CORE_SIZE,
    minY: GROUND_Y - CORE_SIZE,
    maxX: RIGHT_WALL,
    maxY: GROUND_Y,
  },
};

/** Before Wave 1: the goal and the controls. */
const FIRST: readonly Card[] = [
  {
    title: 'Defend the Ink Core',
    body:
      'Enemies walk in from the Spawn arrows toward the Ink Core. Each one that ' +
      'reaches it costs it HP, and if the HP hits zero the Wave is lost. Survive every ' +
      'Wave to clear the Level. You build your defences by drawing, and ink is scarce.',
    swatches: [],
  },
  {
    title: 'Draw',
    body:
      'Pick a Colour with 1–5 and drag to draw. A stroke whose end does not come back ' +
      'to its start is a Line. A Line that touches the ground, or another Line that ' +
      'does, stays fixed exactly where you drew it until Enemies wear it down. One drawn ' +
      'in mid-air starts Frozen and falls when Released. Lines are your walls and ' +
      'ramps. Hold Ctrl for a straight one. Ctrl+Z undoes.',
    swatches: [],
  },
  {
    title: 'Close it into an Object',
    body:
      'Bring a stroke back to its start, until the marker shows, and it becomes an ' +
      'Object: a solid body with exactly the shape you drew. It must not cross itself, ' +
      'and may touch Terrain and other Objects but not overlap them. Every Object ' +
      'starts Frozen, hanging where you drew it.',
    swatches: [],
  },
  {
    title: 'Fill and Release',
    body:
      'Click inside an Object to fill it with the picked Colour: the Fill gives it its ' +
      'weight. Right-click a Frozen Object to Release it and let it fall. A hard hit ' +
      'frees it too.',
    swatches: [],
  },
];

/** Before Wave 2: killing, and what an Enemy spills. */
const SECOND: readonly Card[] = [
  {
    title: 'Crush them',
    body:
      'Walls only hold Enemies back, and they wear through them. To kill an Enemy, hit ' +
      'it hard: hang a filled Object above their path and Release it as they pass ' +
      'beneath. The heavier and faster it falls, the harder it hits. Long falls hurt ' +
      'Enemies too.',
    swatches: [],
  },
  {
    title: 'Full of ink',
    body:
      'Every Enemy is full of one Colour of ink, which you can see in its belly. When ' +
      'it dies in the Arena the ink spills out, just as a broken Object lets out its ' +
      'Fill: grey and black tumble out as pebbles and stones, blue and green splash, ' +
      'and red explodes. Pick which one to kill, and where.',
    swatches: [],
  },
];

/** Before Wave 3: grey vs black. */
const THIRD: readonly Card[] = [
  {
    title: 'Pebble or stone?',
    body:
      'Grey is pebble: cheap and plentiful. It makes flimsy walls and light rocks that ' +
      'burst into pebbles. Black is stone: scarce, it makes the strongest walls and ' +
      'heavy rocks that hit hard and burst into heavy stones. Build with grey; save ' +
      'black for what must hold or must hit.',
    swatches: [
      { colour: 'grey', label: 'grey: pebble' },
      { colour: 'black', label: 'black: stone' },
    ],
  },
];

const { grey, black } = DEFAULT_INK_TABLE.tanks;

/** The Tutorial: three small Waves of Crawlers, grey and black. Starting values, to tune with F2. */
export const TUTORIAL_LEVEL: Level = {
  name: 'Tutorial',
  arena: ARENA,
  tanks: { grey, blue: 0, green: 0, black, red: 0 },
  waves: [
    { sends: [{ type: 'crawler', count: 2 }], gap: 3 },
    { sends: [{ type: 'crawler', count: 3 }], gap: 3 },
    { sends: [{ type: 'crawler', count: 4 }], gap: 2.5 },
  ],
  cards: [FIRST, SECOND, THIRD],
};
