import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import { TERRAIN_SURFACE } from '../materials/material-table';
import type {
  BodyId,
  BodyShape,
  CircleBodyDef,
  ObjectBodyDef,
  PhysicsWorld,
  ShapeId,
} from '../physics';
import type { HostSurface } from './arena-contents';
import {
  TERRAIN_PARTY,
  type ContactLedger,
  type Party,
  type PartyId,
  type SavedContacts,
} from './contact-ledger';
import type { Happening, Thing, Why } from './happenings';
import type { Numbers, ThingType } from './numbers';

/**
 * Arena bodies: every body in the Arena, and every shape added on one, come
 * and go through here. Each engine call is paired with the Contact ledger's:
 *
 * - adding a body registers its Party;
 * - removing one unregisters it and tells every kind what went before the
 *   call returns, so nothing is left attached to a body that is gone;
 * - sliding one marks it Squeezed.
 *
 * It also says what was added and what went, and why, for the list of what
 * happened: each body and added shape is a Thing that its kind names.
 *
 * It knows what each body and added shape is (its `ThingType`), and sets its
 * surface by what `Numbers` says of it, when it is added and again after an
 * F2 edit. It knows what each body
 * and added shape is made of: the Arena query tests those forms, and a
 * Party's form gives its surface, where a Patch can be laid on it. Kinds
 * never call the ledger's `register`, `unregister` or `squeezed`, or add or
 * remove bodies and shapes themselves.
 */

/** What of the physics module Arena bodies calls. */
export type BodiesPhysics = Pick<
  PhysicsWorld,
  | 'addTerrain'
  | 'addLine'
  | 'addObject'
  | 'addCircle'
  | 'removeBody'
  | 'getTransform'
  | 'getVelocity'
  | 'slideOut'
  | 'addCapsule'
  | 'removeShape'
  | 'setSurface'
  | 'setShapeSurface'
  | 'reset'
>;

/** What of the Contact ledger Arena bodies calls. */
export type BodiesLedger<T> = Pick<
  ContactLedger<T>,
  'newId' | 'register' | 'unregister' | 'squeezed' | 'party' | 'restore'
>;

/** Who a new body is, given the body: a kind builds its record around it. */
type Who<P> = (body: BodyId) => P;

/** What an added body or shape is, for the list of what happened; none for the Terrain. */
type What = Thing | null;

/**
 * What a body, or a shape added on one, is made of, as the Arena query tests
 * it: in its body's own coordinates (px, relative to its origin,
 * unrotated). The Terrain's and a Line's bodies never leave the origin, so
 * theirs are in world coordinates too.
 */
export type Form =
  /** The Terrain: convex polygons. */
  | { readonly kind: 'terrain'; readonly polygons: readonly Polygon[] }
  /** A Piece: connected capsules. */
  | { readonly kind: 'capsules'; readonly segments: readonly Segment[]; readonly radius: number }
  /** An Object: the Outline it is drawn and filled by, and the convex parts it collides with. */
  | { readonly kind: 'object'; readonly outline: Polygon; readonly parts: readonly Polygon[] }
  /** Rubble or a Droplet: a circle about the origin. */
  | { readonly kind: 'circle'; readonly radius: number }
  /** A Patch: one capsule, on its host. */
  | { readonly kind: 'capsule'; readonly segment: Segment; readonly radius: number };

/** A body or an added shape, as the Arena query finds it. */
export interface Figure {
  /** What it is; null for the Terrain. */
  readonly what: Thing | null;
  /** Its body: for an added shape, its host's, which it moves with. */
  readonly body: BodyId;
  readonly form: Form;
}

/** A shape added on a host's body. */
export interface AddedShape {
  readonly shape: ShapeId;
  /** The host's body, which it moves and goes with. */
  readonly body: BodyId;
}

interface BodyEntry extends Figure {
  readonly party: PartyId;
  /** What it is, which gives its surface; null for the Terrain, whose surface never changes. */
  readonly type: ThingType | null;
  /** Whether a Patch can be laid on it. */
  readonly lands: boolean;
  /** Shapes added on it, in the order they were added. */
  readonly shapes: Set<ShapeId>;
  /** Its place in the order bodies and shapes were added. */
  readonly order: number;
}

interface ShapeEntry extends Figure {
  readonly what: Thing;
  readonly type: ThingType;
  readonly order: number;
}

