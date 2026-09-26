import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, ContactPair, ShapeId } from '../physics';
import type { HostSurface } from './arena-contents';
import type { NewContact, Party, PartyHit, Touching } from './contact-ledger';
import type { Landing, LooseDroplet } from './droplets';
import {
  MaterialRules,
  type Breakable,
  type RulesArena,
  type RulesContacts,
  type RulesPhysics,
} from './material-rules';
import type { PatchRecord } from './patches';
import { Random } from './random';
import type { LooseRubble } from './rubble';
import type { Sticker } from './sticking';
import type { Broken } from './strokes';

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

  touching(body: BodyId): Iterable<Touching<T>> {
    return this.touches.get(body) ?? [];
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
 * `patch` and `use`, each with what it was handed.
 */
export class FakeArena<T, S> implements RulesArena<T, S> {
  /** What breaking each target lets out; a target not in it is already gone. */
  readonly breaks = new Map<T, Broken>();
  readonly droplets = new Map<BodyId, FakeDroplet>();
  /** Each host's surface by its Party id. */
  readonly surfaces = new Map<number, HostSurface>();
  readonly patches = new Map<ShapeId, PatchRecord>();
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

  burst(debris: Broken['debris']): void {
    this.log.push({ what: 'burst', with: debris });
  }

  addRubble(rubble: readonly LooseRubble[]): void {
    this.log.push({ what: 'rubble', with: rubble });
  }

  addDroplets(droplets: readonly LooseDroplet[]): void {
    this.log.push({ what: 'droplets', with: droplets });
  }

  addBlast(centre: Vec2, ink: number): void {
    this.log.push({ what: 'blast', with: { centre, ink } });
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
}

/** The Material rules over fake ports, with the simulation's generator seeded 1. */
export function fakeRules<T extends Breakable, S extends Sticker = Sticker>(
  materials: MaterialTable,
) {
  const physics = new FakePhysics();
  const contacts = new FakeContacts<T>();
  const arena = new FakeArena<T, S>();
  const random = new Random(1);
  const rules = new MaterialRules<T, S>({ materials, random, physics, contacts, arena });
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
