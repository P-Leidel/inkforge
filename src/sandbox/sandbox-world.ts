import { polygonArea } from '../geometry/polygon';
import { sub, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import {
  createMaterialTable,
  TERRAIN_SURFACE,
  type MaterialTable,
} from '../materials/material-table';
import {
  createPhysicsWorld,
  type BodyId,
  type PhysicsWorld,
  type PhysicsWorldFactory,
} from '../physics';
import {
  processStroke,
  type RejectionReason,
  type StrokeContext,
  type StrokeResult,
} from '../stroke/stroke-pipeline';
import { SANDBOX_ARENA, type Arena } from './arena';
import type { HostSurface, Kind } from './arena-contents';
import { blastInk, Blasts, type BlastView, type Reach } from './blasts';
import { Bonds, type BondView } from './bonds';
import { ContactLedger, TERRAIN_PARTY, type Party, type SavedContacts } from './contact-ledger';
import { Debris, type DebrisParticle } from './debris';
import { Droplets, packSpill, type DropletView } from './droplets';
import { Glue, type GlueWear } from './glue';
import { MaterialRules, wear } from './material-rules';
import { Patches, type PatchRecord, type PatchView, type Puff } from './patches';
import { Random } from './random';
import { launchRubble, packRubble, Rubble, type FadingRubbleView, type RubbleView } from './rubble';
import { Sticking } from './sticking';
import {
  Strokes,
  type BrokenOutline,
  type FillOutcome,
  type LineView,
  type ObjectView,
  type Piece,
  type ReleasedFill,
  type StrokeId,
  type StrokeTarget,
} from './strokes';

export type { BlastView } from './blasts';
export type { BondView } from './bonds';
export type { DropletView } from './droplets';
export type { PatchView } from './patches';
export type { FadingRubbleView, RubbleView } from './rubble';
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
/** Seed of the Debris' own random generator, apart from the simulation's. */
const DEBRIS_SEED = 0x0deb415;
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

/** What glues: green Pieces and green Patches. */
type Gluing = Piece | PatchRecord;

/** A kind as the Sandbox world runs it, over every kind alike. */
type AnyKind = Kind<string, unknown, unknown>;

/** Every kind's views by its name: everything R brings back, and nothing visual only. */
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
 * fixed order, and passes on what one reports to the next. The Contact ledger
 * decides which contacts count, and the Material rules read it. Each Stroke is drawn in a Colour given with the
 * command; the world holds no selected Colour.
 */
export class SandboxWorld {
  readonly arena: Arena;
  readonly random: Random;
  readonly materials: MaterialTable;
  private readonly physics: PhysicsWorld;
  private readonly contacts: ContactLedger<StrokeTarget>;
  private readonly rules: MaterialRules;
  private readonly glue: Glue;
  private readonly sticking: Sticking;
  private readonly debris = new Debris(new Random(DEBRIS_SEED), GRAVITY);
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
  /** The material table as it was last applied to the physics world. */
  private appliedMaterials = '';
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
    this.addTerrain();
    this.strokes = new Strokes(this.physics, this.materials, this.arena, this.contacts);
    this.rubbleKind = new Rubble(this.physics, this.materials, this.contacts);
    this.bondsKind = new Bonds(this.physics, this.contacts);
    this.dropletsKind = new Droplets(this.physics, this.materials, this.arena, this.contacts);
    this.patchesKind = new Patches(this.physics, this.materials, this.contacts);
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
    this.rules = new MaterialRules(this.materials);
    this.glue = new Glue(this.materials, this.physics, this.contacts, (shape) =>
      this.patchesKind.isPatch(shape),
    );
    this.sticking = new Sticking(this.materials, this.physics, this.contacts);
  }

  /** Whether physics is running (stands in for the Wave) rather than paused (the Build Phase). */
  get isRunning(): boolean {
    return this.running;
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

  /** Debris particles in flight. */
  get debrisParticles(): readonly DebrisParticle[] {
    return this.debris.views;
  }

  /** Rubble, oldest first. */
  get rubble(): readonly RubbleView[] {
    return this.rubbleKind.views;
  }

  /** Rubble the cap removed, fading out. */
  get fadingRubble(): readonly FadingRubbleView[] {
    return this.rubbleKind.fadingViews;
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
    this.strokes.remove(id);
    this.passOnGone();
  }

  /**
   * Takes back the most recent Stroke or Fill that still exists: what's left
   * of a Line goes as a whole. Broken Objects, and Lines whose every Piece
   * broke, are gone from the history, so undo skips them.
   */
  undo(): void {
    this.strokes.undo();
    this.passOnGone();
  }

  /**
   * Removes every Stroke and Fill, the Rubble, Droplets, Patches, Blasts and
   * the Debris; the Terrain stays. R has nothing to go back to. Nothing is left
   * touching or Settled, since every kind unregisters its bodies.
   */
  clear(): void {
    for (const kind of this.kinds) kind.clear();
    this.contacts.takeGone();
    this.snapshot = null;
    this.debris.clear();
  }

  /**
   * Tells every kind, in kind order, what the last step or command removed,
   * so that what was attached to it goes too: a bond whose host broke or was
   * undone lets its green Object fall free.
   */
  private passOnGone(): void {
    const gone = this.contacts.takeGone();
    if (gone.length === 0) return;
    const parties = new Set(gone);
    for (const kind of this.kinds) kind.gone(parties);
  }

  /**
   * Breaks what the Material rules or a Blast broke: an Object or a Piece
   * goes, Debris bursts from it, a broken Object's Fill comes out, and then
   * red explodes, so its Blast acts on what the Fill released.
   */
  private breakTarget(target: StrokeTarget): void {
    const broken = this.strokes.break(target);
    if (!broken) return;
    const { outline, velocity, colours } = broken.debris;
    this.debris.burst(outline, velocity, colours);
    if (broken.fill) this.releaseFill(broken.fill);
    if (broken.outline) this.explode(broken.outline, broken.fill);
  }

  /**
   * Starts a Blast at a broken Object's centre if its Outline or Fill is
   * red: one Blast of all its red ink.
   */
  private explode(outline: BrokenOutline, fill: ReleasedFill | null): void {
    const ink = blastInk(
      outline,
      fill && { colour: fill.colour, area: polygonArea(fill.outline) },
      this.materials,
    );
    if (ink > 0) this.blastsKind.add(outline.centre, ink);
  }

  /**
   * What a Blast does to each body its ring reached, at the strength it has
   * there. It damages a Piece or an Object that isn't sliding off a Line,
   * when the strength beats its threshold. It wakes a Frozen Object when the
   * push over its mass beats the wake speed. It pushes every moving body
   * (an Object, Rubble or a Droplet) outward from its centre, never faster
   * than `maxPushSpeed`. What it broke then breaks, and red explodes in turn.
   */
  private readonly blastReached = (reached: readonly Reach<StrokeTarget>[]): void => {
    const { blast, wakeSpeed } = this.materials;
    const broken: StrokeTarget[] = [];
    for (const { party, centre, point, strength } of reached) {
      const { body, target } = party;
      if (target && this.physics.getSlide(body) === null) {
        if (this.rules.applyBlast(target, strength)) {
          broken.push(target);
          continue;
        }
      }
      if (target?.kind === 'piece') continue; // fixed, so only damaged
      const mass = this.physics.getMass(body);
      const impulse = Math.min(blast.push * strength, mass * blast.maxPushSpeed);
      if (this.physics.isFrozen(body) && impulse / mass > wakeSpeed) this.physics.release(body);
      if (!this.physics.isFree(body)) continue;
      this.physics.applyImpulse(body, this.outward(body, centre, point, impulse));
    }
    for (const target of broken) this.breakTarget(target);
  };

  /**
   * An impulse of `size` pointing from a Blast's centre to where it reached
   * a body: `point`, or the body's centre if the Blast started inside it, or
   * straight up if that is the Blast's centre too.
   */
  private outward(body: BodyId, centre: Vec2, point: Vec2, size: number): Vec2 {
    let away = sub(point, centre);
    if (Math.hypot(away.x, away.y) < 1e-6) away = sub(this.physics.getTransform(body), centre);
    const length = Math.hypot(away.x, away.y);
    if (length < 1e-6) return { x: 0, y: -size };
    return { x: (away.x * size) / length, y: (away.y * size) / length };
  }

  /** Bursts a puff of Debris where each used-up Patch was. */
  private puff(puffs: readonly Puff[]): void {
    for (const { outline, velocity, colour } of puffs)
      this.debris.burst(outline, velocity, [colour]);
  }

  /**
   * Lets out a broken Object's Fill, in the same step, from where the Object
   * was and moving as it moved, kicked outward from its centre: grey and
   * black Fills release Rubble, blue and green ones a Spill of Droplets.
   * Red Fills release nothing here; their Blast starts in `explode`.
   */
  private releaseFill(released: ReleasedFill): void {
    if (this.materials.colours[released.colour].fill.spills > 0) this.releaseSpill(released);
    else this.releaseRubble(released);
  }

  /** Throws out a Spill, drawing from `world.random`: the count and spots, then the kick. */
  private releaseSpill({ colour, outline, from }: ReleasedFill): void {
    const { centres, length } = packSpill(outline, this.materials, this.random);
    const launched = launchRubble(
      centres.map((centre) => ({ centre })),
      from,
      this.materials.colours[colour].fill.kickSpeed,
      this.materials.kickSpread,
      this.random,
    );
    this.dropletsKind.add(
      launched.map(({ position, velocity, angularVelocity }) => ({
        colour,
        length,
        motion: { transform: { ...position, angle: 0 }, velocity, angularVelocity },
      })),
    );
  }

  private releaseRubble({ colour, mass, outline, from }: ReleasedFill): void {
    const fill = this.materials.colours[colour].fill;
    const pieces = packRubble(outline, colour, mass, this.materials, this.random);
    const launched = launchRubble(
      pieces,
      from,
      fill.kickSpeed,
      this.materials.kickSpread,
      this.random,
    );
    this.rubbleKind.add(
      launched.map(({ position, velocity, angularVelocity }, k) => ({
        colour,
        radius: pieces[k]!.radius,
        mass: pieces[k]!.mass,
        motion: {
          transform: { ...position, angle: from.transform.angle },
          velocity,
          angularVelocity,
        },
      })),
    );
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
    this.snapshot = this.takeSnapshot();
    this.rebuild(this.snapshot);
    this.strokes.squeezeAll();
  }

  /**
   * Takes the world back to the moment physics last started, damage and all,
   * and pauses. Strokes and Fills made since are gone, and undo carries on
   * from the history of that moment. Does nothing before the first start.
   */
  reset(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    this.rebuild(snapshot);
    this.debris.clear();
    for (const kind of this.kinds) kind.dropVisuals();
    this.random.state = snapshot.random;
    this.elapsed = snapshot.time;
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
   * Lays a Patch where each Droplet landed, on the surface of what it landed
   * on: the Terrain's polygons, or the host's kind's surface for it.
   */
  private layPatches(): void {
    for (const { colour, length, centre, host } of this.dropletsKind.land(
      this.contacts.newContacts,
    )) {
      const surface = this.surfaceOf(host);
      if (surface) this.puff(this.patchesKind.add(host, surface, centre, colour, length));
    }
  }

  private surfaceOf(host: Party<unknown>): HostSurface | null {
    if (host.id === TERRAIN_PARTY) return { kind: 'polygons', polygons: this.arena.terrain };
    for (const kind of this.kinds) {
      const surface = kind.surfaceOf(host.id);
      if (surface) return surface;
    }
    return null;
  }

  /** Adds the Terrain, which is Party 0 to the Contact ledger. */
  private addTerrain(): void {
    const body = this.physics.addTerrain(this.arena.terrain, TERRAIN_SURFACE);
    this.contacts.register({ id: TERRAIN_PARTY, stroke: TERRAIN_PARTY, body, target: null });
  }

  /**
   * Applies edits to the material table from the next step. Densities are
   * left out: an Object's mass is set when it is drawn or filled.
   */
  private applyMaterials(): void {
    const materials = JSON.stringify(this.materials);
    if (materials === this.appliedMaterials) return;
    this.appliedMaterials = materials;
    this.physics.setWakeSpeed(this.materials.wakeSpeed);
    this.physics.setMinBounceSpeed(this.materials.minBounceSpeed);
    for (const kind of this.kinds) kind.applySurfaces();
  }

  /**
   * Rebuilds the physics world from a snapshot, from a fresh engine state:
   * the Contact ledger, the Terrain, then every kind in order.
   */
  private rebuild(snapshot: Snapshot): void {
    this.physics.reset();
    this.contacts.restore(snapshot.contacts);
    this.addTerrain();
    const saved: Readonly<Record<string, unknown>> = snapshot.contents;
    for (const kind of this.kinds) kind.restore(saved[kind.name]);
  }

  /** Advances physics by one fixed step, if running. */
  step(): void {
    if (!this.running) return;
    this.applyMaterials();
    this.contacts.step(this.physics.step());
    this.elapsed += STEP_SECONDS;
    this.debris.step(STEP_SECONDS);
    const broken = this.rules.applyStep(this.contacts.hits);
    // A green Object sticks to its first new contact even if that breaks in
    // this step: it then falls free at once, as when its host breaks later.
    for (const { sticker, host, pair } of this.sticking.step(
      this.strokes.objectRecords(),
      STEP_SECONDS,
    )) {
      const point = this.physics.touchPoint(pair) ?? this.physics.getTransform(sticker.body);
      this.bondsKind.add(sticker.id, sticker.party, host.id, point);
    }
    // Droplets land before anything breaks, so a Patch on something broken
    // in this step goes with it.
    this.layPatches();
    this.patchesKind.wearByHits(this.contacts.hits);
    for (const target of broken) this.breakTarget(target);
    for (const worn of this.glue.apply<Gluing>(
      [...this.strokes.pieces(), ...this.patchesKind.gluers()],
      STEP_SECONDS,
      this.wearGluer,
    )) {
      if (worn.kind === 'piece') this.breakTarget(worn);
    }
    this.blastsKind.spread(STEP_SECONDS, this.blastReached);
    this.passOnGone();
    this.puff(this.patchesKind.removeUsedUp());
    for (const kind of this.kinds) kind.step(STEP_SECONDS);
  }

  /** Glue wears a Piece by damage, and a Patch by using it up. */
  private readonly wearGluer: GlueWear<Gluing> = (gluer, amount) => {
    if (gluer.kind !== 'piece') return this.patchesKind.wear(gluer, amount);
    gluer.damage += amount;
    return wear(gluer, this.materials) >= 1;
  };

  /** Advances by real elapsed time, in whole fixed steps; the remainder carries over. */
  advance(seconds: number): void {
    if (!this.running) return;
    this.accumulator += seconds;
    let steps = 0;
    // A small tolerance so that e.g. 100 ms of frames gives exactly 6 steps.
    while (this.accumulator >= STEP_SECONDS - 1e-9 && steps < MAX_STEPS_PER_ADVANCE) {
      this.step();
      this.accumulator -= STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_ADVANCE) this.accumulator = 0;
  }

  /** Frees the physics world. */
  dispose(): void {
    this.physics.destroy();
  }
}
