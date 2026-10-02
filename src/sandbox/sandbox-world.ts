import { cutPolylineOutside } from '../geometry/clip';
import { transformPoints } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import {
  createEnemyTable,
  enemiesRevision,
  type EnemyTable,
  type EnemyType,
} from '../materials/enemy-table';
import { samplesInk, type SamplesInk } from '../materials/ink';
import {
  createMaterialTable,
  materialsRevision,
  type MaterialTable,
} from '../materials/material-table';
import { createPhysicsWorld, type PhysicsWorld } from '../physics';
import {
  processStroke,
  type RejectionReason,
  type StrokeContext,
  type StrokeResult,
} from '../stroke/stroke-pipeline';
import { SANDBOX_ARENA, type Arena } from './arena';
import { ArenaBodies } from './arena-bodies';
import type { Kind } from './arena-contents';
import { ArenaQuery } from './arena-query';
import { Blasts, type BlastView } from './blasts';
import { Bonds, type BondView } from './bonds';
import { ContactLedger, type PartyId, type SavedContacts } from './contact-ledger';
import { Droplets, type DropletView } from './droplets';
import { Enemies, type EnemyRecord, type EnemyView } from './enemies';
import { Happenings, type Thing, type Why } from './happenings';
import { InkCore, type InkCoreView } from './ink-core';
import { EnemyRules, type Killed } from './enemy-rules';
import { MaterialRules } from './material-rules';
import { Numbers } from './numbers';
import { Patches, type PatchView } from './patches';
import { PreviousPoses } from './previous-poses';
import { Random } from './random';
import { Rubble, type RubbleView } from './rubble';
import {
  freezeResting,
  Strokes,
  type AddedStroke,
  type FillOutcome,
  type LineView,
  type MadeFill,
  type MadeStroke,
  type ObjectStroke,
  type ObjectView,
  type RemovedFill,
  type RemovedStroke,
  type StrokeId,
  type StrokeTarget,
} from './strokes';

export type { BlastView } from './blasts';
export type { Poses } from './arena-contents';
export type { BondView } from './bonds';
export type { DropletView } from './droplets';
export type { DropInk } from './drops';
export type { EnemyView } from './enemies';
export type { Entry, Happening, Reader, Thing, Why } from './happenings';
export type { InkCoreView } from './ink-core';
export type { PatchView } from './patches';
export type { RubbleView } from './rubble';
export {
  SLIDE_OUT_SPEED,
  type AddedStroke,
  type FillOutcome,
  type LineView,
  type MadeFill,
  type MadeStroke,
  type ObjectView,
  type PieceView,
  type RemovedFill,
  type RemovedStroke,
  type StrokeId,
} from './strokes';

/** Fixed physics step: 60 Hz. */
export const STEP_SECONDS = 1 / 60;
/** Gravity, px/s². */
export const GRAVITY = 1000;
/** At most this many steps per `advance`, so a long frame can't stall the game. */
const MAX_STEPS_PER_ADVANCE = 8;

/**
 * What a submitted Stroke became. A Line or an Object carries its Colour
 * and the Ink (px²) it took: a Line's as drawn, with each Piece's and how
 * much of each lies on a Line already standing, and an Object's Outline's.
 */
export type StrokeOutcome =
  | AddedStroke
  /** It was not accepted, so nothing was added: `path` is what it would have been. */
  | { readonly kind: 'declined'; readonly made: MadeStroke; readonly path: readonly Vec2[] }
  | { readonly kind: 'rejected'; readonly reason: RejectionReason; readonly path: readonly Vec2[] }
  | { readonly kind: 'dropped' };

export interface StrokeOptions {
  /** Overrides the Line thickness (the stress tests use a thinner Line). */
  readonly lineThickness?: number;
  /**
   * Asked what the Stroke would make, with its Ink, before it is added:
   * false declines it, and nothing is added. The world decides nothing by
   * it; the Game layer above refuses what can't be afforded.
   */
  readonly accept?: (made: MadeStroke) => boolean;
}

