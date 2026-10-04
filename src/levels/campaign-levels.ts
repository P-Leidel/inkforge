import type { Level } from '../game/level';
import { LEVEL_1 } from './level-1';
import { LEVEL_2 } from './level-2';
import { LEVEL_3 } from './level-3';
import { LEVEL_4 } from './level-4';

/** The Campaign's Levels, in the order they are played. */
export const CAMPAIGN_LEVELS: readonly Level[] = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4];
