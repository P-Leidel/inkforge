import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { EnemyType } from '../materials/enemy-table';
import type { MaterialTable } from '../materials/material-table';
import type { ContactHit } from '../physics';
import type { Party } from './contact-ledger';
import { drawDrop, type DropInk } from './drops';
import type { Walker } from './enemies';
import type { Thing, Why } from './happenings';
import type { Numbers } from './numbers';
import type { Random } from './random';
import { impactDamage, type RulesContacts, type RulesPhysics } from './material-rules';

/**
 * Enemy rules: an Enemy's life, from walking to its Drop. Headless and part
 * of the Sandbox world, behind the Material rules, which call them in their
 * one order: `walk` before each physics step, and after it `wear` (pressing
 * and floor wear, which the Material rules deal as damage), `hurt` for the
 * hits and Blasts an Enemy takes, and `afterStep` (reaching the Ink Core,
 * deaths, Drops). They decide whether an Enemy stands, climbs or is
 * stalled, its Stack, what it presses, and when it dies. What its numbers
 * are they ask `Numbers`; they carry their decisions out through their own
 * narrow port, `EnemyArena`, which the world wires to the Enemies kind,
 * the Arena query and the Ink Core.
 */

/**
 * A wall an Enemy presses leans over it as an overhang when the contact
 * normal points down more than this (its y): one it never climbs.
 */
const OVERHANG = 0.25;

/** The steepest surface (radians from level) an Enemy stands on: anything steeper it presses. */
export const STEEPEST_FLOOR = Math.PI / 4;

/**
 * Floor or not: whether an Enemy stands on a surface it touches, given the
 * unit contact normal pointing from the surface towards the Enemy. It does
 * on one no steeper than `STEEPEST_FLOOR`; anything steeper it presses.
 */
export function isFloor(normal: Vec2): boolean {
  return -normal.y >= Math.cos(STEEPEST_FLOOR) - 1e-9;
}

/**
 * Whether an Enemy walking along x toward `heading` (+1 or -1) presses a
 * surface it touches, given the unit contact normal pointing from the
 * surface towards the Enemy: one steeper than `STEEPEST_FLOOR` in its way,
 * facing it within 45° of head-on. A ceiling above it or a wall behind it
 * isn't in its way.
 */
export function isPressed(normal: Vec2, heading: number): boolean {
  return -heading * normal.x > Math.sin(STEEPEST_FLOOR) + 1e-9;
}

/**
 * Whether what an Enemy walking along x toward `heading` (+1 or -1)
 * touches is ahead of it, given the unit contact normal pointing from it
 * towards the Enemy: the normal leans back against its heading at all. A
 * wall it presses is ahead, and so is the top corner of an Enemy it is
 * climbing; a floor straight below it is not.
 */
export function isAhead(normal: Vec2, heading: number): boolean {
  return -heading * normal.x > 1e-9;
}

/**
 * Whether a hit pushes an Enemy down onto what it stands on, given the unit
 * hit normal pointing from the hitter towards the Enemy: from above, within
 * `STEEPEST_FLOOR` of straight down. Standing, it can't give way, so it is
 * crushed: it takes the hit as a fixed body would.
 */
export function isCrushing(normal: Vec2): boolean {
  return isFloor({ x: -normal.x, y: -normal.y });
}

/** An Enemy that died, and where its body was. */
export interface Killed {
  readonly id: number;
  readonly type: EnemyType;
  readonly at: Vec2;
}

/** Wear an Enemy deals what it presses or stands on in a step, for the Material rules to deal. */
export interface Wear<T> {
  readonly target: T;
  readonly amount: number;
}

/**
 * What the Enemy rules' decisions do to the Arena contents, wired by the
 * Sandbox world. Each call carries out a decision; none decides anything.
 * `W` is what walks.
 */
