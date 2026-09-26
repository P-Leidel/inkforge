import { applyTransform } from '../geometry/transform';
import { rotate, sub, type Vec2 } from '../geometry/vec2';
import type { BodyId, BondAnchors, BondId, PhysicsWorld } from '../physics';
import type { Kind, Solids } from './arena-contents';
import type { ContactLedger, PartyId } from './contact-ledger';
import type { StrokeId } from './strokes';

/**
 * Bonds: green Objects stuck to what they touched, each held by a rigid
 * joint at the point where they touched (the one runtime joint of ADR
 * 0003). A bond holds its two bodies through either being rebuilt (the
 * physics module carries it), and goes when either is gone: broken, undone,
 * removed, cleared or capped. The stuck Object then falls free for good.
 */

export interface BondView {
  readonly id: number;
  /** The Object that stuck. */
  readonly object: StrokeId;
  /** Where the bond holds, in the world: where the two touched as it stuck. */
  readonly point: Vec2;
}

interface BondRecord {
  readonly id: number;
  readonly object: StrokeId;
  /** The stuck Object's Party, and the Party of what it is stuck to. */
  readonly stuck: PartyId;
  readonly host: PartyId;
  /** The stuck Object's body. */
  readonly body: BodyId;
  readonly bond: BondId;
}

type SavedBond = Omit<BondRecord, 'body' | 'bond'> & { readonly anchors: BondAnchors };

/**
 * The bonds in the Arena, oldest first. Bond ids, like Stroke ids, are never
 * reused. Bonds come after every kind with bodies, so that restoring them
 * finds both their Parties registered again.
 */
export class Bonds implements Kind<'bonds', readonly SavedBond[], readonly BondView[]> {
  readonly name = 'bonds';
  private bonds: BondRecord[] = [];
  private nextId = 1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly parties: Pick<ContactLedger<unknown>, 'party'>,
  ) {}

  get views(): readonly BondView[] {
    return this.bonds.map(({ id, object, body, bond }) => ({
      id,
      object,
      point: applyTransform(this.physics.getBond(bond)!.onA, this.physics.getTransform(body)),
    }));
  }

  /** Sticks Object `object`, Party `stuck`, to Party `host` at `point`, holding the two as they are now. */
  add(object: StrokeId, stuck: PartyId, host: PartyId, point: Vec2): void {
    const a = this.body(stuck);
    const b = this.body(host);
    if (a === null || b === null) return;
    const pa = this.physics.getTransform(a);
    const pb = this.physics.getTransform(b);
    const anchors: BondAnchors = {
      onA: rotate(sub(point, pa), -pa.angle),
      onB: rotate(sub(point, pb), -pb.angle),
      angle: pb.angle - pa.angle,
    };
    this.attach({ id: this.nextId++, object, stuck, host, anchors });
  }

  private body(party: PartyId): BodyId | null {
    return this.parties.party(party)?.body ?? null;
  }

  private attach({ anchors, ...saved }: SavedBond): void {
    const stuck = this.body(saved.stuck);
    const host = this.body(saved.host);
    if (stuck === null || host === null) return;
    const bond = this.physics.addBond(stuck, host, anchors);
    this.bonds.push({ ...saved, body: stuck, bond });
  }

  save(): readonly SavedBond[] {
    return this.bonds.map(({ body: _body, bond, ...saved }) => ({
      ...saved,
      anchors: this.physics.getBond(bond)!,
    }));
  }

  /** Holds the bonded bodies together again, oldest bond first. */
  restore(saved: readonly SavedBond[]): void {
    this.bonds = [];
    for (const bond of saved) this.attach(bond);
  }

  dropVisuals(): void {}

  clear(): void {
    for (const { bond } of this.bonds) this.physics.removeBond(bond);
    this.bonds = [];
  }

  /** A bond whose Object or host is gone goes too, and the Object falls free. */
  gone(parties: ReadonlySet<PartyId>): void {
    if (!this.bonds.some(({ stuck, host }) => parties.has(stuck) || parties.has(host))) return;
    this.bonds = this.bonds.filter(({ stuck, host, bond }) => {
      if (!parties.has(stuck) && !parties.has(host)) return true;
      this.physics.removeBond(bond);
      return false;
    });
  }

  /** A bond goes only with what it holds. */
  erase(): void {}

  /** Bonds take no room of their own. */
  solids(): Solids {
    return { polygons: [], circles: [] };
  }

  /** Bonds have no bodies. */
  surfaceOf(): null {
    return null;
  }

  applySurfaces(): void {}

  step(): void {}
}
