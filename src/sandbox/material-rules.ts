import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { Polygon } from '../geometry/polygon';
import type { BodyId, ContactHit, PhysicsWorld, ShapeId } from '../physics';
import type { HostSurface, Motion } from './arena-contents';
import {
  blastInk,
  blastSize,
  blastStrength,
  pieceBlastSize,
  type BlastSize,
  type Reach,
} from './blasts';
import { pairKey, type ContactLedger, type Party } from './contact-ledger';
import { packSpill, type Landing, type LooseDroplet } from './droplets';
import type { Walker } from './enemies';
import { Glue, type Gluer } from './glue';
import type { Thing, Why } from './happenings';
import type { Breakable, Numbers } from './numbers';
import type { PatchRecord } from './patches';
import type { Random } from './random';
import { launchRubble, packRubble, type LooseRubble } from './rubble';
import { Sticking, type Sticker } from './sticking';

/**
 * Material rules: everything Colour-specific that follows from things
 * touching, breaking and exploding, and the Enemies' walking. Headless and
 * part of the Sandbox world. Before each physics step the world calls
 * `walk`, and after it one call, `step`, and they run every consequence in
 * their own order: they read the contacts that count
 * from the Contact ledger (hits, new contacts, touching) and what the Blasts
 * reached, and decide damage from any cause and the blue counter, what
 * breaks, what a break lets out (Debris, Rubble, a Spill, a Blast), what a
 * Blast wakes and pushes, glue drag and wear, Patch wear, what sticks and
 * where a Droplet lands. For Enemies they decide whether one stands on
 * something it can walk on, before each step, and what follows from what
 * it touches and where it is after: pressing and floor wear, the damage
 * hits and Blasts deal to its HP, reaching the Ink Core, dying at 0 HP or
 * below the screen. What a
 * thing's numbers are they ask `Numbers`. They carry their decisions out
 * through two narrow ports the world wires up: the physics module, and the
 * Arena (its kinds and Debris). Glue drag (`Glue`) and sticking (`Sticking`)
 * are parts of them in files of their own; the world only talks to
 * `MaterialRules`.
 */

/** Damage an impact deals to a receiver: the impulse above its threshold, times k. */
export function impactDamage(impulse: number, threshold: number, damagePerImpulse: number): number {
  return impulse > threshold ? (impulse - threshold) * damagePerImpulse : 0;
}

/**
 * The wake measure: whether a push of `impulse` wakes a Frozen body of
 * `mass`, because the speed it would give it beats `wakeSpeed`. A Blast
 * wakes a Frozen Object by it.
 */
export function wakes(impulse: number, mass: number, wakeSpeed: number): boolean {
  return impulse / mass > wakeSpeed;
}

/**
 * The fuse rule: whether a destroyed Piece of `colour` sets off the next one
 * along its Line. Its Blast, measured a Piece's length (`pieceLength`) from
 * its centre, must still destroy a whole Piece of that Colour in one go. The
 * neighbour's nearest point is closer than that: a Piece is at most one and a
 * half times `pieceLength` long, so it is at most three quarters of that
 * away, which leaves room for bends.
 */
export function fuseBurns(colour: Colour, table: MaterialTable): boolean {
  const line = table.colours[colour].line;
  if (line.explodes <= 0) return false;
  const strength = blastStrength(pieceBlastSize(table), table.pieceLength);
  return impactDamage(strength, line.damageThreshold, table.damagePerImpulse) >= line.durability;
}

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
 * Whether a hit pushes an Enemy down onto what it stands on, given the unit
 * hit normal pointing from the hitter towards the Enemy: from above, within
 * `STEEPEST_FLOOR` of straight down. Standing, it can't give way, so it is
 * crushed: it takes the hit as a fixed body would.
 */
export function isCrushing(normal: Vec2): boolean {
  return isFloor({ x: -normal.x, y: -normal.y });
}

/** What damages a Breakable. */
type Cause =
  /** A hit: above the threshold, and it counts towards the impact limit. */
  | 'impact'
  /** A Blast's strength: above the threshold, but not an impact. */
  | 'blast'
  /** Wear by use, such as glue's: all of it, with no threshold, and not an impact. */
  | 'wear';