/** What runs just before and just after each step `step` and `advance` take. */
export interface StepHooks {
  readonly before?: () => void;
  readonly after?: () => void;
}

export interface FillOptions {
  /** Asked what the Fill would be, with its Ink, before it is added: false declines it. */
  readonly accept?: (fill: MadeFill) => boolean;
}

/**
 * Every kind of Arena contents, in the fixed order they are rebuilt in: the
 * Ink Core, Strokes, Rubble, Enemies, Bonds, Droplets, Patches, then
 * Blasts. A kind that lives on another, or acts on it, comes after it.
 */
type Kinds = readonly [
  InkCore,
  Strokes,
  Rubble,
  Enemies,
  Bonds,
  Droplets,
  Patches,
  Blasts<StrokeTarget>,
];

/**
 * The order the Eraser removes what it touches in, by rank: kind order, an
 * Object before a Piece, each oldest first. Every Thing has a rank, though
 * the Eraser never touches an Enemy.
 */
const ERASE_ORDER: Readonly<Record<Thing['thing'], number>> = {
  object: 0,
  piece: 1,
  rubble: 2,
  enemy: 3,
  droplet: 4,
  patch: 5,
};

/** A kind as the Sandbox world runs it, over every kind alike. */
type AnyKind = Kind<string, unknown, unknown>;

/**
 * Every kind's views by its name: everything R brings back, and nothing
 * visual only but the poses bodies had as the latest step began.
 */
export type ArenaContents = { readonly [K in Kinds[number] as K['name']]: K['views'] };

/** Every kind's part of a snapshot, by its name. */
type SavedContents = { readonly [K in Kinds[number] as K['name']]: ReturnType<K['save']> };

/** Everything R brings back: the whole simulation when physics last started. */
interface Snapshot {
  readonly contents: SavedContents;
  /** Contacts touching when it was taken: they are Settled after a rebuild. */
  readonly contacts: SavedContacts;
  readonly random: number;
  readonly time: number;
}

export interface SandboxWorldOptions {
  readonly seed?: number;
  readonly arena?: Arena;
  /** The material table to read; defaults to a fresh copy of the defaults. */
  readonly materials?: MaterialTable;
  /** The enemy table to read; defaults to a fresh copy of the defaults. */
  readonly enemies?: EnemyTable;
}

/**
 * The headless sandbox: the Arena and its contents, the pause state, and
 * Reset. It has no rendering dependency, so it is the main testing seam.
 * Each kind of Arena contents is a module of its own (`InkCore`, `Strokes`,
 * `Rubble`, `Enemies`, `Bonds`, `Droplets`, `Patches`, `Blasts`); the world
 * runs them all, in a fixed order. They add and remove bodies through Arena bodies, which tells
 * every kind what went as it goes, and the Arena query answers what is
 * where from them. The Contact ledger decides which contacts count, and the
 * Material rules read it and decide every consequence, in their own order:
 * the world calls them once a step and wires their decisions to the kinds
 * and the physics module. Each step and command appends what happened to
 * `happenings`, which the renderer reads. Each Stroke is drawn in a Colour
 * given with the command; the world holds no selected Colour.
 */
