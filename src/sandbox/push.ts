/**
 * The Push (ADR 0021): the Enemies lined up behind one that presses a Piece
 * or an Object, each pressing into the next, push it on, and it wears what
 * it presses faster. Pure: the Enemy rules say who presses into whom and
 * who pushes at all.
 */

/**
 * The Push behind `front`: every Enemy that presses into it, or into one of
 * those, and so on, each once however many chains reach it, and never
 * `front` itself. `behind` gives the Enemies pressing into one; one that
 * doesn't `push` (a Tipped Siege Walker) is no part of it, and neither is
 * what presses only into it: the chain stops there, as at a gap.
 */
export function pushBehind<W>(
  front: W,
  behind: (walker: W) => Iterable<W>,
  pushes: (walker: W) => boolean,
): W[] {
  const seen = new Set<W>([front]);
  const found: W[] = [];
  const queue = [front];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const pusher of behind(next)) {
      if (seen.has(pusher)) continue;
      seen.add(pusher);
      if (!pushes(pusher)) continue;
      found.push(pusher);
      queue.push(pusher);
    }
  }
  return found;
}

/**
 * The wear per second an Enemy deals what it presses: its `pressing` rate
 * times 1, plus `stackWear` for each other Enemy in its Stack, plus the
 * `push` of each Enemy in its Push.
 */
export function frontWear(
  pressing: number,
  stackWear: number,
  stack: number,
  push: readonly number[],
): number {
  return pressing * (1 + stackWear * stack + push.reduce((sum, each) => sum + each, 0));
}