/** What Debris bursts from: an Outline or band in world coordinates, moving and coloured so. */
export interface Debris {
  readonly outline: Polygon;
  readonly velocity: Vec2;
  readonly colours: readonly Colour[];
}

/** A broken Object's Fill, which comes out in the same step. */
export interface ReleasedFill {
  readonly colour: Colour;
  readonly mass: number;
  /** Its Ink, px². */
  readonly ink: number;
  /** The Outline it fills, relative to the Object's origin. */
  readonly outline: Polygon;
  /** The Object's pose and motion as it broke. */
  readonly from: Motion;
}

/** A broken Object's Outline, which explodes if its Colour does. */
export interface BrokenOutline {
  readonly colour: Colour;
  /** Its Ink, px². */
  readonly ink: number;
  /** The Object's centre (its body's origin) as it broke. */
  readonly centre: Vec2;
}

/**
 * What breaking a thing lets out, one variant per thing: the Material rules
 * decide what follows. Each bursts into Debris.
 */
export type Broken =
  /** A Piece's burst: it explodes if its Line Colour does. */
  | {
      readonly kind: 'piece';
      readonly debris: Debris;
      readonly colour: Colour;
      /** Its centre, halfway along it. */
      readonly centre: Vec2;
    }
  /** An Object's Outline and Fill: the Fill comes out, then red explodes. */
  | {
      readonly kind: 'object';
      readonly debris: Debris;
      readonly outline: BrokenOutline;
      /** Its Fill; null for a hollow Object. */
      readonly fill: ReleasedFill | null;
    };

/** What the Material rules ask of the physics module. */
export type RulesPhysics = Pick<
  PhysicsWorld,
  | 'getSlide'
  | 'getMass'
  | 'getInertia'
  | 'getTransform'
  | 'getVelocity'
  | 'getAngularVelocity'
  | 'isFrozen'
  | 'isFree'
  | 'release'
  | 'applyImpulse'
  | 'applyAngularImpulse'
  | 'touchPoint'
>;

/** The contacts that count, as the Contact ledger gives them after each step. */
export type RulesContacts<T> = Pick<
  ContactLedger<T>,
  'hits' | 'newContacts' | 'touching' | 'normal'
>;

/**
 * What the Material rules' decisions do to the Arena contents, wired by the
 * Sandbox world to its kinds and its Debris. Each call carries out a
 * decision; none decides anything. `T` is what takes damage, `S` what
 * may stick and `W` what walks.
 */
