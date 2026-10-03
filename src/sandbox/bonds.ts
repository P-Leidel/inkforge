import { applyTransform } from '../geometry/transform';
import { rotate, sub, type Vec2 } from '../geometry/vec2';
import type { BodyId, BondAnchors, BondId, PhysicsWorld } from '../physics';
import type { Kind, Poses } from './arena-contents';
import type { ContactLedger, PartyId } from './contact-ledger';
import type { PreviousPoses } from './previous-poses';
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
  /** The stuck Object's poses: drawn between them, the bond moves with it as drawn. */
  readonly objectPoses: Poses;
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

/** A bond lifted off its host while the host's body is rebuilt (`Bonds.lift`). */
export interface LiftedBond {
  /** Its place among the bonds, oldest first. */
  readonly place: number;
  readonly saved: SavedBond;
  /** Where it holds the host, in the world, and the host's angle, as it was lifted. */
  readonly onHost: Vec2;
  readonly hostAngle: number;
}

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
    private readonly poses: Pick<PreviousPoses, 'of'>,
  ) {}

  get views(): readonly BondView[] {
    return this.bonds.map(({ id, object, body, bond }) => {
      const objectPoses = this.poses.of(body);
      return {
        id,
        object,
        point: applyTransform(this.physics.getBond(bond)!.onA, objectPoses.transform),
        objectPoses,
      };
    });
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

  /**
   * The bodies of the Objects stuck to Party `host`, of those stuck to them,
   * and so on: what it carries.
   */
  carriedBy(host: PartyId): BodyId[] {
    const carrying = new Set([host]);
    const carried: BodyId[] = [];
    for (let grew = true; grew;) {
      grew = false;
      for (const { stuck, host, body } of this.bonds) {
        if (!carrying.has(host) || carrying.has(stuck)) continue;
        carrying.add(stuck);
        carried.push(body);
        grew = true;
      }
    }
    return carried;
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

  /**
   * Takes the bonds on the hosts with these Parties off them, saying
   * nothing, so that they can be landed again once the hosts' bodies are
   * rebuilt under the same Parties (`land`). The stuck Objects stay as they
   * are.
   */
  lift(hosts: ReadonlySet<PartyId>): LiftedBond[] {
    const lifted: LiftedBond[] = [];
    this.bonds.forEach(({ body: _body, bond, ...saved }, place) => {
      if (!hosts.has(saved.host)) return;
      const anchors = this.physics.getBond(bond)!;
      const host = this.physics.getTransform(this.body(saved.host)!);
      lifted.push({
        place,
        saved: { ...saved, anchors },
        onHost: applyTransform(anchors.onB, host),
        hostAngle: host.angle,
      });
      this.physics.removeBond(bond);
    });
    const gone = new Set(lifted.map(({ place }) => place));
    this.bonds = this.bonds.filter((_, place) => !gone.has(place));
    return lifted;
  }

  /**
   * Holds again what `lift` took off, on its hosts' new bodies, where it
   * held them in the world, in its place among the bonds. One whose host is
   * gone is gone.
   */
  land(lifted: readonly LiftedBond[]): void {
    for (const { place, saved, onHost, hostAngle } of lifted) {
      const host = this.body(saved.host);
      const stuck = this.body(saved.stuck);
      if (host === null || stuck === null) continue;
      const pb = this.physics.getTransform(host);
      const anchors: BondAnchors = {
        onA: saved.anchors.onA,
        onB: rotate(sub(onHost, pb), -pb.angle),
        angle: saved.anchors.angle + pb.angle - hostAngle,
      };
      const bond = this.physics.addBond(stuck, host, anchors);
      this.bonds.splice(place, 0, { ...saved, body: stuck, bond });
    }
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

  /** Every bond went with the bodies it held. */
  clear(): void {
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

  step(): void {}
}
