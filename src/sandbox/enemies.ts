import type { Polygon } from '../geometry/polygon';
import { transformPoints } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { EnemyType } from '../materials/enemy-table';
import { enemyMass } from '../materials/mass';
import type { MaterialTable } from '../materials/material-table';
import type { BodyId, PhysicsWorld } from '../physics';
import type { Arena } from './arena';
import type { ArenaBodies } from './arena-bodies';
import { motionOf, type Kind, type Motion, type Poses } from './arena-contents';
import type { ArenaQuery } from './arena-query';
import type { PartyId } from './contact-ledger';
import type { Why } from './happenings';
import type { Numbers } from './numbers';
import type { PreviousPoses } from './previous-poses';

/**
 * Enemies: upright bodies that walk toward the Ink Core, pushed by a capped
 * force (ADR 0010). This kind holds their bodies and pushes them; whether
 * one stands on something it can walk on, and what follows from what it
 * touches, the Material rules decide.
 */

/** How far (px) a new Enemy starts clear of the Terrain at the Spawn, and of one below it. */
const SPAWN_GAP = 0.5;
/**
 * Height (px) of the bevel at each bottom corner of an Enemy's body, at
 * most: taller than a Line is thick, so it can ride up onto one lying on
 * the ground.
 */
const BEVEL_HEIGHT = 12;
/**
 * The bevel's slope: 3 up in 4 across, about 37°, gentle enough that a
 * push of one weight climbs it without friction.
 */
const BEVEL_RUN = 4 / 3;
/** Size (px) of the cut at each top corner. */
const TOP_CUT = 4;

/**
 * An Enemy's body, `width` × `height` about its centre: an upright box with
 * its top corners cut and its bottom corners bevelled, so that it rides up
 * onto a Line lying on the ground, and over the seams of the Terrain, as a
 * rounded box would. One convex polygon.
 */
export function enemyOutline(width: number, height: number): Polygon {
  const w = width / 2;
  const h = height / 2;
  // A narrow body keeps a flat bottom: the bevels together take at most 80% of its width.
  const rise = Math.min(BEVEL_HEIGHT, height / 4, (0.4 * width) / BEVEL_RUN);
  const run = rise * BEVEL_RUN;
  const cut = Math.min(TOP_CUT, w / 4, h / 4);
  return [
    { x: -w + cut, y: -h },
    { x: w - cut, y: -h },
    { x: w, y: -h + cut },
    { x: w, y: h - rise },
    { x: w - run, y: h },
    { x: -w + run, y: h },
    { x: -w, y: h - rise },
    { x: -w, y: -h + cut },
  ];
}

/**
 * The walking force (mass × px/s²) along x: what would take the body from
 * `velocity` to `wanted` (px/s) over a step of `seconds`, but never more
 * than `most` either way. Walking at `wanted` it only makes up for what
 * slowed it; blocked, it pushes at `most` and presses.
 */
export function walkingForce(
  velocity: number,
  wanted: number,
  most: number,
  mass: number,
  seconds: number,
): number {
  const force = (mass * (wanted - velocity)) / seconds;
  return Math.max(-most, Math.min(most, force));
}

/** An Enemy as the Material rules see it. */
export interface Walker {
  readonly id: number;
  readonly body: BodyId;
  readonly type: EnemyType;
}

export interface EnemyView extends Poses {
  readonly id: number;
  readonly type: EnemyType;
  /** Its body's outline about its centre; place it with `transform`. */
  readonly outline: Polygon;
  readonly width: number;
  readonly height: number;
  /** Linear velocity, px/s. */
  readonly velocity: Vec2;
}

/** An Enemy's record. */
export interface EnemyRecord extends Walker {
  /** Its Party id, the same after a rebuild. */
  readonly party: PartyId;
  /** Its size and weight, from the enemy table when it was sent in. */
  readonly width: number;
  readonly height: number;
  readonly mass: number;
}

type SavedEnemy = Omit<EnemyRecord, 'body'> & { readonly motion: Motion };

/**
 * The Enemies in the Arena, oldest first. Each is a Party of its own to the
 * Contact ledger, with no target yet: it deals damage by the normal rule,
 * as its own hitter. Enemy ids are never reused, not even after R or
 * Clear. What it walks toward is the Ink Core's side of it.
 */
export class Enemies implements Kind<'enemies', readonly SavedEnemy[], readonly EnemyView[]> {
  readonly name = 'enemies';
  private enemies: EnemyRecord[] = [];
  private nextId = 1;