export interface RulesArena<T, S, W> {
  /** Removes a broken Object or Piece and says what it lets out; null if it is already gone. */
  break(target: T): Broken | null;
  /** Bursts Debris, which is visual only. */
  burst(debris: Debris): void;
  /** Sets Rubble loose (the Rubble cap may remove the oldest). */
  addRubble(rubble: readonly LooseRubble[]): void;
  /** Sets a Spill's Droplets loose. */
  addDroplets(droplets: readonly LooseDroplet[]): void;
  /** Starts a Blast of `size` at `centre`. */
  addBlast(centre: Vec2, size: BlastSize): void;
  /** Bonds a sticking Object to `host` at `point`, in the world. */
  bond(sticker: S, host: Party<unknown>, point: Vec2): void;
  /** Whether a body is a Droplet in flight. */
  isDroplet(body: BodyId): boolean;
  /** Removes a Droplet that landed on `host`, and says where it was. */
  landDroplet(body: BodyId, host: Party<unknown>): Landing;
  /** A host's surface in its own coordinates, where a Patch can lie; null if it has none. */
  surfaceOf(host: Party<unknown>): HostSurface | null;
  /** Lays a Landing's Patch on its host (the Patch cap may remove the oldest). */
  layPatch(landing: Landing, surface: HostSurface): void;
  /** The Patch whose shape this is, if any. */
  patchOf(shape: ShapeId): PatchRecord | undefined;
  /** Records that a Patch used up `amount` more; it goes once it is used up. */
  usePatch(patch: PatchRecord, amount: number): void;
  /** Removes every used-up Patch. */
  removeUsedUpPatches(): void;
  /** The Objects that may stick, as the step's sticking reaches them. */
  stickers(): Iterable<S>;
  /** Every gluer now: the Pieces, then the Patches. */
  gluers(): Iterable<(T & Gluer) | PatchRecord>;
  /**
   * Spreads every Blast by `seconds`, handing `act` what each newly reached;
   * a Blast `act` starts spreads in the same call.
   */
  spreadBlasts(seconds: number, act: (reached: readonly Reach<T>[]) => void): void;
  /** Every Enemy, oldest first. */
  walkers(): Iterable<W>;
  /**
   * Pushes an Enemy through the next step of `seconds` toward its walking
   * speed: it walks. Returns its drive state: true if it pushes as hard as
   * it will without getting past.
   */
  walk(walker: W, seconds: number): boolean;
  /** Which way along x an Enemy walks: +1 or -1, toward the Ink Core's side of it. */
  heading(walker: W): number;
  /** The Enemy whose Party this is, if any. */
  walkerOf(party: Party<unknown>): W | undefined;
  /** Kills Enemy `id` at once: it pops and goes, releasing nothing physical. */
  kill(id: number): void;
  /** Whether a Party is the Ink Core. */
  isInkCore(party: Party<unknown>): boolean;
  /** Takes `damage` off the Ink Core's HP. */
  damageInkCore(damage: number): void;
  /** What lies wholly below the bottom of the screen, oldest first. */
  belowScreen(): readonly Thing[];
  /** What lies wholly out of view over the Spawn edge, oldest first. */
  beyondSpawnEdge(): readonly Thing[];
  /** Removes a thing at once, for `why`: it breaks, bursts and releases nothing. */
  remove(thing: Thing, why: Why): void;
}

export interface MaterialRulesOptions<T, S, W> {
  readonly materials: MaterialTable;
  /** What a thing's numbers are. */
  readonly numbers: Numbers;
  /** The simulation's generator: releasing a Fill draws from it. */
  readonly random: Random;
  readonly physics: RulesPhysics;
  readonly contacts: RulesContacts<T>;
  readonly arena: RulesArena<T, S, W>;
}

/** Whether a gluer is a Patch, which glues through its one shape, rather than a Piece. */
const isPatch = (gluer: Gluer): gluer is PatchRecord => gluer.shape !== undefined;

/**
 * The Material rules' entry point: the Sandbox world calls `step` once after
 * each physics step, and the rules run their phases in their own order.
 */
export class MaterialRules<T extends Breakable, S extends Sticker, W extends Walker> {
  private readonly materials: MaterialTable;
  private readonly numbers: Numbers;
  private readonly random: Random;
  private readonly physics: RulesPhysics;
  private readonly contacts: RulesContacts<T>;
  private readonly arena: RulesArena<T, S, W>;
  private readonly glueDrag: Glue;
  private readonly sticking: Sticking;
  /** The Enemies stalled in their walking this step, by id: they press an Object in their way. */
  private readonly stalled = new Set<number>();

  constructor({
    materials,
    numbers,
    random,
    physics,
    contacts,
    arena,
  }: MaterialRulesOptions<T, S, W>) {
    this.materials = materials;
    this.numbers = numbers;
    this.random = random;
    this.physics = physics;
    this.contacts = contacts;
    this.arena = arena;
    this.glueDrag = new Glue(materials, physics, contacts, (shape) => !!arena.patchOf(shape));
    this.sticking = new Sticking(materials, physics, contacts);
  }

