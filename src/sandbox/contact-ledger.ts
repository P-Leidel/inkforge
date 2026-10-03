import type { Vec2 } from '../geometry/vec2';
import type {
  BodyId,
  ContactHit,
  ContactPair,
  PhysicsWorld,
  ShapeId,
  StepReport,
} from '../physics';

/**
 * The Contact ledger: which contacts count. It is fed each step's report
 * and hands every rule the contacts that count, as Parties, in the
 * engine's report order: the step's hits, its new contacts, and who
 * touches whom. It owns everything that decides this:
 *
 * - who each body is (its Party), registered by Arena bodies as a kind adds
 *   it; a body may be several Parties, each some of its shapes (a Line that
 *   isn't Grounded, one Party per Piece);
 * - the Settled pairs, which deal no damage and aren't new until they
 *   come apart;
 * - the Squeezed Objects, which are in no channel while they slide, and
 *   restart from rest where their slide ends as if physics started there:
 *   what they touch then is Settled;
 * - what a Party rebuilt on a new body (a Line changing form) touched and
 *   was Settled with, which carries over to the new body.
 *
 * Touching is built from the report's begins and ends, so it changes only
 * when contacts do, and a resting pile costs nothing per step. It is part of
 * the Sandbox world and never reads the engine; it asks the physics module
 * only whether a sliding Object still slides, and which way a touching pair
 * faces when a rule asks.
 */

/** A Party's id. Never reused, not even after R or Clear, and the same after a rebuild. */
export type PartyId = number;

/** The Terrain's Party id. */
export const TERRAIN_PARTY: PartyId = 0;

/** Party ids stay below this, so a pair of them is one exact number. */
const ID_LIMIT = 2 ** 26;

/** One number for an ordered pair of Party ids: `first` and `second` in that order. */
export function pairKey(first: PartyId, second: PartyId): number {
  return first * ID_LIMIT + second;
}

/** One number for two Parties, whichever way round. */
function eitherWay(a: PartyId, b: PartyId): number {
  return a < b ? pairKey(a, b) : pairKey(b, a);
}

/** Who a body is to the rules. Built once per record; rebuilt with it on restore. */
export interface Party<T> {
  /** Never reused; the same after a rebuild. The Terrain is 0. */
  readonly id: PartyId;
  /**
   * The Stroke it is part of: a Piece's Line, otherwise its own id. What one
   * Stroke hits in one step is one impact, however many of its Pieces hit.
   */
  readonly stroke: PartyId;
  readonly body: BodyId;
  /**
   * The shapes of `body` that are this Party, when the body is several
   * (a Line that isn't Grounded: one per Piece). Absent when the Party is
   * its whole body. Shapes added on the body (Patches) are its host's.
   */
  readonly shapes?: readonly ShapeId[];
  /** What takes damage on this side, or null (Terrain, Rubble, Droplets). */
  readonly target: T | null;
  /** True for a Droplet: it deals no damage, and nothing sticks to it. */
  readonly harmless?: boolean;
}

/** A hit that counts, between two Parties. */
export interface PartyHit<T> {
  readonly a: Party<T>;
  readonly b: Party<T>;
  /** Its bodies and shapes are in the engine's order: `a` is `hit.bodyA`'s Party. */
  readonly hit: ContactHit;
}

/** Two Parties that started touching, and the shape pair that made them touch. */
export interface NewContact<T> {
  readonly a: Party<T>;
  readonly b: Party<T>;
  /** `a` is `pair.bodyA`'s Party. */
  readonly pair: ContactPair;
}

/** Another Party touching one, and every shape pair the two touch through. */
export interface Touching<T> {
  readonly party: Party<T>;
  /** In the order they began, each in the engine's order, so either side may be A. */
  readonly pairs: readonly ContactPair[];
}

/** The ledger's part of a snapshot. */
export interface SavedContacts {
  /**
   * The Party pairs Settled after a rebuild, by `pairKey` with the lower id
   * first: every pair Settled or touching when it was saved.
   */
  readonly settled: readonly number[];
}

/**
 * What Parties rebuilt on new bodies were Settled with and touched as they
 * went (`carry`), for when they are registered again (`rejoin`).
 */
export interface CarriedContacts {
  /** Their Settled pairs, by `pairKey` with the lower id first. */
  readonly settled: readonly number[];
  /** The pairs they touched, the same way. */
  readonly touching: readonly number[];
}

/** One side's entry for two Parties touching. Both sides share `pairs`. */
interface Contact<T> extends Touching<T> {
  readonly pairs: ContactPair[];
}

const sameShapes = (p: ContactPair, q: ContactPair) =>
  (p.shapeA === q.shapeA && p.shapeB === q.shapeB) ||
  (p.shapeA === q.shapeB && p.shapeB === q.shapeA);

