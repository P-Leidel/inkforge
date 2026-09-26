import type { Colour } from '../materials/colour';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, ContactPair, PhysicsWorld, ShapeId } from '../physics';
import type { ContactLedger } from './contact-ledger';

/**
 * Glue drag, one of the Material rules (ADR 0007): anything moving that
 * touches glue is slowed by a force against its motion, proportional to its
 * speed and not scaled by its mass, so heavier things are slowed less. Its
 * spin is slowed at the same rate. The glue wears by the momentum its drag
 * removes. It reads who touches whom from the Contact ledger and pushes
 * bodies through the physics module.
 */

/**
 * Something whose glue drags what touches it, by its Colour's Line numbers:
 * a Piece, or a green Patch. A Piece glues through its own shapes, not
 * through the Patches on it (a blue Patch covers the green under it); a
 * Patch glues through its one shape on its host's body.
 */
export interface Gluer {
  readonly colour: Colour;
  readonly body: BodyId;
  /** The one shape of `body` that glues: a Patch's. Absent for a Piece. */
  readonly shape?: ShapeId;
}

/**
 * Wears a gluer by `amount` (the momentum its drag removed, times its
 * Colour's `glueWear`) and says whether it is worn out.
 */
export type GlueWear<G> = (gluer: G, amount: number) => boolean;

/** A free body touching glue this step: how hard it is dragged, and by which gluers. */
interface Dragged<G> {
  drag: number;
  readonly gluers: G[];
}

export class Glue {
  constructor(
    private readonly materials: MaterialTable,
    private readonly physics: Pick<
      PhysicsWorld,
      | 'isFree'
      | 'getMass'
      | 'getInertia'
      | 'getVelocity'
      | 'getAngularVelocity'
      | 'applyImpulse'
      | 'applyAngularImpulse'
    >,
    private readonly contacts: Pick<ContactLedger<unknown>, 'touching'>,
    /** Whether a shape is a Patch's, which the body under it doesn't glue through. */
    private readonly isPatch: (shape: ShapeId) => boolean,
  ) {}

  /**
   * Drags every free body touching the glue of one of `gluers`, once however
   * many it touches, by the strongest glue it touches. Over a step of
   * `seconds` its velocity and spin lose `c·dt/m` of themselves, but never
   * more than all, so a light body is stopped rather than flung back. The
   * momentum removed wears the gluers it touches, shared evenly, through
   * `wear`. Returns the gluers worn out, in the order they wore out.
   */
  apply<G extends Gluer>(gluers: Iterable<G>, seconds: number, wear: GlueWear<G>): G[] {
    // In the order first found, which is the same in every replay.
    const dragged = new Map<BodyId, Dragged<G>>();
    for (const gluer of gluers) {
      const { glueDrag } = this.materials.colours[gluer.colour].line;
      if (glueDrag <= 0) continue;
      for (const { party, pairs } of this.contacts.touching(gluer.body)) {
        if (!this.physics.isFree(party.body)) continue;
        if (!pairs.some((pair) => this.gluesThrough(gluer, pair))) continue;
        const entry = dragged.get(party.body);
        if (!entry) dragged.set(party.body, { drag: glueDrag, gluers: [gluer] });
        else if (!entry.gluers.includes(gluer)) {
          entry.drag = Math.max(entry.drag, glueDrag);
          entry.gluers.push(gluer);
        }
      }
    }

    const worn: G[] = [];
    for (const [body, { drag, gluers: touched }] of dragged) {
      const v = this.physics.getVelocity(body);
      const w = this.physics.getAngularVelocity(body);
      if (v.x === 0 && v.y === 0 && w === 0) continue;
      const mass = this.physics.getMass(body);
      if (mass <= 0) continue;
      const k = Math.min((drag * seconds) / mass, 1);
      this.physics.applyImpulse(body, { x: -k * mass * v.x, y: -k * mass * v.y });
      if (w !== 0) this.physics.applyAngularImpulse(body, -k * this.physics.getInertia(body) * w);
      const share = (k * mass * Math.hypot(v.x, v.y)) / touched.length;
      for (const gluer of touched) {
        const amount = share * this.materials.colours[gluer.colour].line.glueWear;
        if (wear(gluer, amount) && !worn.includes(gluer)) worn.push(gluer);
      }
    }
    return worn;
  }

  /** Whether a gluer touches through this shape pair: its Patch's shape, or a Piece's own. */
  private gluesThrough(gluer: Gluer, pair: ContactPair): boolean {
    const mine = pair.bodyA === gluer.body ? pair.shapeA : pair.shapeB;
    return gluer.shape === undefined ? !this.isPatch(mine) : mine === gluer.shape;
  }
}
