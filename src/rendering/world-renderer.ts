import type Phaser from 'phaser';
import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { Random } from '../sandbox/random';
import {
  GRAVITY,
  STEP_SECONDS,
  type Entry,
  type Reader,
  type SandboxWorld,
  type StrokeId,
} from '../sandbox/sandbox-world';
import { BakedTextures } from './baked-textures';
import { Debris } from './debris';
import { DropBursts } from './drop-burst';
import { fillPolygon, strokePolygon } from './draw';
import { INK_HUES } from './ink';
import { BlastsDrawing } from './kinds/blasts-drawing';
import { BondsDrawing } from './kinds/bonds-drawing';
import { DropletsDrawing } from './kinds/droplets-drawing';
import { stepsSince, type DrawnKind } from './kinds/drawn-kind';
import { EnemiesDrawing, POP_HUES } from './kinds/enemies-drawing';
import { InkCoreDrawing } from './kinds/ink-core-drawing';
import { LinesDrawing } from './kinds/lines-drawing';
import { ObjectsDrawing } from './kinds/objects-drawing';
import { PatchesDrawing } from './kinds/patches-drawing';
import { RubbleDrawing } from './kinds/rubble-drawing';
import { PALETTE } from './palette';

type Graphics = Phaser.GameObjects.Graphics;

const DEBRIS_DEPTH = 5;
/** Drop dots fly over the world, just under the palette they fly to. */
const DROP_DOTS_DEPTH = 59;
/** Seed of the Debris' own random generator, apart from the simulation's. */
const DEBRIS_SEED = 0x0deb415;
/** Seed of the Drop bursts' own random generator. */
const DROP_BURST_SEED = 0xd409;
/** Where the Drop bursts fly to when the renderer is given no gauges: the top-left corner. */
const NO_GAUGES = (): Vec2 => ({ x: 0, y: 0 });
/** The Spawn arrow at the left edge: how far above the ground it points in, and its size. */
const SPAWN_ARROW_RISE = 60;
const SPAWN_ARROW_LENGTH = 22;
const SPAWN_ARROW_WIDTH = 24;

/** The hues of Debris in these Colours, taken in turn. */
const inkHues = (colours: readonly Colour[]): number[] => colours.map((colour) => INK_HUES[colour]);

/** The ids of what the renderer holds a drawing for. */
export interface Held {
  readonly lines: readonly StrokeId[];
  readonly objects: readonly StrokeId[];
  readonly rubble: readonly number[];
  readonly patches: readonly number[];
}

/**
 * Draws the Sandbox world's state: Terrain and the Spawn arrow, the Ink
 * Core, Lines, Objects, Rubble, Enemies, Patches, Droplets, bonds, Debris
 * and Blast rings.
 *
 * Each kind of Arena contents is drawn by a module of its own (`kinds/`),
 * which makes, bakes again and frees its own drawings from the world's list
 * of what happened and draws its things from their views. The renderer
 * reads the list once a frame, hands each entry to every kind, drops every
 * kind's drawings on `start over`, and has the kinds draw in a fixed order,
 * the way the Sandbox world runs its kinds. It keeps the Terrain and the
 * Debris, which is visual only: Debris bursts where something broke, where
 * a Patch went used up or capped, and where an Enemy popped. A Drop's dots,
 * visual only too, fly from where the Enemy died to the gauges.
 *
 * The world steps at a fixed rate, and a screen can show more frames than
 * that: each body is drawn between its pose as the latest step began and its
 * pose now, as far as the world is into its next step, so it moves smoothly.
 * Debris and Blast rings keep to the steps.
 */
export class WorldRenderer {
  private readonly happenings: Reader;
  /** The looks of Rubble, by Colour and radius, and of Patches, by Colour and size. */
  private readonly baked: BakedTextures;
  private readonly debris = new Debris(new Random(DEBRIS_SEED), GRAVITY, STEP_SECONDS);
  /** The simulated time the Debris has moved on to, s. */
  private debrisTime: number;
  /** Where the Terrain is drawn, and the Terrain drawn there. */
  private readonly terrainGraphics: Graphics;
  private drawnTerrain: readonly Polygon[] = [];
  private readonly debrisGraphics: Graphics;
  /** The dots of each Drop, flying to the gauges: visual only, in real time. */
  private readonly drops: DropBursts;
  private readonly dropGraphics: Graphics;
  private readonly lines: LinesDrawing;
  private readonly objects: ObjectsDrawing;
  private readonly rubble: RubbleDrawing;
  private readonly patches: PatchesDrawing;
  /** Every kind, in the order they are drawn. */
  private readonly kinds: readonly DrawnKind[];