export class SandboxWorld {
  /** The Arena the world was made with: a Clear onto no other Arena brings it back. */
  private readonly baseArena: Arena;
  /** The Arena as it is now: the base Arena, or the one the latest Clear was onto. */
  private current: Arena;
  readonly random: Random;
  readonly materials: MaterialTable;
  readonly enemyTable: EnemyTable;
  /** What a thing's numbers are, from the material and enemy tables as they are now. */
  private readonly numbers: Numbers;
  /** What happened, in order: read it through a reader of your own. */
  readonly happenings = new Happenings(() => this.elapsed);
  private readonly physics: PhysicsWorld;
  private readonly contacts: ContactLedger<StrokeTarget>;
  private readonly bodies: ArenaBodies<StrokeTarget>;
  /** What is where: every question about place. */
  private readonly query: ArenaQuery;
  private readonly rules: MaterialRules<StrokeTarget, ObjectStroke, EnemyRecord>;
  /** Each body's pose as the latest step began, for drawing: the simulation never reads it. */
  private readonly poses: PreviousPoses;
  private readonly inkCoreKind: InkCore;
  private readonly strokes: Strokes;
  private readonly rubbleKind: Rubble;
  private readonly enemiesKind: Enemies;
  private readonly bondsKind: Bonds;
  private readonly dropletsKind: Droplets;
  private readonly patchesKind: Patches;
  private readonly blastsKind: Blasts<StrokeTarget>;
  /** Every kind, in rebuild order. */
  private readonly kinds: readonly AnyKind[];
  /** Taken whenever physics starts; R returns to it. */
  private snapshot: Snapshot | null = null;
  /** The material and enemy tables' revisions last applied to the physics world; none yet. */
  private appliedRevisions: readonly number[] = [];
  private running = false;
  private accumulator = 0;
  private elapsed = 0;
  /** Steps taken in all, never taken back: R goes back in time, not in this. */
  private stepsTaken = 0;

