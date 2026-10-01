import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { EnemyTable } from '../materials/enemy-table';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, ContactPair, ShapeId } from '../physics';
import type { HostSurface } from './arena-contents';
import type { BlastSize, Reach } from './blasts';
import type { NewContact, Party, PartyHit, Touching } from './contact-ledger';
import type { Landing, LooseDroplet } from './droplets';
import type { DropInk } from './drops';
import type { Walker } from './enemies';
import type { Gluer } from './glue';
import type { Thing, Why } from './happenings';
import {
  MaterialRules,
  type Broken,
  type Debris,
  type Killed,
  type RulesArena,
  type RulesContacts,
  type RulesPhysics,
} from './material-rules';
import { Numbers, type Breakable } from './numbers';
import type { PatchRecord } from './patches';
import { Random } from './random';
import type { LooseRubble } from './rubble';
import type { Sticker } from './sticking';

/**
 * Fakes of the Material rules' ports, so that tests drive the rules with
 * hand-made Parties, hits and bodies and no engine. Only test files import
 * this module.
 */

/** A body as the fake physics module holds it. */
export interface FakeBody {
  mass: number;
  inertia: number;
  frozen: boolean;
  /** Whether it moves freely: not fixed, Frozen or sliding. */
  free: boolean;
  /** What it still has to slide off a Line, or null. */
  slide: Vec2 | null;
  transform: Transform;
  velocity: Vec2;
  spin: number;
}

/** A physics module of plain bodies that logs every call that changes one. */
export class FakePhysics implements RulesPhysics {
  private readonly bodies = new Map<BodyId, FakeBody>();
  /** Where each pair touched, by the pair itself. */
  readonly touchPoints = new Map<ContactPair, Vec2>();
  /** Every call that changed a body, in order, e.g. `impulse 3`. */
  readonly log: string[] = [];

  /** Adds a free body at rest, of mass 1, with whatever `body` sets. */
  add(id: number, body: Partial<FakeBody> = {}): BodyId {
    this.bodies.set(id as BodyId, {
      mass: 1,
      inertia: 10,
      frozen: false,
      free: true,
      slide: null,
      transform: { x: 0, y: 0, angle: 0 },
      velocity: { x: 0, y: 0 },
      spin: 0,
      ...body,
    });
    return id as BodyId;
  }

  body(id: BodyId): FakeBody {
    const body = this.bodies.get(id);
    if (!body) throw new Error(`no body ${id}`);
    return body;
  }

  getSlide = (id: BodyId) => this.body(id).slide;
  getMass = (id: BodyId) => this.body(id).mass;
  getInertia = (id: BodyId) => this.body(id).inertia;
  getTransform = (id: BodyId) => this.body(id).transform;
  getVelocity = (id: BodyId) => this.body(id).velocity;
  getAngularVelocity = (id: BodyId) => this.body(id).spin;
  isFrozen = (id: BodyId) => this.body(id).frozen;
  isFree = (id: BodyId) => this.body(id).free;
  touchPoint = (pair: ContactPair) => this.touchPoints.get(pair) ?? null;

  release = (id: BodyId) => {
    this.log.push(`release ${id}`);
    Object.assign(this.body(id), { frozen: false, free: true });
  };

  applyImpulse = (id: BodyId, impulse: Vec2) => {
    this.log.push(`impulse ${id}`);
    const body = this.body(id);
    body.velocity = {
      x: body.velocity.x + impulse.x / body.mass,
      y: body.velocity.y + impulse.y / body.mass,
    };
  };

  applyAngularImpulse = (id: BodyId, impulse: number) => {
    this.log.push(`spin ${id}`);
    this.body(id).spin += impulse / this.body(id).inertia;
  };
}

/** The Contact ledger's channels, set by hand. */
export class FakeContacts<T> implements RulesContacts<T> {
  hits: PartyHit<T>[] = [];
  newContacts: NewContact<T>[] = [];
  /** What touches each body now. */
  readonly touches = new Map<BodyId, Touching<T>[]>();
  /**
   * Which way each touching shape pair faces, towards its `bodyB`; none by
   * default. Asked about its `bodyA`, it faces the other way.
   */
  readonly normals = new Map<ContactPair, Vec2>();