export class ContactLedger<T> {
  /** The Terrain is 0; the rest count up from 1. */
  private nextId = 1;
  /** The Party of every registered body that is one Party. */
  private readonly parties = new Map<BodyId, Party<T>>();
  /** The Parties of every registered body that is several, in the order registered. */
  private readonly shared = new Map<BodyId, Party<T>[]>();
  /** The Party of each shape of a body that is several Parties. */
  private readonly byShape = new Map<ShapeId, Party<T>>();
  /**
   * Hosts of shapes added on a body that is several Parties (Patches): the
   * Party they lie on.
   */
  private readonly hosts = new Map<ShapeId, Party<T>>();
  /** The same Parties by their id. */
  private readonly byId = new Map<PartyId, Party<T>>();
  /** Who touches whom, both ways round, with the shape pairs they touch through. */
  private readonly contacts = new Map<PartyId, Map<PartyId, Contact<T>>>();
  /**
   * Pairs that were touching when physics started. They deal no damage and
   * aren't new until they have stopped touching: pressing play doesn't break
   * a build.
   */
  private settled = new Set<number>();
  /** Squeezed Objects, by body: the only bodies whose slide is checked each step. */
  private readonly sliding = new Set<BodyId>();
  /** Objects whose slide ended in the last step. */
  private readonly slideEnded = new Set<BodyId>();
  /** Pairs, by key, whose last shape pair ended in this step: they touched as it began. */
  private readonly parted = new Set<number>();
  /** No step has run since `restore`: the Settled pairs haven't been checked against the engine yet. */
  private unchecked = false;
  /**
   * Pairs a rebuilt Party touched as it went (`rejoin`): beginning again in
   * the next step doesn't make them new.
   */
  private readonly rejoining = new Set<number>();
  /** Settled pairs of a rebuilt Party, which stay Settled only if they touch again in the next step. */
  private readonly recheck = new Set<number>();
  private readonly hitList: PartyHit<T>[] = [];
  private readonly newList: NewContact<T>[] = [];

  constructor(private readonly physics: Pick<PhysicsWorld, 'getSlide' | 'touchNormal'>) {}

  /** The last step's hits that count: neither side Squeezed, the pair not Settled. */
  get hits(): readonly PartyHit<T>[] {
    return this.hitList;
  }

  /**
   * The last step's new contacts: pairs of Parties that didn't touch as
   * the step began and do at its end, neither Squeezed, the pair not
   * Settled. What an Object touches in the step its slide ends is Settled,
   * so it isn't new.
   */
  get newContacts(): readonly NewContact<T>[] {
    return this.newList;
  }

  /** A new Party id, never reused. */
  newId(): PartyId {
    const id = this.nextId++;
    if (id >= ID_LIMIT) throw new Error('out of Party ids');
    return id;
  }

  /**
   * A body was added: from now on it is `party` to every rule, or the part
   * of it `party.shapes` names.
   */
  register(party: Party<T>): void {
    this.byId.set(party.id, party);
    if (!party.shapes) {
      this.parties.set(party.body, party);
      return;
    }
    let parties = this.shared.get(party.body);
    if (!parties) {
      parties = [];
      this.shared.set(party.body, parties);
    }
    parties.push(party);
    for (const shape of party.shapes) this.byShape.set(shape, party);
  }

  /**
   * A shape was added on a body that is several Parties (a Patch): its
   * contacts are `host`'s.
   */
  hostShape(shape: ShapeId, host: PartyId): void {
    const party = this.byId.get(host);
    if (party) this.hosts.set(shape, party);
  }

  /** The Party of a registered body that is one Party. */
  partyOf(body: BodyId): Party<T> | undefined {
    return this.parties.get(body);
  }

  /** The Party a shape of a registered body is: its own, or its body's. */
  partyAt(body: BodyId, shape: ShapeId): Party<T> | undefined {
    return this.parties.get(body) ?? this.byShape.get(shape) ?? this.hosts.get(shape);
  }

  /** Every Party of a registered body: one, or several in the order registered. */
  partiesOf(body: BodyId): readonly Party<T>[] {
    const party = this.parties.get(body);
    return party ? [party] : (this.shared.get(body) ?? []);
  }

  /** Every registered body. */
  *bodies(): Iterable<BodyId> {
    yield* this.parties.keys();
    yield* this.shared.keys();
  }

  /** The registered Party with this id: a body there now. */
  party(id: PartyId): Party<T> | undefined {
    return this.byId.get(id);
  }

  /**
   * A body was removed: its Parties go, with everything they touched and
   * were Settled with.
   */
  unregister(body: BodyId): void {
    const parties = this.partiesOf(body);
    if (parties.length === 0) return;
    this.sliding.delete(body);
    this.slideEnded.delete(body);
    for (const party of parties) this.forget(party);
    this.parties.delete(body);
    this.shared.delete(body);
  }