  constructor(options: SandboxWorldOptions = {}) {
    this.baseArena = options.arena ?? SANDBOX_ARENA;
    this.current = this.baseArena;
    this.random = new Random(options.seed ?? 1);
    this.materials = options.materials ?? createMaterialTable();
    this.enemyTable = options.enemies ?? createEnemyTable();
    this.numbers = new Numbers(this.materials, this.enemyTable);
    this.physics = createPhysicsWorld({
      gravity: { x: 0, y: GRAVITY },
      timeStep: STEP_SECONDS,
      wakeSpeed: this.materials.wakeSpeed,
      minBounceSpeed: this.materials.minBounceSpeed,
    });
    this.contacts = new ContactLedger(this.physics);
    const say = this.happenings.say.bind(this.happenings);
    this.bodies = new ArenaBodies(
      this.physics,
      this.contacts,
      this.numbers,
      (parties) => this.passOnGone(parties),
      say,
    );
    this.query = new ArenaQuery(this.physics, this.bodies, () => this.arena);
    this.poses = new PreviousPoses(this.physics);
    this.bodies.addTerrain(this.arena.terrain);
    // The kinds read the Arena as it is now: a Clear can put the world on another.
    const { physics, materials, numbers, bodies, query, poses } = this;
    const arena = () => this.current;
    this.inkCoreKind = new InkCore(arena, this.enemyTable, bodies);
    this.strokes = new Strokes(physics, materials, numbers, bodies, query, poses, say);
    this.rubbleKind = new Rubble(physics, materials, bodies, poses);
    this.enemiesKind = new Enemies(
      physics,
      materials,
      numbers,
      arena,
      bodies,
      query,
      poses,
      GRAVITY,
    );
    this.bondsKind = new Bonds(physics, this.contacts, poses);
    this.dropletsKind = new Droplets(physics, materials, arena, bodies, poses);
    this.patchesKind = new Patches(physics, materials, bodies, poses);
    this.blastsKind = new Blasts(query, this.materials, this.contacts);
    const kinds: Kinds = [
      this.inkCoreKind,
      this.strokes,
      this.rubbleKind,
      this.enemiesKind,
      this.bondsKind,
      this.dropletsKind,
      this.patchesKind,
      this.blastsKind,
    ];
    this.kinds = kinds;
    this.rules = new MaterialRules({
      materials: this.materials,
      numbers: this.numbers,
      random: this.random,
      physics: this.physics,
      contacts: this.contacts,
      arena: {
        break: (target) => this.strokes.break(target),
        burst: ({ outline, velocity, colours }) =>
          say({ kind: 'burst', outline, velocity, colours }),
        addRubble: (rubble) => this.rubbleKind.add(rubble),
        addDroplets: (droplets) => this.dropletsKind.add(droplets),
        addBlast: (centre, size) =>
          say({ kind: 'exploded', id: this.blastsKind.add(centre, size), centre, size }),
        bond: (sticker, host, point) =>
          this.bondsKind.add(sticker.id, sticker.party, host.id, point),
        isDroplet: (body) => this.dropletsKind.isDroplet(body),
        landDroplet: (body, host) => this.dropletsKind.land(body, host),
        surfaceOf: (host) => this.bodies.surfaceOf(host.id),
        layPatch: ({ host, centre, colour, length }, surface) =>
          this.patchesKind.add(host, surface, centre, colour, length),
        patchOf: (shape) => this.patchesKind.patchOf(shape),
        usePatch: (patch, amount) => this.patchesKind.use(patch, amount),
        removeUsedUpPatches: () => this.patchesKind.removeUsedUp(),
        stickers: () => this.strokes.objectRecords(),
        gluers: () => [...this.strokes.pieces(), ...this.patchesKind.gluers()],
        spreadBlasts: (seconds, act) => this.blastsKind.spread(seconds, act),
        belowScreen: () => this.query.below(this.arena.height),
        beyondSpawnEdge: () => this.query.beyondSpawnEdge(),
        remove: (thing, why) => this.removeThing(thing, why),
      },
      enemies: new EnemyRules({
        materials: this.materials,
        numbers: this.numbers,
        random: this.random,
        physics: this.physics,
        contacts: this.contacts,
        arena: {
          walkers: () => this.enemiesKind.walkers(),
          walk: (enemy, seconds) => this.enemiesKind.walk(enemy, seconds),
          climb: (enemy, seconds) => this.enemiesKind.climb(enemy, seconds),
          heading: (enemy) => this.enemiesKind.heading(enemy),
          blocksClimb: (room) => this.query.blocksClimb(room),
          walkerOf: (party) => this.enemiesKind.byParty(party.id),
          kill: (id) => this.kill(id),
          drop: ({ id, type, at }, ink) => say({ kind: 'dropped', id, type, at, ink }),
          carried: (enemy) => this.bondsKind.carriedBy(enemy.party),
          isInkCore: (party) => this.inkCoreKind.is(party.id),
          damageInkCore: (damage) => this.inkCoreKind.damage(damage),
          belowScreen: () => this.query.below(this.arena.height),
          remove: (thing, why) => this.removeThing(thing, why),
        },
      }),
    });
  }

  /** The Arena as it is now: its Terrain, Spawn and Ink Core are those of the one the latest Clear was onto. */
  get arena(): Arena {
    return this.current;
  }

  /** Whether physics is running rather than paused. */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * How far the world is into its next step, from 0 to 1: the time `advance`
   * carried over, in steps. The renderer draws each body that far from its
   * pose as the latest step began to its pose now. It is 1 while paused, so
   * everything is drawn where it is.
   */
  get stepFraction(): number {
    if (!this.running) return 1;
    return Math.min(1, Math.max(0, this.accumulator / STEP_SECONDS));
  }

  /** Simulated seconds since the world was created. */
  get time(): number {
    return this.elapsed;
  }

  /**
   * A count that goes up at every step and with everything that happens,
   * quietly or not. While it stays the same, nothing in the Arena moved,
   * came, went or was filled.
   */
  get changes(): number {
    return this.stepsTaken + this.happenings.said;
  }

  get bodyCount(): number {
    return this.physics.bodyCount;
  }

  /** Every kind's views by its name, e.g. `contents.strokes.lines` and `contents.rubble`. */
  get contents(): ArenaContents {
    return Object.fromEntries(this.kinds.map((kind) => [kind.name, kind.views])) as ArenaContents;
  }

