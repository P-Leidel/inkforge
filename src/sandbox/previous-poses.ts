import type { Transform } from '../geometry/transform';
import type { BodyId, PhysicsWorld } from '../physics';
import type { Poses } from './arena-contents';

/**
 * Each body's pose as the latest step began, so the renderer can draw it
 * between that pose and its pose now. It is visual only: the simulation
 * never reads it. Body ids stay through a body being rebuilt (Release,
 * waking, a slide), so a rebuilt body keeps both its poses; they come back
 * after `physics.reset()`, so the Sandbox world forgets every pose then.
 */
export class PreviousPoses {
  private poses = new Map<BodyId, Transform>();

  constructor(private readonly physics: Pick<PhysicsWorld, 'getTransform'>) {}

  /** As a step begins: remembers each of `bodies`' pose now, and forgets the rest. */
  remember(bodies: Iterable<BodyId>): void {
    const poses = new Map<BodyId, Transform>();
    for (const body of bodies) poses.set(body, this.physics.getTransform(body));
    this.poses = poses;
  }

  /** Forgets every pose: until the next step, every body is drawn where it is. */
  forget(): void {
    this.poses = new Map();
  }

  /** `body`'s pose now and as the latest step began; the same if it wasn't there then. */
  of(body: BodyId): Poses {
    const transform = this.physics.getTransform(body);
    return { transform, previousTransform: this.poses.get(body) ?? transform };
  }
}