  touching(body: BodyId): Iterable<Touching<T>> {
    return this.touches.get(body) ?? [];
  }

  normal(body: BodyId, pair: ContactPair): Vec2 | null {
    const normal = this.normals.get(pair);
    if (!normal) return null;
    return body === pair.bodyA && body !== pair.bodyB ? { x: -normal.x, y: -normal.y } : normal;
  }
}

/** A Droplet the fake Arena holds. */
export interface FakeDroplet {
  readonly colour: Colour;
  readonly length: number;
  readonly centre: Vec2;
}

/**
 * Arena contents that record what the rules did to them, in order, in
 * `log`: `break`, `burst`, `rubble`, `droplets`, `blast`, `bond`, `land`,
 * `patch` and `use`, each with what it was handed; `reach` when a Blast
 * spreading reached something, and `used-up` for each Patch removed;
 * `walk`, `climb`, `core` (damage to the Ink Core), `kill` (an Enemy's id), `drop`
 * (what died and its Drop's Ink) and `remove`. An Enemy walks
 * right unless `headings` says otherwise, and gets past unless it is among
 * the `stalled`.
 */
export class FakeArena<T, S, W = Walker> implements RulesArena<T, S, W> {
  /** What breaking each target lets out; a target not in it is already gone. */
  readonly breaks = new Map<T, Broken>();
  readonly droplets = new Map<BodyId, FakeDroplet>();
  /** Each host's surface by its Party id. */
  readonly surfaces = new Map<number, HostSurface>();
  readonly patches = new Map<ShapeId, PatchRecord>();
  /** What a Patch holds: one that has used up this much is removed at the end of the step. */
  patchCapacity = Infinity;
  /** The Objects that may stick. */
  mayStick: S[] = [];
  /** The gluers, handed to glue drag as they are. */
  glue: ((T & Gluer) | PatchRecord)[] = [];
  /** What the Blasts reach when they next spread, one batch per Blast; handed out once. */
  reaching: Reach<T>[][] = [];
  /** The Enemies. */
  walking: W[] = [];
  /** The Enemies stalled in their walking; the rest get past. */
  stalled = new Set<W>();
  /** Which way each Enemy walks; +1 if not set. */
  headings = new Map<W, number>();
  /** Each Enemy by its Party id. */
  readonly enemyParties = new Map<number, W>();
  /** The Ink Core's Party id. */
  inkCore = -1;
  /** What lies below the screen, and beyond the Spawn edge. */
  below: Thing[] = [];
  beyond: Thing[] = [];
  /** What killing each Enemy says died, by its id; a Crawler at the origin if not set. */
  readonly killed = new Map<number, Killed>();
  readonly log: { readonly what: string; readonly with?: unknown }[] = [];

  /** The names of what was done, in order. */
  get done(): string[] {
    return this.log.map(({ what }) => what);
  }

  /** What was handed to each call of `what`, in order. */
  handed(what: string): unknown[] {
    return this.log.filter((entry) => entry.what === what).map((entry) => entry.with);
  }

  break(target: T): Broken | null {
    const broken = this.breaks.get(target) ?? null;
    this.breaks.delete(target);
    this.log.push({ what: 'break', with: target });
    return broken;
  }

  burst(debris: Debris): void {
    this.log.push({ what: 'burst', with: debris });
  }

  addRubble(rubble: readonly LooseRubble[]): void {
    this.log.push({ what: 'rubble', with: rubble });
  }

  addDroplets(droplets: readonly LooseDroplet[]): void {
    this.log.push({ what: 'droplets', with: droplets });
  }

  addBlast(centre: Vec2, size: BlastSize): void {
    this.log.push({ what: 'blast', with: { centre, size } });
  }

  bond(sticker: S, host: Party<unknown>, point: Vec2): void {
    this.log.push({ what: 'bond', with: { sticker, host, point } });
  }

