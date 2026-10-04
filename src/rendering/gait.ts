import { transformPoints } from '../geometry/transform';
import type { Polygon } from '../geometry/polygon';

/**
 * The Siege Walker's gait, drawn only: its colliders stay in the standing
 * pose. Its legs swing in pairs, the first and third against the second and
 * fourth, at a rate tied to its speed over the ground; they come to stand
 * still when it stalls, and flail while it is Tipped. Nothing here is a rule
 * of the game: it reads the Enemy's view, and only says how to draw it.
 */

/** How a walker's legs are swinging. */
export interface Gait {
  /** Where in its stride it is, radians: a stride is 2π. */
  readonly phase: number;
  /** How far its legs swing, from 0 (standing) to 1 (in full stride). */
  readonly swing: number;
}

/** What the gait reads of a walker each frame. */
export interface Going {
  /** Its speed over the ground (px/s): its velocity along x. */
  readonly speed: number;
  /** Whether it is Tipped. */
  readonly tipped: boolean;
}

/** A walker that has just come in: standing, at the start of a stride. */
export const STANDING: Gait = { phase: 0, swing: 0 };

/** How far (px) it goes over the ground in one stride: both pairs of legs swing once. */
export const STRIDE = 70;
/** Slower than this (px/s) over the ground it has stalled: its legs come to stand still. */
export const STALL_SPEED = 4;
/** How fast (per s) its legs come into full stride, or to standing, from either. */
const SWING_EASE = 4;
/** How fast (rad/s) its legs flail while it is Tipped. */
const FLAIL_RATE = 9;
/** How far (radians) a leg swings either way in full stride. */
const STRIDE_ANGLE = 0.32;
/** How far (radians) a leg flails either way while it is Tipped. */
const FLAIL_ANGLE = 0.6;
/** How far apart (radians) in their flailing one leg is from the next, so they flail out of step. */
const FLAIL_SPREAD = 2.1;

/**
 * How a walker's legs swing `seconds` after they swung as `gait`, going as
 * `going`. Walking, its stride moves on by how far it went; stalled, it
 * stays where it is in its stride while its legs come to standing; Tipped,
 * they flail at their own rate.
 */
export function gaitAfter(gait: Gait, { speed, tipped }: Going, seconds: number): Gait {
  const walking = !tipped && Math.abs(speed) >= STALL_SPEED;
  const turn = tipped
    ? FLAIL_RATE * seconds
    : walking
      ? (2 * Math.PI * Math.abs(speed) * seconds) / STRIDE
      : 0;
  const wanted = walking || tipped ? 1 : 0;
  const ease = Math.min(1, SWING_EASE * seconds);
  return {
    phase: (gait.phase + turn) % (2 * Math.PI),
    swing: gait.swing + (wanted - gait.swing) * ease,
  };
}

/**
 * How far (radians, clockwise) each of `legs` legs is swung from standing.
 * Walking, the legs swing in two pairs, each against the other: the first
 * and third, and the second and fourth. Tipped, each flails out of step.
 */
export function legAngles(gait: Gait, tipped: boolean, legs: number): number[] {
  return Array.from({ length: legs }, (_, k) =>
    tipped
      ? FLAIL_ANGLE * gait.swing * Math.sin(gait.phase + k * FLAIL_SPREAD)
      : STRIDE_ANGLE * gait.swing * Math.sin(gait.phase + (k % 2) * Math.PI),
  );
}

/** `leg`, standing, swung by `angle` (radians, clockwise) about the middle of its top edge. */
export function swungLeg(leg: Polygon, angle: number): Polygon {
  const [a, b] = [leg[0]!, leg[1]!];
  const hip = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const about = leg.map(({ x, y }) => ({ x: x - hip.x, y: y - hip.y }));
  return transformPoints(about, { x: hip.x, y: hip.y, angle });
}