  get lines(): readonly LineView[] {
    return this.strokes.lines;
  }

  get objects(): readonly ObjectView[] {
    return this.strokes.objects;
  }

  /** Rubble, oldest first. */
  get rubble(): readonly RubbleView[] {
    return this.rubbleKind.views;
  }

  /** Green Objects stuck to what they touched. */
  get bonds(): readonly BondView[] {
    return this.bondsKind.views;
  }

  /** Droplets in flight. */
  get droplets(): readonly DropletView[] {
    return this.dropletsKind.views;
  }

  /** Patches, oldest first. */
  get patches(): readonly PatchView[] {
    return this.patchesKind.views;
  }

  /** Blast rings still spreading, oldest first. */
  get blasts(): readonly BlastView[] {
    return this.blastsKind.views;
  }

  /** Enemies, oldest first. */
  get enemies(): readonly EnemyView[] {
    return this.enemiesKind.views;
  }

  /** The Ink Core and its HP. */
  get inkCore(): InkCoreView {
    return this.inkCoreKind.views;
  }

  /**
   * Sends in an Enemy of `type` from the Spawn, out of view,
   * paused or running. Given `at`, it appears with its centre there instead,
   * for tests and demos. Returns its id.
   */
  spawn(type: EnemyType, at?: Vec2): number {
    return this.enemiesKind.spawn(type, at);
  }

  /** How many Enemies are in the Arena. */
  get enemyCount(): number {
    return this.enemiesKind.count;
  }

  /**
   * Whether the lane's far end is free: an Enemy of `type` sent in now would
   * stand there with nothing in its way, rather than on top of what does.
   */
  spawnClear(type: EnemyType): boolean {
    return this.enemiesKind.spawnClear(type);
  }

  /**
   * An Enemy dies: it pops, a burst of its body that is visual only, and
   * goes, releasing nothing physical. Says what died and where.
   */
  private kill(id: number): Killed | null {
    const enemy = this.enemiesKind.view(id);
    if (!enemy) return null;
    const { type, outline, transform, velocity } = enemy;
    this.happenings.say({
      kind: 'popped',
      id,
      type,
      outline: transformPoints(outline, transform),
      velocity,
    });
    this.enemiesKind.remove(id, 'died');
    return { id, type, at: { x: transform.x, y: transform.y } };
  }

  /**
   * Turns one Stroke's raw pointer samples, drawn in `colour`, into a Line,
   * an Object, a rejection or nothing. Every Colour follows the same drawing
   * rules; only the material differs.
   */
  submitStroke(
    samples: readonly Vec2[],
    colour: Colour,
    options: StrokeOptions = {},
  ): StrokeOutcome {
    const result = processStroke(samples, this.strokeContext(options));
    switch (result.kind) {
      case 'line':
      case 'object': {
        const made = this.strokes.measure(result, colour);
        if (options.accept && !options.accept(made)) {
          const path =
            result.kind === 'line'
              ? [result.segments[0]!.a, ...result.segments.map(({ b }) => b)]
              : [...result.outline, result.outline[0]!];
          return { kind: 'declined', made, path };
        }
        return this.strokes.add(result, colour, this.running);
      }
      case 'rejected':
        return { kind: 'rejected', reason: result.reason, path: result.path };
      case 'dropped':
        return result;
    }
  }

  /**
   * What a Stroke would become if it were submitted now, without adding it.
   * Drawing input uses this to show a refused Object in red while drawing.
   */
  previewStroke(samples: readonly Vec2[]): StrokeResult {
    return processStroke(samples, this.strokeContext({}));
  }

  /** The Arena as the Stroke pipeline sees it: what the Arena query says a new Stroke meets. */
  private strokeContext(options: StrokeOptions): StrokeContext {
    return {
      pieceLength: this.materials.pieceLength,
      lineCutters: (path) => this.query.lineCutters(path),
      overlapsSolid: (part) => this.query.overlapsSolid(part),
      ...(options.lineThickness !== undefined && { lineThickness: options.lineThickness }),
    };
  }

