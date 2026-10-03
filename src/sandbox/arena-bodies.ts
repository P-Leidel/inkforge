import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import { TERRAIN_SURFACE } from '../materials/material-table';
import type { BodyId, BodyShape, PhysicsWorld, ShapeId } from '../physics';
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
 * - rebuilding Parties on new bodies (`rehost`) tells no kind, and carries
 *   over what they touched: they never went;
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
  | 'addBody'
  | 'removeBody'
  | 'getTransform'
  | 'getVelocity'
  | 'slideOut'
  | 'addCapsule'
  | 'removeShape'
  | 'setSurface'
  | 'setShapeSurface'
  | 'shapesOf'
  | 'removeOwnShapes'
  | 'reset'
>;

/** What of the Contact ledger Arena bodies calls. */
export type BodiesLedger<T> = Pick<
  ContactLedger<T>,
  | 'newId'
  | 'register'
  | 'unregister'
  | 'unregisterParty'
  | 'hostShape'
  | 'squeezed'
  | 'party'
  | 'restore'
  | 'carry'
  | 'rejoin'
>;

/** Where an Object's body is, what it is made of, and how it starts. */
export interface ObjectBody {
  /** World position of the body's origin. */
  readonly position: Vec2;
  /** Convex parts relative to the origin, together forming one rigid body. */
  readonly parts: readonly Polygon[];
  /** Whether the Object starts Frozen. */
  readonly frozen: boolean;
  readonly mass: number;
  /** Rotation about `position`, radians; 0 by default. */
  readonly angle?: number;
  /** Linear velocity, px/s, if it starts moving (not Frozen). */
  readonly velocity?: Vec2;
  /** Angular velocity, rad/s, if it starts moving (not Frozen). */
  readonly angularVelocity?: number;
}

/** Where a moving circle (Rubble, a Droplet) is, and how it starts. It is never Frozen. */
export interface CircleBody {
  /** World position of its centre. */
  readonly position: Vec2;
  /** px. */
  readonly radius: number;
  readonly mass: number;
  /** Rotation, radians; 0 by default. */
  readonly angle?: number;
  /** Linear velocity, px/s. */
  readonly velocity?: Vec2;
  /** Angular velocity, rad/s. */
  readonly angularVelocity?: number;
  /** Circles of the same group (a positive number) never touch each other. None by default. */
  readonly group?: number;
  /** False if its hits never wake a Frozen Object (Droplets). True by default. */
  readonly wakes?: boolean;
  /** True for continuous collision against moving bodies too (see `BodyMotion`). */
  readonly bullet?: boolean;
}

/** Where an Enemy's body is, and how it starts. It never rotates, and is never Frozen. */
export interface EnemyBody {
  /** World position of its centre. */
  readonly position: Vec2;
  /** Its outline relative to its centre: one convex polygon. */
  readonly outline: Polygon;
  readonly mass: number;
  /** Linear velocity, px/s. */
  readonly velocity?: Vec2;
}

/**
 * Where a Line that isn't Grounded is, and how it starts: one moving body of
 * capsules, its Pieces' segments in its own coordinates.
 */
export interface LooseLineBody {
  /** World position of the body's origin; the world origin as it is drawn. */
  readonly position: Vec2;
  /** Rotation about `position`, radians; 0 by default. */
  readonly angle?: number;
  readonly thickness: number;
  readonly mass: number;
  /** Whether it starts Frozen. */
  readonly frozen: boolean;
  /** Linear velocity, px/s, if it starts moving (not Frozen). */
  readonly velocity?: Vec2;
  /** Angular velocity, rad/s, if it starts moving (not Frozen). */
  readonly angularVelocity?: number;
}

/** One Piece of a Line that isn't Grounded: its segments in the body's own coordinates. */
export interface LoosePiece<P> {
  readonly segments: readonly Segment[];
  readonly what: Thing;
  /** Who it is, given the body and its own shapes on it. */
  readonly who: (body: BodyId, shapes: readonly ShapeId[]) => P;
}

