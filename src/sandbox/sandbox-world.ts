import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import {
  createMaterialTable,
  materialsRevision,
  type MaterialTable,
} from '../materials/material-table';
import { createPhysicsWorld, type PhysicsWorld, type PhysicsWorldFactory } from '../physics';
import {
  processStroke,
  type RejectionReason,
  type StrokeContext,
  type StrokeResult,
} from '../stroke/stroke-pipeline';
import { SANDBOX_ARENA, type Arena } from './arena';
import { ArenaBodies } from './arena-bodies';
import type { Kind } from './arena-contents';
import { Blasts, type BlastView } from './blasts';
import { Bonds, type BondView } from './bonds';
import { ContactLedger, type PartyId, type SavedContacts } from './contact-ledger';
import { Droplets, type DropletView } from './droplets';
import { Happenings } from './happenings';
import { MaterialRules } from './material-rules';
import { Patches, type PatchView } from './patches';
import { PreviousPoses } from './previous-poses';
import { Random } from './random';
import { Rubble, type RubbleView } from './rubble';
import {
  Strokes,
  type FillOutcome,
  type LineView,
  type ObjectStroke,
  type ObjectView,
  type StrokeId,
  type StrokeTarget,
} from './strokes';

export type { BlastView } from './blasts';
export type { Poses } from './arena-contents';
export type { BondView } from './bonds';
export type { DropletView } from './droplets';
export type { Entry, Happening, Reader, Thing, Why } from './happenings';
export type { PatchView } from './patches';
export type { RubbleView } from './rubble';
export {
  SLIDE_OUT_SPEED,
  type FillOutcome,
  type LineView,
  type ObjectView,
  type PieceView,
  type StrokeId,
} from './strokes';

/** Fixed physics step: 60 Hz. */
export const STEP_SECONDS = 1 / 60;
/** Gravity, px/s². */
export const GRAVITY = 1000;
/** At most this many steps per `advance`, so a long frame can't stall the game. */
const MAX_STEPS_PER_ADVANCE = 8;

/** What a submitted Stroke became. */
export type StrokeOutcome =
  | { readonly kind: 'line'; readonly id: StrokeId }
  | { readonly kind: 'object'; readonly id: StrokeId }
  | { readonly kind: 'rejected'; readonly reason: RejectionReason; readonly path: readonly Vec2[] }
  | { readonly kind: 'dropped' };

export interface StrokeOptions {
  /** Overrides the Line thickness (the stress tests use a thinner Line). */
  readonly lineThickness?: number;
}

/**
 * Every kind of Arena contents, in the fixed order they are rebuilt in:
 * Strokes, Rubble, Bonds, Droplets, Patches, then Blasts. A kind that lives
 * on another, or acts on it, comes after it.
 */
type Kinds = readonly [Strokes, Rubble, Bonds, Droplets, Patches, Blasts<StrokeTarget>];

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
  readonly createPhysics?: PhysicsWorldFactory;
}

/**
 * The headless sandbox: the Arena and its contents, the pause state, and
 * Reset. It has no rendering dependency, so it is the main testing seam.
 * Each kind of Arena contents is a module of its own (`Strokes`, `Rubble`,
 * `Bonds`, `Droplets`, `Patches`, `Blasts`); the world runs them all, in a
 * fixed order. They add and remove bodies through Arena bodies, which tells
 * every kind what went as it goes. The Contact ledger decides which contacts count, and the
 * Material rules read it and decide every consequence: the world runs their
 * phases in its step order and wires their decisions to the kinds and the
 * physics module. Each step and command appends what happened to
 * `happenings`, which the renderer reads. Each Stroke is drawn in a Colour
 * given with the command; the world holds no selected Colour.
 */
export class SandboxWorld {
  readonly arena: Arena;
  readonly random: Random;
  readonly materials: MaterialTable;
  /** What happened, in order: read it through a reader of your own. */
  readonly happenings = new Happenings(() => this.elapsed);
  private readonly physics: PhysicsWorld;
  private readonly contacts: ContactLedger<StrokeTarget>;
  private readonly bodies: ArenaBodies<StrokeTarget>;
  private readonly rules: MaterialRules<StrokeTarget, ObjectStroke>;
  /** Each body's pose as the latest step began, for drawing: the simulation never reads it. */
  private readonly poses: PreviousPoses;
  private readonly strokes: Strokes;
  private readonly rubbleKind: Rubble;
  private readonly bondsKind: Bonds;
  private readonly dropletsKind: Droplets;
  private readonly patchesKind: Patches;
  private readonly blastsKind: Blasts<StrokeTarget>;
  /** Every kind, in rebuild order. */
  private readonly kinds: readonly AnyKind[];
  /** Taken whenever physics starts; R returns to it. */
  private snapshot: Snapshot | null = null;
  /** The material table's revision last applied to the physics world; none yet. */
  private appliedRevision = -1;
  private running = false;
  private accumulator = 0;
  private elapsed = 0;

