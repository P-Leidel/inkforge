import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { TERRAIN_SURFACE, type MaterialTable } from '../materials/material-table';
import type { BodyId, CircleBodyDef, ObjectBodyDef, PhysicsWorld, ShapeId } from '../physics';
import type { HostSurface } from './arena-contents';
import {
  TERRAIN_PARTY,
  type ContactLedger,
  type Party,
  type PartyId,
  type SavedContacts,
} from './contact-ledger';

/**
 * Arena bodies: every body in the Arena, and every shape added on one, come
 * and go through here. Each engine call is paired with the Contact ledger's:
 *
 * - adding a body registers its Party;
 * - removing one unregisters it and tells every kind what went before the
 *   call returns, so nothing is left attached to a body that is gone;
 * - sliding one marks it Squeezed.
 *
 * It knows each body's Colour and role, and each added shape's Colour, so it
 * re-applies surfaces after a material table edit, and it knows each Party's
 * surface: where a Patch can be laid on it. Kinds never call the ledger's
 * `register`, `unregister` or `squeezed`, or add or remove bodies and shapes
 * themselves.
 */

/** What of the physics module Arena bodies calls. */
export type BodiesPhysics = Pick<
  PhysicsWorld,
  | 'addTerrain'
  | 'addLine'
  | 'addObject'
  | 'addCircle'
  | 'removeBody'
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

/** A body's material: its Colour's surface in a role. */
export interface Paint {
  readonly colour: Colour;
  readonly role: 'line' | 'outline';
}

/** Who a new body is, given the body: a kind builds its record around it. */
type Who<P> = (body: BodyId) => P;

/** A shape added on a host's body. */
export interface AddedShape {
  readonly shape: ShapeId;
  /** The host's body, which it moves and goes with. */
  readonly body: BodyId;
}

interface BodyEntry {
  readonly body: BodyId;
  readonly party: PartyId;
  /** Null for the Terrain, whose surface never changes. */
  readonly paint: Paint | null;
  /** Where a Patch can be laid on it; null if nothing lands on it. */
  readonly surface: HostSurface | null;
  /** Shapes added on it, in the order they were added. */
  readonly shapes: Set<ShapeId>;
}

interface ShapeEntry {
  readonly body: BodyId;
  readonly colour: Colour;
}

export class ArenaBodies<T> {
  /** Every body, in the order it was added: Terrain first. */
  private readonly bodies = new Map<BodyId, BodyEntry>();
  /** Every added shape, in the order it was added. */
  private readonly shapes = new Map<ShapeId, ShapeEntry>();

  /**
   * @param gone Hears each Party that went, as it goes: the Sandbox world
   * tells every kind, in kind order. What hears it only forgets its own
   * records and lets go of what they held, and never calls back in.
   */
  constructor(
    private readonly physics: BodiesPhysics,
    private readonly contacts: BodiesLedger<T>,
    private readonly materials: MaterialTable,
    private readonly gone: (parties: ReadonlySet<PartyId>) => void,
  ) {}

  /** A new Party id, never reused. */
  newId(): PartyId {
    return this.contacts.newId();
  }

  /** Adds the Terrain, which is Party 0. */
  addTerrain(polygons: readonly Polygon[]): void {
    const body = this.physics.addTerrain(polygons, TERRAIN_SURFACE);
    this.track(body, TERRAIN_PARTY, null, { kind: 'polygons', polygons });
    this.contacts.register({ id: TERRAIN_PARTY, stroke: TERRAIN_PARTY, body, target: null });
  }

  /** Adds a fixed Line body with its Colour's Line surface; Patches lie along its capsules. */
  addLine<P extends Party<T>>(
    segments: readonly Segment[],
    thickness: number,
    colour: Colour,
    who: Who<P>,
  ): P {
    const body = this.physics.addLine(segments, thickness, this.materials.colours[colour].line);
    const surface: HostSurface = { kind: 'capsules', segments, radius: thickness / 2 };
    return this.register(body, { colour, role: 'line' }, surface, who);
  }

