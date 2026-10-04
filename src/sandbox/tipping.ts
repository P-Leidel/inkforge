import type { GettingUp } from './numbers';

/**
 * Tipped, and getting back up (ADR 0023): pure rules for an Enemy whose
 * shape can tip, the Siege Walker. Tilted past its tip angle it is Tipped:
 * it lies helpless, doesn't walk and presses nothing. After a delay it tries
 * to get up, by a torque toward upright the short way round, capped. A try
 * that doesn't get it up ends, and after the delay again the next one's cap
 * is higher, so weight on it delays it but it always gets up in the end.
 */

/** How far a Tipped Enemy is from getting back up. */
export interface Tipped {
  /** How many tries so far have failed. */
  readonly tries: number;
  /** Whether it is trying now; otherwise it lies, waiting. */
  readonly trying: boolean;
  /** How long (s) it has lain since it tipped or its last try failed, or tried since it began. */
  readonly elapsed: number;
}

/**
 * It is up again, no longer Tipped, once it tilts less than this share of
 * its tip angle: past its tip angle it is top-heavy enough to fall back.
 */
export const UP_AGAIN = 0.5;
/** How long (s) a try lasts before it has failed. */
export const TRY_SECONDS = 3;
/** The fastest (rad/s) a try turns it toward upright. */
const RIGHTING_SPIN = 1.5;
/** How fast (rad/s per radian left) a try turns it, slowing as it comes upright. */
const RIGHTING_GAIN = 3;

/** `angle` (radians) brought into -π to π. */
export function wrappedAngle(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

/**
 * Whether it is Tipped, and how far along, after a step of `seconds` that
 * starts with it posed at `angle` (radians): `tipped` is how it was, null
 * if it wasn't. Tilted past `tipAngle` either way, it tips; Tipped, it lies
 * `delay` seconds, then tries for `TRY_SECONDS`, then lies again with one
 * more failed try, until it tilts less than `UP_AGAIN` of its tip angle.
 */
export function tippedAfter(
  tipped: Tipped | null,
  angle: number,
  seconds: number,
  tipAngle: number,
  { delay }: Pick<GettingUp, 'delay'>,
): Tipped | null {
  const tilt = Math.abs(wrappedAngle(angle));
  if (!tipped) return tilt >= tipAngle ? { tries: 0, trying: false, elapsed: 0 } : null;
  if (tilt < UP_AGAIN * tipAngle) return null;
  const elapsed = tipped.elapsed + seconds;
  if (!tipped.trying)
    return elapsed >= delay ? { ...tipped, trying: true, elapsed: 0 } : { ...tipped, elapsed };
  return elapsed >= TRY_SECONDS
    ? { tries: tipped.tries + 1, trying: false, elapsed: 0 }
    : { ...tipped, elapsed };
}

/**
 * The cap on a try's torque, in its own weights times its height, after
 * `tries` failed tries: the first try's, raised by `growth` of it each time.
 */
export function rightingCap({ torque, growth }: Omit<GettingUp, 'delay'>, tries: number): number {
  return torque * (1 + growth) ** tries;
}

/**
 * The torque (mass × px²/s²) of a try through a step of `seconds`: toward
 * upright, the short way round, from `angle` (radians) and `spin` (rad/s),
 * for a body of `inertia` (mass × px²), never more than `most` either way.
 * Far from upright it turns it as fast as `RIGHTING_SPIN`, slowing as it
 * comes up, so it doesn't swing over onto its other side.
 */
export function rightingTorque(
  angle: number,
  spin: number,
  inertia: number,
  most: number,
  seconds: number,
): number {
  const left = wrappedAngle(angle);
  const wanted = -Math.sign(left) * Math.min(RIGHTING_SPIN, RIGHTING_GAIN * Math.abs(left));
  const torque = (inertia * (wanted - spin)) / seconds;
  return Math.max(-most, Math.min(most, torque));
}
