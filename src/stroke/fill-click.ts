import { pathLength, type Vec2 } from '../geometry/vec2';
import { MIN_LINE_LENGTH } from './stroke-rules';

/**
 * Whether a press and release is a click, which fills the Object under it,
 * rather than a Stroke: the pointer moved less than the shortest Line in
 * total, so a short drag inside an Object still draws.
 */
export function isFillClick(samples: readonly Vec2[]): boolean {
  return pathLength(samples) < MIN_LINE_LENGTH;
}