/** Who a new body is, given the body: a kind builds its record around it. */
type Who<P> = (body: BodyId) => P;

/**
 * What an added body or shape is, for the list of what happened; none for
 * the Terrain and the Ink Core.
 */
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
  /**
   * A Piece: connected capsules. A fixed Piece's never leave the origin; a
   * Piece of a Line that isn't Grounded `moves` with its body.
   */
  | {
      readonly kind: 'capsules';
      readonly segments: readonly Segment[];
      readonly radius: number;
      readonly moves?: boolean;
    }
  /** An Object: the Outline it is drawn and filled by, and the convex parts it collides with. */
  | { readonly kind: 'object'; readonly outline: Polygon; readonly parts: readonly Polygon[] }
  /** Rubble or a Droplet: a circle about the origin. */
  | { readonly kind: 'circle'; readonly radius: number }
  /** An Enemy: an upright rounded box, the one convex polygon it collides with. */
  | { readonly kind: 'enemy'; readonly outline: Polygon }
  /** A Patch: one capsule, on its host. */
  | { readonly kind: 'capsule'; readonly segment: Segment; readonly radius: number };

/** A body or an added shape, as the Arena query finds it. */
export interface Figure {
  /** What it is; null for the Terrain and the Ink Core. */
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
  /**
   * What it is, which gives its surface; null for the Terrain and the Ink
   * Core, whose surface never changes.
   */
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
  /** The Party it lies on. */
  readonly host: PartyId;
}

/** A Piece of a Line that isn't Grounded: some of its body's own shapes, and a Party. */
interface PartEntry extends Figure {
  readonly what: Thing;
  readonly party: PartyId;
  /** Its own shapes on the body. */
  readonly shapes: readonly ShapeId[];
  readonly order: number;
}

