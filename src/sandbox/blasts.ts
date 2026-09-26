import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, NearBody, PhysicsWorld } from '../physics';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import type { HostSurface, Kind, Solids } from './arena-contents';
import { TERRAIN_PARTY, type Party, type PartyId } from './contact-ledger';

/**
 * Blasts (ADR 0008): rings of force spreading out from destroyed red ink.
 * Sizing a Blast and its falloff are pure; the `Blasts` kind below holds the
 * rings still spreading. A Blast acts once on each body its ring reaches,
 * but it only reports what it reached: the Material rules push, wake,
 * damage and break.
 */

/** A Blast's size: how far it reaches and how strong it is at its centre. */
export interface BlastSize {
  /** R, px. */
  readonly reach: number;
  /** S. */
  readonly strength: number;
}

/**
 * The red ink (px²) a broken Object puts into its Blast: its Outline's
 * (length × Line thickness) if its Outline explodes, plus its Fill's (the
 * Object's area) if its Fill does. A red Outline with a red Fill makes one
 * combined Blast.
 */
export function blastInk(
  outline: { readonly colour: Colour; readonly length: number },
  fill: { readonly colour: Colour; readonly area: number } | null,
  table: MaterialTable,
): number {
  const fromOutline = table.colours[outline.colour].outline.explodes > 0 ? outline.length : 0;
  const fromFill = fill && table.colours[fill.colour].fill.explodes > 0 ? fill.area : 0;
  return fromOutline * LINE_THICKNESS + fromFill;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** R and S grow with the square root of the red ink, each clamped. */
export function blastSize(ink: number, table: MaterialTable): BlastSize {
  const b = table.blast;
  const root = Math.sqrt(ink);
  return {
    reach: clamp(b.radiusPerRootInk * root, b.radiusMin, b.radiusMax),
    strength: clamp(b.strengthPerRootInk * root, b.strengthMin, b.strengthMax),
  };
}

/** A destroyed Piece's Blast: of a fixed size, whatever its red ink. */
export function pieceBlastSize(table: MaterialTable): BlastSize {
  return { reach: table.blast.pieceRadius, strength: table.blast.pieceStrength };
}

/** A Blast's strength at `distance` from its centre: S × (1 − d/R)², 0 beyond R. */
export function blastStrength({ reach, strength }: BlastSize, distance: number): number {
  const left = 1 - clamp(distance, 0, reach) / reach;
  return strength * left * left;
}

export interface BlastView extends BlastSize {
  readonly id: number;
  readonly centre: Vec2;
  /** How far the ring has spread, px. */
  readonly radius: number;
}

/** A body a Blast's ring reached. */
export interface Reach<T> {
  readonly party: Party<T>;
  /** The Blast's centre. */
  readonly centre: Vec2;
  /** Its point nearest the Blast's centre. */
  readonly point: Vec2;
  /** The Blast's strength there. */
  readonly strength: number;
}

interface BlastRecord extends BlastSize {
  readonly id: number;
  readonly centre: Vec2;
  radius: number;
  /** The Parties it has acted on. */
  readonly acted: Set<PartyId>;
}

interface SavedBlast extends BlastSize {
  readonly id: number;
  readonly centre: Vec2;
  readonly radius: number;
  readonly acted: readonly PartyId[];
}

/**
 * The Blasts still spreading, in the order they started. Each ring grows
 * at the table's speed up to its reach and acts once on every body it
 * reaches, measured to the body's nearest point: Pieces, Objects, Rubble
 * and Droplets, never the Terrain or a Patch. A Blast is done once its
 * ring reaches R. Blast ids are never reused. Blasts have no bodies.
 */
export class Blasts<T> implements Kind<'blasts', readonly SavedBlast[], readonly BlastView[]> {
  readonly name = 'blasts';
  private blasts: BlastRecord[] = [];
  private nextId = 1;

  constructor(
    private readonly physics: Pick<PhysicsWorld, 'bodiesWithin'>,
    private readonly materials: MaterialTable,
    private readonly parties: { partyOf(body: BodyId): Party<T> | undefined },
  ) {}

  get views(): readonly BlastView[] {
    return this.blasts.map(({ id, centre, radius, reach, strength }) => ({
      id,
      centre,
      radius,
      reach,
      strength,
    }));
  }

  /** Starts a Blast of `size` at `centre`; its ring grows from the next `spread`. */
  add(centre: Vec2, { reach, strength }: BlastSize): void {
    const { x, y } = centre;
    this.blasts.push({
      id: this.nextId++,
      centre: { x, y },
      radius: 0,
      reach,
      strength,
      acted: new Set(),
    });
  }

  /**
   * Grows every ring by `seconds` of spreading, in the order the Blasts
   * started, and hands `act` what each newly reached, by Party id, at the
   * strength it has there. A Blast that `act` starts (red set off by
   * another) spreads in the same call, after the rest. Then drops the
   * Blasts that are done.
   */
  spread(seconds: number, act: (reached: readonly Reach<T>[]) => void): void {
    if (this.blasts.length === 0) return;
    const grow = this.materials.blast.speed * seconds;
    for (let k = 0; k < this.blasts.length; k++) {
      const blast = this.blasts[k]!;
      blast.radius = Math.min(blast.reach, blast.radius + grow);
      const reached = this.reach(blast);
      if (reached.length > 0) act(reached);
    }
    this.blasts = this.blasts.filter((blast) => blast.radius < blast.reach);
  }

  /** What the ring reaches now that it hasn't acted on yet, by Party id; marks it acted on. */
  private reach(blast: BlastRecord): Reach<T>[] {
    const reached: { party: Party<T>; near: NearBody }[] = [];
    for (const near of this.physics.bodiesWithin(blast.centre, blast.radius)) {
      const party = this.parties.partyOf(near.body);
      if (!party || party.id === TERRAIN_PARTY || blast.acted.has(party.id)) continue;
      reached.push({ party, near });
    }
    reached.sort((p, q) => p.party.id - q.party.id);
    return reached.map(({ party, near }) => {
      blast.acted.add(party.id);
      const strength = blastStrength(blast, near.distance);
      return { party, centre: blast.centre, point: near.point, strength };
    });
  }

  save(): readonly SavedBlast[] {
    return this.blasts.map(({ acted, ...blast }) => ({ ...blast, acted: [...acted] }));
  }

  restore(saved: readonly SavedBlast[]): void {
    this.blasts = saved.map(({ acted, ...blast }) => ({ ...blast, acted: new Set(acted) }));
  }

  /** It keeps nothing for what is gone. */
  gone(parties: ReadonlySet<PartyId>): void {
    for (const { acted } of this.blasts) for (const party of parties) acted.delete(party);
  }

  /** A Blast still spreading can't be erased. */
  erase(): void {}

  dropVisuals(): void {}

  clear(): void {
    this.blasts = [];
  }

  /** Blasts aren't solid. */
  solids(): Solids {
    return { polygons: [], circles: [] };
  }

  /** Nothing lands on a Blast. */
  surfaceOf(): HostSurface | null {
    return null;
  }

  applySurfaces(): void {}

  /** Blasts spread in their own call, `spread`. */
  step(): void {}
}