export interface EnemyArena<W> {
  /** Every Enemy, oldest first. */
  walkers(): Iterable<W>;
  /**
   * Pushes an Enemy through the next step of `seconds` toward its walking
   * speed: it walks. Returns its drive state: true if it pushes as hard as
   * it will without getting past.
   */
  walk(walker: W, seconds: number): boolean;
  /**
   * Pushes an Enemy up through the next step of `seconds`, never harder
   * than its type's climb: it climbs.
   */
  climb(walker: W, seconds: number): void;
  /** Which way along x an Enemy walks: +1 or -1, toward the Ink Core's side of it. */
  heading(walker: W): number;
  /**
   * Whether the Terrain, the Ink Core, an Object or a Line fills any of
   * `room`, a convex polygon in world coordinates: no room to climb into.
   */
  blocksClimb(room: Polygon): boolean;
  /** The Enemy whose Party this is, if any. */
  walkerOf(party: Party<unknown>): W | undefined;
  /**
   * Kills Enemy `id` at once: it pops and goes, releasing nothing physical.
   * Says what died and where; null if it is already gone.
   */
  kill(id: number): Killed | null;
  /** Lets out a dead Enemy's Drop: the Ink of every Colour, from where it died. */
  drop(killed: Killed, ink: DropInk): void;
  /** Whether a Party is the Ink Core. */
  isInkCore(party: Party<unknown>): boolean;
  /** Takes `damage` off the Ink Core's HP. */
  damageInkCore(damage: number): void;
  /** What lies wholly below the bottom of the screen, oldest first. */
  belowScreen(): readonly Thing[];
  /** Removes a thing at once, for `why`: it breaks, bursts and releases nothing. */
  remove(thing: Thing, why: Why): void;
}

export interface EnemyRulesOptions<W> {
  readonly materials: MaterialTable;
  /** What an Enemy's numbers are. */
  readonly numbers: Numbers;
  /** The simulation's generator: Drops draw from it. */
  readonly random: Random;
  readonly physics: Pick<RulesPhysics, 'getTransform' | 'getMass' | 'isFree'>;
  readonly contacts: Pick<RulesContacts<unknown>, 'touching' | 'normal'>;
  readonly arena: EnemyArena<W>;
}

/** The Enemy rules' entry points, which the Material rules call in their order. */
export class EnemyRules<W extends Walker> {
  private readonly materials: MaterialTable;
  private readonly numbers: Numbers;
  private readonly random: Random;
  private readonly physics: EnemyRulesOptions<W>['physics'];
  private readonly contacts: EnemyRulesOptions<W>['contacts'];
  private readonly arena: EnemyArena<W>;
  /** The Enemies stalled in their walking this step, by id: they press an Object in their way. */
  private readonly stalled = new Set<number>();

  constructor({ materials, numbers, random, physics, contacts, arena }: EnemyRulesOptions<W>) {
    this.materials = materials;
    this.numbers = numbers;
    this.random = random;
    this.physics = physics;
    this.contacts = contacts;
    this.arena = arena;
  }

  /**
   * Before each physics step of `seconds`: every Enemy standing on
   * something it can walk on walks, oldest first. One in the air, or only
   * on what is too steep, doesn't push. Each says whether it is stalled,
   * for pressing after the step. One that climbs (`climbs`) walks too,
   * standing or not, and climbs as well.
   */
  walk(seconds: number): void {
    this.stalled.clear();
    for (const walker of this.arena.walkers()) {
      const climbs = this.climbs(walker);
      if ((climbs || this.stands(walker)) && this.arena.walk(walker, seconds))
        this.stalled.add(walker.id);
      if (climbs) this.arena.climb(walker, seconds);
    }
  }

  /** The Enemy whose Party this is, if any. */
  walkerOf(party: Party<unknown>): W | undefined {
    return this.arena.walkerOf(party);
  }

  /**
   * Whether an Enemy climbs now: its type climbs, and a step low enough
   * touches it from ahead. Another Enemy is such a step when it touches it
   * from ahead (`isAhead`), its side or the corner of its top, and its step
   * is low enough: the top of that Enemy, or of the highest Enemy standing
   * on it, on another and so on, at most the climbing step (in its own
   * heights) above its feet. The Terrain, an Object or a Line is one when
   * the Enemy presses it as a wall (`isPressed`, not an overhang over it) and
   * its top ahead is as low: there is room for the Enemy's body just ahead,
   * standing the climbing step above its feet. Once it stands on top, the
   * contact is below it, not ahead, and it walks on.
   */
  private climbs(walker: W): boolean {
    if (this.numbers.enemy(walker.type).climb <= 0) return false;
    const heading = this.arena.heading(walker);
    const step = this.numbers.climbStep * walker.height;
    const feet = () => this.physics.getTransform(walker.body).y + walker.height / 2;
    for (const { party, pairs } of this.contacts.touching(walker.body)) {
      if (party.harmless) continue;
      const other = this.arena.walkerOf(party);
      if (other === walker) continue;
      const touches = (test: (normal: Vec2) => boolean) =>
        pairs.some((pair) => {
          const normal = this.contacts.normal(walker.body, pair);
          return normal !== null && test(normal);
        });
      if (other) {
        if (!touches((normal) => isAhead(normal, heading))) continue;
        if (feet() - this.stepTop(other, walker) <= step + 1e-9) return true;
      } else if (!this.arena.isInkCore(party)) {
        if (!touches((normal) => isPressed(normal, heading) && normal.y < OVERHANG)) continue;
        if (!this.arena.blocksClimb(this.roomOver(walker, feet() - step))) return true;
      }
    }
    return false;
  }