  /**
   * Before each physics step of `seconds`: every Enemy standing on
   * something it can walk on walks, oldest first. One in the air, or only
   * on what is too steep, doesn't push. Each says whether it is stalled,
   * for pressing after the step.
   */
  walk(seconds: number): void {
    this.stalled.clear();
    for (const walker of this.arena.walkers()) {
      if (this.stands(walker) && this.arena.walk(walker, seconds)) this.stalled.add(walker.id);
    }
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
   * Runs every consequence of the physics step the Contact ledger just read,
   * in an order that must not change: exact replays depend on every engine
   * call and every draw from the generator coming in the same order.
   *
   * Pressing and floor wear are a breaking cause like hits: what they wore
   * out joins what the hits broke. What the hits broke breaks only after
   * sticking and landing: a green
   * Object sticks to its first new contact even if that breaks in this step
   * (it then falls free at once, as when its host breaks later), and a Patch
   * laid on something broken goes with it. Then glue drags and wears, which
   * breaks a worn-out Piece at once; the Blasts spread, and what they break
   * breaks as they do; and the used-up Patches go.
   *
   * Hits and Blasts take damage off an Enemy's HP as they come, but it
   * dies only in its own phase. Then come the Enemies' phases: Enemies
   * reaching the Ink Core, kills (0 HP, then below the screen), and
   * removing what went out over the Spawn edge, in that order. (Drops,
   * which draw from the generator, will come after kills.)
   */
  step(seconds: number): void {
    const broken = this.impacts();
    for (const target of this.press(seconds)) if (!broken.includes(target)) broken.push(target);
    this.stick(seconds);
    this.land(); // Droplets land by new contacts, then Patches wear by hits
    for (const target of broken) this.breakTarget(target);
    this.glue(seconds);
    this.arena.spreadBlasts(seconds, this.blastReached);
    this.arena.removeUsedUpPatches();
    this.reachInkCore();
    this.kill();
    this.removeBeyondSpawnEdge();
  }

  /**
   * Pressing and floor wear over a step of `seconds`, Enemy by Enemy, oldest
   * first: every Piece or Object an Enemy presses loses durability at its
   * type's pressing rate per second, and what it stands on at `floorWear`
   * times that. A Piece is pressed when it is in the Enemy's way
   * (`isPressed`); an Object only when the Enemy is also stalled, since one
   * it can shove is pushed, not pressed. Wear depends on the time in
   * contact alone, and never wakes a Frozen Object. The Terrain, Rubble, the
   * Ink Core and other Enemies take no damage, so they never wear. Returns
   * what wore out, not yet broken, in the order it did.
   */
  private press(seconds: number): T[] {
    const worn: T[] = [];
    const { floorWear } = this.numbers;
    for (const walker of this.arena.walkers()) {
      const rate = this.numbers.enemy(walker.type).pressing * seconds;
      const heading = this.arena.heading(walker);
      const stalled = this.stalled.has(walker.id);
      for (const { party, pairs } of this.contacts.touching(walker.body)) {
        const { target } = party;
        if (!target) continue;
        let pressed = false;
        let floor = false;
        for (const pair of pairs) {
          const normal = this.contacts.normal(walker.body, pair);
          if (!normal) continue;
          if (isFloor(normal)) floor = true;
          else if (isPressed(normal, heading)) pressed = true;
        }
        if (pressed && !this.numbers.of(target).fixed && !stalled) pressed = false;
        const amount = pressed ? rate : floor ? floorWear * rate : 0;
        if (amount > 0 && this.damage(target, amount, 'wear') && !worn.includes(target))
          worn.push(target);
      }
    }
    return worn;
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
   * below the bottom of the screen.
   */
  private kill(): void {
    const dead = [...this.arena.walkers()].filter((walker) => this.isDead(walker));
    for (const { id } of dead) this.arena.kill(id);
    for (const thing of this.arena.belowScreen()) {
      if (thing.thing === 'enemy') this.arena.kill(thing.id);
    }
  }

  /** Whether an Enemy's damage has reached its type's HP. */
  private isDead(walker: W): boolean {
    return walker.damage >= this.numbers.enemy(walker.type).hp;
  }

  /**
   * Takes damage off an Enemy's HP, by the one rule: an impact or a Blast
   * deals what it has above the Enemy type's damage threshold, times k.
   * Enemies have no impact limit.
   */
  private hurt(walker: W, amount: number): void {
    const { damageThreshold } = this.numbers.enemy(walker.type);
    walker.damage += impactDamage(amount, damageThreshold, this.materials.damagePerImpulse);
  }

  /**
   * Anything but an Enemy wholly out of view over the Spawn edge is
   * removed, as a Droplet that leaves the Arena is: it breaks, bursts,
   * releases and sets off nothing. An Enemy there walks in again.
   */
  private removeBeyondSpawnEdge(): void {
    for (const thing of this.arena.beyondSpawnEdge()) {
      if (thing.thing !== 'enemy') this.arena.remove(thing, 'left');
    }
  }

  /**
   * Damages by the step's hits: each Party takes the strongest hit of the
   * step from each Stroke it hit (several shapes of one body, or several
   * Pieces of one Line, hitting at once are one impact), against its own
   * threshold: a Breakable its durability, an Enemy its HP. Hits with a
   * harmless Party (a Droplet) deal no damage either way. An Enemy standing
   * on something that is hit from above (`isCrushing`) takes the hit as if
   * it were fixed, since it can't give way: a boulder dropped on it deals
   * all its weight. Returns what broke, in the order the hits first reached
   * it, not yet broken: `step` breaks it later.
   */
  private impacts(): T[] {
    const hits = this.contacts.hits;
    if (hits.length === 0) return [];
    // The strongest hit each target or Enemy takes from each Stroke, in the order they came.
    const impacts = new Map<number, { target: T | null; walker: W | null; impulse: number }>();
    const take = (receiver: Party<T>, other: Party<T>, hit: ContactHit, towards: Vec2) => {
      const { target } = receiver;
      const walker = target ? null : (this.arena.walkerOf(receiver) ?? null);
      if (!target && !walker) return;
      const impulse = walker ? this.enemyImpulse(walker, other, hit, towards) : hit.impulse;
      const key = pairKey(receiver.id, other.stroke);
      const current = impacts.get(key);
      if (current) current.impulse = Math.max(current.impulse, impulse);
      else impacts.set(key, { target, walker, impulse });
    };
    for (const { a, b, hit } of hits) {
      if (a.harmless || b.harmless) continue;
      // The hit's normal points from A towards B.
      take(a, b, hit, { x: -hit.normal.x, y: -hit.normal.y });
      take(b, a, hit, hit.normal);
    }

    const broken: T[] = [];
    for (const { target, walker, impulse } of impacts.values()) {
      if (walker) this.hurt(walker, impulse);
      else if (target && this.damage(target, impulse, 'impact') && !broken.includes(target))
        broken.push(target);
    }
    return broken;
  }

  /**
   * The impulse a hit deals an Enemy, given the unit normal pointing from
   * the hitter towards it: the hit's own, or, when it is crushed, what the
   * hitter's approach would deal a fixed body, the hitter's mass times its
   * approach speed.
   */
  private enemyImpulse(walker: W, other: Party<T>, hit: ContactHit, towards: Vec2): number {
    if (!isCrushing(towards) || !this.stands(walker) || !this.physics.isFree(other.body))
      return hit.impulse;
    return Math.max(hit.impulse, this.physics.getMass(other.body) * hit.speed);
  }

  /**
   * Moves sticking on by a step of `seconds` for each Object that may stick,
   * and bonds each one that sticks now to its host, where the two touched.
   */
  private stick(seconds: number): void {
    for (const { sticker, host, pair } of this.sticking.step(this.arena.stickers(), seconds)) {
      const point = this.physics.touchPoint(pair) ?? this.physics.getTransform(sticker.body);
      this.arena.bond(sticker, host, point);
    }
  }

  /**
   * Lands every Droplet with a new contact this step, at its first one with
   * a Party that isn't harmless, in the ledger's order: the Droplet goes and
   * lays a Patch of its length on what it landed on. Then wears each Patch a
   * hit names by the hit's impulse, times its Fill Colour's `patchHitWear`:
   * every bounce a blue Patch gives uses it up a little. A Droplet's hit
   * doesn't count.
   */
  private land(): void {
    const landings: Landing[] = [];
    for (const { a, b } of this.contacts.newContacts) {
      for (const [mine, host] of [
        [a, b],
        [b, a],
      ] as const) {
        if (host.harmless || !this.arena.isDroplet(mine.body)) continue;
        landings.push(this.arena.landDroplet(mine.body, host));
      }
    }
    for (const landing of landings) {
      const surface = this.arena.surfaceOf(landing.host);
      if (surface) this.arena.layPatch(landing, surface);
    }

    for (const { a, b, hit } of this.contacts.hits) {
      if (a.harmless || b.harmless) continue;
      this.wearPatchByHit(hit.shapeA, hit.impulse);
      this.wearPatchByHit(hit.shapeB, hit.impulse);
    }
  }

  private wearPatchByHit(shape: ShapeId, impulse: number): void {
    const patch = this.arena.patchOf(shape);
    if (!patch) return;
    this.arena.usePatch(patch, impulse * this.materials.colours[patch.colour].fill.patchHitWear);
  }

  /**
   * Drags every free body touching glue (green Pieces and Patches) and
   * wears the glue by the momentum it removed: a Piece by damage, which
   * breaks it once worn out, and a Patch by using it up, which removes it
   * at the end of the step.
   */
  private glue(seconds: number): void {
    for (const worn of this.glueDrag.apply(this.arena.gluers(), seconds, this.wearGluer)) {
      if (!isPatch(worn)) this.breakTarget(worn);
    }
  }

  /** Glue wears a Piece by damage, and says whether it is worn out; it uses up a Patch. */
  private readonly wearGluer = (gluer: (T & Gluer) | PatchRecord, amount: number): boolean => {
    if (!isPatch(gluer)) return this.damage(gluer, amount, 'wear');
    this.arena.usePatch(gluer, amount);
    return false;
  };

  /**
   * What a Blast does to each body its ring reached, at the strength it has
   * there. It damages a Piece or an Object that isn't sliding off a Line,
   * and an Enemy, when the strength beats its threshold. It wakes a Frozen
   * Object when its push wakes it (`wakes`). It pushes every moving body (an Object, Rubble
   * or a Droplet) outward from its centre by `push` times the strength, but
   * never faster than `maxPushSpeed`. What it broke then breaks, and red
   * explodes in turn.
   */
  private readonly blastReached = (reached: readonly Reach<T>[]): void => {
    const { blast, wakeSpeed } = this.materials;
    const broken: T[] = [];
    for (const { party, centre, point, strength } of reached) {
      const { body, target } = party;
      const walker = target ? undefined : this.arena.walkerOf(party);
      if (walker) this.hurt(walker, strength);
      if (target && this.physics.getSlide(body) === null) {
        if (this.damage(target, strength, 'blast')) {
          broken.push(target);
          continue;
        }
      }
      if (target && this.numbers.of(target).fixed) continue; // a Piece is only damaged
      const mass = this.physics.getMass(body);
      const impulse = Math.min(blast.push * strength, mass * blast.maxPushSpeed);
      if (this.physics.isFrozen(body) && wakes(impulse, mass, wakeSpeed))
        this.physics.release(body);
      if (!this.physics.isFree(body)) continue;
      this.physics.applyImpulse(body, this.outward(body, centre, point, impulse));
    }
    for (const target of broken) this.breakTarget(target);
  };

  /**
   * An impulse of `size` pointing from a Blast's centre to where it reached
   * a body: `point`, or the body's centre if the Blast started inside it, or
   * straight up if that is the Blast's centre too.
   */
  private outward(body: BodyId, centre: Vec2, point: Vec2, size: number): Vec2 {
    let away = sub(point, centre);
    if (Math.hypot(away.x, away.y) < 1e-6) away = sub(this.physics.getTransform(body), centre);
    const length = Math.hypot(away.x, away.y);
    if (length < 1e-6) return { x: 0, y: -size };
    return { x: (away.x * size) / length, y: (away.y * size) / length };
  }

  /**
   * Adds damage to a Breakable from any cause, and decides whether it is
   * broken: its damage has reached its durability, or its impacts its
   * impact limit. An impact or a Blast deals what it has above the
   * Breakable's threshold, times k, and only an impact counts towards the
   * impact limit. Wear deals all of it.
   */
  private damage(target: Breakable, amount: number, cause: Cause): boolean {
    if (cause === 'wear') {
      target.damage += amount;
    } else {
      const { damageThreshold } = this.numbers.of(target).toughness;
      if (amount > damageThreshold) {
        if (cause === 'impact') target.impacts++;
        target.damage += impactDamage(amount, damageThreshold, this.materials.damagePerImpulse);
      }
    }
    return this.numbers.wear(target) >= 1;
  }

  /**
   * Breaks an Object or a Piece: it goes, Debris bursts from it, a broken
   * Object's Fill comes out, and then red explodes, so its Blast acts on
   * what the Fill released.
   */
  private breakTarget(target: T): void {
    const broken = this.arena.break(target);
    if (!broken) return;
    this.arena.burst(broken.debris);
    switch (broken.kind) {
      case 'piece':
        return this.explodePiece(broken.colour, broken.centre);
      case 'object':
        if (broken.fill) this.releaseFill(broken.fill);
        return this.explode(broken.outline, broken.fill);
    }
  }

  /**
   * Lets out a broken Object's Fill, in the same step, from where the Object
   * was and moving as it moved, kicked outward from its centre: a Fill
   * Colour that `spills` (blue, green) throws out a Spill of Droplets, and
   * any other releases Rubble, none if its `rubbleMax` is 0 (red, whose
   * Blast starts in `explode`).
   */
  private releaseFill(released: ReleasedFill): void {
    if (this.materials.colours[released.colour].fill.spills > 0) this.releaseSpill(released);
    else this.releaseRubble(released);
  }

  /** Throws out a Spill, drawing from the generator: the count and spots, then the kick. */
  private releaseSpill({ colour, outline, ink, from }: ReleasedFill): void {
    const { centres, length } = packSpill(outline, ink, this.materials, this.random);
    const launched = launchRubble(
      centres.map((centre) => ({ centre })),
      from,
      this.materials.colours[colour].fill.kickSpeed,
      this.materials.kickSpread,
      this.random,
    );
    this.arena.addDroplets(
      launched.map(({ position, velocity, angularVelocity }) => ({
        colour,
        length,
        motion: { transform: { ...position, angle: 0 }, velocity, angularVelocity },
      })),
    );
  }

  /** Packs Rubble inside the Outline and kicks it out, drawing from the generator in that order. */
  private releaseRubble({ colour, mass, outline, ink, from }: ReleasedFill): void {
    const fill = this.materials.colours[colour].fill;
    const pieces = packRubble(outline, ink, colour, mass, this.materials, this.random);
    const launched = launchRubble(
      pieces,
      from,
      fill.kickSpeed,
      this.materials.kickSpread,
      this.random,
    );
    this.arena.addRubble(
      launched.map(({ position, velocity, angularVelocity }, k) => ({
        colour,
        radius: pieces[k]!.radius,
        mass: pieces[k]!.mass,
        motion: {
          transform: { ...position, angle: from.transform.angle },
          velocity,
          angularVelocity,
        },
      })),
    );
  }

  /**
   * Starts a Blast at a broken Object's centre if its Outline or Fill is
   * red: one Blast of all its red Ink.
   */
  private explode(outline: BrokenOutline, fill: ReleasedFill | null): void {
    const ink = blastInk(outline, fill, this.materials);
    if (ink > 0) this.arena.addBlast(outline.centre, blastSize(ink, this.materials));
  }

  /**
   * Starts a Blast of the fixed Piece size at a broken Piece's centre if its
   * Line Colour explodes (red), so the next red Piece goes too: a fuse.
   */
  private explodePiece(colour: Colour, centre: Vec2): void {
    if (this.materials.colours[colour].line.explodes > 0)
      this.arena.addBlast(centre, pieceBlastSize(this.materials));
  }
}
