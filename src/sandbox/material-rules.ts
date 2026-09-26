import { polygonArea } from '../geometry/polygon';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld, ShapeId } from '../physics';
import type { HostSurface } from './arena-contents';
import { blastInk, type Reach } from './blasts';
import { pairKey, type ContactLedger, type Party } from './contact-ledger';
import { packSpill, type Landing, type LooseDroplet } from './droplets';
import { Glue, type Gluer } from './glue';
import type { PatchRecord } from './patches';
import type { Random } from './random';
import { launchRubble, packRubble, type LooseRubble } from './rubble';
import { Sticking, type Sticker } from './sticking';
import type { Broken, BrokenOutline, ReleasedFill } from './strokes';

/**
 * Material rules: everything Colour-specific that follows from things
 * touching, breaking and exploding. Headless and part of the Sandbox world.
 * Each step they read the contacts that count from the Contact ledger (hits,
 * new contacts, touching) and what the Blasts reached, and decide every
 * consequence: damage from any cause and the blue counter, what breaks, what
 * a break lets out (Debris, Rubble, a Spill, a Blast), what a Blast wakes and
 * pushes, glue drag and wear, Patch wear, what sticks and where a Droplet
 * lands. They carry their decisions out through two narrow ports the world
 * wires up: the physics module, and the Arena (its kinds and Debris). Glue
 * drag (`Glue`) and sticking (`Sticking`) are parts of them in files of
 * their own; the world only talks to `MaterialRules`.
 */

/**
 * Something that takes damage and breaks: an Object, by its Outline's
 * numbers, or a Piece of a Line, by its Line's.
 */
export interface Breakable {
  readonly colour: Colour;
  /** Which of its Colour's roles it takes its numbers from: a Piece's is `'line'`. */
  readonly role: 'line' | 'outline';
  /** Damage taken so far. */
  damage: number;
  /** Hits above its damage threshold so far (the blue counter). */
  impacts: number;
}

/** Damage an impact deals to a receiver: the impulse above its threshold, times k. */
export function impactDamage(impulse: number, threshold: number, damagePerImpulse: number): number {
  return impulse > threshold ? (impulse - threshold) * damagePerImpulse : 0;
}

/** A Breakable's numbers: its Colour's as a Line or as an Outline. Pieces have no impact limit. */
function numbersOf(target: Breakable, table: MaterialTable) {
  const material = table.colours[target.colour];
  return target.role === 'line' ? { ...material.line, impactLimit: 0 } : material.outline;
}

/** How worn a Breakable is, from 0 (whole) to 1 (broken): damage or impacts, whichever is further. */
export function wear(target: Breakable, table: MaterialTable): number {
  const { durability, impactLimit } = numbersOf(target, table);
  const byDamage = durability > 0 ? target.damage / durability : 1;
  const byImpacts = impactLimit > 0 ? target.impacts / impactLimit : 0;
  return Math.min(1, Math.max(byDamage, byImpacts));
}

/** Durability left before it breaks. */
export function durabilityLeft(target: Breakable, table: MaterialTable): number {
  return Math.max(0, numbersOf(target, table).durability - target.damage);
}

/**
 * The wake measure: whether a push of `impulse` wakes a Frozen body of
 * `mass`, because the speed it would give it beats `wakeSpeed`. A Blast
 * wakes a Frozen Object by it.
 */
export function wakes(impulse: number, mass: number, wakeSpeed: number): boolean {
  return impulse / mass > wakeSpeed;
}

/** What damages a Breakable. */
type Cause =
  /** A hit: above the threshold, and it counts towards the impact limit. */
  | 'impact'
  /** A Blast's strength: above the threshold, but not an impact. */
  | 'blast'
  /** Wear by use, such as glue's: all of it, with no threshold, and not an impact. */
  | 'wear';

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
export type RulesContacts<T> = Pick<ContactLedger<T>, 'hits' | 'newContacts' | 'touching'>;

/**
 * What the Material rules' decisions do to the Arena contents, wired by the
 * Sandbox world to its kinds and its Debris. Each call carries out a
 * decision; none decides anything. `T` is what takes damage and `S` what
 * may stick.
 */
export interface RulesArena<T, S> {
  /** Removes a broken Object or Piece and says what it lets out; null if it is already gone. */
  break(target: T): Broken | null;
  /** Bursts Debris, which is visual only. */
  burst(debris: Broken['debris']): void;
  /** Sets Rubble loose (the Rubble cap may remove the oldest). */
  addRubble(rubble: readonly LooseRubble[]): void;
  /** Sets a Spill's Droplets loose. */
  addDroplets(droplets: readonly LooseDroplet[]): void;
  /** Starts a Blast of `ink` px² of red ink at `centre`. */
  addBlast(centre: Vec2, ink: number): void;
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
}

export interface MaterialRulesOptions<T, S> {
  readonly materials: MaterialTable;
  /** The simulation's generator: releasing a Fill draws from it. */
  readonly random: Random;
  readonly physics: RulesPhysics;
  readonly contacts: RulesContacts<T>;
  readonly arena: RulesArena<T, S>;
}

/** Whether a gluer is a Patch, which glues through its one shape, rather than a Piece. */
const isPatch = (gluer: Gluer): gluer is PatchRecord => gluer.shape !== undefined;