/** Where a Patch can be laid on a body made of `form`. */
function surfaceOfForm(form: Form): HostSurface | null {
  switch (form.kind) {
    case 'terrain':
      return { kind: 'polygons', polygons: form.polygons };
    case 'object':
      return { kind: 'polygons', polygons: [form.outline] };
    case 'capsules':
      return { kind: 'capsules', segments: form.segments, radius: form.radius };
    case 'circle':
      return { kind: 'circle', radius: form.radius };
    case 'capsule':
      return null;
  }
}

export class ArenaBodies<T> {
  /** Every body, in the order it was added: Terrain first. */
  private readonly bodies = new Map<BodyId, BodyEntry>();
  /** Every added shape, in the order it was added. */
  private readonly shapes = new Map<ShapeId, ShapeEntry>();
  /** Bodies and shapes added so far: the next one's place in the order. */
  private added = 0;

  /**
   * @param gone Hears each Party that went, as it goes: the Sandbox world
   * tells every kind, in kind order. What hears it only forgets its own
   * records and lets go of what they held, and never calls back in.
   * @param say Appends to the list of what happened.
   */
  constructor(
    private readonly physics: BodiesPhysics,
    private readonly contacts: BodiesLedger<T>,
    private readonly numbers: Numbers,
    private readonly gone: (parties: ReadonlySet<PartyId>) => void,
    private readonly say: (happening: Happening) => void,
  ) {}

  /** A new Party id, never reused. */
  newId(): PartyId {
    return this.contacts.newId();
  }

  /** Adds the Terrain, which is Party 0. */
  addTerrain(polygons: readonly Polygon[]): void {
    const body = this.physics.addTerrain(polygons, TERRAIN_SURFACE);
    this.track(body, TERRAIN_PARTY, null, null, { kind: 'terrain', polygons }, true);
    this.contacts.register({ id: TERRAIN_PARTY, stroke: TERRAIN_PARTY, body, target: null });
  }

  /** Adds a fixed Line body with `type`'s surface; Patches lie along its capsules. */
  addLine<P extends Party<T>>(
    segments: readonly Segment[],
    thickness: number,
    type: ThingType,
    what: Thing,
    who: Who<P>,
  ): P {
    const body = this.physics.addLine(segments, thickness, this.numbers.surface(type));
    const form: Form = { kind: 'capsules', segments, radius: thickness / 2 };
    return this.register(body, type, form, what, who);
  }

  /** Adds an Object with `type`'s surface; Patches lie along `outline`. */
  addObject<P extends Party<T>>(
    def: Omit<ObjectBodyDef, 'surface'>,
    type: ThingType,
    outline: Polygon,
    what: Thing,
    who: Who<P>,
  ): P {
    const body = this.physics.addObject({ ...def, surface: this.numbers.surface(type) });
    const form: Form = { kind: 'object', outline, parts: def.parts };
    return this.register(body, type, form, what, who);
  }

  /**
   * Adds a moving circle with `type`'s surface. Patches lie on its rim,
   * unless it is harmless: nothing lands on a Droplet.
   */
  addCircle<P extends Party<T>>(
    def: Omit<CircleBodyDef, 'surface'>,
    type: ThingType,
    what: Thing,
    who: Who<P>,
  ): P {
    const body = this.physics.addCircle({ ...def, surface: this.numbers.surface(type) });
    const circle: Form = { kind: 'circle', radius: def.radius };
    return this.register(body, type, circle, what, who, (party) => !party.harmless);
  }

  private register<P extends Party<T>>(
    body: BodyId,
    type: ThingType,
    form: Form,
    what: Thing,
    who: Who<P>,
    lands: (party: P) => boolean = () => true,
  ): P {
    const party = who(body);
    this.track(body, party.id, what, type, form, lands(party));
    this.contacts.register(party);
    this.say({ kind: 'added', what });
    return party;
  }

  private track(
    body: BodyId,
    party: PartyId,
    what: What,
    type: ThingType | null,
    form: Form,
    lands: boolean,
  ): void {
    const order = this.added++;
    this.bodies.set(body, { body, party, what, type, form, lands, shapes: new Set(), order });
  }

  /**
   * Removes a body, with the shapes added on it, and unregisters its Party,
   * for `why`. The shapes on it go first, with their host. Every kind hears
   * that it went before this returns. Does nothing to a body that is
   * already gone.
   */
  removeBody(body: BodyId, why: Why): void {
    const entry = this.bodies.get(body);
    if (!entry) return;
    const motion = this.motionOf(body);
    // The engine drops the shapes added on it with it.
    for (const shape of entry.shapes) {
      this.say({ kind: 'went', what: this.shapes.get(shape)!.what, why: 'with-host', ...motion });
      this.shapes.delete(shape);
    }
    this.bodies.delete(body);
    this.physics.removeBody(body);
    this.contacts.unregister(body);
    if (entry.what) this.say({ kind: 'went', what: entry.what, why, ...motion });
    this.gone(new Set([entry.party]));
  }