  /**
   * Releases the Frozen Object under `point`, if physics is running. Returns
   * whether an Object was Released.
   */
  releaseAt(point: Vec2): boolean {
    return this.running && this.strokes.releaseAt(point);
  }

  /**
   * The Ink a Fill clicked at `point` would take, without filling: null over
   * nothing, or over an Object that is already filled.
   */
  fillInkAt(point: Vec2): number | null {
    return this.strokes.fillInkAt(point);
  }

  /**
   * Measures a Stroke's raw pointer samples as drawn, without the Stroke
   * pipeline or adding anything: whether they close, their Ink, and the
   * part of it lying on a standing Line. A Line is cut where the Arena
   * query says a new one is, as the Stroke pipeline cuts it. To estimate
   * what a Stroke costs while it is drawn.
   */
  measureSamples(samples: readonly Vec2[]): SamplesInk {
    return samplesInk(
      samples,
      (path) => this.query.lyingOnLines(path),
      (points) => cutPolylineOutside(points, this.query.lineCutters(points)),
    );
  }

  /**
   * Whether a Stroke along raw `samples` would come within an Enemy's
   * width of it, where it is now (`ArenaQuery.nearEnemy`).
   */
  nearEnemy(samples: readonly Vec2[]): boolean {
    const widest = Math.max(0, ...this.enemiesKind.views.map(({ width }) => width));
    return widest > 0 && this.query.nearEnemy(samples, widest);
  }

  /**
   * Fills the Object under `point` with `colour`: its mass becomes its
   * Outline's plus its Fill's. Works paused and running, on Frozen and moving
   * Objects, and never wakes a Frozen one. An Object holds one Fill. A Fill
   * that is added carries its Colour and the Ink it took.
   */
  fillAt(point: Vec2, colour: Colour, options: FillOptions = {}): FillOutcome {
    return this.strokes.fillAt(point, colour, options.accept);
  }

  /**
   * Releases a Frozen Object, optionally setting it moving (the stress tests
   * launch balls this way). Only while physics is running.
   */
  release(id: StrokeId, velocity?: Vec2): boolean {
    return this.running && this.strokes.release(id, velocity);
  }

  /** Removes one Stroke with its Fill, e.g. a spent stress-test ball. */
  remove(id: StrokeId): void {
    this.strokes.remove(id, 'removed');
  }

  /**
   * The Eraser: removes everything closer
   * than `radius` px to `path` (a drag, or a click's one point): whole
   * Objects with their Fills, the Pieces of Lines, Rubble, Droplets and
   * Patches. Erasing is not breaking: nothing bursts, releases its Fill or
   * sets off a Blast. What was attached to what went goes as when it
   * breaks: a green Object stuck to it falls free. Works paused and running.
   * Each thing erased goes as `erased` in the list of what happened.
   * Returns how many things it erased.
   */
  eraseAlong(path: readonly Vec2[], radius: number): number {
    if (path.length === 0) return 0;
    const touched = this.query.touchedBy({ path, radius });
    const rank = (thing: Thing) => ERASE_ORDER[thing.thing];
    // What went with a host erased before it is already gone, and stays so.
    for (const thing of touched.sort((p, q) => rank(p) - rank(q))) {
      this.removeThing(thing, 'erased');
    }
    return touched.length;
  }

  /**
   * Removes one thing at once, for `why`, by its kind: nothing bursts,
   * releases its Fill or sets off a Blast.
   */
  private removeThing(thing: Thing, why: Why): void {
    switch (thing.thing) {
      case 'object':
        return this.strokes.remove(thing.id, why);
      case 'piece':
        return this.strokes.removePiece(thing.id, thing.index, why);
      case 'rubble':
        return this.rubbleKind.remove(thing.id, why);
      case 'enemy':
        return this.enemiesKind.remove(thing.id, why);
      case 'droplet':
        return this.dropletsKind.remove(thing.id, why);
      case 'patch':
        return this.patchesKind.remove(thing.id, why);
    }
  }