  /**
   * Draws `world`, which must hold no Strokes, Rubble or Patches yet: from
   * here on it knows what is there only by what happens. A Drop's dots fly
   * to `gaugeAt` each Colour's gauge.
   */
  constructor(
    scene: Phaser.Scene,
    private readonly world: SandboxWorld,
    gaugeAt: (colour: Colour) => Vec2 = NO_GAUGES,
  ) {
    const { lines, objects, rubble, patches } = world;
    if (lines.length + objects.length + rubble.length + patches.length > 0)
      throw new Error('a World renderer starts on a world with nothing in it');
    this.happenings = world.happenings.reader();
    this.debrisTime = world.time;
    this.baked = new BakedTextures(scene);
    this.rubble = new RubbleDrawing(this.baked, world.materials, () => world.rubble);
    this.terrainGraphics = scene.add.graphics();
    this.drawTerrain();
    this.debrisGraphics = scene.add.graphics().setDepth(DEBRIS_DEPTH);
    this.drops = new DropBursts(new Random(DROP_BURST_SEED), gaugeAt);
    this.dropGraphics = scene.add.graphics().setDepth(DROP_DOTS_DEPTH);
    const inkCore = new InkCoreDrawing(scene, () => world.inkCore);
    const enemies = new EnemiesDrawing(scene, () => world.enemies);
    const bonds = new BondsDrawing(scene, () => world.bonds);
    const droplets = new DropletsDrawing(scene, () => world.droplets);
    const blasts = new BlastsDrawing(scene, () => world.blasts);
    this.lines = new LinesDrawing(scene, () => world.lines);
    this.objects = new ObjectsDrawing(scene, () => world.objects);
    this.patches = new PatchesDrawing(
      this.baked,
      () => world.patches,
      (outline, velocity, colours, time) =>
        this.debris.burst(outline, velocity, inkHues(colours), stepsSince(time, this.world.time)),
    );
    this.kinds = [
      inkCore,
      this.lines,
      this.objects,
      this.rubble,
      enemies,
      this.patches,
      droplets,
      bonds,
      blasts,
    ];
  }

  /** Frees the textures, and stops reading what happens. */
  destroy(): void {
    this.happenings.close();
    this.dropAll();
    this.baked.destroy();
  }

  /** Debris particles in flight. */
  get debrisCount(): number {
    return this.debris.count;
  }

  /** Drop dots in flight to the gauges. */
  get dropDotCount(): number {
    return this.drops.count;
  }

  /** The ids of what it holds a drawing for, for tests. */
  held(): Held {
    return {
      lines: this.lines.held(),
      objects: this.objects.held(),
      rubble: this.rubble.held(),
      patches: this.patches.held(),
    };
  }

  /** The Terrain, and the Spawn arrow at the left edge, where Enemies come in. */
  private drawTerrain(): void {
    const g = this.terrainGraphics;
    g.clear();
    this.drawnTerrain = this.world.arena.terrain;
    g.fillStyle(PALETTE.terrainFill, 1);
    g.lineStyle(2, PALETTE.terrainEdge, 1);
    for (const polygon of this.drawnTerrain) {
      fillPolygon(g, polygon);
      strokePolygon(g, polygon);
    }
    const y = this.world.arena.spawn.y - SPAWN_ARROW_RISE;
    g.fillStyle(PALETTE.spawn, 0.8);
    fillPolygon(g, [
      { x: 4, y: y - SPAWN_ARROW_WIDTH / 2 },
      { x: 4 + SPAWN_ARROW_LENGTH, y },
      { x: 4, y: y + SPAWN_ARROW_WIDTH / 2 },
    ]);
  }

  /** Draws a frame, `seconds` of real time after the last: Drop dots fly on in real time. */
  draw(seconds = 0): void {
    // A gallery demo may have brought its own Terrain, or Clear the sandbox Arena's back.
    if (this.world.arena.terrain !== this.drawnTerrain) this.drawTerrain();
    const now = this.world.time;
    this.debris.advance(Math.round((now - this.debrisTime) / STEP_SECONDS));
    this.debrisTime = now;
    this.drops.advance(seconds);
    for (const entry of this.happenings.read()) this.follow(entry, now);
    const fraction = this.world.stepFraction;
    for (const kind of this.kinds) kind.draw(fraction, now);
    this.drawDebris();
    this.drawDrops();
  }

  /** Hands one entry of the list to every kind, and bursts Debris; `now` is the world's time. */
  private follow(entry: Entry, now: number): void {
    if (entry.kind === 'burst') {
      const { outline, velocity, colours, time } = entry;
      this.debris.burst(outline, velocity, inkHues(colours), stepsSince(time, now));
    } else if (entry.kind === 'popped') {
      const { outline, velocity, type, time } = entry;
      this.debris.burst(outline, velocity, POP_HUES[type], stepsSince(time, now));
    } else if (entry.kind === 'dropped') {
      this.drops.burst(entry.at, entry.ink);
    } else if (entry.kind === 'start-over') this.dropAll();
    else for (const kind of this.kinds) kind.follow(entry, now);
  }

  /** Frees every kind's drawings, and drops the Debris. */
  private dropAll(): void {
    for (const kind of this.kinds) kind.dropAll();
    this.debris.clear();
    this.drops.clear();
  }

  /** Each particle as a small tumbling square in its Colour, fading out. */
  private drawDebris(): void {
    const g = this.debrisGraphics;
    g.clear();
    for (const { hue, size, position, angle, opacity } of this.debris.views) {
      const c = (Math.cos(angle) * size) / 2;
      const s = (Math.sin(angle) * size) / 2;
      g.fillStyle(hue, opacity);
      fillPolygon(g, [
        { x: position.x - c + s, y: position.y - s - c },
        { x: position.x + c + s, y: position.y + s - c },
        { x: position.x + c - s, y: position.y + s + c },
        { x: position.x - c - s, y: position.y - s + c },
      ]);
    }
  }

  /** Each Drop dot as a small disc in its Colour's hue, ringed dark. */
  private drawDrops(): void {
    const g = this.dropGraphics;
    g.clear();
    for (const { colour, position, radius } of this.drops.views) {
      g.fillStyle(INK_HUES[colour], 1);
      g.fillCircle(position.x, position.y, radius);
      g.lineStyle(1, 0x1b1f27, 0.8);
      g.strokeCircle(position.x, position.y, radius);
    }
  }
}