  /** Where a body is and how it moves, as it or a shape on it goes. */
  private motionOf(body: BodyId) {
    return { transform: this.physics.getTransform(body), velocity: this.physics.getVelocity(body) };
  }

  /** Slides an Object `displacement` px at `speed` px/s; it is Squeezed until it arrives. */
  slideOut(body: BodyId, displacement: Vec2, speed: number): void {
    this.physics.slideOut(body, displacement, speed);
    this.contacts.squeezed(body);
  }

  /**
   * Adds a capsule of `radius` around `segment` (in the host's own
   * coordinates) on the body of Party `host`, with `type`'s surface: a
   * Patch. It goes with its host. Null if the host is gone.
   */
  addShape(
    host: PartyId,
    segment: Segment,
    radius: number,
    type: ThingType,
    what: Thing,
  ): AddedShape | null {
    const body = this.contacts.party(host)?.body;
    const entry = body === undefined ? undefined : this.bodies.get(body);
    if (body === undefined || !entry) return null;
    const shape = this.physics.addCapsule(body, segment, radius, this.numbers.surface(type));
    entry.shapes.add(shape);
    const form: Form = { kind: 'capsule', segment, radius };
    this.shapes.set(shape, { body, type, what, form, order: this.added++ });
    this.say({ kind: 'added', what });
    return { shape, body };
  }

  /**
   * Removes a shape `addShape` added, for `why`; its host stays. Does
   * nothing to one already gone.
   */
  removeShape(shape: ShapeId, why: Why): void {
    const entry = this.shapes.get(shape);
    if (!entry) return;
    const motion = this.motionOf(entry.body);
    this.dropShape(shape);
    this.say({ kind: 'went', what: entry.what, why, ...motion });
  }

  private dropShape(shape: ShapeId): void {
    const entry = this.shapes.get(shape)!;
    this.shapes.delete(shape);
    this.bodies.get(entry.body)?.shapes.delete(shape);
    this.physics.removeShape(shape);
  }

  /**
   * The surface of the body with this Party, in its own coordinates: where
   * a Patch can be laid on it. Null for a Party with no body, or one nothing
   * lands on.
   */
  surfaceOf(party: PartyId): HostSurface | null {
    const body = this.contacts.party(party)?.body;
    const entry = body === undefined ? undefined : this.bodies.get(body);
    return entry?.lands ? surfaceOfForm(entry.form) : null;
  }

  /**
   * The bodies and added shapes among `found` that the Arena holds, each
   * once, in the order they were added: what the Arena query tests.
   */
  figures(found: Iterable<BodyShape>): Figure[] {
    const figures = new Map<number, Figure>();
    for (const { body, shape } of found) {
      const added = this.shapes.get(shape);
      const entry = added?.body === body ? added : this.bodies.get(body);
      if (entry) figures.set(entry.order, { what: entry.what, body: entry.body, form: entry.form });
    }
    return [...figures].sort(([p], [q]) => p - q).map(([, figure]) => figure);
  }

  /**
   * Sets every body's and added shape's surface by what `Numbers` says of
   * it now, in the order they were added: after an edit.
   */
  applySurfaces(): void {
    for (const { body, type } of this.bodies.values()) {
      if (type) this.physics.setSurface(body, this.numbers.surface(type));
    }
    for (const [shape, { type }] of this.shapes) {
      this.physics.setShapeSurface(shape, this.numbers.surface(type));
    }
  }

  /**
   * Removes every added shape, then every body but the Terrain, in the order
   * they were added, telling no kind and saying nothing: Clear, where every
   * kind forgets all of itself, and the Sandbox world says it starts over.
   */
  clear(): void {
    for (const shape of [...this.shapes.keys()]) this.dropShape(shape);
    for (const { body, party } of [...this.bodies.values()]) {
      if (party === TERRAIN_PARTY) continue;
      this.bodies.delete(body);
      this.physics.removeBody(body);
      this.contacts.unregister(body);
    }
  }

  /**
   * Starts again from a fresh engine state with no bodies, and hands the
   * Contact ledger its saved Settled pairs: a rebuild adds every body again.
   */
  reset(contacts: SavedContacts): void {
    this.physics.reset();
    this.bodies.clear();
    this.shapes.clear();
    this.contacts.restore(contacts);
  }
}