  constructor(
    private readonly physics: Pick<
      PhysicsWorld,
      'getTransform' | 'getVelocity' | 'getAngularVelocity' | 'applyForce'
    >,
    private readonly materials: MaterialTable,
    private readonly numbers: Numbers,
    private readonly arena: Arena,
    private readonly bodies: Pick<ArenaBodies<never>, 'newId' | 'addEnemy' | 'removeBody'>,
    private readonly query: Pick<ArenaQuery, 'blocksEnemy'>,
    private readonly poses: Pick<PreviousPoses, 'of'>,
    /** Gravity, px/s²: an Enemy's push is in multiples of its weight. */
    private readonly gravity: number,
  ) {}

  get views(): readonly EnemyView[] {
    return this.enemies.map(({ id, type, width, height, body }) => ({
      id,
      type,
      outline: enemyOutline(width, height),
      width,
      height,
      ...this.poses.of(body),
      velocity: this.physics.getVelocity(body),
    }));
  }

  /** Every Enemy, oldest first. */
  walkers(): Iterable<EnemyRecord> {
    return this.enemies;
  }

  /**
   * Sends in an Enemy of `type` from the Spawn: it stands at the lane's far
   * end, its back to the wall, or on top of what already stands there.
   * Returns its id.
   */
  spawn(type: EnemyType): number {
    const numbers = this.numbers.enemy(type);
    const { width, height } = numbers;
    const outline = enemyOutline(width, height);
    const x = this.arena.spawn.x + width / 2 + SPAWN_GAP;
    let y = this.arena.spawn.y - height / 2 - SPAWN_GAP;
    const blocked = () => this.query.blocksEnemy(transformPoints(outline, { x, y, angle: 0 }));
    while (y - height > 0 && blocked()) y -= height + SPAWN_GAP;
    const id = this.nextId++;
    const mass = enemyMass(numbers, this.materials);
    const enemy = { id, party: this.bodies.newId(), type, width, height, mass };
    this.addBody(enemy, {
      transform: { x, y, angle: 0 },
      velocity: { x: 0, y: 0 },
      angularVelocity: 0,
    });
    return id;
  }

  private addBody(enemy: Omit<EnemyRecord, 'body'>, motion: Motion): void {
    const { id, party, type, width, height, mass } = enemy;
    const { body } = this.bodies.addEnemy(
      {
        position: { x: motion.transform.x, y: motion.transform.y },
        outline: enemyOutline(width, height),
        mass,
        velocity: motion.velocity,
      },
      { kind: 'enemy', type },
      { thing: 'enemy', id },
      (body) => ({ id: party, stroke: party, body, target: null }),
    );
    this.enemies.push({ ...enemy, body });
  }

  /**
   * Pushes an Enemy through the next step toward its walking speed, toward
   * the Ink Core's side, never harder than its push: its walking. The
   * Material rules call it for each one that stands on something.
   */
  walk(enemy: EnemyRecord, seconds: number): void {
    const { walkingSpeed, push } = this.numbers.enemy(enemy.type);
    const { x } = this.physics.getTransform(enemy.body);
    const core = this.arena.core;
    const toward = Math.sign((core.minX + core.maxX) / 2 - x);
    const velocity = this.physics.getVelocity(enemy.body).x;
    const most = push * enemy.mass * this.gravity;
    const force = walkingForce(velocity, toward * walkingSpeed, most, enemy.mass, seconds);
    this.physics.applyForce(enemy.body, { x: force, y: 0 });
  }

  /** Removes Enemy `id` at once, for `why`. */
  remove(id: number, why: Why): void {
    const index = this.enemies.findIndex((enemy) => enemy.id === id);
    if (index < 0) return;
    const { body } = this.enemies.splice(index, 1)[0]!;
    this.bodies.removeBody(body, why);
  }

  save(): readonly SavedEnemy[] {
    return this.enemies.map(({ body, ...enemy }) => ({
      ...enemy,
      motion: motionOf(this.physics, body),
    }));
  }

  /** Adds the Enemies again, oldest first. */
  restore(saved: readonly SavedEnemy[]): void {
    this.enemies = [];
    for (const { motion, ...enemy } of saved) this.addBody(enemy, motion);
  }

  /** Nothing of it is attached to anything else. */
  gone(): void {}

  clear(): void {
    this.enemies = [];
  }

  step(): void {}
}