  /** Adds an Object with its Colour's Outline surface; Patches lie along `outline`. */
  addObject<P extends Party<T>>(
    def: Omit<ObjectBodyDef, 'surface'>,
    colour: Colour,
    outline: Polygon,
    who: Who<P>,
  ): P {
    const body = this.physics.addObject({
      ...def,
      surface: this.materials.colours[colour].outline,
    });
    const surface: HostSurface = { kind: 'polygons', polygons: [outline] };
    return this.register(body, { colour, role: 'outline' }, surface, who);
  }

  /**
   * Adds a moving circle with `paint`'s surface. Patches lie on its rim,
   * unless it is harmless: nothing lands on a Droplet.
   */
  addCircle<P extends Party<T>>(def: Omit<CircleBodyDef, 'surface'>, paint: Paint, who: Who<P>): P {
    const body = this.physics.addCircle({
      ...def,
      surface: this.materials.colours[paint.colour][paint.role],
    });
    const circle: HostSurface = { kind: 'circle', radius: def.radius };
    return this.register(body, paint, circle, who, (party) => !party.harmless);
  }

  private register<P extends Party<T>>(
    body: BodyId,
    paint: Paint,
    surface: HostSurface,
    who: Who<P>,
    lands: (party: P) => boolean = () => true,
  ): P {
    const party = who(body);
    this.track(body, party.id, paint, lands(party) ? surface : null);
    this.contacts.register(party);
    return party;
  }

  private track(
    body: BodyId,
    party: PartyId,
    paint: Paint | null,
    surface: HostSurface | null,
  ): void {
    this.bodies.set(body, { body, party, paint, surface, shapes: new Set() });
  }

  /**
   * Removes a body, with the shapes added on it, and unregisters its Party.
   * Every kind hears that it went before this returns. Does nothing to a
   * body that is already gone.
   */
  removeBody(body: BodyId): void {
    const entry = this.bodies.get(body);
    if (!entry) return;
    // The engine drops the shapes added on it with it.
    for (const shape of entry.shapes) this.shapes.delete(shape);
    this.bodies.delete(body);
    this.physics.removeBody(body);
    this.contacts.unregister(body);
    this.gone(new Set([entry.party]));
  }

  /** Slides an Object `displacement` px at `speed` px/s; it is Squeezed until it arrives. */
  slideOut(body: BodyId, displacement: Vec2, speed: number): void {
    this.physics.slideOut(body, displacement, speed);
    this.contacts.squeezed(body);
  }

  /**
   * Adds a capsule of `radius` around `segment` (in the host's own
   * coordinates) on the body of Party `host`, with `colour`'s Line surface:
   * a Patch. It goes with its host. Null if the host is gone.
   */
  addShape(host: PartyId, segment: Segment, radius: number, colour: Colour): AddedShape | null {
    const body = this.contacts.party(host)?.body;
    const entry = body === undefined ? undefined : this.bodies.get(body);
    if (body === undefined || !entry) return null;
    const surface = this.materials.colours[colour].line;
    const shape = this.physics.addCapsule(body, segment, radius, surface);
    entry.shapes.add(shape);
    this.shapes.set(shape, { body, colour });
    return { shape, body };
  }

  /** Removes a shape `addShape` added; its host stays. Does nothing to one already gone. */
  removeShape(shape: ShapeId): void {
    const entry = this.shapes.get(shape);
    if (!entry) return;
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
    return body === undefined ? null : (this.bodies.get(body)?.surface ?? null);
  }

  /**
   * Sets every body's and added shape's surface from the material table as
   * it is now, in the order they were added: after an edit.
   */
  applySurfaces(): void {
    const { colours } = this.materials;
    for (const { body, paint } of this.bodies.values()) {
      if (paint) this.physics.setSurface(body, colours[paint.colour][paint.role]);
    }
    for (const [shape, { colour }] of this.shapes) {
      this.physics.setShapeSurface(shape, colours[colour].line);
    }
  }

  /**
   * Removes every added shape, then every body but the Terrain, in the order
   * they were added, telling no kind: Clear, where every kind forgets all
   * of itself.
   */
  clear(): void {
    for (const shape of [...this.shapes.keys()]) this.removeShape(shape);
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
