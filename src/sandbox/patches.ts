import {
  closestParameterOnSegment,
  distancePointToSegment,
  type Segment,
} from '../geometry/segment';
import { bandPolygon } from '../geometry/separation';
import type { Polygon } from '../geometry/polygon';
import { applyTransform } from '../geometry/transform';
import { rotate, sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld, ShapeId } from '../physics';
import type { HostSurface, Kind, Solids } from './arena-contents';
import type { ContactLedger, Party, PartyHit, PartyId } from './contact-ledger';

/**
 * Patches: the strips of ink Droplets leave where they land. A Patch is a
 * thin capsule laid along its host's surface and added to the host's body,
 * so it moves with the host and whatever lands there touches the Patch. It
 * has no mass, and meets things with its Colour's Line surface and glue:
 * blue bounces, green glues. It wears as it is used, and vanishes in a puff
 * of Debris when it is used up.
 */

/** Edges within this angle (radians) of the one a Droplet landed on count as the same edge. */
const SAME_EDGE = (5 * Math.PI) / 180;

/** A path of a host's surface: its points, and whether it closes on itself. */
interface Chain {
  readonly points: readonly Vec2[];
  readonly closed: boolean;
}

/** Joins connected segments into chains of points. */
function chainsOf(segments: readonly Segment[]): Chain[] {
  const chains: { points: Vec2[]; closed: false }[] = [];
  for (const { a, b } of segments) {
    const chain = chains[chains.length - 1];
    const last = chain?.points[chain.points.length - 1];
    if (chain && last && Math.hypot(last.x - a.x, last.y - a.y) < 1e-6) chain.points.push(b);
    else chains.push({ points: [a, b], closed: false });
  }
  return chains;
}

/**
 * Where a Patch of `length` px goes on a host's surface, for a Droplet that
 * landed with its centre at `point`, all in the host's own coordinates: a
 * straight strip along the surface at the point nearest `point`, with its
 * centre line on the surface. It lies along the edge the Droplet landed on
 * (neighbouring edges running within 5° of it count as the same edge),
 * centred on that point but moved along to stay on the edge, and clipped to
 * the edge where the edge is shorter. On a Piece it lies along the side of
 * its capsules facing the Droplet; on a circle, along the tangent, at most
 * the radius long. Null for a surface with no edges.
 */
export function layPatch(surface: HostSurface, point: Vec2, length: number): Segment | null {
  switch (surface.kind) {
    case 'circle': {
      const r = Math.hypot(point.x, point.y);
      const out = r > 1e-9 ? { x: point.x / r, y: point.y / r } : { x: 0, y: -1 };
      const at = { x: out.x * surface.radius, y: out.y * surface.radius };
      const half = Math.min(length, surface.radius) / 2;
      const along = { x: -out.y * half, y: out.x * half };
      return {
        a: { x: at.x - along.x, y: at.y - along.y },
        b: { x: at.x + along.x, y: at.y + along.y },
      };
    }
    case 'polygons':
      return layAlong(
        surface.polygons.map((points) => ({ points, closed: true })),
        0,
        point,
        length,
      );
    case 'capsules':
      return layAlong(chainsOf(surface.segments), surface.radius, point, length);
  }
}