/** Where a Patch can be laid on a body made of `form`. */
function surfaceOfForm(form: Form): HostSurface | null {
  switch (form.kind) {
    case 'terrain':
      return { kind: 'polygons', polygons: form.polygons };
    case 'object':
    case 'enemy':
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
  /** The Pieces of Lines that aren't Grounded, by each of their own shapes. */
  private readonly parts = new Map<ShapeId, PartEntry>();
  /** Those Pieces by their Party. */
  private readonly partsByParty = new Map<PartyId, PartEntry>();
  /** Bodies and shapes added so far: the next one's place in the order. */
  private added = 0;
  /** The Parties being rebuilt on new bodies (`rehost`): no kind hears that they went. */
  private kept: ReadonlySet<PartyId> = new Set();

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
    const body = this.physics.addBody({
      shapes: { kind: 'polygons', polygons },
      surface: TERRAIN_SURFACE,
    });
    this.track(body, TERRAIN_PARTY, null, null, { kind: 'terrain', polygons }, true);
    this.contacts.register({ id: TERRAIN_PARTY, stroke: TERRAIN_PARTY, body, target: null });
  }

  /**
   * Adds the Ink Core, a fixed block with the Terrain's surface, as Party
   * `party`. To the Arena query it is solid like the Terrain; it takes no
   * damage from hits, and like the Terrain it stays through Clear.
   */
  addInkCore(block: Polygon, party: PartyId): void {
    const body = this.physics.addBody({
      shapes: { kind: 'polygons', polygons: [block] },
      surface: TERRAIN_SURFACE,
    });
    this.track(body, party, null, null, { kind: 'terrain', polygons: [block] }, true);
    this.contacts.register({ id: party, stroke: party, body, target: null });
  }

  /** Adds a fixed Line body with `type`'s surface; Patches lie along its capsules. */
  addLine<P extends Party<T>>(
    segments: readonly Segment[],
    thickness: number,
    type: ThingType,
    what: Thing,
    who: Who<P>,
  ): P {
    const body = this.physics.addBody({
      shapes: { kind: 'capsules', segments, radius: thickness / 2 },
      surface: this.numbers.surface(type),
    });
    const form: Form = { kind: 'capsules', segments, radius: thickness / 2 };
    return this.register(body, type, form, what, who);
  }

  /**
   * Adds a Line that isn't Grounded, Party `line`, with `type`'s surface:
   * one moving body of capsules, whose hits wake Frozen Objects, each of its
   * Pieces a Party of its own, some of its shapes. Patches lie along each
   * Piece's capsules. Returns the Pieces' Parties, in order.
   */
  addLooseLine<P extends Party<T>>(
    def: LooseLineBody,
    type: ThingType,
    line: PartyId,
    pieces: readonly LoosePiece<P>[],
  ): P[] {
    const radius = def.thickness / 2;
    const body = this.physics.addBody({
      shapes: { kind: 'capsules', segments: pieces.flatMap((p) => p.segments), radius },
      surface: this.numbers.surface(type),
      position: def.position,
      angle: def.angle,
      motion: {
        mass: def.mass,
        velocity: def.velocity,
        angularVelocity: def.angularVelocity,
        frozen: def.frozen,
        wakes: true,
      },
      reportsHits: true,
    });
    const form: Form = { kind: 'capsules', segments: [], radius, moves: true };
    this.track(body, line, null, type, form, false);
    const own = this.physics.shapesOf(body);
    let k = 0;
    return pieces.map(({ segments, what, who }) => {
      const shapes = own.slice(k, (k += segments.length));
      const party = who(body, shapes);
      const entry: PartEntry = {
        what,
        body,
        form: { kind: 'capsules', segments, radius, moves: true },
        party: party.id,
        shapes,
        order: this.added++,
      };
      for (const shape of shapes) this.parts.set(shape, entry);
      this.partsByParty.set(party.id, entry);
      this.contacts.register(party);
      this.say({ kind: 'added', what });
      return party;
    });
  }

  /** Adds an Object with `type`'s surface; Patches lie along `outline`. */
  addObject<P extends Party<T>>(
    def: ObjectBody,
    type: ThingType,
    outline: Polygon,
    what: Thing,
    who: Who<P>,
  ): P {
    const body = this.physics.addBody({
      shapes: { kind: 'polygons', polygons: def.parts },
      surface: this.numbers.surface(type),
      position: def.position,
      angle: def.angle,
      motion: {
        mass: def.mass,
        velocity: def.velocity,
        angularVelocity: def.angularVelocity,
        frozen: def.frozen,
        wakes: true,
      },
      reportsHits: true,
    });
    const form: Form = { kind: 'object', outline, parts: def.parts };
    return this.register(body, type, form, what, who);
  }

  /**
   * Adds an Enemy with `type`'s surface: an upright body a walking force
   * drives, whose hits wake Frozen Objects. Patches lie along its outline.
   */
  addEnemy<P extends Party<T>>(def: EnemyBody, type: ThingType, what: Thing, who: Who<P>): P {
    const body = this.physics.addBody({
      shapes: { kind: 'polygons', polygons: [def.outline] },
      surface: this.numbers.surface(type),
      position: def.position,
      motion: { mass: def.mass, velocity: def.velocity, wakes: true, upright: true, driven: true },
      reportsHits: true,
    });
    return this.register(body, type, { kind: 'enemy', outline: def.outline }, what, who);
  }

  /**
   * Adds a moving circle with `type`'s surface. Patches lie on its rim,
   * unless it is harmless: nothing lands on a Droplet.
   */
  addCircle<P extends Party<T>>(def: CircleBody, type: ThingType, what: Thing, who: Who<P>): P {
    const body = this.physics.addBody({
      shapes: { kind: 'circle', radius: def.radius },
      surface: this.numbers.surface(type),
      position: def.position,
      angle: def.angle,
      motion: {
        mass: def.mass,
        velocity: def.velocity,
        angularVelocity: def.angularVelocity,
        wakes: def.wakes ?? true,
        bullet: def.bullet,
      },
      reportsHits: true,
      group: def.group,
    });
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
    const parts = this.partsOf(body);
    for (const part of parts) this.forgetPart(part);
    this.bodies.delete(body);
    this.physics.removeBody(body);
    this.contacts.unregister(body);
    if (entry.what) this.say({ kind: 'went', what: entry.what, why, ...motion });
    for (const part of parts) this.say({ kind: 'went', what: part.what, why, ...motion });
    this.tellGone([entry.party, ...parts.map((part) => part.party)]);
  }

  /**
   * Removes one Piece of a Line that isn't Grounded, Party `party`, for
   * `why`: its shapes, with the shapes added on it, and its Party. The body
   * stays with the rest. Every kind hears that it went before this returns.
   * Does nothing to one already gone.
   */
  removePart(party: PartyId, why: Why): void {
    const part = this.partsByParty.get(party);
    if (!part) return;
    const { body } = part;
    const motion = this.motionOf(body);
    for (const [shape, added] of this.shapes) {
      if (added.host !== party) continue;
      this.say({ kind: 'went', what: added.what, why: 'with-host', ...motion });
      this.dropShape(shape);
    }
    this.forgetPart(part);
    this.physics.removeOwnShapes(body, part.shapes);
    this.contacts.unregisterParty(party);
    this.say({ kind: 'went', what: part.what, why, ...motion });
    this.tellGone([party]);
  }

  /**
   * Runs `act`, which removes the bodies of Parties `parties` and adds them
   * again under the same Parties: a Line changing form. They never went: no
   * kind hears that they did, and what they touched and were Settled with
   * carries over to their new bodies. One that `act` doesn't add again goes
   * once it is done.
   */
  rehost(parties: ReadonlySet<PartyId>, act: () => void): void {
    const carried = this.contacts.carry(parties);
    this.kept = parties;
    try {
      act();
    } finally {
      this.kept = new Set();
    }
    this.contacts.rejoin(carried);
    this.tellGone([...parties].filter((party) => !this.contacts.party(party)));
  }

  /** Tells every kind that these Parties went, but those being rebuilt. */
  private tellGone(parties: readonly PartyId[]): void {
    const gone = parties.filter((party) => !this.kept.has(party));
    if (gone.length > 0) this.gone(new Set(gone));
  }

  /** The Pieces of the Line that isn't Grounded with this body, in order; none for any other body. */
  private partsOf(body: BodyId): PartEntry[] {
    return [...this.partsByParty.values()].filter((part) => part.body === body);
  }

  private forgetPart(part: PartEntry): void {
    for (const shape of part.shapes) this.parts.delete(shape);
    this.partsByParty.delete(part.party);
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
    if (this.partsByParty.has(host)) this.contacts.hostShape(shape, host);
    const form: Form = { kind: 'capsule', segment, radius };
    this.shapes.set(shape, { body, type, what, form, order: this.added++, host });
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

  /** The body of the Party with this id, or null for one with no body. */
  bodyOf(party: PartyId): BodyId | null {
    return this.contacts.party(party)?.body ?? null;
  }

  /**
   * The surface of the body with this Party, in its own coordinates: where
   * a Patch can be laid on it. Null for a Party with no body, or one nothing
   * lands on.
   */
  surfaceOf(party: PartyId): HostSurface | null {
    const part = this.partsByParty.get(party);
    if (part) return surfaceOfForm(part.form);
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
      const added = this.shapes.get(shape) ?? this.parts.get(shape);
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
   * Removes every added shape, then every body but the Terrain and the Ink
   * Core, in the order they were added, telling no kind and saying nothing:
   * Clear, where every kind forgets all of itself, and the Sandbox world
   * says it starts over.
   */
  clear(): void {
    for (const shape of [...this.shapes.keys()]) this.dropShape(shape);
    this.parts.clear();
    this.partsByParty.clear();
    for (const { body, type } of [...this.bodies.values()]) {
      if (!type) continue; // the Terrain or the Ink Core
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
    this.parts.clear();
    this.partsByParty.clear();
    this.contacts.restore(contacts);
  }
}