  isDroplet(body: BodyId): boolean {
    return this.droplets.has(body);
  }

  landDroplet(body: BodyId, host: Party<unknown>): Landing {
    const droplet = this.droplets.get(body)!;
    this.droplets.delete(body);
    this.log.push({ what: 'land', with: body });
    return { ...droplet, host };
  }

  surfaceOf(host: Party<unknown>): HostSurface | null {
    return this.surfaces.get(host.id) ?? null;
  }

  layPatch(landing: Landing, surface: HostSurface): void {
    this.log.push({ what: 'patch', with: { landing, surface } });
  }

  patchOf(shape: ShapeId): PatchRecord | undefined {
    return this.patches.get(shape);
  }

  usePatch(patch: PatchRecord, amount: number): void {
    patch.used += amount;
    this.log.push({ what: 'use', with: { patch, amount } });
  }

  removeUsedUpPatches(): void {
    for (const [shape, patch] of this.patches) {
      if (patch.used < this.patchCapacity) continue;
      this.patches.delete(shape);
      this.log.push({ what: 'used-up', with: patch });
    }
  }

  stickers(): Iterable<S> {
    return this.mayStick;
  }

  gluers(): Iterable<(T & Gluer) | PatchRecord> {
    return this.glue;
  }

  spreadBlasts(_seconds: number, act: (reached: readonly Reach<T>[]) => void): void {
    const batches = this.reaching;
    this.reaching = [];
    for (const reached of batches) {
      this.log.push({ what: 'reach', with: reached });
      act(reached);
    }
  }

  walkers(): Iterable<W> {
    return this.walking;
  }

  walk(walker: W): boolean {
    this.log.push({ what: 'walk', with: walker });
    return this.stalled.has(walker);
  }

  climb(walker: W): void {
    this.log.push({ what: 'climb', with: walker });
  }

  heading(walker: W): number {
    return this.headings.get(walker) ?? 1;
  }

  walkerOf(party: Party<unknown>): W | undefined {
    return this.enemyParties.get(party.id);
  }

  /** Says a Crawler died at the origin, unless `killed` says otherwise for its id. */
  kill(id: number): Killed | null {
    this.log.push({ what: 'kill', with: id });
    return this.killed.get(id) ?? { id, type: 'crawler', at: { x: 0, y: 0 } };
  }

  drop(killed: Killed, ink: DropInk): void {
    this.log.push({ what: 'drop', with: { killed, ink } });
  }

  isInkCore(party: Party<unknown>): boolean {
    return party.id === this.inkCore;
  }

  damageInkCore(damage: number): void {
    this.log.push({ what: 'core', with: damage });
  }

  belowScreen(): readonly Thing[] {
    return this.below;
  }

  beyondSpawnEdge(): readonly Thing[] {
    return this.beyond;
  }

  remove(thing: Thing, why: Why): void {
    this.log.push({ what: 'remove', with: { thing, why } });
  }
}

/**
 * The Material rules over fake ports, with the simulation's generator seeded
 * 1, reading `enemies` or a fresh copy of the default enemy table.
 */
export function fakeRules<
  T extends Breakable,
  S extends Sticker = Sticker,
  W extends Walker = Walker,
>(materials: MaterialTable, enemies?: EnemyTable) {
  const physics = new FakePhysics();
  const contacts = new FakeContacts<T>();
  const arena = new FakeArena<T, S, W>();
  const random = new Random(1);
  const rules = new MaterialRules<T, S, W>({
    materials,
    numbers: new Numbers(materials, enemies),
    random,
    physics,
    contacts,
    arena,
  });
  return { rules, physics, contacts, arena, random };
}

/** A Patch record on `body`, glueing or bouncing through `shape`. */
export function fakePatch(colour: Colour, body: number, shape: number): PatchRecord {
  return {
    kind: 'patch',
    id: shape,
    colour,
    host: body,
    body: body as BodyId,
    segment: { a: { x: -10, y: 0 }, b: { x: 10, y: 0 } },
    thickness: 4,
    used: 0,
    shape: shape as ShapeId,
  };
}