  /**
   * One Party of a body that is several went, and its body stays (a Piece
   * broke off a Line that isn't Grounded): it goes, with everything it
   * touched and was Settled with, and so do the shapes added on it.
   */
  unregisterParty(id: PartyId): void {
    const party = this.byId.get(id);
    if (!party?.shapes) return;
    const parties = this.shared.get(party.body);
    if (parties) parties.splice(parties.indexOf(party), 1);
    this.forget(party);
  }

  private forget(party: Party<T>): void {
    this.byId.delete(party.id);
    for (const shape of party.shapes ?? []) this.byShape.delete(shape);
    for (const [shape, host] of this.hosts) if (host === party) this.hosts.delete(shape);
    const mine = this.contacts.get(party.id);
    if (mine) {
      for (const other of mine.keys()) {
        this.contacts.get(other)?.delete(party.id);
        this.settled.delete(eitherWay(party.id, other));
      }
      this.contacts.delete(party.id);
    }
    // Until the first step after a restore, Settled pairs needn't touch yet.
    if (this.unchecked) {
      for (const key of this.settled) {
        if (Math.floor(key / ID_LIMIT) === party.id || key % ID_LIMIT === party.id)
          this.settled.delete(key);
      }
    }
  }

  /**
   * Parties `ids` are about to go with their bodies and come back under the
   * same ids on new ones (a Line changing form): what they were Settled with
   * and touched, to hand `rejoin` once they are registered again.
   */
  carry(ids: ReadonlySet<PartyId>): CarriedContacts {
    const mine = (key: number) => ids.has(Math.floor(key / ID_LIMIT)) || ids.has(key % ID_LIMIT);
    const touching = new Set([...this.rejoining].filter(mine));
    for (const id of ids) {
      for (const other of this.contacts.get(id)?.keys() ?? []) touching.add(eitherWay(id, other));
    }
    return { settled: [...this.settled].filter(mine), touching: [...touching] };
  }

  /**
   * The Parties `carry` was given are registered again: they are Settled
   * with what they were, and what they touched isn't new when it begins
   * again in the next step. A pair that doesn't begin again in it has come
   * apart.
   */
  rejoin(carried: CarriedContacts): void {
    for (const key of carried.settled) {
      this.settled.add(key);
      this.recheck.add(key);
    }
    for (const key of carried.touching) this.rejoining.add(key);
  }

  /** An Object started sliding off a Line: call it after every `physics.slideOut`. */
  squeezed(body: BodyId): void {
    if (this.parties.has(body)) this.sliding.add(body);
  }

  /**
   * The Parties touching `body`'s Parties now, Settled included, Party by
   * Party; none while either side is Squeezed.
   */
  *touching(body: BodyId): Iterable<Touching<T>> {
    for (const party of this.partiesOf(body)) yield* this.touchingParty(party.id);
  }

  /**
   * The Parties touching Party `id` now, Settled included; none while
   * either side is Squeezed.
   */
  *touchingParty(id: PartyId): Iterable<Touching<T>> {
    const party = this.byId.get(id);
    if (!party || this.sliding.has(party.body)) return;
    const mine = this.contacts.get(party.id);
    if (!mine) return;
    for (const contact of mine.values()) {
      if (!this.sliding.has(contact.party.body)) yield contact;
    }
  }

  /**
   * Which way a shape pair `touching(body)` named faces now: the unit
   * normal pointing from the other side towards `body`'s, so up (y < 0)
   * where `body` rests on flat ground and sideways where it presses against
   * a wall. Null if the pair doesn't touch now. The Material rules decide
   * from it whether `body` stands on the other side or presses it.
   */
  normal(body: BodyId, pair: ContactPair): Vec2 | null {
    const normal = this.physics.touchNormal(pair);
    if (!normal) return null;
    // The physics normal points from A towards B.
    return pair.bodyB === body ? normal : { x: -normal.x, y: -normal.y };
  }