  /**
   * Takes back what's left of a Stroke, for undo: an Object with its Fill, or
   * a Line's Pieces still there. Says what it took back, in its Colour, and
   * its Ink, or that the Stroke was gone already. Nothing is refunded here.
   */
  removeStroke(id: StrokeId): RemovedStroke {
    return this.strokes.removeStroke(id);
  }

  /**
   * Takes back an Object's Fill, for undo; the Object stays, hollow. Says
   * what it took back and its Ink, or that there was no Fill to take.
   */
  removeFill(id: StrokeId): RemovedFill {
    return this.strokes.removeFill(id);
  }

  /**
   * Removes every Stroke and Fill, the Rubble, Enemies, Droplets, Patches
   * and Blasts; the Ink Core stays, and is whole again. R has nothing to go
   * back to. Nothing is left touching or Settled, since every kind
   * unregisters its bodies. It starts over: the Debris goes too. The Arena
   * becomes `arena`, a Level's own, or else the base Arena again, with its
   * Terrain, Spawn and Ink Core; it stays through R.
   */
  clear(arena: Arena = this.baseArena): void {
    this.bodies.clear();
    for (const kind of this.kinds) kind.clear();
    this.poses.forget();
    if (arena !== this.current) {
      this.current = arena;
      // The Terrain is the first body: start again from a fresh engine state,
      // with the new one, and the Ink Core where the new Arena has it.
      this.rebuild(this.takeSnapshot());
    }
    this.snapshot = null;
    this.happenings.say({ kind: 'start-over' });
  }

  /**
   * Tells every kind, in kind order, what just went, so that what was
   * attached to it goes too: a bond whose host broke or was undone lets its
   * green Object fall free.
   */
  private passOnGone(parties: ReadonlySet<PartyId>): void {
    for (const kind of this.kinds) kind.gone(parties);
  }

  /**
   * Starts or pauses physics. Box2D can't save its own state, and a world
   * rebuilt from scratch doesn't play out like one that wasn't, so every
   * start takes a snapshot for R and rebuilds the world from it: the first
   * run and every retry play out identically.
   */
  togglePause(): void {
    this.running = !this.running;
    this.accumulator = 0;
    if (!this.running) return;
    const snapshot = this.takeSnapshot();
    this.snapshot = snapshot;
    // Everything comes back as it was, under the same ids: nothing came or went.
    this.happenings.quietly(() => this.rebuild(snapshot));
    this.strokes.squeezeAll();
  }

  /**
   * Runs physics on from where it was paused, without a snapshot or a
   * rebuild: the engine carries on as if it had never paused, and R still
   * goes back to the last start. The Game's Wave pauses and runs this way.
   * Lines drawn while paused squeeze the Objects they cross, as at a start.
   * Does nothing while running.
   */
  resume(): void {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.strokes.squeezeAll();
  }

  /** Pauses physics, if running. */
  pause(): void {
    this.running = false;
    this.accumulator = 0;
  }

  /**
   * Freezes again every Object at rest where it is, as a Wave ends (the
   * Aftermath); moving ones are left as they are. Only while paused: it
   * rebuilds the world from a snapshot of now, as a start does, so nothing
   * comes or goes, and R still goes back to the last start.
   */
  freezeResting(): void {
    if (this.running) return;
    const now = this.takeSnapshot();
    const snapshot = {
      ...now,
      contents: { ...now.contents, strokes: freezeResting(now.contents.strokes) },
    };
    this.happenings.quietly(() => this.rebuild(snapshot));
  }