  constructor(options: SandboxWorldOptions = {}) {
    this.arena = options.arena ?? SANDBOX_ARENA;
    this.random = new Random(options.seed ?? 1);
    this.materials = options.materials ?? createMaterialTable();
    this.physics = (options.createPhysics ?? createPhysicsWorld)({
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
      this.materials,
      (parties) => this.passOnGone(parties),
      say,
    );
    this.poses = new PreviousPoses(this.physics);
    this.bodies.addTerrain(this.arena.terrain);
    const { physics, materials, arena, bodies, poses } = this;
    this.strokes = new Strokes(physics, materials, arena, bodies, poses, say);
    this.rubbleKind = new Rubble(physics, materials, bodies, poses);
    this.bondsKind = new Bonds(physics, this.contacts, poses);
    this.dropletsKind = new Droplets(physics, materials, arena, bodies, poses);
    this.patchesKind = new Patches(physics, materials, bodies, poses);
    this.blastsKind = new Blasts(this.physics, this.materials, this.contacts);
    const kinds: Kinds = [
      this.strokes,
      this.rubbleKind,
      this.bondsKind,
      this.dropletsKind,
      this.patchesKind,
      this.blastsKind,
    ];
    this.kinds = kinds;
    this.rules = new MaterialRules({
      materials: this.materials,
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
      },
    });
  }

  /** Whether physics is running (stands in for the Wave) rather than paused (the Build Phase). */
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
      case 'object':
        return { kind: result.kind, id: this.strokes.add(result, colour, this.running) };
      case 'rejected':
        return { kind: 'rejected', reason: result.reason, path: result.path };
      case 'dropped':
        return result;
    }
  }

  /**
   * What a Stroke would become if it were submitted now, without adding it.
   * The scene uses this to show a refused Object in red while drawing.
   */
  previewStroke(samples: readonly Vec2[]): StrokeResult {
    return processStroke(samples, this.strokeContext({}));
  }

  /** The Arena as the Stroke pipeline sees it: the Terrain and every kind's solids. */
  private strokeContext(options: StrokeOptions): StrokeContext {
    const solids = this.kinds.map((kind) => kind.solids());
    return {
      terrain: this.arena.terrain,
      pieceLength: this.materials.pieceLength,
      objects: solids.flatMap((s) => s.polygons),
      rubble: solids.flatMap((s) => s.circles),
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
   * Fills the Object under `point` with `colour`: its mass becomes its
   * Outline's plus its Fill's. Works paused and running, on Frozen and moving
   * Objects, and never wakes a Frozen one. An Object holds one Fill.
   */
  fillAt(point: Vec2, colour: Colour): FillOutcome {
    return this.strokes.fillAt(point, colour);
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
   * The Eraser, a testing tool of the sandbox: removes everything closer
   * than `radius` px to `path` (a drag, or a click's one point): whole
   * Objects with their Fills, the Pieces of Lines, Rubble, Droplets and
   * Patches. Erasing is not breaking: nothing bursts, releases its Fill or
   * sets off a Blast. What was attached to what went goes as when it
   * breaks: a green Object stuck to it falls free. Works paused and running;
   * erased Strokes are gone from the undo history.
   */
  eraseAlong(path: readonly Vec2[], radius: number): void {
    if (path.length === 0) return;
    const brush = { path, radius };
    for (const kind of this.kinds) kind.erase(brush);
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists: what's left
   * of a Line goes as a whole. Broken Objects, and Lines whose every Piece
   * broke, are gone from the history, so undo skips them.
   */
  undo(): void {
    this.strokes.undo();
  }

  /**
   * Removes every Stroke and Fill, the Rubble, Droplets, Patches and Blasts;
   * the Terrain stays. R has nothing to go back to. Nothing is left touching
   * or Settled, since every kind unregisters its bodies. It starts over: the
   * Debris goes too.
   */
  clear(): void {
    this.bodies.clear();
    for (const kind of this.kinds) kind.clear();
    this.poses.forget();
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
   * Takes the world back to the moment physics last started, damage and all,
   * and pauses. Strokes and Fills made since are gone, and undo carries on
   * from the history of that moment. Does nothing before the first start.
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
   * Applies edits to the material table from the next step, when its
   * revision has moved on. Densities are left out: an Object's mass is set
   * when it is drawn or filled.
   */
  private applyMaterials(): void {
    const revision = materialsRevision(this.materials);
    if (revision === this.appliedRevision) return;
    this.appliedRevision = revision;
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
   * Advances physics by one fixed step, if running. The Material rules
   * decide every consequence, one phase at a time, in an order that must
   * not change: exact replays depend on every engine call and every draw
   * from `random` coming in the same order.
   */
  step(): void {
    if (!this.running) return;
    this.poses.remember(this.contacts.bodies());
    this.applyMaterials();
    this.contacts.step(this.physics.step());
    this.elapsed += STEP_SECONDS;
    // Damage by the ledger's hits. What broke breaks only after sticking and
    // landing: a green Object sticks to its first new contact even if that
    // breaks in this step (it then falls free at once, as when its host
    // breaks later), and a Patch laid on something broken goes with it.
    const broken = this.rules.impacts();
    this.rules.stick(this.strokes.objectRecords(), STEP_SECONDS);
    this.rules.land(); // Droplets land by new contacts, then Patches wear by hits
    this.rules.breakAll(broken);
    this.rules.glue([...this.strokes.pieces(), ...this.patchesKind.gluers()], STEP_SECONDS);
    this.blastsKind.spread(STEP_SECONDS, this.rules.blastReached);
    this.patchesKind.removeUsedUp();
    for (const kind of this.kinds) kind.step(STEP_SECONDS);
  }

  /**
   * Advances by real elapsed time, in whole fixed steps; the remainder
   * carries over. Returns the steps taken.
   */
  advance(seconds: number): number {
    if (!this.running) return 0;
    this.accumulator += seconds;
    let steps = 0;
    // A small tolerance so that e.g. 100 ms of frames gives exactly 6 steps.
    while (this.accumulator >= STEP_SECONDS - 1e-9 && steps < MAX_STEPS_PER_ADVANCE) {
      this.step();
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
