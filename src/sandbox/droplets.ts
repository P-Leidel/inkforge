import { polygonArea, type Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import type { Arena } from './arena';
import type { ArenaBodies } from './arena-bodies';
import { motionOf, type Kind, type Motion, type Poses, type Solids } from './arena-contents';
import { brushTouchesCircle, type Brush } from './brush';
import type { Party, PartyId } from './contact-ledger';
import type { Why } from './happenings';
import type { PreviousPoses } from './previous-poses';
import type { Random } from './random';
import { deepestPoint, hexSpots } from './rubble';

/**
 * Spills: the Droplets a blue or green Fill throws out when its Object
 * breaks. Packing a Spill (`dropletCount`, `packSpill`) is pure, apart from
 * the seeded generator it is handed; the `Droplets` kind below holds the
 * Droplets in flight until each lands and becomes a Patch.
 */

/** Droplets never touch each other: they all share this collision group. */
const DROPLET_GROUP = 1;

/** How many Droplets a Spill has: from `dropletsMin` to `dropletsMax`, drawn from `random`. */
export function dropletCount(table: MaterialTable, random: Random): number {
  const min = Math.max(1, Math.floor(table.dropletsMin));
  const max = Math.max(min, Math.floor(table.dropletsMax));
  return min + Math.floor(random.next() * (max - min + 1));
}

/** A Spill packed inside an Outline, in the Outline's coordinates. */
export interface PackedSpill {
  /** Where each Droplet starts. */
  readonly centres: readonly Vec2[];
  /** Each Droplet's share of the Spill's Patch length (px). */
  readonly length: number;
}

/**
 * Packs a Spill inside its Object's Outline: `dropletCount` Droplets, each
 * on its own spot of a hex grid clear of the Outline's edges, picked by
 * `random`. Droplets never touch each other, so when fewer spots fit, some
 * share one; if none fits, they all start at the deepest point. The Spill's
 * Patch length is `patchLengthPerArea` × the Fill's area, shared evenly.
 */
export function packSpill(outline: Polygon, table: MaterialTable, random: Random): PackedSpill {
  const count = dropletCount(table, random);
  const spots = hexSpots(outline, table.dropletRadius);
  if (spots.length === 0) spots.push(deepestPoint(outline).point);
  const centres: Vec2[] = [];
  for (let k = 0; k < count; k++) {
    if (count <= spots.length) {
      // A partial Fisher-Yates shuffle: each Droplet on its own spot.
      const j = k + Math.floor(random.next() * (spots.length - k));
      [spots[k], spots[j]] = [spots[j]!, spots[k]!];
      centres.push(spots[k]!);
    } else {
      centres.push(spots[Math.floor(random.next() * spots.length)]!);
    }
  }
  return { centres, length: (table.patchLengthPerArea * polygonArea(outline)) / count };
}

export interface DropletView extends Poses {
  readonly id: number;
  readonly colour: Colour;
  readonly radius: number;
  /** Linear velocity, px/s. */
  readonly velocity: Vec2;
}

/** A Droplet set loose from a broken Object's Fill. */
export interface LooseDroplet {
  readonly colour: Colour;
  /** Its share of its Spill's Patch length (px). */
  readonly length: number;
  readonly motion: Motion;
}

/** A Droplet that touched something: it is gone, and leaves a Patch there. */
export interface Landing {
  readonly colour: Colour;
  readonly length: number;
  /** Where its centre was as it landed, in the world. */
  readonly centre: Vec2;
  /** What it landed on. */
  readonly host: Party<unknown>;
}

interface DropletRecord {
  readonly id: number;
  /** Its Party id, the same after a rebuild. */
  readonly party: PartyId;
  readonly colour: Colour;
  readonly length: number;
  readonly radius: number;
  readonly mass: number;
  readonly body: BodyId;
}

type SavedDroplet = Omit<DropletRecord, 'body'> & { readonly motion: Motion };

/**
 * The Droplets in flight, oldest first. Each is a small fast circle that
 * never touches another Droplet, never wakes a Frozen Object, and is a
 * harmless Party to the Contact ledger: it deals no damage, and nothing
 * sticks to it. The Material rules land it at its first new contact
 * (Settled pairs are never new, so one touching something at the snapshot
 * doesn't land again), and it vanishes if it leaves the Arena. Droplet ids
 * are never reused. Droplets aren't solid: a Stroke can be drawn through a
 * Spill.
 */
export class Droplets implements Kind<'droplets', readonly SavedDroplet[], readonly DropletView[]> {
  readonly name = 'droplets';
  private droplets: DropletRecord[] = [];
  private readonly byBody = new Map<BodyId, DropletRecord>();
  private nextId = 1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly materials: MaterialTable,
    private readonly arena: Arena,
    private readonly bodies: Pick<ArenaBodies<never>, 'newId' | 'addCircle' | 'removeBody'>,
    private readonly poses: Pick<PreviousPoses, 'of'>,
  ) {}

  get views(): readonly DropletView[] {
    return this.droplets.map(({ id, colour, radius, body }) => ({
      id,
      colour,
      radius,
      ...this.poses.of(body),
      velocity: this.physics.getVelocity(body),
    }));
  }

  /** Sets a Spill's Droplets loose, in order. */
  add(loose: readonly LooseDroplet[]): void {
    const { dropletRadius: radius, dropletMass: mass } = this.materials;
    for (const { motion, ...droplet } of loose) {
      const id = this.nextId++;
      this.addBody({ id, party: this.bodies.newId(), radius, mass, ...droplet }, motion);
    }
  }

  private addBody(droplet: Omit<DropletRecord, 'body'>, motion: Motion): void {
    const { id, party } = droplet;
    const { body } = this.bodies.addCircle(
      {
        position: { x: motion.transform.x, y: motion.transform.y },
        angle: motion.transform.angle,
        radius: droplet.radius,
        mass: droplet.mass,
        velocity: motion.velocity,
        angularVelocity: motion.angularVelocity,
        group: DROPLET_GROUP,
        wakes: false,
        bullet: true,
      },
      { colour: droplet.colour, role: 'line' },
      { thing: 'droplet', id },
      (body) => ({ id: party, stroke: party, body, target: null, harmless: true }),
    );
    const record = { ...droplet, body };
    this.droplets.push(record);
    this.byBody.set(body, record);
  }

  private removeBody(body: BodyId, why: Why): void {
    this.byBody.delete(body);
    this.bodies.removeBody(body, why);
  }

  /** Whether a body is a Droplet's. */
  isDroplet(body: BodyId): boolean {
    return this.byBody.has(body);
  }

  /**
   * Removes the Droplet whose body this is, which landed on `host`; the
   * Landing says where to lay its Patch. Which contact lands a Droplet is
   * the Material rules' to decide.
   */
  land(body: BodyId, host: Party<unknown>): Landing {
    const droplet = this.byBody.get(body);
    if (!droplet) throw new Error(`no Droplet has body ${body}`);
    const { x, y } = this.physics.getTransform(body);
    this.removeBody(body, 'landed');
    this.droplets.splice(this.droplets.indexOf(droplet), 1);
    return { colour: droplet.colour, length: droplet.length, centre: { x, y }, host };
  }

  save(): readonly SavedDroplet[] {
    return this.droplets.map(({ body, ...droplet }) => ({
      ...droplet,
      motion: motionOf(this.physics, body),
    }));
  }

  /** Adds the Droplets again, oldest first. */
  restore(saved: readonly SavedDroplet[]): void {
    this.droplets = [];
    this.byBody.clear();
    for (const { motion, ...droplet } of saved) this.addBody(droplet, motion);
  }

  /** Nothing of it is attached to anything else. */
  gone(): void {}

  /** An erased Droplet lays no Patch. */
  erase(brush: Brush): void {
    this.droplets = this.droplets.filter(({ body, radius }) => {
      const { x, y } = this.physics.getTransform(body);
      if (!brushTouchesCircle(brush, { x, y }, radius)) return true;
      this.removeBody(body, 'erased');
      return false;
    });
  }

  clear(): void {
    this.droplets = [];
    this.byBody.clear();
  }

  /** Droplets aren't solid. */
  solids(): Solids {
    return { polygons: [], circles: [] };
  }

  /** Droplets that left the Arena vanish. */
  step(): void {
    const { width, height } = this.arena;
    const left = this.droplets.filter(({ body, radius }) => {
      const { x, y } = this.physics.getTransform(body);
      return x < -radius || x > width + radius || y < -radius || y > height + radius;
    });
    if (left.length === 0) return;
    for (const { body } of left) this.removeBody(body, 'left');
    this.droplets = this.droplets.filter((d) => this.byBody.has(d.body));
  }
}