  /**
   * Takes the world back to the moment physics last started, damage and all,
   * and pauses. Strokes and Fills made since are gone. Does nothing before
   * the first start.
   * It starts over: everything comes back as added, and the Debris goes.
   */
  reset(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    this.random.state = snapshot.random;
    this.elapsed = snapshot.time;
    this.happenings.say({ kind: 'start-over' });
    this.rebuild(snapshot);
    this.running = false;
    this.accumulator = 0;
  }

  /**
   * The whole simulation now. Its contacts are the pairs Settled or touching
   * now: straight after a rebuild (R, or a start not yet stepped) the engine
   * hasn't found any contacts yet, so the pairs Settled at the last start
   * still count until they have stepped apart.
   */
  private takeSnapshot(): Snapshot {
    return {
      contents: Object.fromEntries(
        this.kinds.map((kind) => [kind.name, kind.save()]),
      ) as SavedContents,
      contacts: this.contacts.save(),
      random: this.random.state,
      time: this.elapsed,
    };
  }

  /**
   * Applies edits to the material and enemy tables from the next step, when
   * either's revision has moved on. Densities and sizes are left out: an
   * Object's mass is set when it is drawn or filled, and an Enemy's when it
   * is sent in.
   */
  private applyMaterials(): void {
    const revisions = [materialsRevision(this.materials), enemiesRevision(this.enemyTable)];
    if (revisions.every((revision, k) => revision === this.appliedRevisions[k])) return;
    this.appliedRevisions = revisions;
    this.physics.setWakeSpeed(this.materials.wakeSpeed);
    this.physics.setMinBounceSpeed(this.materials.minBounceSpeed);
    this.bodies.applySurfaces();
  }

  /**
   * Rebuilds the physics world from a snapshot, from a fresh engine state:
   * the Contact ledger, the Terrain, then every kind in order.
   */
  private rebuild(snapshot: Snapshot): void {
    this.bodies.reset(snapshot.contacts);
    // Body ids start again after a reset: a pose from before would be another body's.
    this.poses.forget();
    this.bodies.addTerrain(this.arena.terrain);
    const saved: Readonly<Record<string, unknown>> = snapshot.contents;
    for (const kind of this.kinds) kind.restore(saved[kind.name]);
  }

  /**
   * Advances physics by one fixed step, if running. The Enemies walk first,
   * as the Material rules decide; after the step the rules run every
   * consequence in their own order, and each kind takes its turn. This order
   * must not change: exact replays depend on every engine call and every
   * draw from `random` coming in the same order. `around`, if given, runs
   * just before and just after the step: the Game's Defence loop sends in a
   * Wave's Enemies there, and ends the Wave or stops physics.
   */
  step(around: StepHooks = {}): void {
    if (!this.running) return;
    around.before?.();
    this.poses.remember(this.contacts.bodies());
    this.applyMaterials();
    this.rules.walk(STEP_SECONDS);
    this.contacts.step(this.physics.step());
    this.elapsed += STEP_SECONDS;
    this.stepsTaken++;
    this.rules.step(STEP_SECONDS);
    for (const kind of this.kinds) kind.step(STEP_SECONDS);
    around.after?.();
  }

  /**
   * Advances by real elapsed time, in whole fixed steps; the remainder
   * carries over. `around`, if given, runs just before and just after each
   * step, as `step` runs it, so a retry plays out the same whatever the
   * frame times. Returns the steps taken.
   */
  advance(seconds: number, around: StepHooks = {}): number {
    if (!this.running) return 0;
    this.accumulator += seconds;
    let steps = 0;
    // A small tolerance so that e.g. 100 ms of frames gives exactly 6 steps.
    while (
      this.running &&
      this.accumulator >= STEP_SECONDS - 1e-9 &&
      steps < MAX_STEPS_PER_ADVANCE
    ) {
      this.step(around);
      this.accumulator -= STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_ADVANCE) this.accumulator = 0;
    return steps;
  }

  /** Frees the physics world. */
  dispose(): void {
    this.physics.destroy();
  }
}