/** Lays a strip along the nearest edge of `chains`, `offset` px out from it on `point`'s side. */
function layAlong(
  chains: readonly Chain[],
  offset: number,
  point: Vec2,
  length: number,
): Segment | null {
  let best: { chain: Chain; edge: number; distance: number } | null = null;
  for (const chain of chains) {
    const { points, closed } = chain;
    const edges = closed ? points.length : points.length - 1;
    for (let i = 0; i < edges; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
      const distance = distancePointToSegment(point, a, b);
      if (!best || distance < best.distance) best = { chain, edge: i, distance };
    }
  }
  if (!best) return null;

  const { points, closed } = best.chain;
  const n = points.length;
  const edges = closed ? n : n - 1;
  const vertex = (k: number) => points[((k % n) + n) % n]!;
  const a = vertex(best.edge);
  const b = vertex(best.edge + 1);
  const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
  const d = { x: (b.x - a.x) / edgeLength, y: (b.y - a.y) / edgeLength };
  const sameEdge = (k: number) => {
    const p = vertex(k);
    const q = vertex(k + 1);
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    return l < 1e-9 || ((q.x - p.x) * d.x + (q.y - p.y) * d.y) / l > Math.cos(SAME_EDGE);
  };
  // Grow the edge over neighbours running the same way, never past the chain's ends.
  let first = best.edge;
  let last = best.edge;
  while (last - first + 1 < edges && (closed || first > 0) && sameEdge(first - 1)) first--;
  while (last - first + 1 < edges && (closed || last < edges - 1) && sameEdge(last + 1)) last++;
  const along = (p: Vec2) => (p.x - a.x) * d.x + (p.y - a.y) * d.y;
  const from = along(vertex(first));
  const to = along(vertex(last + 1));

  const strip = Math.min(length, to - from);
  const at = from + closestParameterOnSegment(point, vertex(first), vertex(last + 1)) * (to - from);
  const start = Math.min(Math.max(at - strip / 2, from), to - strip);
  const side = (point.x - a.x) * d.y - (point.y - a.y) * d.x > 0 ? 1 : -1;
  const out = { x: d.y * side * offset, y: -d.x * side * offset };
  const on = (t: number) => ({ x: a.x + d.x * t + out.x, y: a.y + d.y * t + out.y });
  return { a: on(start), b: on(start + strip) };
}

export interface PatchView {
  readonly id: number;
  readonly colour: Colour;
  /** Its centre line in the world, where its host is now. */
  readonly segment: Segment;
  readonly thickness: number;
  /** How used up it is, from 0 (fresh) to 1 (gone). */
  readonly wear: number;
}

/** A puff of Debris where a used-up Patch was, for the Sandbox world to burst. */
export interface Puff {
  /** In the world. */
  readonly outline: Polygon;
  readonly velocity: Vec2;
  readonly colour: Colour;
}

/** A Patch: one shape on its host's body. */
export interface PatchRecord {
  readonly kind: 'patch';
  readonly id: number;
  readonly colour: Colour;
  /** Its host's Party id. */
  readonly host: PartyId;
  /** Its host's body. */
  readonly body: BodyId;
  /** Its centre line in the host's own coordinates. */
  readonly segment: Segment;
  readonly thickness: number;
  /** Wear taken so far. */
  used: number;
  readonly shape: ShapeId;
}

type SavedPatch = Omit<PatchRecord, 'kind' | 'body' | 'shape'>;

/**
 * The Patches in the Arena, oldest first, and the cap on them. Patch ids
 * are never reused. A Patch has no Party of its own: hits and contacts on
 * it are its host's, and name its shape. So hits on it damage its host by
 * the normal rule and take nothing from the Patch, which wears only by use.
 * It goes when its host goes (host gone). Patches come after their hosts'
 * kinds, so that restoring finds their hosts registered again.
 */