/**
 * The Material rules' entry point. The Sandbox world calls one phase at a
 * time, in its step order: `impacts`, `stick`, `land`, `breakAll`, `glue`,
 * and `blastReached` as the Blasts spread.
 */
export class MaterialRules<T extends Breakable, S extends Sticker> {
  private readonly materials: MaterialTable;
  private readonly random: Random;
  private readonly physics: RulesPhysics;
  private readonly contacts: RulesContacts<T>;
  private readonly arena: RulesArena<T, S>;
  private readonly glueDrag: Glue;
  private readonly sticking: Sticking;

  constructor({ materials, random, physics, contacts, arena }: MaterialRulesOptions<T, S>) {
    this.materials = materials;
    this.random = random;
    this.physics = physics;
    this.contacts = contacts;
    this.arena = arena;
    this.glueDrag = new Glue(materials, physics, contacts, (shape) => !!arena.patchOf(shape));
    this.sticking = new Sticking(materials, physics, contacts);
  }

  /**
   * Damages by the step's hits: each Party takes the strongest hit of the
   * step from each Stroke it hit (several shapes of one body, or several
   * Pieces of one Line, hitting at once are one impact), against its own
   * threshold. Hits with a harmless Party (a Droplet) deal no damage either
   * way. Returns what broke, in the order the hits first reached it, not yet
   * broken: `breakAll` breaks it later in the step.
   */
  impacts(): T[] {
    const hits = this.contacts.hits;
    if (hits.length === 0) return [];
    // The strongest hit each target takes from each Stroke, in the order they came.
    const impacts = new Map<number, { target: T; impulse: number }>();
    const take = (receiver: Party<T>, other: Party<T>, impulse: number) => {
      if (!receiver.target) return;
      const key = pairKey(receiver.id, other.stroke);
      const current = impacts.get(key);
      if (!current) impacts.set(key, { target: receiver.target, impulse });
      else if (current.impulse < impulse) current.impulse = impulse;
    };
    for (const { a, b, hit } of hits) {
      if (a.harmless || b.harmless) continue;
      take(a, b, hit.impulse);
      take(b, a, hit.impulse);
    }

    const broken: T[] = [];
    for (const { target, impulse } of impacts.values()) {
      if (this.damage(target, impulse, 'impact') && !broken.includes(target)) broken.push(target);
    }
    return broken;
  }

  /**
   * Moves sticking on by a step of `seconds` for each of `objects`, and
   * bonds each Object that sticks now to its host, where the two touched.
   */
  stick(objects: Iterable<S>, seconds: number): void {
    for (const { sticker, host, pair } of this.sticking.step(objects, seconds)) {
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
  land(): void {
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

  /** Breaks what `impacts` returned, in order. */
  breakAll(targets: readonly T[]): void {
    for (const target of targets) this.breakTarget(target);
  }

  /**
   * Drags every free body touching glue (green Pieces and Patches) and
   * wears the glue by the momentum it removed: a Piece by damage, which
   * breaks it once worn out, and a Patch by using it up, which removes it
   * at the end of the step.
   */
  glue(gluers: Iterable<(T & Gluer) | PatchRecord>, seconds: number): void {
    for (const worn of this.glueDrag.apply(gluers, seconds, this.wearGluer)) {
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
   * when the strength beats its threshold. It wakes a Frozen Object when its
   * push wakes it (`wakes`). It pushes every moving body (an Object, Rubble
   * or a Droplet) outward from its centre by `push` times the strength, but
   * never faster than `maxPushSpeed`. What it broke then breaks, and red
   * explodes in turn.
   */
  readonly blastReached = (reached: readonly Reach<T>[]): void => {
    const { blast, wakeSpeed } = this.materials;
    const broken: T[] = [];
    for (const { party, centre, point, strength } of reached) {
      const { body, target } = party;
      if (target && this.physics.getSlide(body) === null) {
        if (this.damage(target, strength, 'blast')) {
          broken.push(target);
          continue;
        }
      }
      if (target?.role === 'line') continue; // a Piece is fixed, so only damaged
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
      const { damageThreshold } = numbersOf(target, this.materials);
      if (amount > damageThreshold) {
        if (cause === 'impact') target.impacts++;
        target.damage += impactDamage(amount, damageThreshold, this.materials.damagePerImpulse);
      }
    }
    return wear(target, this.materials) >= 1;
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
    if (broken.fill) this.releaseFill(broken.fill);
    if (broken.outline) this.explode(broken.outline, broken.fill);
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
  private releaseSpill({ colour, outline, from }: ReleasedFill): void {
    const { centres, length } = packSpill(outline, this.materials, this.random);
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
  private releaseRubble({ colour, mass, outline, from }: ReleasedFill): void {
    const fill = this.materials.colours[colour].fill;
    const pieces = packRubble(outline, colour, mass, this.materials, this.random);
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
   * red: one Blast of all its red ink.
   */
  private explode(outline: BrokenOutline, fill: ReleasedFill | null): void {
    const ink = blastInk(
      outline,
      fill && { colour: fill.colour, area: polygonArea(fill.outline) },
      this.materials,
    );
    if (ink > 0) this.arena.addBlast(outline.centre, ink);
  }
}