  /** Takes in one step's report, and fills `hits` and `newContacts` until the next step. */
  step(report: StepReport): void {
    this.hitList.length = 0;
    this.newList.length = 0;
    this.slideEnded.clear();
    this.parted.clear();

    // Squeeze is judged after the step: a slide that ended in it ended.
    for (const body of this.sliding) {
      if (this.physics.getSlide(body) !== null) continue;
      this.sliding.delete(body);
      this.slideEnded.add(body);
    }

    // The adapter's own order: ends, then begins.
    for (const pair of report.ends) this.end(pair);
    for (const pair of report.begins) this.begin(pair);

    // Settled is judged at the end of the step: a Settled pair that ends
    // and begins again in one step stays Settled.
    for (const key of this.parted) {
      if (this.settled.has(key) && !this.touches(key)) this.settled.delete(key);
    }
    // An Object restarts from rest where its slide ends, resting on what it
    // was squeezed off: what it touches then is Settled, so settling onto a
    // Line deals no damage, as when physics starts.
    for (const body of this.slideEnded) {
      const party = this.parties.get(body);
      if (!party) continue;
      for (const other of this.contacts.get(party.id)?.keys() ?? []) {
        this.settled.add(eitherWay(party.id, other));
      }
    }
    if (this.unchecked) {
      // Right after a restore, a Settled pair that didn't begin again never ends.
      for (const key of this.settled) if (!this.touches(key)) this.settled.delete(key);
      this.unchecked = false;
    }
    // The same for the Settled pairs a rebuilt Party carried.
    for (const key of this.recheck) if (!this.touches(key)) this.settled.delete(key);
    this.recheck.clear();
    this.rejoining.clear();

    for (const hit of report.hits) {
      const a = this.partyAt(hit.bodyA, hit.shapeA);
      const b = this.partyAt(hit.bodyB, hit.shapeB);
      if (!a || !b || this.sliding.has(a.body) || this.sliding.has(b.body)) continue;
      if (this.settled.has(eitherWay(a.id, b.id))) continue;
      this.hitList.push({ a, b, hit });
    }

    let kept = 0;
    for (const contact of this.newList) {
      const { a, b } = contact;
      if (this.sliding.has(a.body) || this.sliding.has(b.body)) continue;
      if (this.settled.has(eitherWay(a.id, b.id))) continue;
      this.newList[kept++] = contact;
    }
    this.newList.length = kept;
  }

  /**
   * Two shapes started touching. Two Parties that weren't touching as the
   * step began make a new contact: not two whose last shape pair ended in
   * it, since the engine's contacts change all at once in a step.
   */
  private begin(pair: ContactPair): void {
    const a = this.partyAt(pair.bodyA, pair.shapeA);
    const b = this.partyAt(pair.bodyB, pair.shapeB);
    if (!a || !b) return;
    const contact = this.contacts.get(a.id)?.get(b.id);
    if (contact) {
      if (!contact.pairs.some((p) => sameShapes(p, pair))) contact.pairs.push(pair);
      return;
    }
    const pairs = [pair];
    this.link(a, b, pairs);
    this.link(b, a, pairs);
    const key = eitherWay(a.id, b.id);
    if (!this.parted.has(key) && !this.rejoining.has(key)) this.newList.push({ a, b, pair });
  }

  /** Two shapes stopped touching. Ends for shape pairs it doesn't hold are ignored. */
  private end(pair: ContactPair): void {
    const a = this.partyAt(pair.bodyA, pair.shapeA);
    const b = this.partyAt(pair.bodyB, pair.shapeB);
    if (!a || !b) return;
    const contact = this.contacts.get(a.id)?.get(b.id);
    if (!contact) return;
    const k = contact.pairs.findIndex((p) => sameShapes(p, pair));
    if (k < 0) return;
    contact.pairs.splice(k, 1);
    if (contact.pairs.length > 0) return;
    this.contacts.get(a.id)!.delete(b.id);
    this.contacts.get(b.id)!.delete(a.id);
    this.parted.add(eitherWay(a.id, b.id));
  }

  private link(from: Party<T>, to: Party<T>, pairs: ContactPair[]): void {
    let mine = this.contacts.get(from.id);
    if (!mine) {
      mine = new Map();
      this.contacts.set(from.id, mine);
    }
    mine.set(to.id, { party: to, pairs });
  }

  /** Whether the two Parties of a pair key touch now. */
  private touches(key: number): boolean {
    return this.contacts.get(Math.floor(key / ID_LIMIT))?.has(key % ID_LIMIT) ?? false;
  }

  save(): SavedContacts {
    // What a rebuilt Party touched as it went touches still, until the next step says otherwise.
    const settled = new Set([...this.settled, ...this.rejoining]);
    for (const [id, mine] of this.contacts) {
      for (const other of mine.keys()) if (id < other) settled.add(pairKey(id, other));
    }
    return { settled: [...settled] };
  }

  /**
   * After `physics.reset()`: forgets every body, what touched and what slid,
   * and takes the saved Settled pairs. Every body is registered again as its
   * kind restores it. Party ids carry on from where they were.
   */
  restore(saved: SavedContacts): void {
    this.parties.clear();
    this.shared.clear();
    this.byShape.clear();
    this.hosts.clear();
    this.byId.clear();
    this.contacts.clear();
    this.sliding.clear();
    this.slideEnded.clear();
    this.parted.clear();
    this.rejoining.clear();
    this.recheck.clear();
    this.hitList.length = 0;
    this.newList.length = 0;
    this.settled = new Set(saved.settled);
    this.unchecked = true;
  }
}
