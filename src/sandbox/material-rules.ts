import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { Polygon } from '../geometry/polygon';
import type { BodyId, PhysicsWorld, ShapeId } from '../physics';
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
import { Glue, type Gluer } from './glue';
import type { Breakable, Numbers } from './numbers';
import type { PatchRecord } from './patches';
import type { Random } from './random';
import { launchRubble, packRubble, type LooseRubble } from './rubble';
import { Sticking, type Sticker } from './sticking';

/**
 * Material rules: everything Colour-specific that follows from things
 * touching, breaking and exploding. Headless and part of the Sandbox world.
 * After each physics step the world makes one call, `step`, and they run
 * every consequence in their own order: they read the contacts that count
 * from the Contact ledger (hits, new contacts, touching) and what the Blasts
 * reached, and decide damage from any cause and the blue counter, what
 * breaks, what a break lets out (Debris, Rubble, a Spill, a Blast), what a
 * Blast wakes and pushes, glue drag and wear, Patch wear, what sticks and
 * where a Droplet lands. What a thing's numbers are they ask `Numbers`. They
 * carry their decisions out through two narrow ports the world wires up: the
 * physics module, and the Arena (its kinds and Debris). Glue
 * drag (`Glue`) and sticking (`Sticking`) are parts of them in files of
 * their own; the world only talks to `MaterialRules`.
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
}

export interface MaterialRulesOptions<T, S> {
  readonly materials: MaterialTable;
  /** What a thing's numbers are. */
  readonly numbers: Numbers;
  /** The simulation's generator: releasing a Fill draws from it. */
  readonly random: Random;
  readonly physics: RulesPhysics;
  readonly contacts: RulesContacts<T>;
  readonly arena: RulesArena<T, S>;
}

/** Whether a gluer is a Patch, which glues through its one shape, rather than a Piece. */
const isPatch = (gluer: Gluer): gluer is PatchRecord => gluer.shape !== undefined;

/**
 * The Material rules' entry point: the Sandbox world calls `step` once after
 * each physics step, and the rules run their phases in their own order.
 */
export class MaterialRules<T extends Breakable, S extends Sticker> {
  private readonly materials: MaterialTable;
  private readonly numbers: Numbers;
  private readonly random: Random;
  private readonly physics: RulesPhysics;
  private readonly contacts: RulesContacts<T>;
  private readonly arena: RulesArena<T, S>;
  private readonly glueDrag: Glue;
  private readonly sticking: Sticking;

  constructor({
    materials,
    numbers,
    random,
    physics,
    contacts,
    arena,
  }: MaterialRulesOptions<T, S>) {
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
   * Runs every consequence of the physics step the Contact ledger just read,
   * in an order that must not change: exact replays depend on every engine
   * call and every draw from the generator coming in the same order.
   *
   * What the hits broke breaks only after sticking and landing: a green
   * Object sticks to its first new contact even if that breaks in this step
   * (it then falls free at once, as when its host breaks later), and a Patch
   * laid on something broken goes with it. Then glue drags and wears, which
   * breaks a worn-out Piece at once; the Blasts spread, and what they break
   * breaks as they do; and the used-up Patches go.
   *
   * The Enemies' phases slot in around these: pressing and floor wear is a
   * breaking cause like hits, so its breaks join `broken` before sticking;
   * after the used-up Patches go come Enemies reaching the Ink Core, kills,
   * Drops (which draw from the generator) and removing what went out over
   * the Spawn edge, in that order.
   */
  step(seconds: number): void {
    const broken = this.impacts();
    this.stick(seconds);
    this.land(); // Droplets land by new contacts, then Patches wear by hits
    for (const target of broken) this.breakTarget(target);
    this.glue(seconds);
    this.arena.spreadBlasts(seconds, this.blastReached);
    this.arena.removeUsedUpPatches();
  }

  /**
   * Damages by the step's hits: each Party takes the strongest hit of the
   * step from each Stroke it hit (several shapes of one body, or several
   * Pieces of one Line, hitting at once are one impact), against its own
   * threshold. Hits with a harmless Party (a Droplet) deal no damage either
   * way. Returns what broke, in the order the hits first reached it, not yet
   * broken: `step` breaks it later.
   */
  private impacts(): T[] {
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
   * when the strength beats its threshold. It wakes a Frozen Object when its
   * push wakes it (`wakes`). It pushes every moving body (an Object, Rubble
   * or a Droplet) outward from its centre by `push` times the strength, but
   * never faster than `maxPushSpeed`. What it broke then breaks, and red
   * explodes in turn.
   */
  private readonly blastReached = (reached: readonly Reach<T>[]): void => {
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