  /**
   * The room an Enemy needs to stand just ahead of it with its feet at
   * `top` (y): a box as wide and tall as its body, from its front onward.
   */
  private roomOver(walker: W, top: number): Polygon {
    const { x } = this.physics.getTransform(walker.body);
    const heading = this.arena.heading(walker);
    const near = x + (heading * walker.width) / 2;
    const far = near + heading * walker.width;
    const [minX, maxX] = [Math.min(near, far), Math.max(near, far)];
    const minY = top - walker.height;
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: top },
      { x: minX, y: top },
    ];
  }

  /**
   * The top (y) of the step an Enemy makes for `climber`: its own top, or
   * that of the highest Enemy standing on it, on another and so on.
   */
  private stepTop(step: W, climber: W): number {
    const top = (walker: W) => this.physics.getTransform(walker.body).y - walker.height / 2;
    let highest = top(step);
    for (const above of this.stackedOn(step, new Set([climber, step]))) {
      highest = Math.min(highest, top(above));
    }
    return highest;
  }

  /**
   * The Enemies standing on `base`, on one of those and so on, but not those
   * in `seen`, to which it adds them.
   */
  private stackedOn(base: W, seen: Set<W>): W[] {
    const found: W[] = [];
    const stack = [base];
    for (let below = stack.pop(); below; below = stack.pop()) {
      for (const above of this.standing(below, 'on')) {
        if (seen.has(above)) continue;
        seen.add(above);
        stack.push(above);
        found.push(above);
      }
    }
    return found;
  }

  /**
   * Every Enemy's Stack: how many other Enemies it stands on, or stand on
   * it, or on one of those and so on.
   */
  private stacks(): Map<W, number> {
    const sizes = new Map<W, number>();
    for (const walker of this.arena.walkers()) {
      if (sizes.has(walker)) continue;
      const stack = [walker];
      for (const member of stack) {
        for (const other of [...this.standing(member, 'on'), ...this.standing(member, 'under')])
          if (!stack.includes(other)) stack.push(other);
      }
      for (const member of stack) sizes.set(member, stack.length - 1);
    }
    return sizes;
  }

  /**
   * The Enemies standing now on `walker` (`on`), or that it stands on
   * (`under`): those touching it where the one above stands (`isFloor`).
   */
  private standing(walker: W, where: 'on' | 'under'): W[] {
    const found: W[] = [];
    for (const { party, pairs } of this.contacts.touching(walker.body)) {
      const other = this.arena.walkerOf(party);
      if (!other || other === walker) continue;
      const above = where === 'on' ? other : walker;
      const stands = pairs.some((pair) => {
        const normal = this.contacts.normal(above.body, pair);
        return normal !== null && isFloor(normal);
      });
      if (stands) found.push(other);
    }
    return found;
  }

  /** Whether an Enemy touches, now, a surface it stands on (`isFloor`). */
  private stands({ body }: W): boolean {
    for (const { pairs } of this.contacts.touching(body)) {
      for (const pair of pairs) {
        const normal = this.contacts.normal(body, pair);
        if (normal && isFloor(normal)) return true;
      }
    }
    return false;
  }

  /**
   * Pressing and floor wear over a step of `seconds`, Enemy by Enemy, oldest
   * first: every Piece or Object an Enemy presses loses durability at its
   * type's pressing rate per second, times 1 plus `stackWear` for each other
   * Enemy in its stack, and what it stands on at `floorWear` times its
   * pressing rate. A Piece is pressed when it is in the Enemy's way
   * (`isPressed`); an Object only when the Enemy is also stalled, since one
   * it can shove is pushed, not pressed. A stalled Enemy also presses
   * whatever touches it from ahead (`isAhead`) and isn't its floor, however
   * slight the touch: a corner catching its head holds it up as surely as a
   * wall, and must wear as one, or it would hold it forever. Wear depends on the time in
   * contact alone, and never wakes a Frozen Object. The Terrain, Rubble, the
   * Ink Core and other Enemies take no damage, so they never wear. Returns
   * the wear, in the order it is dealt; `fixed` says whether a target is a
   * Piece rather than an Object.
   */
  wear<T>(seconds: number, fixed: (target: T) => boolean): Wear<T>[] {
    const wear: Wear<T>[] = [];
    const { floorWear, stackWear } = this.numbers;
    const stacks = this.stacks();
    for (const walker of this.arena.walkers()) {
      const rate = this.numbers.enemy(walker.type).pressing * seconds;
      const stacked = 1 + stackWear * (stacks.get(walker) ?? 0);
      const heading = this.arena.heading(walker);
      const stalled = this.stalled.has(walker.id);
      for (const { party, pairs } of this.contacts.touching(walker.body)) {
        const target = party.target as T | null;
        if (!target) continue;
        let pressed = false;
        let floor = false;
        for (const pair of pairs) {
          const normal = this.contacts.normal(walker.body, pair);
          if (!normal) continue;
          if (isFloor(normal)) floor = true;
          else if (isPressed(normal, heading) || (stalled && isAhead(normal, heading)))
            pressed = true;
        }
        if (pressed && !fixed(target) && !stalled) pressed = false;
        const amount = pressed ? stacked * rate : floor ? floorWear * rate : 0;
        if (amount > 0) wear.push({ target, amount });
      }
    }
    return wear;
  }

  /**
   * The impulse a hit deals an Enemy, given the unit normal pointing from
   * the hitter towards it: the hit's own, or, when it is crushed, what the
   * hitter's approach would deal a fixed body, the hitter's mass times its
   * approach speed.
   */
  hitImpulse(walker: W, other: Party<unknown>, hit: ContactHit, towards: Vec2): number {
    if (!isCrushing(towards) || !this.stands(walker) || !this.physics.isFree(other.body))
      return hit.impulse;
    return Math.max(hit.impulse, this.physics.getMass(other.body) * hit.speed);
  }

  /**
   * Takes damage off an Enemy's HP, by the one rule: an impact or a Blast
   * deals what it has above the Enemy type's damage threshold, times k.
   * Enemies have no impact limit. It dies only in `afterStep`.
   */
  hurt(walker: W, amount: number): void {
    const { damageThreshold } = this.numbers.enemy(walker.type);
    walker.damage += impactDamage(amount, damageThreshold, this.materials.damagePerImpulse);
  }

  /**
   * The Enemies' phases at the end of a step, in an order that must not
   * change: Enemies reaching the Ink Core, kills (0 HP, then below the
   * screen), then Drops, which draw from the generator.
   */
  afterStep(): void {
    this.reachInkCore();
    this.drop(this.kill());
  }

  /**
   * Every Enemy touching the Ink Core deals it its type's core damage and
   * disappears, oldest first. One already at 0 HP dies instead.
   */
  private reachInkCore(): void {
    const reached = [...this.arena.walkers()].filter(
      (walker) =>
        !this.isDead(walker) &&
        [...this.contacts.touching(walker.body)].some(({ party }) => this.arena.isInkCore(party)),
    );
    for (const { id, type } of reached) {
      this.arena.damageInkCore(this.numbers.enemy(type).coreDamage);
      this.arena.remove({ thing: 'enemy', id }, 'reached');
    }
  }

  /**
   * Kills: every Enemy at 0 HP dies, oldest first, then every one wholly
   * below the bottom of the screen. Returns what died, in that order.
   */
  private kill(): Killed[] {
    const killed: Killed[] = [];
    const kill = (id: number) => {
      const dead = this.arena.kill(id);
      if (dead) killed.push(dead);
    };
    const dead = [...this.arena.walkers()].filter((walker) => this.isDead(walker));
    for (const { id } of dead) kill(id);
    for (const thing of this.arena.belowScreen()) {
      if (thing.thing === 'enemy') kill(thing.id);
    }
    return killed;
  }

  /**
   * Drops: every Enemy that died lets out a Drop, in the order they died, a
   * Pit's and a trap's as much as a fight's. Each draws its amounts from the
   * generator, one Colour after another, from its type's ranges as they are
   * now. An Enemy that reached the Ink Core didn't die, and drops nothing.
   */
  private drop(killed: readonly Killed[]): void {
    for (const dead of killed) {
      this.arena.drop(dead, drawDrop(this.numbers.enemy(dead.type).drop, this.random));
    }
  }

  /** Whether an Enemy's damage has reached its type's HP. */
  private isDead(walker: W): boolean {
    return walker.damage >= this.numbers.enemy(walker.type).hp;
  }
}
