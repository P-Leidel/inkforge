import type { BodyId, ContactHit, ContactPair, PhysicsWorld, StepReport } from '../physics';

/**
 * The Contact ledger: which contacts count. It is fed each step's report
 * and hands every rule the contacts that count, as Parties, in the
 * engine's report order: the step's hits, its new contacts, and who
 * touches whom. It owns everything that decides this:
 *
 * - who each body is (its Party), registered by the kind that adds it;
 * - the Settled pairs, which deal no damage and aren't new until they
 *   come apart;
 * - the Squeezed Objects, which are in no channel while they slide.
 *
 * Touching is built from the report's begins and ends, so it changes only
 * when contacts do, and a resting pile costs nothing per step. It is part of
 * the Sandbox world and never reads the engine; it asks the physics module
 * only whether a sliding Object still slides.
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

/** What a kind needs of the ledger: Party ids, and its bodies' Parties coming and going. */
export type PartyIndex<T> = Pick<
  ContactLedger<T>,
  'newId' | 'register' | 'unregister' | 'squeezed'
>;

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
  /** The Party of every registered body. */
  private readonly parties = new Map<BodyId, Party<T>>();
  /** The same Parties by their id. */
  private readonly byId = new Map<PartyId, Party<T>>();
  /** Parties unregistered since `takeGone`: what was removed. */
  private gone: PartyId[] = [];
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
  private readonly hitList: PartyHit<T>[] = [];
  private readonly newList: NewContact<T>[] = [];

  constructor(private readonly physics: Pick<PhysicsWorld, 'getSlide'>) {}

  /** The last step's hits that count: neither side Squeezed, the pair not Settled. */
  get hits(): readonly PartyHit<T>[] {
    return this.hitList;
  }

  /**
   * The last step's new contacts: pairs of Parties that didn't touch as
   * the step began and do at its end, neither Squeezed, the pair not
   * Settled. What an Object touches in the step its slide ends isn't new.
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

  /** A body was added: from now on it is `party` to every rule. */
  register(party: Party<T>): void {
    this.parties.set(party.body, party);
    this.byId.set(party.id, party);
  }

  /** The Party of a registered body. */
  partyOf(body: BodyId): Party<T> | undefined {
    return this.parties.get(body);
  }

  /** The registered Party with this id: a body there now. */
  party(id: PartyId): Party<T> | undefined {
    return this.byId.get(id);
  }

  /**
   * The Parties unregistered since the last call, in the order they went:
   * what was broken, undone, removed, cleared or capped. A rebuild forgets
   * Parties without them going.
   */
  takeGone(): readonly PartyId[] {
    const gone = this.gone;
    if (gone.length > 0) this.gone = [];
    return gone;
  }

  /** A body was removed: its Party goes, with everything it touched and was Settled with. */
  unregister(body: BodyId): void {
    const party = this.parties.get(body);
    if (!party) return;
    this.parties.delete(body);
    this.byId.delete(party.id);
    this.gone.push(party.id);
    this.sliding.delete(body);
    this.slideEnded.delete(body);
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

  /** An Object started sliding off a Line: call it after every `physics.slideOut`. */
  squeezed(body: BodyId): void {
    if (this.parties.has(body)) this.sliding.add(body);
  }

  /**
   * The Parties touching `body`'s Party now, Settled included; none while
   * either side is Squeezed.
   */
  *touching(body: BodyId): Iterable<Touching<T>> {
    const party = this.parties.get(body);
    if (!party || this.sliding.has(body)) return;
    const mine = this.contacts.get(party.id);
    if (!mine) return;
    for (const contact of mine.values()) {
      if (!this.sliding.has(contact.party.body)) yield contact;
    }
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
    if (this.unchecked) {
      // Right after a restore, a Settled pair that didn't begin again never ends.
      for (const key of this.settled) if (!this.touches(key)) this.settled.delete(key);
      this.unchecked = false;
    }

    for (const hit of report.hits) {
      const a = this.parties.get(hit.bodyA);
      const b = this.parties.get(hit.bodyB);
      if (!a || !b || this.sliding.has(a.body) || this.sliding.has(b.body)) continue;
      if (this.settled.has(eitherWay(a.id, b.id))) continue;
      this.hitList.push({ a, b, hit });
    }

    let kept = 0;
    for (const contact of this.newList) {
      const { a, b } = contact;
      if (this.sliding.has(a.body) || this.sliding.has(b.body)) continue;
      if (this.slideEnded.has(a.body) || this.slideEnded.has(b.body)) continue;
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
    const a = this.parties.get(pair.bodyA);
    const b = this.parties.get(pair.bodyB);
    if (!a || !b) return;
    const contact = this.contacts.get(a.id)?.get(b.id);
    if (contact) {
      if (!contact.pairs.some((p) => sameShapes(p, pair))) contact.pairs.push(pair);
      return;
    }
    const pairs = [pair];
    this.link(a, b, pairs);
    this.link(b, a, pairs);
    if (!this.parted.has(eitherWay(a.id, b.id))) this.newList.push({ a, b, pair });
  }

  /** Two shapes stopped touching. Ends for shape pairs it doesn't hold are ignored. */
  private end(pair: ContactPair): void {
    const a = this.parties.get(pair.bodyA);
    const b = this.parties.get(pair.bodyB);
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
    const settled = new Set(this.settled);
    for (const [id, mine] of this.contacts) {
      for (const other of mine.keys()) if (id < other) settled.add(pairKey(id, other));
    }
    return { settled: [...settled] };
  }

  /**
   * After `physics.reset()`: forgets every body, what touched and what slid,
   * and takes the saved Settled pairs. The kinds register their bodies again
   * as they restore them. Party ids carry on from where they were.
   */
  restore(saved: SavedContacts): void {
    this.parties.clear();
    this.byId.clear();
    this.gone = [];
    this.contacts.clear();
    this.sliding.clear();
    this.slideEnded.clear();
    this.parted.clear();
    this.hitList.length = 0;
    this.newList.length = 0;
    this.settled = new Set(saved.settled);
    this.unchecked = true;
  }
}
