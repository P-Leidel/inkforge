import type Phaser from 'phaser';
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
import { fillPolygon, strokePolygon } from './draw';
import { INK_HUES } from './ink';
import { BlastsDrawing } from './kinds/blasts-drawing';
import { BondsDrawing } from './kinds/bonds-drawing';
import { DropletsDrawing } from './kinds/droplets-drawing';
import { stepsSince, type DrawnKind } from './kinds/drawn-kind';
import { LinesDrawing } from './kinds/lines-drawing';
import { ObjectsDrawing } from './kinds/objects-drawing';
import { PatchesDrawing } from './kinds/patches-drawing';
import { RubbleDrawing } from './kinds/rubble-drawing';
import { PALETTE } from './palette';

type Graphics = Phaser.GameObjects.Graphics;

const DEBRIS_DEPTH = 5;
/** Seed of the Debris' own random generator, apart from the simulation's. */
const DEBRIS_SEED = 0x0deb415;

/** The ids of what the renderer holds a drawing for. */
export interface Held {
  readonly lines: readonly StrokeId[];
  readonly objects: readonly StrokeId[];
  readonly rubble: readonly number[];
  readonly patches: readonly number[];
}

/**
 * Draws the Sandbox world's state: Terrain, Lines, Objects, Rubble, Patches,
 * Droplets, bonds, Debris and Blast rings.
 *
 * Each kind of Arena contents is drawn by a module of its own (`kinds/`),
 * which makes, bakes again and frees its own drawings from the world's list
 * of what happened and draws its things from their views. The renderer
 * reads the list once a frame, hands each entry to every kind, drops every
 * kind's drawings on `start over`, and has the kinds draw in a fixed order,
 * the way the Sandbox world runs its kinds. It keeps the Terrain and the
 * Debris, which is visual only: Debris bursts where something broke and
 * where a Patch went used up or capped.
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
  private readonly debrisGraphics: Graphics;
  private readonly lines: LinesDrawing;
  private readonly objects: ObjectsDrawing;
  private readonly rubble: RubbleDrawing;
  private readonly patches: PatchesDrawing;
  /** Every kind, in the order they are drawn. */
  private readonly kinds: readonly DrawnKind[];

  /**
   * Draws `world`, which must hold no Strokes, Rubble or Patches yet: from
   * here on it knows what is there only by what happens.
   */
  constructor(
    scene: Phaser.Scene,
    private readonly world: SandboxWorld,
  ) {
    const { lines, objects, rubble, patches } = world;
    if (lines.length + objects.length + rubble.length + patches.length > 0)
      throw new Error('a World renderer starts on a world with nothing in it');
    this.happenings = world.happenings.reader();
    this.debrisTime = world.time;
    this.baked = new BakedTextures(scene);
    this.rubble = new RubbleDrawing(this.baked, world.materials, () => world.rubble);
    this.drawTerrain(scene.add.graphics());
    this.debrisGraphics = scene.add.graphics().setDepth(DEBRIS_DEPTH);
    const bonds = new BondsDrawing(scene, () => world.bonds);
    const droplets = new DropletsDrawing(scene, () => world.droplets);
    const blasts = new BlastsDrawing(scene, () => world.blasts);
    this.lines = new LinesDrawing(scene, () => world.lines);
    this.objects = new ObjectsDrawing(scene, () => world.objects);
    this.patches = new PatchesDrawing(
      this.baked,
      () => world.patches,
      (outline, velocity, colours, time) =>
        this.debris.burst(outline, velocity, colours, stepsSince(time, this.world.time)),
    );
    this.kinds = [this.lines, this.objects, this.rubble, this.patches, droplets, bonds, blasts];
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

  /** The ids of what it holds a drawing for, for tests. */
  held(): Held {
    return {
      lines: this.lines.held(),
      objects: this.objects.held(),
      rubble: this.rubble.held(),
      patches: this.patches.held(),
    };
  }

  private drawTerrain(g: Graphics): void {
    g.fillStyle(PALETTE.terrainFill, 1);
    g.lineStyle(2, PALETTE.terrainEdge, 1);
    for (const polygon of this.world.arena.terrain) {
      fillPolygon(g, polygon);
      strokePolygon(g, polygon);
    }
  }

  draw(): void {
    const now = this.world.time;
    this.debris.advance(Math.round((now - this.debrisTime) / STEP_SECONDS));
    this.debrisTime = now;
    for (const entry of this.happenings.read()) this.follow(entry, now);
    const fraction = this.world.stepFraction;
    for (const kind of this.kinds) kind.draw(fraction, now);
    this.drawDebris();
  }

  /** Hands one entry of the list to every kind, and bursts Debris; `now` is the world's time. */
  private follow(entry: Entry, now: number): void {
    if (entry.kind === 'burst') {
      const { outline, velocity, colours, time } = entry;
      this.debris.burst(outline, velocity, colours, stepsSince(time, now));
    } else if (entry.kind === 'start-over') this.dropAll();
    else for (const kind of this.kinds) kind.follow(entry, now);
  }

  /** Frees every kind's drawings, and drops the Debris. */
  private dropAll(): void {
    for (const kind of this.kinds) kind.dropAll();
    this.debris.clear();
  }

  /** Each particle as a small tumbling square in its Colour, fading out. */
  private drawDebris(): void {
    const g = this.debrisGraphics;
    g.clear();
    for (const { colour, size, position, angle, opacity } of this.debris.views) {
      const c = (Math.cos(angle) * size) / 2;
      const s = (Math.sin(angle) * size) / 2;
      g.fillStyle(INK_HUES[colour], opacity);
      fillPolygon(g, [
        { x: position.x - c + s, y: position.y - s - c },
        { x: position.x + c + s, y: position.y + s - c },
        { x: position.x + c - s, y: position.y + s + c },
        { x: position.x - c - s, y: position.y - s + c },
      ]);
    }
  }
}