export class Patches implements Kind<'patches', readonly SavedPatch[], readonly PatchView[]> {
  readonly name = 'patches';
  /** Oldest first. */
  private patches: PatchRecord[] = [];
  private readonly byShape = new Map<ShapeId, PatchRecord>();
  private nextId = 1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly materials: MaterialTable,
    private readonly parties: Pick<ContactLedger<unknown>, 'party'>,
  ) {}

  get views(): readonly PatchView[] {
    return this.patches.map((patch) => ({
      id: patch.id,
      colour: patch.colour,
      segment: this.worldSegment(patch),
      thickness: patch.thickness,
      wear: Math.min(1, patch.used / this.capacity(patch)),
    }));
  }

  private worldSegment({ body, segment }: PatchRecord): Segment {
    const transform = this.physics.getTransform(body);
    return { a: applyTransform(segment.a, transform), b: applyTransform(segment.b, transform) };
  }

  /** What a Patch holds before it is used up: `patchCapacity` per px of its length. */
  private capacity({ segment: { a, b }, thickness }: PatchRecord): number {
    const length = Math.max(Math.hypot(b.x - a.x, b.y - a.y), thickness);
    return this.materials.patchCapacity * length;
  }

  /**
   * Lays a Patch of `length` px on `host`, whose surface is `surface`, for a
   * Droplet that landed with its centre at `centre` (in the world). Over the
   * Patch cap, the oldest Patches go at once; returns their puffs.
   */
  add(host: Party<unknown>, surface: HostSurface, centre: Vec2, colour: Colour, length: number) {
    const transform = this.physics.getTransform(host.body);
    const local = rotate(sub(centre, transform), -transform.angle);
    const segment = layPatch(surface, local, length);
    if (segment) {
      const { patchThickness: thickness } = this.materials;
      const id = this.nextId++;
      this.attach({ id, colour, host: host.id, segment, thickness, used: 0 });
    }
    return this.cap();
  }

  private attach(saved: SavedPatch): void {
    const body = this.parties.party(saved.host)?.body;
    if (body === undefined) return;
    const surface = this.materials.colours[saved.colour].line;
    const shape = this.physics.addCapsule(body, saved.segment, saved.thickness / 2, surface);
    const patch: PatchRecord = { ...saved, kind: 'patch', body, shape };
    this.patches.push(patch);
    this.byShape.set(shape, patch);
  }

  /** Over the Patch cap, the oldest go first. */
  private cap(): Puff[] {
    const over = this.patches.length - Math.max(0, Math.floor(this.materials.patchCap));
    if (over <= 0) return [];
    return this.remove(this.patches.slice(0, over));
  }

  /** Removes Patches and returns their puffs. */
  private remove(patches: readonly PatchRecord[]): Puff[] {
    const puffs = patches.map((patch) => ({
      outline: bandPolygon([this.worldSegment(patch)], patch.thickness / 2 + 1),
      velocity: this.physics.getVelocity(patch.body),
      colour: patch.colour,
    }));
    for (const { shape } of patches) {
      this.physics.removeShape(shape);
      this.byShape.delete(shape);
    }
    this.patches = this.patches.filter(({ shape }) => this.byShape.has(shape));
    return puffs;
  }

  /** Whether a shape is a Patch's. */
  isPatch(shape: ShapeId): boolean {
    return this.byShape.has(shape);
  }

  /** Every Patch, oldest first: the green ones glue. */
  gluers(): Iterable<PatchRecord> {
    return this.patches;
  }

  /** Wears a Patch by `amount`; returns whether it is used up. */
  wear(patch: PatchRecord, amount: number): boolean {
    patch.used += amount;
    return patch.used >= this.capacity(patch);
  }

  /**
   * Wears each Patch a hit names by the hit's impulse, times its Colour's
   * `patchHitWear`: every bounce a blue Patch gives uses it up a little. A
   * Droplet landing doesn't count.
   */
  wearByHits(hits: readonly PartyHit<unknown>[]): void {
    if (this.patches.length === 0) return;
    for (const { a, b, hit } of hits) {
      if (a.harmless || b.harmless) continue;
      for (const shape of [hit.shapeA, hit.shapeB]) {
        const patch = this.byShape.get(shape);
        if (!patch) continue;
        patch.used += hit.impulse * this.materials.colours[patch.colour].fill.patchHitWear;
      }
    }
  }

  /** Removes every used-up Patch; returns their puffs. */
  removeUsedUp(): Puff[] {
    const used = this.patches.filter((patch) => patch.used >= this.capacity(patch));
    return used.length > 0 ? this.remove(used) : [];
  }

  save(): readonly SavedPatch[] {
    return this.patches.map(({ kind: _kind, body: _body, shape: _shape, ...patch }) => patch);
  }

  /** Lays the Patches again on their hosts, oldest first. They get new shapes. */
  restore(saved: readonly SavedPatch[]): void {
    this.patches = [];
    this.byShape.clear();
    for (const patch of saved) this.attach(patch);
  }

  dropVisuals(): void {}

  clear(): void {
    for (const { shape } of this.patches) this.physics.removeShape(shape);
    this.patches = [];
    this.byShape.clear();
  }

  /** A Patch whose host is gone went with the host's body. */
  gone(parties: ReadonlySet<PartyId>): void {
    if (!this.patches.some(({ host }) => parties.has(host))) return;
    this.patches = this.patches.filter(({ host, shape }) => {
      if (!parties.has(host)) return true;
      this.byShape.delete(shape);
      return false;
    });
  }

  /** Patches take no room of their own. */
  solids(): Solids {
    return { polygons: [], circles: [] };
  }

  /** A Droplet landing on a Patch lands on its host. */
  surfaceOf(): null {
    return null;
  }

  applySurfaces(): void {
    for (const { shape, colour } of this.patches) {
      this.physics.setShapeSurface(shape, this.materials.colours[colour].line);
    }
  }

  step(): void {}
}
